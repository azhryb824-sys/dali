import { mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { dirname, isAbsolute } from "node:path";

const supportedSchemes = new Set(["file", "libsql", "http", "https", "ws", "wss"]);
const env = { ...process.env };
const isRenderBuild = env.RENDER === "true"
  || Boolean(env.RENDER_SERVICE_ID)
  || Boolean(env.RENDER_GIT_COMMIT)
  || Boolean(env.RENDER_EXTERNAL_HOSTNAME);

function scheme(value) {
  return value?.match(/^([a-z][a-z0-9+.-]*):/i)?.[1]?.toLowerCase();
}

if (isRenderBuild) {
  const configuredScheme = scheme(env.DATABASE_URL?.trim());
  if (!configuredScheme || !supportedSchemes.has(configuredScheme)) {
    env.DATABASE_URL = "file:/tmp/dali-render-build.db";
    process.stdout.write("[build] using isolated SQLite database for Render build\n");
  }

  if (!env.UPLOADS_DIR || !isAbsolute(env.UPLOADS_DIR)) {
    env.UPLOADS_DIR = "/tmp/dali-render-build-uploads";
    process.stdout.write("[build] using isolated uploads directory for Render build\n");
  }
}

if (env.DATABASE_URL?.startsWith("file:")) {
  const databasePath = env.DATABASE_URL.slice("file:".length);
  if (databasePath && databasePath !== ":memory:" && isAbsolute(databasePath)) {
    await mkdir(dirname(databasePath), { recursive: true, mode: 0o700 });
  }
}
if (env.UPLOADS_DIR && isAbsolute(env.UPLOADS_DIR)) {
  await mkdir(env.UPLOADS_DIR, { recursive: true, mode: 0o700 });
}

const child = spawn("bash", ["scripts/build-verified.sh"], {
  stdio: "inherit",
  env,
});
child.on("error", (error) => {
  console.error("[build] failed to start verified build", error);
  process.exit(1);
});
child.on("exit", (code, signal) => {
  process.exit(signal ? 1 : (code ?? 1));
});
