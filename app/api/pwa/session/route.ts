import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { pwaDeviceChallenges, pwaDevices } from "@/db/schema";
import { issuePwaAccessToken, PWA_ACCESS_SECONDS, pwaAccessCookie } from "@/lib/pwa-access";
import { enforcePublicRateLimit, jsonNoStore, rateLimitResponse, readLimitedJson, rejectCrossSiteRequest, requestSourceHash } from "@/lib/security";

const DEVICE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SIGNATURE_PATTERN = /^[A-Za-z0-9_-]{80,200}$/;

function decodeBase64Url(value: string) {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export async function POST(request: Request) {
  if (rejectCrossSiteRequest(request)) return jsonNoStore({ error: "مصدر الطلب غير مسموح", code: "CROSS_SITE" }, { status: 403 });
  const limit = await enforcePublicRateLimit(request, { scope: "pwa-session", limit: 60, windowSeconds: 10 * 60, blockSeconds: 10 * 60 });
  if (!limit.allowed) return rateLimitResponse(limit.retryAfterSeconds);
  const parsed = await readLimitedJson(request, 4_000);
  if (!parsed.ok) return parsed.response;
  const payload = parsed.value as Record<string, unknown>;
  const deviceId = typeof payload.deviceId === "string" ? payload.deviceId.trim().toLowerCase() : "";
  const challengeId = typeof payload.challengeId === "string" ? payload.challengeId.trim().toLowerCase() : "";
  const signature = typeof payload.signature === "string" ? payload.signature.trim() : "";
  if (!DEVICE_ID_PATTERN.test(deviceId) || !DEVICE_ID_PATTERN.test(challengeId) || !SIGNATURE_PATTERN.test(signature)) {
    return jsonNoStore({ error: "إثبات الجهاز غير صالح", code: "PROOF_INVALID" }, { status: 400 });
  }

  const db = getDb();
  const [device, challenge] = await Promise.all([
    db.query.pwaDevices.findFirst({ where: eq(pwaDevices.id, deviceId) }),
    db.query.pwaDeviceChallenges.findFirst({ where: eq(pwaDeviceChallenges.id, challengeId) }),
  ]);
  const now = new Date().toISOString();
  if (!device || device.status !== "active") return jsonNoStore({ error: "الجهاز غير معتمد أو أُلغي اعتماده", code: "DEVICE_REVOKED" }, { status: 403 });
  if (!challenge || challenge.deviceId !== deviceId || challenge.usedAt || challenge.expiresAt <= now) {
    return jsonNoStore({ error: "انتهى تحدي التحقق؛ أعد المحاولة", code: "CHALLENGE_EXPIRED" }, { status: 409 });
  }

  let verified = false;
  try {
    const publicKey = await crypto.subtle.importKey("jwk", JSON.parse(device.publicKeyJwk) as JsonWebKey, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    const message = `dali-pwa-v1:${deviceId}:${challengeId}:${challenge.nonce}`;
    verified = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, publicKey, decodeBase64Url(signature), new TextEncoder().encode(message));
  } catch {
    verified = false;
  }
  if (!verified) return jsonNoStore({ error: "تعذّر التحقق من مفتاح الجهاز", code: "PROOF_INVALID" }, { status: 403 });

  const [claimed] = await db.update(pwaDeviceChallenges).set({ usedAt: now }).where(and(
    eq(pwaDeviceChallenges.id, challengeId),
    isNull(pwaDeviceChallenges.usedAt),
  )).returning({ id: pwaDeviceChallenges.id });
  if (!claimed) return jsonNoStore({ error: "استُخدم تحدي التحقق بالفعل", code: "CHALLENGE_REPLAY" }, { status: 409 });
  await db.update(pwaDevices).set({ lastSeenAt: now, lastSourceHash: await requestSourceHash(request), updatedAt: now }).where(eq(pwaDevices.id, deviceId));
  const accessToken = await issuePwaAccessToken(deviceId);
  return jsonNoStore({ authorized: true, expiresInSeconds: PWA_ACCESS_SECONDS }, {
    headers: { "set-cookie": pwaAccessCookie(request, accessToken) },
  });
}
