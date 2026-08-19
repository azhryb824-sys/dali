import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";
import { drizzle as drizzleLibsql } from "drizzle-orm/libsql";
import { createClient, type Client } from "@libsql/client";
import * as schema from "./schema";
import { getRuntimeEnv } from "@/lib/runtime-env";
import { OperationalError } from "@/lib/operational-error";

let nodeClient: Client | undefined;
const LIBSQL_COMPATIBLE_SCHEMES = new Set(["file", "libsql", "http", "https", "ws", "wss"]);

export function getDb(): DrizzleD1Database<typeof schema> {
  const database = getRuntimeEnv().DB;
  if (database) return drizzle(database, { schema });
  return drizzleLibsql(getSqlClient(), { schema }) as unknown as DrizzleD1Database<typeof schema>;
}

export function getConfiguredDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new OperationalError("DATABASE_URL_MISSING");

  const scheme = databaseUrl.match(/^([a-z][a-z0-9+.-]*):/i)?.[1]?.toLowerCase();
  if (!scheme || !LIBSQL_COMPATIBLE_SCHEMES.has(scheme)) {
    throw new OperationalError("DATABASE_URL_UNSUPPORTED");
  }
  if (scheme === "file" && !databaseUrl.slice("file:".length).trim()) {
    throw new OperationalError("DATABASE_FILE_PATH_MISSING");
  }
  return databaseUrl;
}

export function getSqlClient() {
  nodeClient ??= createClient({
    url: getConfiguredDatabaseUrl(),
    authToken: process.env.DATABASE_AUTH_TOKEN,
  });
  return nodeClient;
}
