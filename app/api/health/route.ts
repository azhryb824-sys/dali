import { getRuntimeEnv } from "@/lib/runtime-env";
import { jsonNoStore } from "@/lib/security";

export async function GET() {
  const startedAt = Date.now();
  try {
    const database = await getRuntimeEnv().DB.prepare("SELECT 1 AS healthy").first<{ healthy: number }>();
    if (database?.healthy !== 1) throw new Error("database-check-failed");
    return jsonNoStore({ status: "ok", services: { database: "ok" }, responseTimeMs: Date.now() - startedAt, timestamp: new Date().toISOString() });
  } catch {
    return jsonNoStore({ status: "degraded", services: { database: "unavailable" }, responseTimeMs: Date.now() - startedAt, timestamp: new Date().toISOString() }, { status: 503 });
  }
}
