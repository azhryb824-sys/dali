import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { portalUsers } from "@/db/schema";
import { auditPortalAction } from "@/lib/audit";
import { requirePortalSessionIdentity } from "@/lib/portal-access";
import { emitPortalNotification } from "@/lib/portal-notifications";
import { enforcePublicRateLimit, jsonNoStore, rateLimitResponse, readLimitedJson, rejectCrossSiteRequest, requestCorrelationId, requestSourceHash } from "@/lib/security";

const allowedDepartments = new Set(["general", "employees", "finance", "legal", "workforce"]);

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, maxLength) : "";
}

export async function POST(request: Request) {
  if (rejectCrossSiteRequest(request)) return jsonNoStore({ error: "مصدر الطلب غير مسموح." }, { status: 403 });
  const access = await requirePortalSessionIdentity();
  if (!access) return jsonNoStore({ error: "انتهت الجلسة الآمنة. أعد تسجيل الدخول." }, { status: 401 });
  if (access.status === "suspended") return jsonNoStore({ error: "هذا الحساب موقوف ولا يمكنه تقديم طلب جديد." }, { status: 403 });
  if (access.status === "active") return jsonNoStore({ error: "الحساب معتمد بالفعل." }, { status: 409 });
  const parsed = await readLimitedJson(request, 8_000);
  if (!parsed.ok) return parsed.response;
  const rateLimit = await enforcePublicRateLimit(request, { scope: `portal-access-request:${access.user.email}`, limit: 6, windowSeconds: 3_600, blockSeconds: 3_600 });
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit.retryAfterSeconds);

  const payload = parsed.value as Record<string, unknown>;
  const requestedDepartment = cleanText(payload.requestedDepartment, 40);
  const requestedJobTitle = cleanText(payload.requestedJobTitle, 120);
  const requestReason = cleanText(payload.requestReason, 1_200);
  if (!allowedDepartments.has(requestedDepartment) || requestedJobTitle.length < 2 || requestReason.length < 20 || payload.termsAccepted !== true) {
    return jsonNoStore({ error: "أكمل القسم والمسمى وسبب طلب الوصول، ثم وافق على ضوابط الاستخدام." }, { status: 400 });
  }

  try {
    const db = getDb();
    const email = access.user.email.trim().toLowerCase();
    const existing = await db.query.portalUsers.findFirst({ where: eq(portalUsers.email, email) });
    if (!existing) return jsonNoStore({ error: "تعذّر العثور على ملف الحساب." }, { status: 404 });
    const now = new Date().toISOString();
    const [updated] = await db.update(portalUsers).set({
      requestedDepartment,
      requestedJobTitle,
      requestReason,
      requestSubmittedAt: now,
      termsAcceptedAt: existing.termsAcceptedAt || now,
      updatedAt: now,
    }).where(eq(portalUsers.email, email)).returning();
    const correlationId = requestCorrelationId(request);
    await auditPortalAction({
      actorEmail: email,
      action: existing.requestSubmittedAt ? "portal-access-request-updated" : "portal-access-request-submitted",
      entityType: "portal-user",
      entityId: email,
      before: existing,
      after: updated,
      reason: requestReason,
      correlationId,
      source: "security",
      ipHash: await requestSourceHash(request),
    });
    await emitPortalNotification({
      eventType: "portal-access-request-submitted",
      title: "طلب انضمام مكتمل ينتظر الاعتماد",
      message: `${access.user.displayName} — ${requestedJobTitle} — القسم المطلوب: ${requestedDepartment}.`,
      severity: "warning",
      module: "users",
      entityType: "portal-user",
      entityId: email,
      actionView: "users",
      targetRole: "admin",
      dedupeKey: `portal-user-pending:${email}`,
    }).catch(() => undefined);
    return jsonNoStore({
      request: {
        requestedDepartment: updated.requestedDepartment,
        requestedJobTitle: updated.requestedJobTitle,
        requestReason: updated.requestReason,
        requestSubmittedAt: updated.requestSubmittedAt,
      },
    });
  } catch (error) {
    console.error("portal-access-request-failed", error);
    return jsonNoStore({ error: "تعذّر حفظ طلب الانضمام حالياً." }, { status: 500 });
  }
}
