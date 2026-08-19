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
  const builtin = getBuiltinModule(specifier) as T | undefined;
  if (!builtin) throw new OperationalError("NODE_BUILTIN_MODULE_UNAVAILABLE");
  return builtin;
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
  if (typeof process === "undefined") return false;
  const env = process.env;
  return env.RENDER === "true"
    || Boolean(env.RENDER_SERVICE_ID || env.RENDER_EXTERNAL_HOSTNAME || env.RENDER_EXTERNAL_URL || env.RENDER_INSTANCE_ID);
}

function renderPersistentDatabaseUrl(options: { allowFileEvidence?: boolean } = {}) {
  const renderRuntime = isRenderRuntime();
  if (!renderRuntime && !options.allowFileEvidence) return null;

  try {
    const fileSystem = nodeBuiltinModule<MinimalNodeFs>("node:fs");
    if (!fileSystem.statSync) throw new OperationalError("RENDER_DATABASE_RECOVERY_INSPECTION_UNAVAILABLE");
    const information = fileSystem.statSync(RENDER_DATABASE_PATH);
    if (!information.isFile() || information.size < 1) {
      if (!renderRuntime) return null;
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
      if (!renderRuntime) return null;
      throw new OperationalError("RENDER_DATABASE_RECOVERY_FILE_MISSING");
    }
    if (!renderRuntime) return null;
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
    const recovered = renderPersistentDatabaseUrl({ allowFileEvidence: true });
    if (recovered) return recovered;
    throw new OperationalError("DATABASE_URL_MISSING");
  }

  const scheme = databaseUrl.match(/^([a-z][a-z0-9+.-]*):/i)?.[1]?.toLowerCase();
  if (!scheme || !LIBSQL_COMPATIBLE_SCHEMES.has(scheme)) {
    const recovered = renderPersistentDatabaseUrl({ allowFileEvidence: true });
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
