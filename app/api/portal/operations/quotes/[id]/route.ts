import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { quoteItems, quoteVersions, workflowApprovals } from "@/db/schema";
import { auditPortalAction } from "@/lib/audit";
import { emitPortalNotification } from "@/lib/portal-notifications";
import { hasPortalPermission, requirePortalApiRole } from "@/lib/portal-access";
import { jsonNoStore, rejectCrossSiteRequest } from "@/lib/security";

const clean = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (rejectCrossSiteRequest(request)) return jsonNoStore({ error: "مصدر الطلب غير مسموح" }, { status: 403 });
  const access = await requirePortalApiRole(["admin", "manager", "employee"]);
  if (!access || !(await hasPortalPermission(access, "operations", "write"))) return jsonNoStore({ error: "غير مصرح بتعديل عرض السعر" }, { status: 403 });
  const id = Number((await context.params).id);
  const db = getDb();
  const quote = await db.query.quoteVersions.findFirst({ where: eq(quoteVersions.id, id) });
  if (!quote) return jsonNoStore({ error: "عرض السعر غير موجود" }, { status: 404 });
  if (!["draft", "rejected"].includes(quote.status) || quote.approvedBy) return jsonNoStore({ error: "العرض المعتمد لا يعدل مباشرة؛ أنشئ إصدارًا جديدًا للحفاظ على السجل" }, { status: 409 });
  const payload = await request.json() as Record<string, unknown>;
  const issueDate = clean(payload.issueDate, 10) || quote.issueDate;
  const validUntil = clean(payload.validUntil, 10) || quote.validUntil;
  if (validUntil < issueDate) return jsonNoStore({ error: "صلاحية العرض تسبق تاريخ الإصدار" }, { status: 400 });
  const now = new Date().toISOString();
  const [updated] = await db.update(quoteVersions).set({
    issueDate, validUntil,
    terms: payload.terms === undefined ? quote.terms : clean(payload.terms, 3000) || null,
    assumptions: payload.assumptions === undefined ? quote.assumptions : clean(payload.assumptions, 5000) || null,
    status: "draft", approvalReason: null, approvedBy: null, approvedAt: null,
    updatedAt: now, recordVersion: quote.recordVersion + 1,
  }).where(and(eq(quoteVersions.id, id), eq(quoteVersions.recordVersion, quote.recordVersion))).returning();
  if (!updated) return jsonNoStore({ error: "تغير العرض قبل حفظ التعديل؛ حدّث الصفحة" }, { status: 409 });
  await auditPortalAction({ actorEmail: access.user.email, action: "quote-edited", entityType: "quote-version", entityId: id, before: quote, after: updated });
  await emitPortalNotification({ eventType: "quote-edited", title: "عُدّل عرض سعر", message: `${quote.quoteCode} — الإصدار ${quote.versionNumber} ويتطلب اعتماد المالك.`, severity: "warning", module: "sales", entityType: "quote-version", entityId: id, actionView: "operations", targetRole: "admin" }).catch(() => undefined);
  return jsonNoStore({ quote: updated });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  if (rejectCrossSiteRequest(request)) return jsonNoStore({ error: "مصدر الطلب غير مسموح" }, { status: 403 });
  const access = await requirePortalApiRole(["admin", "manager", "employee"]);
  if (!access || !(await hasPortalPermission(access, "operations", "write"))) return jsonNoStore({ error: "غير مصرح بحذف عرض السعر" }, { status: 403 });
  const id = Number((await context.params).id);
  const db = getDb();
  const quote = await db.query.quoteVersions.findFirst({ where: eq(quoteVersions.id, id) });
  if (!quote) return jsonNoStore({ error: "عرض السعر غير موجود" }, { status: 404 });
  if (quote.approvedBy || !["draft", "rejected"].includes(quote.status)) return jsonNoStore({ error: "لا يمكن حذف عرض سعر دخل مسار الاعتماد أو تم اعتماده؛ أنشئ إصدارًا بديلًا", code: "QUOTE_DELETE_BLOCKED" }, { status: 409 });
  await db.transaction(async (tx) => {
    await tx.delete(workflowApprovals).where(and(eq(workflowApprovals.entityType, "quote-version"), eq(workflowApprovals.entityId, String(id))));
    await tx.delete(quoteItems).where(eq(quoteItems.quoteVersionId, id));
    await tx.delete(quoteVersions).where(eq(quoteVersions.id, id));
  });
  await auditPortalAction({ actorEmail: access.user.email, action: "quote-deleted", entityType: "quote-version", entityId: id, before: quote });
  await emitPortalNotification({ eventType: "quote-deleted", title: "حُذف عرض سعر", message: `${quote.quoteCode} — الإصدار ${quote.versionNumber}.`, severity: "warning", module: "sales", entityType: "quote-version", entityId: id, actionView: "operations", targetDepartment: "workforce" }).catch(() => undefined);
  return jsonNoStore({ deleted: true, id });
}
