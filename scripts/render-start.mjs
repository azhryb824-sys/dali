import { createClient } from "@libsql/client";
import { mkdir, readFile, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { spawn } from "node:child_process";

const databaseUrl = process.env.DATABASE_URL || "file:/var/data/dali.db";
if (databaseUrl.startsWith("file:")) await mkdir(dirname(databaseUrl.slice(5)), { recursive: true, mode: 0o700 });
await mkdir(process.env.UPLOADS_DIR || "/var/data/uploads", { recursive: true, mode: 0o700 });

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
  env: { ...process.env, HOSTNAME: "0.0.0.0", DATABASE_URL: databaseUrl, UPLOADS_DIR: process.env.UPLOADS_DIR || "/var/data/uploads" },
});
child.on("exit", (code, signal) => process.exit(signal ? 1 : (code ?? 1)));
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => child.kill(signal));
