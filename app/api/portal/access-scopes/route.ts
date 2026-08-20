import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { businessLines, constructionProjects, portalAccessScopes, portalUsers, serviceCities, serviceRegions } from "@/db/schema";
import { functionalRoleLabels, functionalRoles } from "@/lib/access-policy";
import { auditPortalAction } from "@/lib/audit";
import { requirePortalApiRole } from "@/lib/portal-access";
import { emitPortalNotification } from "@/lib/portal-notifications";
import { revokePortalSessionsForUser } from "@/lib/portal-session";
import { jsonNoStore, readLimitedJson, rejectCrossSiteRequest, requestCorrelationId } from "@/lib/security";

const integer = (value: unknown, nullable = true) => {
  if (nullable && (value === "" || value == null)) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
};
const money = (value: unknown) => {
  if (value === "" || value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) : undefined;
};
const date = (value: unknown) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : value ? undefined : null;

export async function GET() {
  const access = await requirePortalApiRole(["admin"]);
  if (!access) return jsonNoStore({ error: "غير مصرح بإدارة نطاقات الوصول" }, { status: 403 });
  const db = getDb();
  const [scopes, users, lines, regions, cities, projects] = await Promise.all([
    db.select().from(portalAccessScopes).orderBy(desc(portalAccessScopes.active), desc(portalAccessScopes.updatedAt)).limit(1000),
    db.select({ email: portalUsers.email, displayName: portalUsers.displayName, status: portalUsers.status }).from(portalUsers).orderBy(portalUsers.displayName),
    db.select().from(businessLines).orderBy(businessLines.id),
    db.select().from(serviceRegions).orderBy(serviceRegions.sortOrder),
    db.select().from(serviceCities).orderBy(serviceCities.nameAr).limit(1000),
    db.select({ id: constructionProjects.id, projectCode: constructionProjects.projectCode, title: constructionProjects.title, cityId: constructionProjects.cityId }).from(constructionProjects).orderBy(desc(constructionProjects.updatedAt)).limit(500),
  ]);
  return jsonNoStore({ scopes, users, lines, regions, cities, projects, roleLabels: functionalRoleLabels });
}

export async function POST(request: Request) {
  if (rejectCrossSiteRequest(request)) return jsonNoStore({ error: "مصدر الطلب غير مسموح" }, { status: 403 });
  const access = await requirePortalApiRole(["admin"]);
  if (!access) return jsonNoStore({ error: "غير مصرح بإدارة نطاقات الوصول" }, { status: 403 });
  const parsed = await readLimitedJson(request, 12_000);
  if (!parsed.ok) return parsed.response;
  const body = parsed.value as Record<string, unknown>;
  const userEmail = typeof body.userEmail === "string" ? body.userEmail.trim().toLowerCase() : "";
  const functionalRole = typeof body.functionalRole === "string" ? body.functionalRole : "";
  const businessLineId = integer(body.businessLineId);
  const regionId = integer(body.regionId);
  const cityId = integer(body.cityId);
  const projectId = integer(body.projectId);
  const financialLimitHalalas = money(body.financialLimit);
  const approvalLimitHalalas = money(body.approvalLimit);
  const validFrom = date(body.validFrom);
  const validUntil = date(body.validUntil);
  if (!userEmail || !functionalRoles.includes(functionalRole as never) || [businessLineId, regionId, cityId, projectId, financialLimitHalalas, approvalLimitHalalas, validFrom, validUntil].includes(undefined) || (validFrom && validUntil && validUntil < validFrom)) {
    return jsonNoStore({ error: "بيانات الدور أو النطاق أو الحدود المالية غير صحيحة" }, { status: 400 });
  }
  if (userEmail === access.user.email) return jsonNoStore({ error: "لا يمكن تعديل نطاق حسابك من جلستك الحالية" }, { status: 409 });
  const db = getDb();
  const target = await db.query.portalUsers.findFirst({ where: eq(portalUsers.email, userEmail) });
  if (!target) return jsonNoStore({ error: "المستخدم غير موجود" }, { status: 404 });
  const [created] = await db.insert(portalAccessScopes).values({
    userEmail, functionalRole, businessLineId, regionId, cityId, projectId,
    financialLimitHalalas, approvalLimitHalalas, canApproveOwn: false,
    validFrom, validUntil, active: true, createdBy: access.user.email,
  }).returning();
  const correlationId = requestCorrelationId(request);
  await revokePortalSessionsForUser(userEmail, "access-scope-changed");
  await auditPortalAction({ actorEmail: access.user.email, action: "access-scope-created", entityType: "portal-access-scope", entityId: created.id, after: created, correlationId, source: "security" });
  await emitPortalNotification({ eventType: "access-scope-created", title: "أُسند نطاق وصول وظيفي", message: `${functionalRoleLabels[functionalRole as keyof typeof functionalRoleLabels]} — أُبطلت الجلسات السابقة ويلزم تسجيل الدخول مجدداً.`, severity: "info", module: "users", entityType: "portal-access-scope", entityId: created.id, actionView: "users", targetEmail: userEmail }).catch(() => undefined);
  return jsonNoStore({ scope: created }, { status: 201 });
}

export async function PATCH(request: Request) {
  if (rejectCrossSiteRequest(request)) return jsonNoStore({ error: "مصدر الطلب غير مسموح" }, { status: 403 });
  const access = await requirePortalApiRole(["admin"]);
  if (!access) return jsonNoStore({ error: "غير مصرح بإدارة نطاقات الوصول" }, { status: 403 });
  const parsed = await readLimitedJson(request, 4_000);
  if (!parsed.ok) return parsed.response;
  const body = parsed.value as Record<string, unknown>;
  const id = integer(body.id, false);
  const active = body.active;
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 1000) : "";
  if (!id || typeof active !== "boolean" || reason.length < 10) return jsonNoStore({ error: "اكتب سبباً واضحاً لا يقل عن 10 أحرف" }, { status: 400 });
  const db = getDb();
  const current = await db.query.portalAccessScopes.findFirst({ where: eq(portalAccessScopes.id, id) });
  if (!current) return jsonNoStore({ error: "نطاق الوصول غير موجود" }, { status: 404 });
  if (current.userEmail === access.user.email) return jsonNoStore({ error: "لا يمكن تعديل نطاق حسابك من جلستك الحالية" }, { status: 409 });
  const [updated] = await db.update(portalAccessScopes).set({ active, updatedAt: new Date().toISOString() }).where(and(eq(portalAccessScopes.id, id), eq(portalAccessScopes.active, !active))).returning();
  if (!updated) return jsonNoStore({ error: "لم تتغير حالة النطاق" }, { status: 409 });
  const correlationId = requestCorrelationId(request);
  await revokePortalSessionsForUser(current.userEmail, "access-scope-changed");
  await auditPortalAction({ actorEmail: access.user.email, action: active ? "access-scope-activated" : "access-scope-suspended", entityType: "portal-access-scope", entityId: id, before: current, after: updated, reason, correlationId, source: "security" });
  await emitPortalNotification({ eventType: active ? "access-scope-activated" : "access-scope-suspended", title: active ? "فُعّل نطاق وصول" : "أُوقف نطاق وصول", message: reason, severity: active ? "success" : "warning", module: "users", entityType: "portal-access-scope", entityId: id, actionView: "users", targetEmail: current.userEmail }).catch(() => undefined);
  return jsonNoStore({ scope: updated });
}
