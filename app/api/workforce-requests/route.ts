import { parseWorkforceRequestInput } from "@/lib/workforce-request-input";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { workforceRequests } from "@/db/schema";
import { createOpportunityFromPublicRequest } from "@/lib/crm";
import { emitPortalNotification } from "@/lib/portal-notifications";
import { enforcePublicRateLimit, jsonNoStore, rateLimitResponse, readLimitedJson, rejectCrossSiteRequest } from "@/lib/security";

function text(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export async function POST(request: Request) {
  try {
    if (rejectCrossSiteRequest(request)) return jsonNoStore({ error: "مصدر الطلب غير مسموح." }, { status: 403 });
    const parsed = await readLimitedJson(request, 200_000);
    if (!parsed.ok) return parsed.response;
    const rateLimit = await enforcePublicRateLimit(request, { scope: "workforce-request", limit: 8, windowSeconds: 900, blockSeconds: 1800 });
    if (!rateLimit.allowed) return rateLimitResponse(rateLimit.retryAfterSeconds);
    const payload = parsed.value as Record<string, unknown>;

    if (text(payload.website, 200)) {
      return Response.json({ accepted: true }, { status: 202 });
    }

    let values: ReturnType<typeof parseWorkforceRequestInput>;
    try { values = parseWorkforceRequestInput(payload); }
    catch (error) { return jsonNoStore({ error: error instanceof Error ? error.message : "بيانات الطلب غير صحيحة" }, { status: 400 }); }
    const { fullName, requestType, specialization, idempotencyKey } = values;

    const db = getDb();
    if (idempotencyKey) {
      const existing = await db.query.workforceRequests.findFirst({ where: eq(workforceRequests.idempotencyKey, idempotencyKey) });
      if (existing) return jsonNoStore({ accepted: true, trackingCode: existing.trackingCode, duplicate: true });
    }

    const trackingCode = `DAL-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`;
    const insert = db.insert(workforceRequests).values({
        trackingCode,
        ...values,
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
