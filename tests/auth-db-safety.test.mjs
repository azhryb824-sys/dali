import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("the Node libSQL entrypoint supports local SQLite", async () => {
  const { createClient } = await import("@libsql/client/node");
  const client = createClient({ url: "file::memory:" });
  const result = await client.execute("SELECT 1 AS healthy");
  assert.equal(Number(result.rows[0]?.healthy), 1);
  client.close();
});

test("production startup and runtime require the existing persistent database", async () => {
  const [startup, database, render] = await Promise.all([
    source("scripts/render-start.mjs"),
    source("db/index.ts"),
    source("render.yaml"),
  ]);

  assert.match(startup, /from "@libsql\/client\/node"/);
  assert.doesNotMatch(startup, /from "@libsql\/client"/);
  assert.doesNotMatch(startup, /process\.env\.DATABASE_URL\s*\|\|/);
  assert.match(startup, /DATABASE_URL_MISSING/);
  assert.match(startup, /UPLOADS_DIR_MISSING/);
  assert.match(startup, /DATABASE_FILE_PATH_MUST_BE_ABSOLUTE/);
  assert.match(startup, /function isRenderRuntime\(\)/);
  assert.match(startup, /RENDER_EXTERNAL_HOSTNAME/);
  assert.match(startup, /RENDER_SERVICE_ID/);
  assert.match(startup, /if \(!isRenderRuntime\(\)\) return/);
  assert.match(startup, /RENDER_DATABASE_URL_RECOVERED/);
  assert.match(startup, /RENDER_DATABASE_RECOVERY_FILE_MISSING/);
  assert.match(startup, /async function requireExistingRenderDatabase\(databasePath\)/);
  assert.match(startup, /RENDER_DATABASE_FILE_MISSING/);
  assert.match(startup, /RENDER_DATABASE_FILE_INVALID/);
  assert.match(startup, /if \(isRenderRuntime\(\)\) await requireExistingRenderDatabase\(databasePath\)/);
  assert.match(startup, /else await mkdir\(dirname\(databasePath\)/);
  assert.match(startup, /dali-predeploy-/);
  assert.match(startup, /copyFile/);
  assert.match(startup, /backups\.slice\(12\)/);

  assert.match(database, /import type \{ Client \} from "@libsql\/client"/);
  assert.doesNotMatch(database, /import \{[^}]*createClient[^}]*\} from "@libsql\/client"/);
  assert.match(database, /createRequire\(import\.meta\.url\)/);
  assert.match(database, /nodeRequire\("@libsql\/client\/node"\)/);
  assert.match(database, /NODE_LIBSQL_CLIENT_UNAVAILABLE/);
  assert.match(database, /DATABASE_URL_UNSUPPORTED/);
  assert.match(database, /RENDER_DATABASE_PATH = "\/var\/data\/dali\.db"/);
  assert.match(database, /RENDER_EXTERNAL_HOSTNAME/);
  assert.match(database, /allowFileEvidence/);
  assert.match(database, /renderPersistentDatabaseUrl\(\{ allowFileEvidence: true \}\)/);
  assert.match(database, /statSync\(RENDER_DATABASE_PATH\)/);
  assert.match(database, /information\.size < 1/);
  assert.match(database, /RENDER_DATABASE_RECOVERY_FILE_MISSING/);
  assert.match(database, /RENDER_DATABASE_RECOVERY_FILE_INVALID/);
  assert.match(database, /RENDER_DATABASE_URL_RECOVERED/);
  assert.doesNotMatch(database, /file:\.data\/dali\.db/);

  assert.match(render, /autoDeployTrigger: commit/);
  assert.doesNotMatch(render, /^\s*autoDeploy:/m);
  assert.match(render, /DATABASE_URL\n\s+value: file:\/var\/data\/dali\.db/);
  assert.match(render, /UPLOADS_DIR\n\s+value: \/var\/data\/uploads/);
});

test("portal authorization uses trusted configuration instead of hardcoded identifiers", async () => {
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
  assert.match(config, /isRenderEnvironment/);
  assert.match(config, /RENDER_EXTERNAL_HOSTNAME/);
  assert.match(config, /isRenderEnvironment\(env\) \? "credentials" : "chatgpt"/);
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
  assert.match(ready, /portal_auth_credentials/);
  assert.match(ready, /hasStoredCredential/);
  assert.match(ready, /adminConfig\.complete \|\| await hasStoredCredential\(\)/);
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
