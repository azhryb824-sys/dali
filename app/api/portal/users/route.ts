import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { portalAccessScopes, portalAuthCredentials, portalRoles, portalUserPermissions, portalUsers } from "@/db/schema";
import { auditPortalAction, recordStatusChange } from "@/lib/audit";
import { hashPassword } from "@/lib/credential-auth";
import { canAdministerPortalUsers, requirePortalApiRole } from "@/lib/portal-access";
import { emitPortalNotification } from "@/lib/portal-notifications";
import { permissionsForProfile, parseRolePermissions, type PermissionProfile } from "@/lib/portal-permissions";
import { revokePortalSessionsForUser } from "@/lib/portal-session";
import { jsonNoStore, readLimitedJson, rejectCrossSiteRequest, requestCorrelationId, requestSourceHash } from "@/lib/security";

const allowedRoles = new Set(["admin", "manager", "employee"]);
const allowedStatuses = new Set(["active", "pending", "suspended"]);
const allowedDepartments = new Set(["general", "employees", "finance", "legal", "workforce", "construction"]);
const permissionProfiles = new Set<PermissionProfile>(["read_only", "operator", "role_default"]);
const roleDepartments: Record<string, string> = {
  accountant: "finance", lawyer: "legal", legal_affairs: "legal", sales_representative: "workforce",
  purchasing_representative: "finance", administrative_assistant: "general",
  finance_director: "finance", project_accountant: "finance", contracts_manager: "legal",
  procurement_officer: "finance", hr_officer: "employees", workforce_operations_manager: "workforce",
  regional_manager: "workforce", construction_director: "construction", project_manager: "construction",
  site_engineer: "construction", planning_engineer: "construction", cost_engineer: "construction",
};

async function requireUserAdministrator() {
  const access = await requirePortalApiRole(["admin", "manager", "employee"]);
  return access && canAdministerPortalUsers(access) ? access : null;
}

