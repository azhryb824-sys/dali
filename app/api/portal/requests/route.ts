import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { workforceRequests } from "@/db/schema";
import { auditPortalAction, recordStatusChange } from "@/lib/audit";
import { emitPortalNotification } from "@/lib/portal-notifications";
import { canAdministerPortalUsers, hasPortalPermission, requirePortalApiRole } from "@/lib/portal-access";
import { rejectCrossSiteRequest } from "@/lib/security";

const allowedStatuses = new Set(["new", "reviewing", "contacted", "closed"]);

export async function PATCH(request: Request) {
  if (rejectCrossSiteRequest(request)) return Response.json({ error: "مصدر الطلب غير مسموح" }, { status: 403 });
  const access = await requirePortalApiRole(["admin", "manager", "employee"]);
  if (!access || !(await hasPortalPermission(access, "workforce", "write"))) return Response.json({ error: "غير مصرح" }, { status: 403 });

  try {
    const payload = (await request.json()) as { id?: unknown; status?: unknown; version?: unknown; action?: unknown; reason?: unknown };
    const id = typeof payload.id === "number" ? payload.id : Number(payload.id);
    const status = typeof payload.status === "string" ? payload.status : "";
    const version = Number(payload.version);
    if (!Number.isInteger(id) || id < 1 || (!["approve", "reject"].includes(String(payload.action)) && !allowedStatuses.has(status)) || !Number.isInteger(version) || version < 1) {
      return Response.json({ error: "بيانات التحديث غير صحيحة" }, { status: 400 });
    }

    const db = getDb();
    const existing = await db.query.workforceRequests.findFirst({ where: eq(workforceRequests.id, id) });
    if (!existing) return Response.json({ error: "الطلب غير موجود" }, { status: 404 });
    if (payload.action === "approve" || payload.action === "reject") {
      if (!canAdministerPortalUsers(access)) return Response.json({ error: "اعتماد طلب عرض السعر متاح للمالك أو مشرف النظام فقط" }, { status: 403 });
      if (existing.requestType !== "quotation" || existing.approvalStatus === "approved") return Response.json({ error: "الطلب غير قابل لهذا القرار" }, { status: 409 });
      const approved = payload.action === "approve";
      const reason = typeof payload.reason === "string" ? payload.reason.trim().slice(0, 1000) : "";
      if (!approved && reason.length < 5) return Response.json({ error: "اكتب سبب رفض الطلب" }, { status: 400 });
      const now = new Date().toISOString();
      const [updated] = await db.update(workforceRequests).set({ approvalStatus: approved ? "approved" : "rejected", approvedBy: approved ? access.user.email : null, approvedAt: approved ? now : null, approvalReason: reason || null, updatedAt: now, version: existing.version + 1 }).where(and(eq(workforceRequests.id, id), eq(workforceRequests.version, version))).returning();
      if (!updated) return Response.json({ error: "تغير الطلب أثناء المراجعة؛ حدّث الصفحة" }, { status: 409 });
      await auditPortalAction({ actorEmail: access.user.email, action: approved ? "quote-request-approved" : "quote-request-rejected", entityType: "workforce-request", entityId: id, before: existing, after: updated, reason });
      await emitPortalNotification({ eventType: approved ? "quote-request-approved" : "quote-request-rejected", title: approved ? "اعتمد طلب عرض السعر" : "رُفض طلب عرض السعر", message: `${existing.trackingCode} — ${approved ? "أصبح قابلًا للتحويل إلى عرض سعر" : reason}`, severity: approved ? "success" : "warning", module: "workforce", entityType: "workforce-request", entityId: id, actionView: "workforce", targetDepartment: "workforce" }).catch(() => undefined);
      return Response.json({ request: updated });
    }
    const transitions: Record<string, string[]> = { new: ["reviewing", "contacted", "closed"], reviewing: ["new", "contacted", "closed"], contacted: ["reviewing", "closed"], closed: ["reviewing"] };
    if (existing.status !== status && !transitions[existing.status]?.includes(status)) return Response.json({ error: "انتقال حالة الطلب غير مسموح" }, { status: 409 });
    if (existing.status === status) return Response.json({ request: existing });
    const now = new Date().toISOString();
    const [updated] = await db
      .update(workforceRequests)
      .set({ status, updatedAt: now, version: existing.version + 1 })
      .where(and(eq(workforceRequests.id, id), eq(workforceRequests.version, version)))
      .returning();

    if (!updated) return Response.json({ error: "تغير الطلب أثناء المراجعة؛ حدّث الصفحة وحاول مجددًا" }, { status: 409 });

    const correlationId = crypto.randomUUID();
    await recordStatusChange({ entityType: "workforce-request", entityId: id, fromStatus: existing.status, toStatus: status, actorEmail: access.user.email, correlationId });
    await auditPortalAction({ actorEmail: access.user.email, action: "request-status-updated", entityType: "workforce-request", entityId: id, before: existing, after: updated, correlationId });
    await emitPortalNotification({
      eventType: "visitor-request-status-updated",
      title: status === "closed" ? "أُغلق طلب زائر" : "تغيّرت حالة طلب زائر",
      message: `${updated.trackingCode} — الحالة الجديدة: ${status}.`,
      severity: status === "closed" ? "success" : "info",
      module: "workforce",
      entityType: "workforce-request",
      entityId: id,
      actionView: "workforce",
      targetDepartment: "workforce",
    }).catch(() => undefined);

    return Response.json({ request: updated });
  } catch {
    return Response.json({ error: "تعذّر تحديث الطلب" }, { status: 500 });
  }
}
