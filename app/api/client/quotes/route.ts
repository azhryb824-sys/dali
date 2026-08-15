import { and, eq, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { clients, quoteVersions, salesOpportunities } from "@/db/schema";
import { auditPortalAction, enqueueOutbox, recordStatusChange } from "@/lib/audit";
import { requireClientApiAccess } from "@/lib/client-access";
import { emitPortalNotification } from "@/lib/portal-notifications";
import { jsonNoStore, rejectCrossSiteRequest, requestCorrelationId } from "@/lib/security";

export async function PATCH(request: Request) {
  if (rejectCrossSiteRequest(request)) return jsonNoStore({ error: "مصدر الطلب غير مسموح" }, { status: 403 });
  const access = await requireClientApiAccess();
  if (!access || !access.canApproveQuotes) return jsonNoStore({ error: "غير مصرح باتخاذ قرار عرض السعر" }, { status: 403 });

  try {
    const payload = await request.json() as { id?: unknown; decision?: unknown; reason?: unknown };
    const id = Number(payload.id);
    const decision = payload.decision === "accepted" || payload.decision === "rejected" ? payload.decision : "";
    const reason = typeof payload.reason === "string" ? payload.reason.trim().slice(0, 1000) : "";
    if (!Number.isInteger(id) || id < 1 || !decision || (decision === "rejected" && !reason)) return jsonNoStore({ error: "بيانات القرار غير مكتملة" }, { status: 400 });

    const db = getDb();
    const quote = await db.query.quoteVersions.findFirst({ where: eq(quoteVersions.id, id) });
    if (!quote || quote.status !== "sent") return jsonNoStore({ error: "عرض السعر غير متاح لاتخاذ القرار" }, { status: 409 });
    const opportunity = await db.query.salesOpportunities.findFirst({ where: and(eq(salesOpportunities.id, quote.opportunityId), eq(salesOpportunities.clientId, access.clientId)) });
    if (!opportunity) return jsonNoStore({ error: "عرض السعر غير متاح لهذا العميل" }, { status: 404 });
    const today = new Date().toISOString().slice(0, 10);
    if (decision === "accepted" && quote.validUntil < today) return jsonNoStore({ error: "انتهت صلاحية العرض؛ اطلب إصدار نسخة محدثة" }, { status: 409 });

    const now = new Date().toISOString();
    const [updated] = await db.update(quoteVersions).set({
      status: decision,
      acceptedAt: decision === "accepted" ? now : quote.acceptedAt,
      clientDecisionBy: access.user.email,
      clientDecisionReason: reason || null,
      clientDecisionAt: now,
      updatedAt: now,
      recordVersion: quote.recordVersion + 1,
    }).where(and(eq(quoteVersions.id, id), eq(quoteVersions.recordVersion, quote.recordVersion), eq(quoteVersions.status, "sent"))).returning();
    if (!updated) return jsonNoStore({ error: "تغير العرض أثناء المراجعة. حدّث الصفحة." }, { status: 409 });

    if (decision === "accepted") {
      await db.update(salesOpportunities).set({ stage: "won", probability: 100, updatedAt: now, version: opportunity.version + 1 }).where(and(eq(salesOpportunities.id, opportunity.id), eq(salesOpportunities.version, opportunity.version)));
      await db.update(clients).set({ status: "active", updatedAt: now }).where(eq(clients.id, access.clientId));
      await db.update(quoteVersions).set({ status: "superseded", updatedAt: now }).where(and(eq(quoteVersions.opportunityId, opportunity.id), eq(quoteVersions.status, "sent"), ne(quoteVersions.id, id)));
    }

    const correlationId = requestCorrelationId(request);
    await recordStatusChange({ entityType: "quote-version", entityId: id, fromStatus: quote.status, toStatus: decision, reason, actorEmail: access.user.email, correlationId });
    await auditPortalAction({ actorEmail: access.user.email, action: "client-quote-decision", entityType: "quote-version", entityId: id, before: quote, after: updated, reason, correlationId, source: "client-portal" });
    await enqueueOutbox({ eventType: `quote.${decision}`, aggregateType: "quote-version", aggregateId: id, payload: { quoteId: id, clientId: access.clientId, decision } });
    await emitPortalNotification({ eventType: "client-quote-decision", title: decision === "accepted" ? "قبل العميل عرض السعر" : "رفض العميل عرض السعر", message: `${quote.quoteCode} — ${access.displayName}.`, severity: decision === "accepted" ? "success" : "critical", module: "sales", entityType: "quote-version", entityId: id, actionView: "operations", targetDepartment: "workforce" }).catch(() => undefined);
    return jsonNoStore({ quote: updated });
  } catch (error) {
    console.error("client-quote-decision-failed", error);
    return jsonNoStore({ error: "تعذّر حفظ قرار عرض السعر" }, { status: 500 });
  }
}
