import { createClient } from "@libsql/client/node";
import { mkdir, readFile, readdir, stat, unlink } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { spawn } from "node:child_process";

const supportedSchemes = new Set(["file", "libsql", "http", "https", "ws", "wss"]);
const renderRecoveryDatabaseUrl = "file:/var/data/dali.db";
const renderRecoveryDatabasePath = "/var/data/dali.db";
const renderRecoveryUploadsDir = "/var/data/uploads";
let databaseUrl = process.env.DATABASE_URL?.trim();
let uploadsDir = process.env.UPLOADS_DIR?.trim();
const allowEmptyDatabaseInitialization = process.env.ALLOW_EMPTY_DATABASE_INIT === "true";

function startupFailure(code) {
  process.stderr.write(`[startup] ${code}\n`);
  process.exit(1);
}

function urlScheme(value) {
  return value.match(/^([a-z][a-z0-9+.-]*):/i)?.[1]?.toLowerCase();
}

function isRenderRuntime() {
  return process.env.RENDER === "true"
    || Boolean(process.env.RENDER_EXTERNAL_HOSTNAME)
    || Boolean(process.env.RENDER_SERVICE_ID)
    || Boolean(process.env.RENDER_INSTANCE_ID);
}

async function recoverRenderPersistentConfiguration() {
  if (!isRenderRuntime()) return;

  const configuredScheme = databaseUrl ? urlScheme(databaseUrl) : undefined;
  const databaseConfigurationInvalid = !databaseUrl || !configuredScheme || !supportedSchemes.has(configuredScheme);
  if (databaseConfigurationInvalid) {
    try {
      const recoveryFile = await stat(renderRecoveryDatabasePath);
      if (!recoveryFile.isFile() || recoveryFile.size < 1) {
        startupFailure("RENDER_DATABASE_RECOVERY_FILE_INVALID");
      }
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
        startupFailure("RENDER_DATABASE_RECOVERY_FILE_MISSING");
      }
      throw error;
    }

    databaseUrl = renderRecoveryDatabaseUrl;
    process.stderr.write("[startup] RENDER_DATABASE_URL_RECOVERED\n");
  }

  if (!uploadsDir || !isAbsolute(uploadsDir)) {
    uploadsDir = renderRecoveryUploadsDir;
    process.stderr.write("[startup] RENDER_UPLOADS_DIR_RECOVERED\n");
  }
}

async function requireExistingRenderDatabase(databasePath) {
  if (!isRenderRuntime()) return;

  try {
    const information = await stat(databasePath);
    if (!information.isFile() || information.size < 1) {
      startupFailure("RENDER_DATABASE_FILE_INVALID");
    }
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      if (allowEmptyDatabaseInitialization) {
        await mkdir(dirname(databasePath), { recursive: true, mode: 0o700 });
        process.stderr.write("[startup] EMPTY_DATABASE_INITIALIZATION_AUTHORIZED\n");
        return;
      }
      startupFailure("RENDER_DATABASE_FILE_MISSING");
    }
    throw error;
  }
}

async function backUpSqliteDatabase(databasePath) {
  let information;
  try {
    information = await stat(databasePath);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return;
    throw error;
  }
  if (!information.isFile() || information.size < 1) return;

  const backupDirectory = join(dirname(databasePath), "backups");
  await mkdir(backupDirectory, { recursive: true, mode: 0o700 });
  const backupName = `dali-predeploy-${Date.now()}.db`;
  const backupPath = join(backupDirectory, backupName);
  const source = createClient({ url: `file:${databasePath}` });
  try { await source.execute({ sql: "VACUUM INTO ?", args: [backupPath] }); } finally { source.close(); }
  const verification = createClient({ url: `file:${backupPath}` });
  try {
    const result = await verification.execute("PRAGMA quick_check");
    if (String(result.rows[0]?.quick_check || "").toLowerCase() !== "ok") startupFailure("DATABASE_BACKUP_INTEGRITY_FAILED");
  } finally { verification.close(); }

  const backups = (await readdir(backupDirectory))
    .filter((name) => /^dali-predeploy-\d{13}\.db$/.test(name))
    .sort()
    .reverse();
  for (const staleName of backups.slice(12)) {
    const stalePath = join(backupDirectory, staleName);
    await unlink(stalePath).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
  }

  process.stdout.write(`[database] backup-created ${backupPath}\n`);
}

await recoverRenderPersistentConfiguration();

if (!databaseUrl) startupFailure("DATABASE_URL_MISSING");
const scheme = urlScheme(databaseUrl);
if (!scheme || !supportedSchemes.has(scheme)) startupFailure("DATABASE_URL_UNSUPPORTED");
if (!uploadsDir) startupFailure("UPLOADS_DIR_MISSING");
if (!isAbsolute(uploadsDir)) startupFailure("UPLOADS_DIR_MUST_BE_ABSOLUTE");

if (scheme === "file") {
  const databasePath = databaseUrl.slice("file:".length);
  if (!databasePath) startupFailure("DATABASE_FILE_PATH_MISSING");
  if (databasePath !== ":memory:" && !isAbsolute(databasePath)) startupFailure("DATABASE_FILE_PATH_MUST_BE_ABSOLUTE");
  if (databasePath !== ":memory:") {
    if (isRenderRuntime()) await requireExistingRenderDatabase(databasePath);
    else await mkdir(dirname(databasePath), { recursive: true, mode: 0o700 });
    await backUpSqliteDatabase(databasePath);
  }
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
