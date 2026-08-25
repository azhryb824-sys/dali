import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("explicit PostgreSQL migrations are locked, transactional, checksummed and idempotent", async () => {
  const [runner, packageJson, runbook, staticAudit, databaseAudit] = await Promise.all([
    source("scripts/apply-postgres-migration.mjs"),
    source("package.json"),
    source("docs/operations-runbook.md"),
    source("scripts/audit-migrations.mjs"),
    source("scripts/audit-postgres-schema.mjs"),
  ]);
  assert.match(runner, /pg_advisory_xact_lock/);
  assert.match(runner, /sql\.begin/);
  assert.match(runner, /createHash\("sha256"\)/);
  assert.match(runner, /MIGRATION_CHECKSUM_MISMATCH/);
  assert.match(runner, /Migration already applied/);
  assert.match(runner, /Legacy migration registered with checksum/);
  assert.match(runner, /historical migrations recorded themselves/i);
  assert.match(packageJson, /db:apply:postgres/);
  assert.match(packageJson, /db:audit:migrations/);
  assert.match(packageJson, /db:audit:postgres/);
  assert.match(staticAudit, /missingColumns: 0/);
  assert.match(databaseAudit, /information_schema\.columns/);
  assert.match(runbook, /0039_replace_urdu_with_bengali\.sql/);
  assert.match(runbook, /لا تستخدم `pg_restore --clean`/);
});
