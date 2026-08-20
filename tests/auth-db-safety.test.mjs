import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("production uses PostgreSQL with safe pooled-connection settings", async () => {
  const [startup, database, render, vite] = await Promise.all([
    source("scripts/render-start.mjs"), source("db/index.ts"), source("render.yaml"), source("vite.config.ts"),
  ]);
  assert.match(startup, /from "postgres"/);
  assert.match(startup, /DATABASE_URL_MISSING/);
  assert.match(startup, /DATABASE_URL_UNSUPPORTED/);
  assert.match(startup, /prepare: false/);
  assert.match(startup, /ssl: "require"/);
  assert.match(startup, /private\.__dali_migrations/);
  assert.match(startup, /drizzle-pg/);
  assert.match(startup, /DATABASE_MIGRATIONS_PENDING/);
  assert.doesNotMatch(startup, /create schema|create table|transaction\.unsafe/);
  assert.doesNotMatch(startup, /libsql|VACUUM INTO|PRAGMA/);
  assert.match(database, /drizzle-orm\/postgres-js/);
  assert.match(database, /POSTGRES_SCHEMES/);
  assert.match(database, /prepare: false/);
  assert.match(database, /ssl: "require"/);
  assert.doesNotMatch(database, /libsql|file:\.data\/dali\.db/);
  assert.match(vite, /node_modules\/postgres\/src\/index\.js/);
  assert.match(render, /autoDeployTrigger: commit/);
  assert.match(render, /DATABASE_URL\n\s+sync: false/);
  assert.doesNotMatch(render, /file:\/var\/data\/dali\.db|\n\s+disk:/);
});

test("portal authorization uses trusted configuration", async () => {
  const [access, login, config, notes] = await Promise.all([
    source("lib/portal-access.ts"), source("app/api/auth/login/route.ts"),
    source("lib/portal-auth-config.ts"), source("RELEASE_NOTES.md"),
  ]);
  assert.doesNotMatch(access, /authorizedUserIdentifiers|userIdentifier/);
  assert.doesNotMatch(`${access}\n${notes}`, /1000000001/);
  assert.match(access, /getPortalAdminConfig\(\)\.emails\.has\(email\)/);
  assert.match(login, /PORTAL_ADMIN_BOOTSTRAP_CONFLICT/);
  assert.match(config, /PORTAL_ADMIN_EMAIL/);
});

test("liveness and readiness are separate deployment signals", async () => {
  const [legacy, live, ready, render] = await Promise.all([
    source("app/api/health/route.ts"), source("app/api/health/live/route.ts"),
    source("app/api/health/ready/route.ts"), source("render.yaml"),
  ]);
  assert.match(render, /healthCheckPath: \/api\/health\/ready/);
  assert.match(legacy, /\.\/live\/route/);
  assert.doesNotMatch(live, /getSqlClient|getDb|SELECT 1/);
  assert.match(ready, /SELECT 1 AS healthy/);
  assert.match(ready, /portal_auth_credentials/);
  assert.match(ready, /status: 503/);
});
