import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";
import { drizzle as drizzleLibsql } from "drizzle-orm/libsql";
import { createClient as createPortableClient, type Client } from "@libsql/client";
import * as schema from "./schema";
import { getRuntimeEnv } from "@/lib/runtime-env";
import { OperationalError } from "@/lib/operational-error";

let nodeClient: Client | undefined;
let nodeFileClientFactory: typeof createPortableClient | undefined;
let renderRecoveryReported = false;
const LIBSQL_COMPATIBLE_SCHEMES = new Set(["file", "libsql", "http", "https", "ws", "wss"]);
const RENDER_DATABASE_PATH = "/var/data/dali.db";
const RENDER_DATABASE_URL = `file:${RENDER_DATABASE_PATH}`;

type MinimalNodeStat = { isFile(): boolean; size: number };
type MinimalNodeFs = { statSync(path: string): MinimalNodeStat };
type MinimalNodeModule = { createRequire(filename: string | URL): (specifier: string) => unknown };
type ProcessWithBuiltinModule = typeof process & { getBuiltinModule?: (specifier: string) => unknown };

function isRenderRuntime() {
  if (typeof process === "undefined") return false;
  const env = process.env;
  return env.RENDER === "true"
    || Boolean(env.RENDER_SERVICE_ID || env.RENDER_EXTERNAL_HOSTNAME || env.RENDER_EXTERNAL_URL || env.RENDER_INSTANCE_ID);
}

function renderPersistentDatabaseUrl(options: { allowFileEvidence?: boolean } = {}) {
  const renderRuntime = isRenderRuntime();
  if (!renderRuntime && !options.allowFileEvidence) return null;

  const getBuiltinModule = (process as ProcessWithBuiltinModule).getBuiltinModule;
  if (typeof getBuiltinModule !== "function") {
    if (!renderRuntime) return null;
    throw new OperationalError("RENDER_DATABASE_RECOVERY_INSPECTION_UNAVAILABLE");
  }

  try {
    const fileSystem = getBuiltinModule("node:fs") as MinimalNodeFs | undefined;
    if (!fileSystem?.statSync) throw new OperationalError("RENDER_DATABASE_RECOVERY_INSPECTION_UNAVAILABLE");
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

function getNodeFileClientFactory() {
  if (nodeFileClientFactory) return nodeFileClientFactory;

  const getBuiltinModule = (process as ProcessWithBuiltinModule).getBuiltinModule;
  if (typeof getBuiltinModule !== "function") {
    throw new OperationalError("NODE_DATABASE_CLIENT_UNAVAILABLE");
  }

  try {
    const nodeModule = getBuiltinModule("node:module") as MinimalNodeModule | undefined;
    if (!nodeModule?.createRequire) throw new OperationalError("NODE_DATABASE_CLIENT_UNAVAILABLE");
    const requireFromProject = nodeModule.createRequire(`${process.cwd()}/package.json`);
    const nodeEntry = requireFromProject(["@libsql/client", "node"].join("/")) as {
      createClient?: typeof createPortableClient;
    };
    if (typeof nodeEntry.createClient !== "function") {
      throw new OperationalError("NODE_DATABASE_CLIENT_UNAVAILABLE");
    }
    nodeFileClientFactory = nodeEntry.createClient;
    return nodeFileClientFactory;
  } catch (error) {
    if (error instanceof OperationalError) throw error;
    throw new OperationalError("NODE_DATABASE_CLIENT_LOAD_FAILED");
  }
}

function createConfiguredClient(databaseUrl: string) {
  const scheme = databaseUrl.match(/^([a-z][a-z0-9+.-]*):/i)?.[1]?.toLowerCase();
  const config = {
    url: databaseUrl,
    authToken: process.env.DATABASE_AUTH_TOKEN,
  };
  return scheme === "file"
    ? getNodeFileClientFactory()(config)
    : createPortableClient(config);
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
  nodeClient ??= createConfiguredClient(getConfiguredDatabaseUrl());
  return nodeClient;
}
