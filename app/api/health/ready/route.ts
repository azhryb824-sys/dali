import { getSqlClient } from "@/db";
import { OperationalError, safeOperationalErrorCode } from "@/lib/operational-error";
import { getConfiguredAuthMode, getConfiguredAuthSecret, getPortalAdminConfig } from "@/lib/portal-auth-config";
import { getRuntimeEnv } from "@/lib/runtime-env";
import { jsonNoStore } from "@/lib/security";

async function checkDatabase() {
  const runtime = getRuntimeEnv();
  const healthy = runtime.DB
    ? await runtime.DB.prepare("SELECT 1 AS healthy").first<{ healthy: number }>()
    : (await getSqlClient().unsafe<{ healthy: number }[]>("SELECT 1 AS healthy"))[0];
  if (Number(healthy?.healthy) !== 1) throw new OperationalError("DATABASE_CHECK_FAILED");
}

async function hasStoredCredential() {
  const runtime = getRuntimeEnv();
  const credential = runtime.DB
    ? await runtime.DB.prepare("SELECT identifier FROM portal_auth_credentials LIMIT 1").first<{ identifier: string }>()
    : (await getSqlClient().unsafe<{ identifier: string }[]>("SELECT identifier FROM portal_auth_credentials LIMIT 1"))[0];
  return Boolean(credential && "identifier" in credential && credential.identifier);
}

async function checkRequiredLoginColumns() {
  const rows = await getSqlClient().unsafe<Array<{ preferred_language_exists:boolean }>>("select exists(select 1 from information_schema.columns where table_schema='public' and table_name='portal_users' and column_name='preferred_language') as preferred_language_exists");
  if (!rows[0]?.preferred_language_exists) throw new OperationalError("AUTH_SCHEMA_MIGRATION_REQUIRED");
}

async function checkCredentialAuthentication() {
  if (getConfiguredAuthMode() !== "credentials") return "external" as const;
  if (getConfiguredAuthSecret().length < 32) throw new OperationalError("AUTH_SECRET_INVALID");

  const adminConfig = getPortalAdminConfig();
  if (adminConfig.complete || await hasStoredCredential()) return "ok" as const;
  throw new OperationalError("AUTH_BOOTSTRAP_CONFIGURATION_INVALID");
}

export async function GET() {
  const startedAt = Date.now();
  const errorCodes: string[] = [];
  let database: "ok" | "unavailable" = "ok";
  let auth: "ok" | "external" | "unavailable" = "ok";

  try {
    await checkDatabase();
  } catch (error) {
    database = "unavailable";
    errorCodes.push(safeOperationalErrorCode(error, "DATABASE_UNAVAILABLE"));
  }

  try {
    auth = await checkCredentialAuthentication();
    if (auth === "ok") await checkRequiredLoginColumns();
  } catch (error) {
    auth = "unavailable";
    errorCodes.push(safeOperationalErrorCode(error, "AUTH_CONFIGURATION_INVALID"));
  }

  const body = {
    status: errorCodes.length ? "degraded" : "ok",
    services: { database, auth },
    ...(errorCodes.length ? { errorCodes } : {}),
    responseTimeMs: Date.now() - startedAt,
    timestamp: new Date().toISOString(),
  };

  if (errorCodes.length) {
    console.error("[health/ready] readiness check failed", { errorCodes });
    return jsonNoStore(body, { status: 503 });
  }
  return jsonNoStore(body);
}
