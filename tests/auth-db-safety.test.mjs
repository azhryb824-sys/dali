import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("production startup requires explicit persistent database configuration", async () => {
  const [startup, database, render] = await Promise.all([
    source("scripts/render-start.mjs"),
    source("db/index.ts"),
    source("render.yaml"),
  ]);

  assert.doesNotMatch(startup, /process\.env\.DATABASE_URL\s*\|\|/);
  assert.match(startup, /DATABASE_URL_MISSING/);
  assert.match(startup, /UPLOADS_DIR_MISSING/);
  assert.match(startup, /DATABASE_FILE_PATH_MUST_BE_ABSOLUTE/);
  assert.match(database, /DATABASE_URL_UNSUPPORTED/);
  assert.doesNotMatch(database, /file:\.data\/dali\.db/);
  assert.match(render, /DATABASE_URL\n\s+value: file:\/var\/data\/dali\.db/);
  assert.match(render, /UPLOADS_DIR\n\s+value: \/var\/data\/uploads/);
});

test("portal authorization uses trusted email configuration instead of hardcoded identifiers", async () => {
  const [access, login, config, releaseNotes] = await Promise.all([
    source("lib/portal-access.ts"),
    source("app/api/auth/login/route.ts"),
    source("lib/portal-auth-config.ts"),
    source("RELEASE_NOTES.md"),
  ]);

  assert.doesNotMatch(access, /authorizedUserIdentifiers|userIdentifier/);
  assert.doesNotMatch(`${access}\n${releaseNotes}`, /1000000001/);
  assert.match(access, /getPortalAdminConfig\(\)\.emails\.has\(email\)/);
  assert.match(config, /PORTAL_ADMIN_EMAIL/);
  assert.match(config, /PORTAL_ADMIN_EMAILS/);
  assert.match(config, /PORTAL_ADMIN_IDENTIFIER/);
  assert.match(login, /normalizePortalIdentifier/);
  assert.match(login, /portalUsers/);
  assert.match(login, /PORTAL_ADMIN_BOOTSTRAP_CONFLICT/);
  assert.doesNotMatch(login, /JSON\.stringify\(\{\s*error/);
  assert.doesNotMatch(login, /error\.message/);
});

test("liveness and readiness are separate deployment signals", async () => {
  const [legacy, live, ready, render] = await Promise.all([
    source("app/api/health/route.ts"),
    source("app/api/health/live/route.ts"),
    source("app/api/health/ready/route.ts"),
    source("render.yaml"),
  ]);

  assert.match(render, /healthCheckPath: \/api\/health\/live/);
  assert.match(legacy, /\.\/live\/route/);
  assert.doesNotMatch(live, /getSqlClient|getDb|SELECT 1/);
  assert.match(ready, /SELECT 1 AS healthy/);
  assert.match(ready, /status: 503/);
});

test("legacy and live stay healthy while ready reports an unavailable database", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("auth-db-safety-test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const env = {
    ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
    DB: {
      prepare() {
        return {
          bind() { return this; },
          async first() { throw Object.assign(new Error("offline"), { code: "DB_OFFLINE" }); },
        };
      },
    },
  };
  const context = { waitUntil() {}, passThroughOnException() {} };

  for (const path of ["/api/health", "/api/health/live"]) {
    const response = await worker.fetch(new Request(`http://localhost${path}`), env, context);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).status, "ok");
  }

  const ready = await worker.fetch(new Request("http://localhost/api/health/ready"), env, context);
  assert.equal(ready.status, 503);
  const body = await ready.json();
  assert.equal(body.status, "degraded");
  assert.equal(body.services.database, "unavailable");
  assert.ok(body.errorCodes.includes("DB_OFFLINE"));
});