export async function POST(request: Request) {
  if (rejectCrossSiteRequest(request)) return jsonNoStore({ error: "مصدر الطلب غير مسموح" }, { status: 403 });
  const access = await requireUserAdministrator();
  if (!access) return jsonNoStore({ error: "إضافة المستخدمين متاحة للمالك ومشرف النظام فقط" }, { status: 403 });
  try {
    const parsed = await readLimitedJson(request, 12_000);
    if (!parsed.ok) return parsed.response;
    const payload = parsed.value as Record<string, unknown>;
    const identifier = typeof payload.identifier === "string" ? payload.identifier.trim() : "";
    const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
    const displayName = typeof payload.displayName === "string" ? payload.displayName.trim().slice(0, 160) : "";
    const password = typeof payload.password === "string" ? payload.password : "";
    const functionalRoles = Array.isArray(payload.functionalRoles)
      ? [...new Set(payload.functionalRoles.filter((value): value is string => typeof value === "string").map((value) => value.trim()).filter(Boolean))]
      : typeof payload.functionalRole === "string" && payload.functionalRole.trim() ? [payload.functionalRole.trim()] : [];
    const requestedProfile = typeof payload.permissionProfile === "string" ? payload.permissionProfile as PermissionProfile : "role_default";
    const permissionProfile: PermissionProfile = permissionProfiles.has(requestedProfile) ? requestedProfile : "role_default";
    const db = getDb();
    if (!functionalRoles.length) return jsonNoStore({ error: "يجب اختيار دور وظيفي واحد على الأقل" }, { status: 400 });
    const activeRoleDefinitions = await db.select().from(portalRoles);
    const definitionByKey = new Map(activeRoleDefinitions.filter((item) => item.active).map((item) => [item.roleKey, item]));
    const roleDefinitions = functionalRoles.map((roleKey) => definitionByKey.get(roleKey));
    if (roleDefinitions.some((definition) => !definition)) return jsonNoStore({ error: "تتضمن الأدوار دوراً غير موجود أو غير نشط" }, { status: 400 });
    const isRootRole = functionalRoles.some((roleKey) => roleKey === "system_owner" || roleKey === "system_admin");
    if (isRootRole && !(access.role === "admin" || access.functionalRoles.includes("system_owner") || access.functionalRoles.includes("system_admin"))) return jsonNoStore({ error: "إنشاء مالك النظام أو مشرفه متاح للمالك أو مشرف قائم فقط" }, { status: 403 });
    const role = isRootRole ? "admin" : "employee";
    const submittedDepartment = typeof payload.department === "string" ? payload.department : "general";
    const inferredDepartments = [...new Set(functionalRoles.map((roleKey) => roleDepartments[roleKey]).filter(Boolean))];
    const department = isRootRole || inferredDepartments.length !== 1 ? "general" : inferredDepartments[0] || submittedDepartment;
    if (!/^\d{10}$/.test(identifier) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || displayName.length < 3 || !allowedRoles.has(role) || !allowedDepartments.has(department) || password.length < 12 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
      return jsonNoStore({ error: "أكمل البيانات: هوية من 10 أرقام، بريد صحيح، وكلمة مرور من 12 خانة تشمل حرفًا كبيرًا وصغيرًا ورقمًا ورمزًا" }, { status: 400 });
    }
    const [credentialExists, userExists] = await Promise.all([
      db.query.portalAuthCredentials.findFirst({ where: eq(portalAuthCredentials.identifier, identifier) }),
      db.query.portalUsers.findFirst({ where: eq(portalUsers.email, email) }),
    ]);
    if (credentialExists || userExists) return jsonNoStore({ error: "رقم الهوية أو البريد مستخدم في حساب آخر" }, { status: 409 });
    const now = new Date().toISOString();
    const passwordHash = await hashPassword(password);
    const user = await db.transaction(async (tx) => {
      await tx.insert(portalAuthCredentials).values({ identifier, email, displayName, passwordHash, mustChangePassword: true, passwordChangedAt: null, createdAt: now, updatedAt: now });
      const [created] = await tx.insert(portalUsers).values({ email, displayName, role, department, status: "active", requestedDepartment: department, requestedJobTitle: "أُضيف بواسطة الإدارة", requestReason: "إنشاء مباشر بواسطة المالك أو مشرف النظام", requestSubmittedAt: now, termsAcceptedAt: now, approvedBy: access.user.email, approvedAt: now, createdAt: now, updatedAt: now }).returning();
      await tx.insert(portalAccessScopes).values(functionalRoles.map((functionalRole) => ({ userEmail: email, functionalRole, active: true, canApproveOwn: false, createdBy: access.user.email, createdAt: now, updatedAt: now })));
      if (!isRootRole) {
        const combinedPermissions = [...new Set(roleDefinitions.flatMap((definition) => parseRolePermissions(definition!.permissionsJson)))];
        const explicitRules = permissionsForProfile(combinedPermissions, permissionProfile);
        await tx.insert(portalUserPermissions).values(explicitRules.map((rule) => ({
          userEmail: email, resource: rule.resource, action: rule.action, allowed: rule.allowed,
          scope: department === "general" ? "all" : "department", createdBy: access.user.email, createdAt: now,
        })));
      }
      return created;
    });
    await auditPortalAction({ actorEmail: access.user.email, action: "portal-user-created", entityType: "portal-user", entityId: email, after: { ...user, identifier: "**********", functionalRoles }, reason: isRootRole ? `إنشاء ${functionalRole === "system_owner" ? "مالك نظام" : "مشرف نظام"} بصلاحيات كاملة` : `إنشاء حساب بأدوار ${roleDefinitions.map((definition) => definition!.labelAr).join("، ")} وحزمة ${permissionProfile}`, source: "security", correlationId: requestCorrelationId(request), ipHash: await requestSourceHash(request) });
    await emitPortalNotification({ eventType: "portal-user-created", title: "أُضيف مستخدم جديد", message: `${displayName} — ${roleDefinitions.map((definition) => definition!.labelAr).join("، ")} — ${department}.`, severity: "warning", module: "users", entityType: "portal-user", entityId: email, actionView: "users", targetRole: "admin" }).catch(() => undefined);
    return jsonNoStore({ user: { ...user, functionalRoles } }, { status: 201 });
  } catch (error) {
    console.error("portal-user-create-failed", error);
    return jsonNoStore({ error: "تعذّر إضافة المستخدم" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  if (rejectCrossSiteRequest(request)) return jsonNoStore({ error: "مصدر الطلب غير مسموح" }, { status: 403 });
  const access = await requireUserAdministrator();
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
