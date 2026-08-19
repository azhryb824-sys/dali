import { getSqlClient } from "@/db";
import { OperationalError, safeOperationalErrorCode } from "@/lib/operational-error";
import { getConfiguredAuthMode, getConfiguredAuthSecret, getPortalAdminConfig } from "@/lib/portal-auth-config";
import { getRuntimeEnv } from "@/lib/runtime-env";
import { jsonNoStore } from "@/lib/security";

async function checkDatabase() {
  const runtime = getRuntimeEnv();
  const healthy = runtime.DB
    ? await runtime.DB.prepare("SELECT 1 AS healthy").first<{ healthy: number }>()
    : (await getSqlClient().execute("SELECT 1 AS healthy")).rows[0];
  if (Number(healthy?.healthy) !== 1) throw new OperationalError("DATABASE_CHECK_FAILED");
}

function checkCredentialAuthentication() {
  if (getConfiguredAuthMode() !== "credentials") return "external" as const;
  const adminConfig = getPortalAdminConfig();
  if (!adminConfig.complete) throw new OperationalError("AUTH_BOOTSTRAP_CONFIGURATION_INVALID");
  if (getConfiguredAuthSecret().length < 32) throw new OperationalError("AUTH_SECRET_INVALID");
  return "ok" as const;
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
    auth = checkCredentialAuthentication();
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
