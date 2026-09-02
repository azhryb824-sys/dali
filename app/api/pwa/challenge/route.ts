import { eq, lt } from "drizzle-orm";
import { getDb } from "@/db";
import { pwaDeviceChallenges, pwaDevices } from "@/db/schema";
import { enforcePublicRateLimit, jsonNoStore, rateLimitResponse, readLimitedJson, rejectCrossSiteRequest } from "@/lib/security";

const DEVICE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CHALLENGE_SECONDS = 90;

function randomBase64Url(bytes: number) {
  const value = crypto.getRandomValues(new Uint8Array(bytes));
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

export async function POST(request: Request) {
  if (rejectCrossSiteRequest(request)) return jsonNoStore({ error: "مصدر الطلب غير مسموح", code: "CROSS_SITE" }, { status: 403 });
  const limit = await enforcePublicRateLimit(request, { scope: "pwa-challenge", limit: 40, windowSeconds: 10 * 60, blockSeconds: 10 * 60 });
  if (!limit.allowed) return rateLimitResponse(limit.retryAfterSeconds);
  const parsed = await readLimitedJson(request, 2_000);
  if (!parsed.ok) return parsed.response;
  const deviceId = typeof (parsed.value as Record<string, unknown>).deviceId === "string" ? String((parsed.value as Record<string, unknown>).deviceId).trim().toLowerCase() : "";
  if (!DEVICE_ID_PATTERN.test(deviceId)) return jsonNoStore({ error: "معرّف الجهاز غير صالح", code: "DEVICE_INVALID" }, { status: 400 });
  const db = getDb();
  const device = await db.query.pwaDevices.findFirst({ where: eq(pwaDevices.id, deviceId) });
  if (!device || device.status !== "active") return jsonNoStore({ error: "الجهاز غير معتمد أو أُلغي اعتماده", code: "DEVICE_REVOKED" }, { status: 403 });

  const now = new Date();
  const id = crypto.randomUUID();
  const nonce = randomBase64Url(32);
  const expiresAt = new Date(now.getTime() + CHALLENGE_SECONDS * 1000).toISOString();
  await db.delete(pwaDeviceChallenges).where(lt(pwaDeviceChallenges.expiresAt, new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()));
  await db.insert(pwaDeviceChallenges).values({ id, deviceId, nonce, expiresAt, createdAt: now.toISOString() });
  return jsonNoStore({ challengeId: id, message: `dali-pwa-v1:${deviceId}:${id}:${nonce}`, expiresAt });
}
