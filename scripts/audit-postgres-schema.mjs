import fs from "node:fs";
import ts from "typescript";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) throw new Error("DATABASE_URL_MISSING");

const schemaPath = "db/schema.ts";
const source = fs.readFileSync(schemaPath, "utf8");
const tree = ts.createSourceFile(schemaPath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const expected = new Map();

function columnName(expression) {
  let current = expression;
  while (ts.isCallExpression(current)) {
    if (ts.isIdentifier(current.expression)) {
      const argument = current.arguments[0];
      return argument && ts.isStringLiteral(argument) ? argument.text : null;
    }
    if (ts.isPropertyAccessExpression(current.expression)) {
      current = current.expression.expression;
      continue;
    }
    break;
  }
  return null;
}

function visit(node) {
  if (ts.isVariableDeclaration(node) && node.initializer && ts.isCallExpression(node.initializer)) {
    const call = node.initializer;
    if (call.expression.getText(tree) === "pgTable" && ts.isStringLiteral(call.arguments[0]) && ts.isObjectLiteralExpression(call.arguments[1])) {
      const columns = new Set();
      for (const property of call.arguments[1].properties) {
        if (!ts.isPropertyAssignment(property)) continue;
        const name = columnName(property.initializer);
        if (name) columns.add(name);
      }
      expected.set(call.arguments[0].text, columns);
    }
  }
  ts.forEachChild(node, visit);
}
visit(tree);

const sql = postgres(databaseUrl, { max: 1, prepare: false, connect_timeout: 10 });
try {
  const rows = await sql`
    select table_name, column_name
    from information_schema.columns
    where table_schema = 'public'
  `;
  const actual = new Map();
  for (const row of rows) {
    const columns = actual.get(row.table_name) ?? new Set();
    columns.add(row.column_name);
    actual.set(row.table_name, columns);
  }
  const missingTables = [...expected.keys()].filter((table) => !actual.has(table));
  const missingColumns = [];
  for (const [table, columns] of expected) {
    if (!actual.has(table)) continue;
    for (const column of columns) if (!actual.get(table).has(column)) missingColumns.push(`${table}.${column}`);
  }
  const trackingColumns = await sql`
    select column_name
    from information_schema.columns
    where table_schema = 'private' and table_name = '__dali_migrations'
  `;
  const tracking = new Set(trackingColumns.map((row) => row.column_name));
  const migrationTrackingReady = tracking.has("name") && tracking.has("checksum") && tracking.has("applied_at");
  const result = { status: missingTables.length || missingColumns.length ? "mismatch" : "ok", expectedTables: expected.size, actualPublicTables: actual.size, missingTables, missingColumns, migrationTrackingReady };
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== "ok" || !migrationTrackingReady) process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}

