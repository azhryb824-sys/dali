import { createClient } from "@libsql/client";
import { mkdir, readFile, readdir } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { spawn } from "node:child_process";

const supportedSchemes = new Set(["file", "libsql", "http", "https", "ws", "wss"]);
const databaseUrl = process.env.DATABASE_URL?.trim();
const uploadsDir = process.env.UPLOADS_DIR?.trim();

function startupFailure(code) {
  process.stderr.write(`[startup] ${code}\n`);
  process.exit(1);
}

if (!databaseUrl) startupFailure("DATABASE_URL_MISSING");
const scheme = databaseUrl.match(/^([a-z][a-z0-9+.-]*):/i)?.[1]?.toLowerCase();
if (!scheme || !supportedSchemes.has(scheme)) startupFailure("DATABASE_URL_UNSUPPORTED");
if (!uploadsDir) startupFailure("UPLOADS_DIR_MISSING");
if (!isAbsolute(uploadsDir)) startupFailure("UPLOADS_DIR_MUST_BE_ABSOLUTE");

if (scheme === "file") {
  const databasePath = databaseUrl.slice("file:".length);
  if (!databasePath) startupFailure("DATABASE_FILE_PATH_MISSING");
  if (databasePath !== ":memory:" && !isAbsolute(databasePath)) startupFailure("DATABASE_FILE_PATH_MUST_BE_ABSOLUTE");
  if (databasePath !== ":memory:") await mkdir(dirname(databasePath), { recursive: true, mode: 0o700 });
}
await mkdir(uploadsDir, { recursive: true, mode: 0o700 });

const client = createClient({ url: databaseUrl, authToken: process.env.DATABASE_AUTH_TOKEN });
await client.execute(`CREATE TABLE IF NOT EXISTS __dali_migrations (
  name TEXT PRIMARY KEY NOT NULL,
  applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);
const applied = new Set((await client.execute("SELECT name FROM __dali_migrations")).rows.map((row) => String(row.name)));
const folder = resolve("drizzle");
const files = (await readdir(folder)).filter((name) => /^\d+_.+\.sql$/.test(name)).sort();
for (const name of files) {
  if (applied.has(name)) continue;
  const sql = (await readFile(resolve(folder, name), "utf8")).replaceAll("--> statement-breakpoint", "\n");
  const escapedName = name.replaceAll("'", "''");
  await client.executeMultiple(`BEGIN;\n${sql}\nINSERT INTO __dali_migrations (name) VALUES ('${escapedName}');\nCOMMIT;`);
  process.stdout.write(`[database] applied ${name}\n`);
}
client.close();

const child = spawn(process.execPath, ["dist/standalone/server.js"], {
  stdio: "inherit",
  env: { ...process.env, HOSTNAME: "0.0.0.0", DATABASE_URL: databaseUrl, UPLOADS_DIR: uploadsDir },
});
child.on("exit", (code, signal) => process.exit(signal ? 1 : (code ?? 1)));
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => child.kill(signal));
