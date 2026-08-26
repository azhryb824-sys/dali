import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("login uses a self-contained stylesheet rather than the portal CSS bundle", async () => {
  const [layout, css] = await Promise.all([
    source("app/login/layout.tsx"),
    source("app/login/login.css"),
  ]);

  assert.match(layout, /import "\.\/login\.css"/);
  assert.doesNotMatch(layout, /portal\.css|portal\/enhancements\.css/);
  assert.match(css, /\.portal-gate\s*\{/);
  assert.match(css, /\.login-credentials-form/);
  assert.match(css, /\.access-request-form/);
  assert.match(css, /\.portal-gate \.gate-status/);
  assert.match(css, /width:\s*100%/);
  assert.match(css, /height:\s*auto/);
});

test("password recovery routes load the same isolated authentication styles", async () => {
  const [forgotLayout, resetLayout] = await Promise.all([
    source("app/forgot-password/layout.tsx"),
    source("app/reset-password/layout.tsx"),
  ]);

  assert.match(forgotLayout, /login\/login\.css/);
  assert.match(resetLayout, /login\/login\.css/);
});

test("GoDaddy startup rejects stale or incomplete Next static assets", async () => {
  const script = await source("scripts/start-godaddy.sh");

  assert.match(script, /rm -rf \.next/);
  assert.match(script, /\.next\/BUILD_ID/);
  assert.match(script, /\.next\/static/);
  assert.match(script, /-name '\*\.css'/);
  assert.match(script, /next start/);
  assert.doesNotMatch(script, /standalone\/server\.js/);
});

test("login repair migration restores only additive credential runtime structures", async () => {
  const migration = await source("drizzle-pg/0045_login_runtime_schema_repair.sql");

  for (const table of ["portal_users", "portal_auth_credentials", "password_reset_tokens", "public_rate_limits"]) {
    assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS "${table}"`));
  }
  assert.match(migration, /must_change_password/);
  assert.match(migration, /last_activity_at/);
  assert.match(migration, /preferred_language" IN \('ar','en','bn'\)/);
  assert.match(migration, /REVOKE ALL ON TABLE/);
  assert.doesNotMatch(migration, /DROP\s+TABLE|TRUNCATE|DROP\s+COLUMN/i);
});

test("one-command recovery preserves dollar signs and validates the deployed login path", async () => {
  const [repair, audit] = await Promise.all([
    source("scripts/repair-login-css.sh"),
    source("scripts/audit-auth-runtime.mjs"),
  ]);

  assert.match(repair, /export "\$key=\$value"/);
  assert.doesNotMatch(repair, /source \/etc\/dali\/dali\.env/);
  assert.match(repair, /0045_login_runtime_schema_repair\.sql/);
  assert.match(repair, /rm -rf \.next/);
  assert.match(repair, /error=service/);
  assert.match(repair, /_next\/static/);
  assert.match(audit, /invalidCredentialRows/);
  assert.match(audit, /missingTables/);
  assert.match(audit, /authSecretReady/);

  const syntax = spawnSync("bash", ["-n", "scripts/repair-login-css.sh"], { encoding: "utf8" });
  assert.equal(syntax.status, 0, syntax.stderr || syntax.stdout);
});
