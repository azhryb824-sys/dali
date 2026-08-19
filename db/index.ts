import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";
import { drizzle as drizzleLibsql } from "drizzle-orm/libsql";
import type { Client } from "@libsql/client";
import * as schema from "./schema";
import { getRuntimeEnv } from "@/lib/runtime-env";
import { OperationalError } from "@/lib/operational-error";

let nodeClient: Client | undefined;
let nodeCreateClient: typeof import("@libsql/client/node").createClient | undefined;
let renderRecoveryReported = false;
const LIBSQL_COMPATIBLE_SCHEMES = new Set(["file", "libsql", "http", "https", "ws", "wss"]);
const RENDER_DATABASE_PATH = "/var/data/dali.db";
const RENDER_DATABASE_URL = `file:${RENDER_DATABASE_PATH}`;

type MinimalNodeStat = { isFile(): boolean; size: number };
type MinimalNodeFs = { statSync(path: string): MinimalNodeStat };
type MinimalNodeModule = { createRequire(filename: string | URL): (specifier: string) => unknown };
type ProcessWithBuiltinModule = typeof process & { getBuiltinModule?: (specifier: string) => unknown };

function nodeBuiltinModule<T>(specifier: string): T {
  if (typeof process === "undefined") throw new OperationalError("NODE_RUNTIME_UNAVAILABLE");
  const getBuiltinModule = (process as ProcessWithBuiltinModule).getBuiltinModule;
  if (typeof getBuiltinModule !== "function") throw new OperationalError("NODE_BUILTIN_MODULE_UNAVAILABLE");
  const module = getBuiltinModule(specifier) as T | undefined;
  if (!module) throw new OperationalError("NODE_BUILTIN_MODULE_UNAVAILABLE");
  return module;
}

function loadNodeCreateClient() {
  if (nodeCreateClient) return nodeCreateClient;
  const moduleApi = nodeBuiltinModule<MinimalNodeModule>("node:module");
  if (typeof moduleApi.createRequire !== "function") {
    throw new OperationalError("NODE_CREATE_REQUIRE_UNAVAILABLE");
  }
  const nodeRequire = moduleApi.createRequire(import.meta.url);
  const clientModule = nodeRequire("@libsql/client/node") as typeof import("@libsql/client/node");
  if (typeof clientModule.createClient !== "function") {
    throw new OperationalError("NODE_LIBSQL_CLIENT_UNAVAILABLE");
  }
  nodeCreateClient = clientModule.createClient;
  return nodeCreateClient;
}

function isRenderRuntime() {
  return typeof process !== "undefined" && process.env.RENDER === "true";
}

function renderPersistentDatabaseUrl() {
  if (!isRenderRuntime()) return null;

  try {
    const fileSystem = nodeBuiltinModule<MinimalNodeFs>("node:fs");
    if (!fileSystem.statSync) throw new OperationalError("RENDER_DATABASE_RECOVERY_INSPECTION_UNAVAILABLE");
    const information = fileSystem.statSync(RENDER_DATABASE_PATH);
    if (!information.isFile() || information.size < 1) {
      throw new OperationalError("RENDER_DATABASE_RECOVERY_FILE_INVALID");
    }
    if (!renderRecoveryReported) {
      renderRecoveryReported = true;
      console.warn("[database] RENDER_DATABASE_URL_RECOVERED");
    }
    return RENDER_DATABASE_URL;
  } catch (error) {
    if (error instanceof OperationalError) throw error;
    if (typeof error === "object" && error && "code" in error && error.code === "ENOENT") {
      throw new OperationalError("RENDER_DATABASE_RECOVERY_FILE_MISSING");
    }
    throw new OperationalError("RENDER_DATABASE_RECOVERY_INSPECTION_FAILED");
  }
}

export function getDb(): DrizzleD1Database<typeof schema> {
  const database = getRuntimeEnv().DB;
  if (database) return drizzle(database, { schema });
  return drizzleLibsql(getSqlClient(), { schema }) as unknown as DrizzleD1Database<typeof schema>;
}

export function getConfiguredDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    const recovered = renderPersistentDatabaseUrl();
    if (recovered) return recovered;
    throw new OperationalError("DATABASE_URL_MISSING");
  }

  const scheme = databaseUrl.match(/^([a-z][a-z0-9+.-]*):/i)?.[1]?.toLowerCase();
  if (!scheme || !LIBSQL_COMPATIBLE_SCHEMES.has(scheme)) {
    const recovered = renderPersistentDatabaseUrl();
    if (recovered) return recovered;
    throw new OperationalError("DATABASE_URL_UNSUPPORTED");
  }
  if (scheme === "file" && !databaseUrl.slice("file:".length).trim()) {
    throw new OperationalError("DATABASE_FILE_PATH_MISSING");
  }
  return databaseUrl;
}

export function getSqlClient() {
  nodeClient ??= loadNodeCreateClient()({
    url: getConfiguredDatabaseUrl(),
    authToken: process.env.DATABASE_AUTH_TOKEN,
  });
  return nodeClient;
}
