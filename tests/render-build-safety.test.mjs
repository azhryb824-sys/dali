import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../scripts/render-build.mjs", import.meta.url), "utf8");
const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

test("Render builds never initialize the application with an unsupported production database URL", () => {
  assert.equal(packageJson.scripts.build, "node scripts/render-build.mjs");
  assert.match(source, /RENDER_SERVICE_ID/);
  assert.match(source, /RENDER_GIT_COMMIT/);
  assert.match(source, /RENDER_EXTERNAL_HOSTNAME/);
  assert.match(source, /supportedSchemes/);
  assert.match(source, /file:\/tmp\/dali-render-build\.db/);
  assert.match(source, /\/tmp\/dali-render-build-uploads/);
  assert.match(source, /scripts\/build-verified\.sh/);
  assert.doesNotMatch(source, /\/var\/data\/dali\.db/);
});

test("the Render build wrapper does not print or copy database credentials", () => {
  assert.doesNotMatch(source, /console\.(?:log|error)\([^\n]*(?:DATABASE_URL|DATABASE_AUTH_TOKEN)/);
  assert.doesNotMatch(source, /process\.stdout\.write\([^\n]*(?:DATABASE_URL|DATABASE_AUTH_TOKEN)/);
  assert.doesNotMatch(source, /authToken/);
});
