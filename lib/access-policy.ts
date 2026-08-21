import { and, eq, gte, isNull, lte, or } from "drizzle-orm";
import { getDb } from "@/db";
import { portalAccessScopes, serviceCities } from "@/db/schema";
import type { PortalAccess } from "@/lib/portal-access";
import { normalizePortalEmail } from "@/lib/portal-auth-config";

export const functionalRoleLabels = {
  system_owner: "مالك النظام",
  system_admin: "مدير النظام",
  executive: "المدير التنفيذي",
  construction_director: "مدير قطاع المقاولات",
  workforce_operations_manager: "مدير العمليات والعمالة",
  finance_director: "المدير المالي",
  project_manager: "مدير مشروع",
  site_engineer: "مهندس موقع",
  planning_engineer: "مهندس تخطيط",
  cost_engineer: "مهندس تكاليف وحصر",
  contracts_manager: "مسؤول العقود والمطالبات",
  procurement_officer: "مسؤول المشتريات",
  project_accountant: "محاسب مشروع",
  document_controller: "مراقب مستندات",
  quality_officer: "مسؤول الجودة",
  safety_officer: "مسؤول السلامة",
  hr_officer: "مسؤول الموارد البشرية",
  regional_manager: "مسؤول المنطقة أو المدينة",
  client_consultant: "عميل أو استشاري",
  subcontractor: "مقاول باطن",
} as const;

export type FunctionalRole = keyof typeof functionalRoleLabels;
export type PortalScope = typeof portalAccessScopes.$inferSelect;

export const functionalRoles = Object.keys(functionalRoleLabels) as FunctionalRole[];

const constructionReadRoles = new Set<FunctionalRole>([
  "system_owner", "system_admin", "executive", "construction_director", "finance_director", "project_manager", "site_engineer",
  "planning_engineer", "cost_engineer", "contracts_manager", "procurement_officer", "project_accountant",
  "document_controller", "quality_officer", "safety_officer", "regional_manager", "client_consultant", "subcontractor",
]);

const recordWriteRoles: Record<string, Set<FunctionalRole>> = {
  survey: new Set(["construction_director", "project_manager", "site_engineer", "regional_manager"]),
  estimate: new Set(["construction_director", "cost_engineer", "contracts_manager"]),
  boq: new Set(["construction_director", "cost_engineer", "contracts_manager"]),
  contract: new Set(["construction_director", "contracts_manager"]),
  wbs: new Set(["construction_director", "project_manager", "planning_engineer"]),
  daily_log: new Set(["project_manager", "site_engineer"]),
  document: new Set(["project_manager", "document_controller"]),
  rfi: new Set(["project_manager", "site_engineer", "document_controller", "client_consultant"]),
  submittal: new Set(["project_manager", "site_engineer", "document_controller", "quality_officer", "client_consultant"]),
  inspection: new Set(["project_manager", "site_engineer", "quality_officer"]),
  ncr: new Set(["project_manager", "quality_officer"]),
  safety: new Set(["project_manager", "safety_officer"]),
  procurement: new Set(["construction_director", "project_manager", "procurement_officer"]),
  subcontract: new Set(["construction_director", "contracts_manager", "procurement_officer", "subcontractor"]),
  change_order: new Set(["construction_director", "project_manager", "cost_engineer", "contracts_manager"]),
  payment_certificate: new Set(["construction_director", "project_manager", "cost_engineer", "contracts_manager", "project_accountant"]),
  handover: new Set(["construction_director", "project_manager", "quality_officer", "document_controller", "client_consultant"]),
  risk: new Set(["construction_director", "project_manager", "planning_engineer", "safety_officer"]),
};

export async function getActivePortalScopes(access: Pick<PortalAccess, "role" | "user">): Promise<PortalScope[]> {
  if (access.role === "admin") return [];
  const today = new Date().toISOString().slice(0, 10);
  return getDb().select().from(portalAccessScopes).where(and(
    eq(portalAccessScopes.userEmail, normalizePortalEmail(access.user.email)),
    eq(portalAccessScopes.active, true),
    or(isNull(portalAccessScopes.validFrom), lte(portalAccessScopes.validFrom, today)),
    or(isNull(portalAccessScopes.validUntil), gte(portalAccessScopes.validUntil, today)),
  ));
}

export function canReadConstruction(access: Pick<PortalAccess, "role">, scopes: PortalScope[]) {
  if (access.role === "admin") return true;
  if (!scopes.length) return access.role === "manager";
  return scopes.some((scope) => constructionReadRoles.has(scope.functionalRole as FunctionalRole));
}

export function canCreateConstructionRecord(access: Pick<PortalAccess, "role">, scopes: PortalScope[], recordType: string) {
  if (access.role === "admin") return true;
  if (!scopes.length) return access.role === "manager";
  if (scopes.some((scope) => scope.functionalRole === "system_owner" || scope.functionalRole === "system_admin")) return true;
  const roles = recordWriteRoles[recordType];
  return Boolean(roles && scopes.some((scope) => roles.has(scope.functionalRole as FunctionalRole)));
}

export function scopeAllowsProject(access: Pick<PortalAccess, "role">, scopes: PortalScope[], projectId: number | null, cityId: number | null) {
  if (access.role === "admin" || !scopes.length) return true;
  return scopes.some((scope) =>
    (!scope.projectId || scope.projectId === projectId) &&
    (!scope.cityId || scope.cityId === cityId),
  );
}

export async function scopeAllowsCity(access: Pick<PortalAccess, "role">, scopes: PortalScope[], cityId: number) {
  if (access.role === "admin" || !scopes.length) return true;
  const city = await getDb().query.serviceCities.findFirst({ where: eq(serviceCities.id, cityId) });
  return scopes.some((scope) => (!scope.cityId || scope.cityId === cityId) && (!scope.regionId || scope.regionId === city?.regionId));
}

export function assertFinancialLimit(access: Pick<PortalAccess, "role">, scopes: PortalScope[], amountHalalas: number | null, approval = false) {
  if (access.role === "admin" || amountHalalas == null || !scopes.length) return;
  if (scopes.some((scope) => scope.functionalRole === "system_owner" || scope.functionalRole === "system_admin")) return;
  const limits = scopes.map((scope) => approval ? scope.approvalLimitHalalas : scope.financialLimitHalalas).filter((value): value is number => value != null);
  if (!limits.length || amountHalalas > Math.max(...limits)) throw new Error(approval ? "تتجاوز القيمة حد الاعتماد المالي للمستخدم" : "تتجاوز القيمة الحد المالي للمستخدم");
}

export function canApproveOwn(scopes: PortalScope[]) {
  return scopes.some((scope) => scope.canApproveOwn);
}
