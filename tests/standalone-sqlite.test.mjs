import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function availablePort() {
  const server = createServer();
  server.unref();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const port = address.port;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function waitForResponse(url, child, output, timeoutMilliseconds = 20_000) {
  const deadline = Date.now() + timeoutMilliseconds;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`standalone server exited with ${child.exitCode}\n${output.value}`);
    }
    try {
      return await fetch(url, { signal: AbortSignal.timeout(2_000) });
    } catch {
      await delay(250);
    }
  }
  throw new Error(`standalone server did not respond at ${url}\n${output.value}`);
}

test("standalone Node server uses the Node libSQL client for a file database", { timeout: 35_000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "dali-standalone-sqlite-"));
  const port = await availablePort();
  const output = { value: "" };
  const child = spawn(process.execPath, ["dist/standalone/server.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      HOSTNAME: "127.0.0.1",
      PORT: String(port),
      RENDER: "true",
      AUTH_MODE: "credentials",
      DATABASE_URL: `file:${join(directory, "dali.db")}`,
      UPLOADS_DIR: join(directory, "uploads"),
      AUTH_SECRET: "standalone-test-auth-secret-with-more-than-32-characters",
      PORTAL_ADMIN_IDENTIFIER: "1234567890",
      PORTAL_ADMIN_EMAIL: "admin@example.test",
      PORTAL_ADMIN_EMAILS: "admin@example.test",
      PORTAL_ADMIN_NAME: "Standalone Test Administrator",
      PORTAL_ADMIN_PASSWORD_HASH: "pbkdf2$310000$AAAAAAAAAAAAAAAAAAAAAA$BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { output.value += chunk; });
  child.stderr.on("data", (chunk) => { output.value += chunk; });

  t.after(async () => {
    if (child.exitCode === null) child.kill("SIGTERM");
    if (child.exitCode === null) {
      await Promise.race([once(child, "exit"), delay(3_000)]).catch(() => undefined);
    }
    await rm(directory, { recursive: true, force: true });
  });

  const live = await waitForResponse(`http://127.0.0.1:${port}/api/health/live`, child, output);
  assert.equal(live.status, 200, output.value);
  assert.equal((await live.json()).status, "ok", output.value);

  const ready = await waitForResponse(`http://127.0.0.1:${port}/api/health/ready`, child, output);
  const readyText = await ready.text();
  assert.equal(ready.status, 200, `${readyText}\n${output.value}`);
  const body = JSON.parse(readyText);
  assert.equal(body.status, "ok", output.value);
  assert.equal(body.services.database, "ok", output.value);
  assert.equal(body.services.auth, "ok", output.value);
  assert.doesNotMatch(output.value, /URL_SCHEME_NOT_SUPPORTED/);
});
