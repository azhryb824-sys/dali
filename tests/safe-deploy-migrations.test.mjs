import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(path, "utf8");

test("safe deployment accepts only new checksummed PostgreSQL migrations", async () => {
  const [deploy, runner] = await Promise.all([
    read("scripts/deploy-safe-godaddy.sh"),
    read("scripts/apply-postgres-migration.mjs"),
  ]);

  assert.match(deploy, /git diff --name-status/);
  assert.match(deploy, /existing migrations cannot be changed or removed/);
  assert.match(deploy, /unsupported database change requires manual deployment/);
  assert.match(deploy, /db\/schema\.ts changed without a new PostgreSQL migration/);
  assert.match(deploy, /node scripts\/apply-postgres-migration\.mjs/);
  assert.match(deploy, /npm run db:audit:postgres/);
  assert.match(runner, /pg_advisory_xact_lock/);
  assert.match(runner, /lock_timeout = '10s'/);
  assert.match(runner, /statement_timeout = '5min'/);
  assert.match(runner, /MIGRATION_CHECKSUM_MISMATCH/);
  assert.match(runner, /sql\.begin/);
});

test("additive migrations run before the canary and remain explicit on rollback", async () => {
  const deploy = await read("scripts/deploy-safe-godaddy.sh");
  const migration = deploy.indexOf('stage="database_migration"');
  const canary = deploy.indexOf('stage="canary_start"');
  const swap = deploy.indexOf('stage="controlled_swap"');

  assert.ok(migration > 0);
  assert.ok(canary > migration);
  assert.ok(swap > canary);
  assert.match(deploy, /ADDITIVE_DATABASE_MIGRATIONS_RETAINED/);
  assert.match(deploy, /DATABASE_MIGRATIONS_OK/);
  assert.match(deploy, /DATABASE_MIGRATIONS=/);
});
