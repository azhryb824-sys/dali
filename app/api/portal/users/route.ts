import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { portalUsers } from "@/db/schema";
import { auditPortalAction, recordStatusChange } from "@/lib/audit";
import { requirePortalApiRole } from "@/lib/portal-access";
import { emitPortalNotification } from "@/lib/portal-notifications";
import { revokePortalSessionsForUser } from "@/lib/portal-session";
import { jsonNoStore, readLimitedJson, rejectCrossSiteRequest, requestCorrelationId, requestSourceHash } from "@/lib/security";

const allowedRoles = new Set(["admin", "manager", "employee"]);
const allowedStatuses = new Set(["active", "pending", "suspended"]);
const allowedDepartments = new Set(["general", "employees", "finance", "legal", "workforce", "construction"]);

export async function PATCH(request: Request) {
  if (rejectCrossSiteRequest(request)) return jsonNoStore({ error: "مصدر الطلب غير مسموح" }, { status: 403 });
  const access = await requirePortalApiRole(["admin"]);
  if (!access) return jsonNoStore({ error: "غير مصرح أو انتهت الجلسة الآمنة" }, { status: 403 });

  try {
    const parsed = await readLimitedJson(request, 8_000);
    if (!parsed.ok) return parsed.response;
    const payload = parsed.value as { email?: unknown; role?: unknown; department?: unknown; status?: unknown; reason?: unknown };
    const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
    const role = typeof payload.role === "string" ? payload.role : "";
    const department = typeof payload.department === "string" ? payload.department : "";
    const status = typeof payload.status === "string" ? payload.status : "";
    const reason = typeof payload.reason === "string" ? payload.reason.trim().slice(0, 1000) : "";

    if (!email || email === access.user.email || !allowedRoles.has(role) || !allowedDepartments.has(department) || !allowedStatuses.has(status) || reason.length < 10) {
      return jsonNoStore({ error: "تحقق من بيانات الصلاحية واكتب سبباً واضحاً لا يقل عن 10 أحرف" }, { status: 400 });
    }

    const db = getDb();
    const existing = await db.query.portalUsers.findFirst({ where: eq(portalUsers.email, email) });
    if (!existing) return jsonNoStore({ error: "المستخدم غير موجود" }, { status: 404 });
    if (status === "active" && (!existing.requestSubmittedAt || !existing.termsAcceptedAt) && existing.status !== "active") {
      return jsonNoStore({ error: "لا يمكن اعتماد الحساب قبل اكتمال طلب الانضمام والموافقة على ضوابط الاستخدام" }, { status: 409 });
    }
    const now = new Date().toISOString();
    const [updated] = await db
      .update(portalUsers)
      .set({
        role,
        department,
        status,
        updatedAt: now,
        ...(status === "active" && existing.status !== "active" ? { approvedBy: access.user.email, approvedAt: now, suspendedAt: null } : {}),
        ...(status === "suspended" ? { suspendedAt: now } : {}),
        ...(status === "pending" ? { approvedBy: null, approvedAt: null, suspendedAt: null } : {}),
      })
      .where(eq(portalUsers.email, email))
      .returning();

    if (!updated) return jsonNoStore({ error: "المستخدم غير موجود" }, { status: 404 });

    const correlationId = requestCorrelationId(request);
    if (existing.status !== status) await recordStatusChange({ entityType: "portal-user", entityId: email, fromStatus: existing.status, toStatus: status, actorEmail: access.user.email, reason, correlationId });
    await revokePortalSessionsForUser(email, "access-policy-changed");
    await auditPortalAction({ actorEmail: access.user.email, action: "user-access-updated", entityType: "portal-user", entityId: email, before: existing, after: updated, reason, correlationId, source: "security", ipHash: await requestSourceHash(request) });
    await emitPortalNotification({
      eventType: "user-access-updated",
      title: status === "active" ? "تم اعتماد صلاحية حسابك" : status === "suspended" ? "تم إيقاف صلاحية الحساب" : "تغيّرت صلاحية الحساب",
      message: `الدور: ${role} — القسم: ${department} — الحالة: ${status}. أُبطلت الجلسات السابقة ويلزم تسجيل دخول جديد.`,
      severity: status === "active" ? "success" : status === "suspended" ? "critical" : "info",
      module: "users",
      entityType: "portal-user",
      entityId: email,
      actionView: "overview",
      targetEmail: email,
    }).catch(() => undefined);

    return jsonNoStore({ user: updated });
  } catch (error) {
    console.error("portal-user-access-update-failed", error);
    return jsonNoStore({ error: "تعذّر تحديث الصلاحية" }, { status: 500 });
  }
}
