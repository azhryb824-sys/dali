import fs from "node:fs";
import ts from "typescript";

const schemaPath = "db/schema.ts";
const migrationsDirectory = "drizzle-pg";
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

const files = fs.readdirSync(migrationsDirectory).filter((file) => file.endsWith(".sql")).sort();
const invalidNames = files.filter((file) => !/^\d{4,5}_[a-z0-9_-]+\.sql$/.test(file));
if (invalidNames.length) throw new Error(`Invalid migration filenames: ${invalidNames.join(", ")}`);

const sql = files.map((file) => fs.readFileSync(`${migrationsDirectory}/${file}`, "utf8")).join("\n");
const available = new Map([...expected.keys()].map((table) => [table, new Set()]));

for (const match of sql.matchAll(/CREATE TABLE(?: IF NOT EXISTS)?\s+(?:public\.)?"?([a-z0-9_]+)"?\s*\(([\s\S]*?)\);/gi)) {
  const columns = available.get(match[1]);
  if (!columns) continue;
  for (const column of match[2].matchAll(/(?:^|,)\s*"?([a-z0-9_]+)"?\s+(?:serial|integer|text|boolean|timestamp|json|numeric|uuid|bigint|date|varchar)/gim)) columns.add(column[1]);
}
for (const statement of sql.matchAll(/ALTER TABLE\s+(?:public\.)?"?([a-z0-9_]+)"?\s+([\s\S]*?);/gi)) {
  const columns = available.get(statement[1]);
  if (!columns) continue;
  for (const addition of statement[2].matchAll(/(?:^|,)\s*ADD COLUMN(?: IF NOT EXISTS)?\s+"?([a-z0-9_]+)"?/gi)) {
    columns.add(addition[1]);
  }
}

const missing = [];
for (const [table, columns] of expected) {
  for (const column of columns) if (!available.get(table)?.has(column)) missing.push(`${table}.${column}`);
}
if (missing.length) throw new Error(`Schema columns missing from cumulative migrations:\n${missing.join("\n")}`);

const destructive = [];
for (const file of files) {
  const body = fs.readFileSync(`${migrationsDirectory}/${file}`, "utf8");
  if (/^\s*(?:TRUNCATE|DELETE\s+FROM|DROP\s+TABLE|ALTER\s+TABLE[\s\S]*?DROP\s+COLUMN)\b/im.test(body)) destructive.push(file);
}
if (destructive.length) throw new Error(`Destructive migrations require manual review: ${destructive.join(", ")}`);

const legacySelfRecording = [...sql.matchAll(/INSERT\s+INTO\s+private\.__dali_migrations/gi)].length;
console.log(JSON.stringify({ status: "ok", tables: expected.size, migrationFiles: files.length, missingColumns: 0, destructiveMigrations: 0, legacySelfRecordingStatementsHandledByRunner: legacySelfRecording }));
