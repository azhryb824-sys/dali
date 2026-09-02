import { and, eq, gt, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { pwaDevices, pwaEnrollmentTokens } from "@/db/schema";
import { auditPortalAction } from "@/lib/audit";
import { emitPortalNotification } from "@/lib/portal-notifications";
import { enforcePublicRateLimit, jsonNoStore, rateLimitResponse, readLimitedJson, rejectCrossSiteRequest, requestCorrelationId, requestSourceHash, sha256 } from "@/lib/security";

const CODE_PATTERN = /^[A-HJ-NP-Z2-9]{12}$/;
const BASE64_URL_POINT = /^[A-Za-z0-9_-]{43}$/;

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function normalizedEnrollmentCode(value: unknown) {
  return clean(value, 20).toUpperCase().replaceAll(/[^A-Z0-9]/g, "");
}

async function validatedPublicKey(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.kty !== "EC" || candidate.crv !== "P-256" || typeof candidate.x !== "string" || typeof candidate.y !== "string" || !BASE64_URL_POINT.test(candidate.x) || !BASE64_URL_POINT.test(candidate.y)) return null;
  const jwk: JsonWebKey = { kty: "EC", crv: "P-256", x: candidate.x, y: candidate.y, ext: true, key_ops: ["verify"] };
  try {
    await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    return jwk;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  if (rejectCrossSiteRequest(request)) return jsonNoStore({ error: "مصدر الطلب غير مسموح", code: "CROSS_SITE" }, { status: 403 });
  const limit = await enforcePublicRateLimit(request, { scope: "pwa-enroll", limit: 8, windowSeconds: 15 * 60, blockSeconds: 15 * 60 });
  if (!limit.allowed) return rateLimitResponse(limit.retryAfterSeconds);
  const parsed = await readLimitedJson(request, 8_000);
  if (!parsed.ok) return parsed.response;
  const payload = parsed.value as Record<string, unknown>;
  const code = normalizedEnrollmentCode(payload.code);
  const deviceName = clean(payload.deviceName, 80);
  const platform = payload.platform === "ipad-pwa" ? "ipad-pwa" : "ios-pwa";
  const publicKey = await validatedPublicKey(payload.publicKeyJwk);
  if (!CODE_PATTERN.test(code) || deviceName.length < 2 || !publicKey) {
    return jsonNoStore({ error: "رمز التفعيل أو بيانات الجهاز غير صحيحة", code: "ENROLLMENT_INVALID" }, { status: 400 });
  }

  const db = getDb();
  const now = new Date().toISOString();
  const tokenHash = await sha256(code);
  const enrollment = await db.query.pwaEnrollmentTokens.findFirst({ where: and(
    eq(pwaEnrollmentTokens.tokenHash, tokenHash),
    gt(pwaEnrollmentTokens.expiresAt, now),
    isNull(pwaEnrollmentTokens.consumedAt),
    isNull(pwaEnrollmentTokens.revokedAt),
  ) });
  if (!enrollment) return jsonNoStore({ error: "رمز التفعيل غير صالح أو انتهت مدته", code: "ENROLLMENT_EXPIRED" }, { status: 404 });

  const deviceId = crypto.randomUUID();
  const sourceHash = await requestSourceHash(request);
  try {
    await db.transaction(async (tx) => {
      const [claimed] = await tx.update(pwaEnrollmentTokens).set({ consumedAt: now, consumedDeviceId: deviceId }).where(and(
        eq(pwaEnrollmentTokens.id, enrollment.id),
        gt(pwaEnrollmentTokens.expiresAt, now),
        isNull(pwaEnrollmentTokens.consumedAt),
        isNull(pwaEnrollmentTokens.revokedAt),
      )).returning({ id: pwaEnrollmentTokens.id });
      if (!claimed) throw new Error("PWA_ENROLLMENT_ALREADY_USED");
      await tx.insert(pwaDevices).values({
        id: deviceId,
        deviceName: deviceName || enrollment.deviceName,
        platform,
        publicKeyJwk: JSON.stringify(publicKey),
        status: "active",
        enrolledBy: enrollment.issuedBy,
        enrolledAt: now,
        lastSeenAt: now,
        lastSourceHash: sourceHash,
        createdAt: now,
        updatedAt: now,
      });
    });
  } catch (error) {
    if (error instanceof Error && error.message === "PWA_ENROLLMENT_ALREADY_USED") {
      return jsonNoStore({ error: "استُخدم رمز التفعيل بالفعل", code: "ENROLLMENT_USED" }, { status: 409 });
    }
    throw error;
  }
  await auditPortalAction({ actorEmail: enrollment.issuedBy, action: "pwa-device-enrolled", entityType: "pwa-device", entityId: deviceId, after: { deviceName, platform, enrollmentId: enrollment.id }, reason: "اكتمل اعتماد الجهاز بمفتاح تشفير غير قابل للاستخراج", source: "security", correlationId: requestCorrelationId(request), ipHash: sourceHash });
  await emitPortalNotification({
    eventType: "pwa-device-enrolled",
    title: "اكتمل اعتماد جهاز iPhone",
    message: `${deviceName} — أصبح الجهاز قادراً على طلب بوابة الدخول دون فتحها للمتصفح العام.`,
    severity: "success",
    module: "users",
    entityType: "pwa-device",
    entityId: deviceId,
    actionView: "users",
    targetRole: "admin",
  }).catch(() => undefined);
  return jsonNoStore({ deviceId, deviceName, platform }, { status: 201 });
}
