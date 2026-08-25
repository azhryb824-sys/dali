import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL?.trim();
const requestedName = process.argv[2]?.trim();
if (!databaseUrl) throw new Error("DATABASE_URL_MISSING");
if (!requestedName || basename(requestedName) !== requestedName || !/^\d+_[a-z0-9_-]+\.sql$/.test(requestedName)) {
  throw new Error("MIGRATION_NAME_REQUIRED");
}

const migrationPath = resolve("drizzle-pg", requestedName);
const migration = await readFile(migrationPath, "utf8");
const checksum = createHash("sha256").update(migration).digest("hex");
const sql = postgres(databaseUrl, { max: 1, prepare: false });

try {
  await sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(644255071)`;
    await tx`create schema if not exists private`;
    await tx`
      create table if not exists private.__dali_migrations (
        name text primary key,
        checksum text not null,
        applied_at timestamptz not null default now()
      )
    `;
    const [existing] = await tx`select checksum from private.__dali_migrations where name = ${requestedName} limit 1`;
    if (existing) {
      if (existing.checksum !== checksum) throw new Error("MIGRATION_CHECKSUM_MISMATCH");
      console.log(`Migration already applied: ${requestedName}`);
      return;
    }
    await tx.unsafe(migration.replaceAll("--> statement-breakpoint", "\n"));
    await tx`insert into private.__dali_migrations (name, checksum) values (${requestedName}, ${checksum})`;
    console.log(`Migration applied: ${requestedName}`);
  });
} finally {
  await sql.end({ timeout: 5 });
}
