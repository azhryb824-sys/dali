import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";
import * as schema from "./schema";
import { OperationalError } from "@/lib/operational-error";

let nodeClient: Sql | undefined;
let database: PostgresJsDatabase<typeof schema> | undefined;
const POSTGRES_SCHEMES = new Set(["postgres", "postgresql"]);

export function getConfiguredDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new OperationalError("DATABASE_URL_MISSING");

  const scheme = databaseUrl.match(/^([a-z][a-z0-9+.-]*):/i)?.[1]?.toLowerCase();
  if (!scheme || !POSTGRES_SCHEMES.has(scheme)) {
    throw new OperationalError("DATABASE_URL_UNSUPPORTED");
  }
  return databaseUrl;
}

export function getSqlClient() {
  nodeClient ??= postgres(getConfiguredDatabaseUrl(), {
    max: 5,
    idle_timeout: 20,
    connect_timeout: 15,
    prepare: false,
    ssl: "require",
  });
  return nodeClient;
}

export function getDb() {
  database ??= drizzle(getSqlClient(), { schema });
  return database;
}
