import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) throw new Error("DATABASE_URL_MISSING");

const sql = postgres(databaseUrl, { max: 1, prepare: false, connect_timeout: 10 });
const testKey = `runtime-audit/storage-${Date.now()}-${crypto.randomUUID()}.bin`;
const expected = new Uint8Array([0, 1, 2, 3, 127, 128, 254, 255]);
let inserted = false;

try {
  const columns = await sql`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'private' AND table_name = 'object_storage'
    ORDER BY ordinal_position
  `;
  const actualColumns = new Set(columns.map((row) => row.column_name));
  const requiredColumns = ["storage_key", "object_data", "content_type", "etag", "updated_at"];
  const missingColumns = requiredColumns.filter((column) => !actualColumns.has(column));
  if (!columns.length) throw new Error("OBJECT_STORAGE_TABLE_MISSING");
  if (missingColumns.length) throw new Error(`OBJECT_STORAGE_COLUMNS_MISSING:${missingColumns.join(",")}`);

  const [privileges] = await sql`
    SELECT
      has_schema_privilege(current_user, 'private', 'USAGE') AS schema_usage,
      has_table_privilege(current_user, 'private.object_storage', 'SELECT,INSERT,UPDATE,DELETE') AS table_access
  `;
  if (!privileges.schema_usage || !privileges.table_access) throw new Error("OBJECT_STORAGE_PRIVILEGES_MISSING");

  await sql`
    INSERT INTO private.object_storage (storage_key, object_data, content_type, etag)
    VALUES (${testKey}, ${expected}, 'application/octet-stream', 'storage-audit')
  `;
  inserted = true;
  const [stored] = await sql`
    SELECT object_data, content_type, etag
    FROM private.object_storage
    WHERE storage_key = ${testKey}
  `;
  const actual = new Uint8Array(stored?.object_data || []);
  if (actual.length !== expected.length || actual.some((byte, index) => byte !== expected[index])) {
    throw new Error("OBJECT_STORAGE_ROUNDTRIP_MISMATCH");
  }
  await sql`DELETE FROM private.object_storage WHERE storage_key = ${testKey}`;
  inserted = false;

  const referenceTables = await sql`
    SELECT DISTINCT table_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'storage_key'
    ORDER BY table_name
  `;
  const references = [];
  let totalReferences = 0;
  let missingObjects = 0;
  for (const row of referenceTables) {
    const table = String(row.table_name);
    if (!/^[a-z0-9_]+$/.test(table)) throw new Error("UNSAFE_STORAGE_REFERENCE_TABLE");
    const [counts] = await sql.unsafe(`
      SELECT
        count(*) FILTER (WHERE source.storage_key IS NOT NULL AND source.storage_key <> '')::int AS references,
        count(*) FILTER (
          WHERE source.storage_key IS NOT NULL AND source.storage_key <> ''
            AND stored.storage_key IS NULL
        )::int AS missing
      FROM public."${table}" AS source
      LEFT JOIN private.object_storage AS stored ON stored.storage_key = source.storage_key
    `);
    const tableReferences = Number(counts?.references || 0);
    const tableMissing = Number(counts?.missing || 0);
    totalReferences += tableReferences;
    missingObjects += tableMissing;
    references.push({ table, references: tableReferences, missingObjects: tableMissing });
  }

  const [objects] = await sql`SELECT count(*)::int AS count FROM private.object_storage`;
  const result = {
    status: missingObjects ? "references_missing" : "ok",
    tableReady: true,
    privilegesReady: true,
    roundTripReady: true,
    storedObjects: Number(objects.count || 0),
    totalReferences,
    missingObjects,
    references,
  };
  console.log(JSON.stringify(result, null, 2));
  if (missingObjects) process.exitCode = 2;
} finally {
  if (inserted) await sql`DELETE FROM private.object_storage WHERE storage_key = ${testKey}`.catch(() => undefined);
  await sql.end({ timeout: 5 });
}
