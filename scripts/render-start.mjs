import postgres from "postgres";
import { mkdir, readdir } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { spawn } from "node:child_process";

const databaseUrl = process.env.DATABASE_URL?.trim();
const uploadsDir = process.env.UPLOADS_DIR?.trim() || "/opt/render/project/src/.data/uploads";

function startupFailure(code) {
  process.stderr.write(`[startup] ${code}\n`);
  process.exit(1);
}

const scheme = databaseUrl?.match(/^([a-z][a-z0-9+.-]*):/i)?.[1]?.toLowerCase();
if (!databaseUrl) startupFailure("DATABASE_URL_MISSING");
if (scheme !== "postgres" && scheme !== "postgresql") startupFailure("DATABASE_URL_UNSUPPORTED");
if (!isAbsolute(uploadsDir)) startupFailure("UPLOADS_DIR_MUST_BE_ABSOLUTE");

await mkdir(uploadsDir, { recursive: true, mode: 0o700 });
const sql = postgres(databaseUrl, {
  max: 1,
  connect_timeout: 20,
  idle_timeout: 20,
  prepare: false,
  ssl: "require",
});

try {
  const appliedRows = await sql`select name from private.__dali_migrations`;
  const applied = new Set(appliedRows.map((row) => String(row.name)));
  const folder = resolve("drizzle-pg");
  const files = (await readdir(folder)).filter((name) => /^\d+_.+\.sql$/.test(name)).sort();
  const pending = files.filter((name) => !applied.has(name));
  if (pending.length) startupFailure(`DATABASE_MIGRATIONS_PENDING:${pending.join(",")}`);
  await sql`select 1`;
} finally {
  await sql.end({ timeout: 5 });
}

const child = spawn(process.execPath, ["dist/standalone/server.js"], {
  stdio: "inherit",
  env: { ...process.env, HOSTNAME: "0.0.0.0", DATABASE_URL: databaseUrl, UPLOADS_DIR: uploadsDir },
});
child.on("exit", (code, signal) => process.exit(signal ? 1 : (code ?? 1)));
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => child.kill(signal));
