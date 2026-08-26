import assert from "node:assert/strict";
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
