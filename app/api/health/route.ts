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
  } catch {
    return jsonNoStore({ status: "degraded", services: { database: "unavailable" }, responseTimeMs: Date.now() - startedAt, timestamp: new Date().toISOString() }, { status: 503 });
  }
}
