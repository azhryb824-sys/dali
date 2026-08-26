import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../drizzle-pg/0047_object_storage_runtime_repair.sql", import.meta.url), "utf8");
const audit = await readFile(new URL("../scripts/audit-storage-runtime.mjs", import.meta.url), "utf8");
const schemaAudit = await readFile(new URL("../scripts/audit-postgres-schema.mjs", import.meta.url), "utf8");
const importer = await readFile(new URL("../scripts/import-file-storage-to-postgres.mjs", import.meta.url), "utf8");
const payments = await readFile(new URL("../app/api/portal/contract-payments/route.ts", import.meta.url), "utf8");
const contractRoute = await readFile(new URL("../app/api/portal/contracts/[id]/route.ts", import.meta.url), "utf8");
const statusRoute = await readFile(new URL("../app/api/portal/contracts/[id]/status/route.ts", import.meta.url), "utf8");

test("storage repair is idempotent and safe on standalone PostgreSQL", () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS private\.object_storage/);
  assert.match(migration, /CREATE INDEX IF NOT EXISTS object_storage_updated_at_idx/);
  assert.match(migration, /IF EXISTS \(SELECT 1 FROM pg_roles WHERE rolname = 'anon'\)/);
  assert.doesNotMatch(migration, /DROP TABLE|TRUNCATE|DELETE FROM private\.object_storage/i);
});

test("storage audit performs round-trip and checks every storage_key reference", () => {
  assert.match(audit, /INSERT INTO private\.object_storage/);
  assert.match(audit, /SELECT object_data, content_type, etag/);
  assert.match(audit, /DELETE FROM private\.object_storage/);
  assert.match(audit, /information_schema\.columns/);
  assert.match(audit, /missingObjects/);
  assert.match(schemaAudit, /objectStorageReady/);
});

test("legacy file importer preserves existing database objects", () => {
  assert.match(importer, /ON CONFLICT \(storage_key\) DO NOTHING/);
  assert.doesNotMatch(importer, /DO UPDATE|DELETE FROM|TRUNCATE/i);
});

test("owners and system admins retain contract management authority", () => {
  assert.match(payments, /canManageContracts:owner\(access\)\|\|await hasPortalPermission/);
  assert.match(contractRoute, /actor\.role === "admin"/);
  assert.match(contractRoute, /functionalRoles\.includes\("system_owner"\)/);
  assert.match(statusRoute, /access\.role === "admin"/);
});
