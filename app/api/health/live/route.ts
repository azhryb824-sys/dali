import { jsonNoStore } from "@/lib/security";

export async function GET() {
  return jsonNoStore({
    status: "ok",
    services: { process: "ok" },
    timestamp: new Date().toISOString(),
  });
}
