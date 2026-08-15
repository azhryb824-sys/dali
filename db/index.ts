import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";
import { drizzle as drizzleLibsql } from "drizzle-orm/libsql";
import { createClient, type Client } from "@libsql/client";
import * as schema from "./schema";
import { getRuntimeEnv } from "@/lib/runtime-env";

let nodeClient: Client | undefined;

export function getDb(): DrizzleD1Database<typeof schema> {
  const database = getRuntimeEnv().DB;
  if (database) return drizzle(database, { schema });
  return drizzleLibsql(getSqlClient(), { schema }) as unknown as DrizzleD1Database<typeof schema>;
}

export function getSqlClient() {
  nodeClient ??= createClient({
    url: process.env.DATABASE_URL || "file:.data/dali.db",
    authToken: process.env.DATABASE_AUTH_TOKEN,
  });
  return nodeClient;
}
