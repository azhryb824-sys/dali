import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import test from "node:test";

test("Render startup rejects the obsolete SQLite database URL", async () => {
  const child = spawn(process.execPath, ["scripts/render-start.mjs"], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: "file:/var/data/dali.db", UPLOADS_DIR: "/tmp/dali-test-uploads" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  const [code] = await once(child, "exit");
  assert.equal(code, 1);
  assert.match(output, /DATABASE_URL_UNSUPPORTED/);
});
