import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { pwaDevices, pwaEnrollmentTokens } from "@/db/schema";
import { auditPortalAction } from "@/lib/audit";
import { canAdministerPortalUsers, requirePortalApiRole } from "@/lib/portal-access";
import { emitPortalNotification } from "@/lib/portal-notifications";
import { externalRequestUrl } from "@/lib/request-origin";
import { jsonNoStore, readLimitedJson, rejectCrossSiteRequest, requestCorrelationId, requestSourceHash, sha256 } from "@/lib/security";

const ENROLLMENT_MINUTES = 20;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

async function requireDeviceAdministrator() {
  const access = await requirePortalApiRole(["admin", "manager", "employee"]);
  return access && canAdministerPortalUsers(access) ? access : null;
}

function enrollmentCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const raw = Array.from(bytes, (byte) => CODE_ALPHABET[byte & 31]).join("");
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
}

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function GET() {
  const access = await requireDeviceAdministrator();
  if (!access) return jsonNoStore({ error: "إدارة أجهزة iPhone متاحة للمالك ومشرف النظام فقط" }, { status: 403 });
  const db = getDb();
  const now = new Date().toISOString();
  const [devices, pendingEnrollments] = await Promise.all([
    db.select({
      id: pwaDevices.id,
      deviceName: pwaDevices.deviceName,
      platform: pwaDevices.platform,
      status: pwaDevices.status,
      enrolledBy: pwaDevices.enrolledBy,
      enrolledAt: pwaDevices.enrolledAt,
      lastSeenAt: pwaDevices.lastSeenAt,
      revokedAt: pwaDevices.revokedAt,
      revokedBy: pwaDevices.revokedBy,
      revocationReason: pwaDevices.revocationReason,
    }).from(pwaDevices).orderBy(desc(pwaDevices.createdAt)).limit(100),
    db.select({
      id: pwaEnrollmentTokens.id,
      deviceName: pwaEnrollmentTokens.deviceName,
      issuedBy: pwaEnrollmentTokens.issuedBy,
      expiresAt: pwaEnrollmentTokens.expiresAt,
      createdAt: pwaEnrollmentTokens.createdAt,
    }).from(pwaEnrollmentTokens).where(and(
      gt(pwaEnrollmentTokens.expiresAt, now),
      isNull(pwaEnrollmentTokens.consumedAt),
      isNull(pwaEnrollmentTokens.revokedAt),
    )).orderBy(desc(pwaEnrollmentTokens.createdAt)).limit(20),
  ]);
  return jsonNoStore({ devices, pendingEnrollments });
}

export async function POST(request: Request) {
  if (rejectCrossSiteRequest(request)) return jsonNoStore({ error: "مصدر الطلب غير مسموح" }, { status: 403 });
  const access = await requireDeviceAdministrator();
  if (!access) return jsonNoStore({ error: "إصدار رمز تفعيل iPhone متاح للمالك ومشرف النظام فقط" }, { status: 403 });
  const parsed = await readLimitedJson(request, 3_000);
  if (!parsed.ok) return parsed.response;
  const deviceName = clean((parsed.value as Record<string, unknown>).deviceName, 80);
  if (deviceName.length < 2) return jsonNoStore({ error: "اكتب اسماً واضحاً للجهاز" }, { status: 400 });

  const code = enrollmentCode();
  const normalizedCode = code.replaceAll("-", "");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ENROLLMENT_MINUTES * 60_000).toISOString();
  const id = crypto.randomUUID();
  await getDb().insert(pwaEnrollmentTokens).values({
    id,
    tokenHash: await sha256(normalizedCode),
    deviceName,
    issuedBy: access.user.email.toLowerCase(),
    expiresAt,
    createdAt: now.toISOString(),
  });
  await auditPortalAction({
    actorEmail: access.user.email,
    action: "pwa-enrollment-issued",
    entityType: "pwa-enrollment",
    entityId: id,
    after: { deviceName, expiresAt },
    reason: "إصدار رمز تفعيل مؤقت لمرة واحدة دون فتح دخول المتصفح العام",
    source: "security",
    correlationId: requestCorrelationId(request),
    ipHash: await requestSourceHash(request),
  });
  await emitPortalNotification({
    eventType: "pwa-enrollment-issued",
    title: "صدر رمز تفعيل جهاز iPhone",
    message: `${deviceName} — الرمز صالح لمدة ${ENROLLMENT_MINUTES} دقيقة ولم يُعرض في سجل النشاط.`,
    severity: "warning",
    module: "users",
    entityType: "pwa-enrollment",
    entityId: id,
    actionView: "users",
    targetRole: "admin",
  }).catch(() => undefined);
  return jsonNoStore({
    enrollment: {
      id,
      code,
      deviceName,
      expiresAt,
      setupUrl: externalRequestUrl(request, `/pwa/setup?code=${encodeURIComponent(code)}`).toString(),
    },
  }, { status: 201 });
}

