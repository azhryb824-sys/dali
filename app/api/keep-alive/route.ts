import { jsonNoStore } from "@/lib/security";

/**
 * Lightweight liveness endpoint used by the external scheduler.
 * It intentionally avoids database access so the keep-alive request does not
 * create records, open sessions, or add unnecessary load to the application.
 */
export async function GET() {
  return jsonNoStore({
    status: "awake",
    service: "dali",
    timestamp: new Date().toISOString(),
  });
}
