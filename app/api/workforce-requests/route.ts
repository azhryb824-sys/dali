import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { workforceRequests } from "@/db/schema";
import { createOpportunityFromPublicRequest } from "@/lib/crm";
import { emitPortalNotification } from "@/lib/portal-notifications";
import { enforcePublicRateLimit, jsonNoStore, rateLimitResponse, readLimitedJson, rejectCrossSiteRequest } from "@/lib/security";

const allowedSpecializations = new Set([
  "عمالة إنشائية",
  "فنيون متخصصون",
  "تشغيل وصيانة",
  "فريق متكامل",
  "جاهزية موسم الحج",
  "طلب عرض سعر",
  "استفسار عام",
  "شراكة أو توريد",
  "طلب توظيف",
  "شكاوى واقتراحات",
]);
const allowedDurations = new Set(["أقل من شهر", "من شهر إلى 3 أشهر", "من 3 إلى 6 أشهر", "من 6 إلى 12 شهراً", "أكثر من سنة", "غير محدد"]);
const allowedContactMethods = new Set(["phone", "email", "either"]);

function text(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export async function POST(request: Request) {
  try {
    if (rejectCrossSiteRequest(request)) return jsonNoStore({ error: "مصدر الطلب غير مسموح." }, { status: 403 });
    const parsed = await readLimitedJson(request, 24_000);
    if (!parsed.ok) return parsed.response;
    const rateLimit = await enforcePublicRateLimit(request, { scope: "workforce-request", limit: 8, windowSeconds: 900, blockSeconds: 1800 });
    if (!rateLimit.allowed) return rateLimitResponse(rateLimit.retryAfterSeconds);
    const payload = parsed.value as Record<string, unknown>;

    if (text(payload.website, 200)) {
      return Response.json({ accepted: true }, { status: 202 });
    }

    const fullName = text(payload.fullName, 100);
    const mobile = text(payload.mobile, 20);
    const email = text(payload.email, 160).toLowerCase();
    const requestType = text(payload.requestType, 20) === "quotation" ? "quotation" : "general";
    const companyName = text(payload.companyName, 160);
    const workSite = text(payload.workSite, 180);
    const requiredStartDate = text(payload.requiredStartDate, 10);
    const duration = text(payload.duration, 80);
    const requestedCount = Number(payload.requestedCount);
    const preferredContact = text(payload.preferredContact, 20);
    const specialization = text(payload.specialization, 80);
    const details = text(payload.details, 2000);
    const idempotencyKey = text(payload.idempotencyKey, 80);

    if (
      fullName.length < 2 ||
      !/^\+?[0-9\s()-]{8,20}$/.test(mobile) ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      !allowedSpecializations.has(specialization) ||
      details.length < 10 ||
      (idempotencyKey && !/^[a-zA-Z0-9-]{16,80}$/.test(idempotencyKey)) ||
      (requestType === "quotation" && (
        companyName.length < 2 ||
        workSite.length < 2 ||
        !Number.isInteger(requestedCount) || requestedCount < 1 || requestedCount > 100000 ||
        !allowedDurations.has(duration) ||
        !allowedContactMethods.has(preferredContact) ||
        (requiredStartDate && !/^\d{4}-\d{2}-\d{2}$/.test(requiredStartDate))
      ))
    ) {
      return jsonNoStore({ error: "بيانات الطلب غير مكتملة أو غير صحيحة." }, { status: 400 });
    }

    const db = getDb();
    if (idempotencyKey) {
      const existing = await db.query.workforceRequests.findFirst({ where: eq(workforceRequests.idempotencyKey, idempotencyKey) });
      if (existing) return jsonNoStore({ accepted: true, trackingCode: existing.trackingCode, duplicate: true });
    }

    const trackingCode = `DAL-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`;
    const insert = db.insert(workforceRequests).values({
        trackingCode,
        fullName,
        mobile,
        email,
        requestType,
        companyName: companyName || null,
        workSite: workSite || null,
        requiredStartDate: requiredStartDate || null,
        duration: duration || null,
        requestedCount: requestType === "quotation" ? requestedCount : null,
        preferredContact: preferredContact || null,
        specialization,
        details,
        idempotencyKey: idempotencyKey || null,
        privacyNoticeVersion: "2026-08-14",
        privacyAcknowledgedAt: new Date().toISOString(),
      });
    const [saved] = idempotencyKey
      ? await insert.onConflictDoNothing({ target: workforceRequests.idempotencyKey }).returning({ id: workforceRequests.id, trackingCode: workforceRequests.trackingCode })
      : await insert.returning({ id: workforceRequests.id, trackingCode: workforceRequests.trackingCode });
    if (!saved && idempotencyKey) {
      const existing = await db.query.workforceRequests.findFirst({ where: eq(workforceRequests.idempotencyKey, idempotencyKey) });
      if (existing) return jsonNoStore({ accepted: true, trackingCode: existing.trackingCode, duplicate: true });
    }
    if (!saved) throw new Error("request-insert-failed");

    const notificationTitle = requestType === "quotation" ? "طلب عرض سعر جديد" : specialization === "طلب توظيف" ? "طلب توظيف جديد" : specialization === "شراكة أو توريد" ? "طلب شراكة أو توريد جديد" : specialization === "شكاوى واقتراحات" ? "شكوى أو اقتراح جديد" : "طلب جديد من الموقع";
    await emitPortalNotification({
      eventType: requestType === "quotation" ? "quotation-request-received" : specialization === "طلب توظيف" ? "career-request-received" : specialization === "شراكة أو توريد" ? "partner-request-received" : specialization === "شكاوى واقتراحات" ? "feedback-request-received" : "visitor-request-received",
      title: notificationTitle,
      message: `${saved.trackingCode} — ${fullName} — ${specialization}.`,
      severity: "critical",
      module: "workforce",
      entityType: "workforce-request",
      entityId: saved.id,
      actionView: "workforce",
      targetDepartment: "workforce",
    }).catch(() => undefined);

    if (requestType === "quotation") {
      await createOpportunityFromPublicRequest(saved.id).catch((error) => console.error("quotation-opportunity-create-failed", error));
    }

    return jsonNoStore({ accepted: true, trackingCode: saved.trackingCode }, { status: 201 });
  } catch {
    return jsonNoStore({ error: "تعذّر حفظ الطلب حالياً." }, { status: 500 });
  }
}