export async function PATCH(request: Request) {
  if (rejectCrossSiteRequest(request)) return jsonNoStore({ error: "مصدر الطلب غير مسموح" }, { status: 403 });
  const access = await requireDeviceAdministrator();
  if (!access) return jsonNoStore({ error: "إلغاء أجهزة iPhone متاح للمالك ومشرف النظام فقط" }, { status: 403 });
  const parsed = await readLimitedJson(request, 4_000);
  if (!parsed.ok) return parsed.response;
  const payload = parsed.value as Record<string, unknown>;
  const action = clean(payload.action, 40);
  const id = clean(payload.id, 80);
  const reason = clean(payload.reason, 500);
  const db = getDb();
  const now = new Date().toISOString();

  if (action === "revoke-enrollment") {
    const [revoked] = await db.update(pwaEnrollmentTokens).set({ revokedAt: now }).where(and(
      eq(pwaEnrollmentTokens.id, id),
      isNull(pwaEnrollmentTokens.consumedAt),
      isNull(pwaEnrollmentTokens.revokedAt),
    )).returning({ id: pwaEnrollmentTokens.id, deviceName: pwaEnrollmentTokens.deviceName });
    if (!revoked) return jsonNoStore({ error: "رمز التفعيل غير موجود أو استُخدم بالفعل" }, { status: 404 });
    await auditPortalAction({ actorEmail: access.user.email, action: "pwa-enrollment-revoked", entityType: "pwa-enrollment", entityId: id, after: revoked, reason: reason || "إلغاء رمز تفعيل غير مستخدم", source: "security" });
    return jsonNoStore({ revoked: true });
  }

  if (action !== "revoke-device" || reason.length < 10) {
    return jsonNoStore({ error: "اكتب سبباً واضحاً لإلغاء الجهاز لا يقل عن 10 أحرف" }, { status: 400 });
  }
  const existing = await db.query.pwaDevices.findFirst({ where: eq(pwaDevices.id, id) });
  if (!existing) return jsonNoStore({ error: "الجهاز غير موجود" }, { status: 404 });
  if (existing.status === "revoked") return jsonNoStore({ revoked: true });
  const [updated] = await db.update(pwaDevices).set({
    status: "revoked",
    revokedAt: now,
    revokedBy: access.user.email.toLowerCase(),
    revocationReason: reason,
    updatedAt: now,
  }).where(and(eq(pwaDevices.id, id), eq(pwaDevices.status, "active"))).returning();
  if (!updated) return jsonNoStore({ error: "تعذّر إلغاء الجهاز" }, { status: 409 });
  await auditPortalAction({ actorEmail: access.user.email, action: "pwa-device-revoked", entityType: "pwa-device", entityId: id, before: existing, after: { ...updated, publicKeyJwk: "[stored]" }, reason, source: "security", correlationId: requestCorrelationId(request), ipHash: await requestSourceHash(request) });
  await emitPortalNotification({
    eventType: "pwa-device-revoked",
    title: "أُلغي اعتماد جهاز iPhone",
    message: `${updated.deviceName} — ${reason}`,
    severity: "critical",
    module: "users",
    entityType: "pwa-device",
    entityId: id,
    actionView: "users",
    targetRole: "admin",
  }).catch(() => undefined);
  return jsonNoStore({ device: { ...updated, publicKeyJwk: undefined } });
}
