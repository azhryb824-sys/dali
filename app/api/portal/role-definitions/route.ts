import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { portalAccessScopes, portalRoles } from "@/db/schema";
import { auditPortalAction } from "@/lib/audit";
import { requirePortalApiRole } from "@/lib/portal-access";
import { emitPortalNotification } from "@/lib/portal-notifications";
import { jsonNoStore, readLimitedJson, rejectCrossSiteRequest, requestCorrelationId } from "@/lib/security";

export const availableRolePermissions = [
  "overview.read", "employees.read", "employees.write", "employees.approve",
  "finance.read", "finance.write", "finance.approve", "finance.post", "finance.pay",
  "legal.read", "legal.write", "legal.approve", "workforce.read", "workforce.write", "workforce.approve",
  "construction.read", "construction.write", "construction.approve", "documents.read", "documents.write", "documents.share",
  "conversations.read", "conversations.write", "website.read", "website.write", "reports.read", "reports.export",
  "assets.administer", "users.administer", "integrations.administer",
] as const;

const allowed = new Set<string>(availableRolePermissions);
const keyPattern = /^[a-z][a-z0-9_]{2,63}$/;
const clean = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";
function permissions(value: unknown) {
  if (!Array.isArray(value)) return null;
  const result = [...new Set(value.filter((item): item is string => typeof item === "string" && (item === "*" || allowed.has(item))))];
  return result.length === value.length ? result : null;
}

async function requireRoleAdmin() {
  const access = await requirePortalApiRole(["admin", "manager", "employee"]);
  if (!access || (access.role !== "admin" && !access.functionalRoles.some((role) => role === "system_owner" || role === "system_admin"))) return null;
  return access;
}

export async function GET() {
  const access = await requireRoleAdmin();
  if (!access) return jsonNoStore({ error: "غير مصرح بإدارة الأدوار" }, { status: 403 });
  const roles = await getDb().select().from(portalRoles).orderBy(asc(portalRoles.labelAr));
  return jsonNoStore({ roles, availablePermissions: availableRolePermissions });
}

export async function POST(request: Request) {
  if (rejectCrossSiteRequest(request)) return jsonNoStore({ error: "مصدر الطلب غير مسموح" }, { status: 403 });
  const access = await requireRoleAdmin();
  if (!access) return jsonNoStore({ error: "غير مصرح بإدارة الأدوار" }, { status: 403 });
  const parsed = await readLimitedJson(request, 20_000);
  if (!parsed.ok) return parsed.response;
  const body = parsed.value as Record<string, unknown>;
  const roleKey = clean(body.roleKey, 64).toLowerCase();
  const labelAr = clean(body.labelAr, 120);
  const description = clean(body.description, 500);
  const selected = permissions(body.permissions);
  if (!keyPattern.test(roleKey) || labelAr.length < 3 || !selected || selected.includes("*") || selected.includes("users.administer")) return jsonNoStore({ error: "بيانات الدور غير صحيحة، وإدارة المستخدمين محصورة في المالك ومشرف النظام" }, { status: 400 });
  try {
    const [created] = await getDb().insert(portalRoles).values({ roleKey, labelAr, description: description || null, permissionsJson: JSON.stringify(selected), protected: false, active: true, createdBy: access.user.email }).returning();
    await auditPortalAction({ actorEmail: access.user.email, action: "portal-role-created", entityType: "portal-role", entityId: roleKey, after: created, correlationId: requestCorrelationId(request), source: "security" });
    await emitPortalNotification({ eventType: "portal-role-created", title: "أُضيف دور وظيفي جديد", message: labelAr, severity: "info", module: "users", entityType: "portal-role", entityId: roleKey, actionView: "users", targetRole: "admin" }).catch(() => undefined);
    return jsonNoStore({ role: created }, { status: 201 });
  } catch (error) {
    return jsonNoStore({ error: String(error).toLowerCase().includes("unique") ? "رمز الدور مستخدم مسبقاً" : "تعذّر إنشاء الدور" }, { status: 409 });
  }
}

export async function PATCH(request: Request) {
  if (rejectCrossSiteRequest(request)) return jsonNoStore({ error: "مصدر الطلب غير مسموح" }, { status: 403 });
  const access = await requireRoleAdmin();
  if (!access) return jsonNoStore({ error: "غير مصرح بإدارة الأدوار" }, { status: 403 });
  const parsed = await readLimitedJson(request, 20_000);
  if (!parsed.ok) return parsed.response;
  const body = parsed.value as Record<string, unknown>;
  const roleKey = clean(body.roleKey, 64).toLowerCase();
  const labelAr = clean(body.labelAr, 120);
  const description = clean(body.description, 500);
  const selected = permissions(body.permissions);
  const active = body.active;
  const reason = clean(body.reason, 1000);
  if (!keyPattern.test(roleKey) || labelAr.length < 3 || !selected || (selected.includes("*") && roleKey !== "system_owner" && roleKey !== "system_admin") || (selected.includes("users.administer") && roleKey !== "system_owner" && roleKey !== "system_admin") || typeof active !== "boolean" || reason.length < 10) return jsonNoStore({ error: "تحقق من البيانات؛ إدارة المستخدمين محصورة في المالك ومشرف النظام، واكتب سبباً لا يقل عن 10 أحرف" }, { status: 400 });
  const db = getDb();
  const existing = await db.query.portalRoles.findFirst({ where: eq(portalRoles.roleKey, roleKey) });
  if (!existing) return jsonNoStore({ error: "الدور غير موجود" }, { status: 404 });
  if (existing.protected && (!active || !selected.includes("*"))) return jsonNoStore({ error: "لا يمكن تعطيل المالك أو مشرف النظام أو سحب الصلاحية الشاملة منهما" }, { status: 409 });
  const [updated] = await db.update(portalRoles).set({ labelAr, description: description || null, permissionsJson: JSON.stringify(selected), active, updatedAt: new Date().toISOString() }).where(eq(portalRoles.roleKey, roleKey)).returning();
  if (!active) await db.update(portalAccessScopes).set({ active: false, updatedAt: new Date().toISOString() }).where(eq(portalAccessScopes.functionalRole, roleKey));
  await auditPortalAction({ actorEmail: access.user.email, action: "portal-role-updated", entityType: "portal-role", entityId: roleKey, before: existing, after: updated, reason, correlationId: requestCorrelationId(request), source: "security" });
  await emitPortalNotification({ eventType: "portal-role-updated", title: "عُدّل تعريف دور وظيفي", message: `${labelAr}: ${reason}`, severity: active ? "info" : "warning", module: "users", entityType: "portal-role", entityId: roleKey, actionView: "users", targetRole: "admin" }).catch(() => undefined);
  return jsonNoStore({ role: updated });
}
