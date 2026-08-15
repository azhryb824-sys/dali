import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { timesheets, workflowApprovals } from "@/db/schema";
import { auditPortalAction, recordStatusChange } from "@/lib/audit";
import { requireClientApiAccess } from "@/lib/client-access";
import { emitPortalNotification } from "@/lib/portal-notifications";
import { jsonNoStore, rejectCrossSiteRequest, requestCorrelationId } from "@/lib/security";

export async function PATCH(request: Request) {
  if (rejectCrossSiteRequest(request)) return jsonNoStore({ error: "مصدر الطلب غير مسموح" }, { status: 403 });
  const access = await requireClientApiAccess();
  if (!access || !access.canApproveTimesheets) return jsonNoStore({ error: "غير مصرح باعتماد الدوام" }, { status: 403 });
  try {
    const payload = await request.json() as { id?: unknown; decision?: unknown; reason?: unknown };
    const id = Number(payload.id);
    const decision = payload.decision === "approved" || payload.decision === "rejected" ? payload.decision : "";
    const reason = typeof payload.reason === "string" ? payload.reason.trim().slice(0, 1000) : "";
    if (!Number.isInteger(id) || id < 1 || !decision || (decision === "rejected" && !reason)) return jsonNoStore({ error: "بيانات القرار غير مكتملة" }, { status: 400 });
    const db = getDb();
    const sheet = await db.query.timesheets.findFirst({ where: and(eq(timesheets.id, id), eq(timesheets.clientId, access.clientId)) });
    if (!sheet || sheet.status !== "submitted") return jsonNoStore({ error: "كشف الدوام غير متاح للاعتماد" }, { status: 409 });
    const now = new Date().toISOString();
    const [updated] = await db.update(timesheets).set({ status: decision, approvedBy: decision === "approved" ? access.user.email : null, approvedAt: decision === "approved" ? now : null, rejectionReason: decision === "rejected" ? reason : null, updatedAt: now, version: sheet.version + 1 }).where(and(eq(timesheets.id, id), eq(timesheets.version, sheet.version))).returning();
    if (!updated) return jsonNoStore({ error: "تغير الكشف أثناء المراجعة. حدّث الصفحة." }, { status: 409 });
    await db.update(workflowApprovals).set({ status: decision, decisionBy: access.user.email, decisionReason: reason || null, decidedAt: now }).where(and(eq(workflowApprovals.entityType, "timesheet"), eq(workflowApprovals.entityId, String(id)), eq(workflowApprovals.status, "pending")));
    const correlationId = requestCorrelationId(request);
    await recordStatusChange({ entityType: "timesheet", entityId: id, fromStatus: sheet.status, toStatus: decision, reason, actorEmail: access.user.email, correlationId });
    await auditPortalAction({ actorEmail: access.user.email, action: "client-timesheet-decision", entityType: "timesheet", entityId: id, before: sheet, after: updated, reason, correlationId, source: "client-portal" });
    await emitPortalNotification({ eventType: "client-timesheet-decision", title: decision === "approved" ? "اعتمد العميل كشف الدوام" : "رفض العميل كشف الدوام", message: `${sheet.timesheetCode} — ${access.displayName}.`, severity: decision === "approved" ? "success" : "critical", module: "operations", entityType: "timesheet", entityId: id, actionView: "operations", targetDepartment: "workforce" }).catch(() => undefined);
    return jsonNoStore({ timesheet: updated });
  } catch { return jsonNoStore({ error: "تعذّر حفظ قرار كشف الدوام" }, { status: 500 }); }
}
