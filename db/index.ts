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
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL environment variable is not configured. " +
      "Please set DATABASE_URL to a valid libsql:// URL or use Cloudflare D1 binding. " +
      "For local development, use 'file:/var/data/dali.db' or 'libsql://'. " +
      "For Render deployment, configure a proper database URL in environment variables."
    );
  }

  nodeClient ??= createClient({
    url: databaseUrl,
    authToken: process.env.DATABASE_AUTH_TOKEN,
  });
  return nodeClient;
}
