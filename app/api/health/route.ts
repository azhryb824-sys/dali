import { getRuntimeEnv } from "@/lib/runtime-env";
import { jsonNoStore } from "@/lib/security";
import { getSqlClient } from "@/db";

export async function GET() {
  const startedAt = Date.now();
  try {
    const runtime = getRuntimeEnv();
    const healthy = runtime.DB
      ? await runtime.DB.prepare("SELECT 1 AS healthy").first<{ healthy: number }>()
      : (await getSqlClient().execute("SELECT 1 AS healthy")).rows[0];
    if (Number(healthy?.healthy) !== 1) throw new Error("database-check-failed");
    return jsonNoStore({ status: "ok", services: { database: "ok" }, responseTimeMs: Date.now() - startedAt, timestamp: new Date().toISOString() });
  } catch (error) {
    const rawCode = typeof error === "object" && error && "code" in error ? String(error.code) : "UNKNOWN";
    const errorCode = /^[A-Z0-9_:-]{1,80}$/.test(rawCode) ? rawCode : "UNKNOWN";
    console.error("[health] database check failed", { errorCode });
    // Render uses this route as a liveness probe. Keep the web process deployable
    // while reporting database readiness explicitly in the response body.
    return jsonNoStore({ status: "degraded", services: { database: "unavailable" }, errorCode, responseTimeMs: Date.now() - startedAt, timestamp: new Date().toISOString() });
  }
}
