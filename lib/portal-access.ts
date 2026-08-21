import { and, eq, gte, isNull, lte, or } from "drizzle-orm";
import type { ChatGPTUser } from "@/app/chatgpt-auth";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getDb } from "@/db";
import { portalAccessScopes, portalUserPermissions, portalUsers } from "@/db/schema";
import { emitPortalNotification } from "@/lib/portal-notifications";
import { getConfiguredAuthMode, getPortalAdminConfig, normalizePortalEmail } from "@/lib/portal-auth-config";
import { verifyPortalSession } from "@/lib/portal-session";
import { userRequiresMfa } from "@/lib/portal-mfa";

export type PortalRole = "admin" | "manager" | "employee";
export type PortalStatus = "active" | "pending" | "suspended";
export type PortalDepartment = "employees" | "finance" | "legal" | "workforce" | "construction" | "general";

export type PortalAccess = {
  authorized: boolean;
  role: PortalRole;
  department: PortalDepartment;
  status: PortalStatus;
  user: ChatGPTUser;
  functionalRoles: string[];
};

const allDepartments: Exclude<PortalDepartment, "general">[] = ["employees", "finance", "legal", "workforce", "construction"];
const functionalDepartmentAccess: Record<string, { read: Exclude<PortalDepartment, "general">[]; write: Exclude<PortalDepartment, "general">[] }> = {
  system_owner: { read: allDepartments, write: allDepartments },
  system_admin: { read: allDepartments, write: allDepartments },
  executive: { read: allDepartments, write: [] },
  construction_director: { read: ["construction", "finance", "legal", "workforce"], write: ["construction"] },
  workforce_operations_manager: { read: ["workforce", "employees", "finance"], write: ["workforce"] },
  finance_director: { read: ["finance", "legal", "construction", "workforce"], write: ["finance"] },
  project_manager: { read: ["construction", "workforce", "finance"], write: ["construction"] },
  site_engineer: { read: ["construction"], write: ["construction"] },
  planning_engineer: { read: ["construction"], write: ["construction"] },
  cost_engineer: { read: ["construction", "finance"], write: ["construction"] },
  contracts_manager: { read: ["construction", "legal", "finance"], write: ["construction", "legal"] },
  procurement_officer: { read: ["construction", "finance"], write: ["construction", "finance"] },
  project_accountant: { read: ["construction", "finance"], write: ["finance"] },
  document_controller: { read: ["construction", "legal"], write: ["construction", "legal"] },
  quality_officer: { read: ["construction"], write: ["construction"] },
  safety_officer: { read: ["construction"], write: ["construction"] },
  hr_officer: { read: ["employees", "workforce"], write: ["employees"] },
  regional_manager: { read: ["construction", "workforce"], write: ["construction", "workforce"] },
  client_consultant: { read: ["construction"], write: [] },
  subcontractor: { read: ["construction"], write: [] },
};
const functionalApprovals: Record<string, string[]> = {
  finance: ["finance_director"], employees: ["hr_officer"], legal: ["contracts_manager"], workforce: ["workforce_operations_manager", "regional_manager"], construction: ["construction_director", "project_manager"],
};

async function activeFunctionalRoles(email: string) {
  const today = new Date().toISOString().slice(0, 10);
  const rows = await getDb().select({ role: portalAccessScopes.functionalRole }).from(portalAccessScopes).where(and(
    eq(portalAccessScopes.userEmail, email), eq(portalAccessScopes.active, true),
    or(isNull(portalAccessScopes.validFrom), lte(portalAccessScopes.validFrom, today)),
    or(isNull(portalAccessScopes.validUntil), gte(portalAccessScopes.validUntil, today)),
  ));
  return [...new Set(rows.map((row) => row.role))];
}

function isPortalRole(value: string): value is PortalRole {
  return value === "admin" || value === "manager" || value === "employee";
}

function isPortalStatus(value: string): value is PortalStatus {
  return value === "active" || value === "pending" || value === "suspended";
}

function isPortalDepartment(value: string): value is PortalDepartment {
  return value === "employees" || value === "finance" || value === "legal" || value === "workforce" || value === "construction" || value === "general";
}

export async function resolvePortalAccess(user: ChatGPTUser, options: { markLogin?: boolean } = {}): Promise<PortalAccess> {
  const db = getDb();
  const email = normalizePortalEmail(user.email);
  const now = new Date().toISOString();
  const existing = await db.query.portalUsers.findFirst({ where: eq(portalUsers.email, email) });
  const activityDue = !existing?.lastActivityAt || Date.now() - new Date(existing.lastActivityAt).getTime() >= 15 * 60 * 1000;

  if (getPortalAdminConfig().emails.has(email)) {
    await db
      .insert(portalUsers)
      .values({
        email,
        displayName: user.displayName,
        role: "admin",
        department: "general",
        status: "active",
        lastLoginAt: options.markLogin ? now : null,
        lastActivityAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: portalUsers.email,
        set: {
          displayName: user.displayName,
          role: "admin",
          department: "general",
          status: "active",
          ...(options.markLogin ? { lastLoginAt: now } : {}),
          ...(activityDue ? { lastActivityAt: now } : {}),
        },
      });

    return { authorized: true, role: "admin", department: "general", status: "active", user: { ...user, email }, functionalRoles: ["system_owner"] };
  }

  if (!existing) {
    await db.insert(portalUsers).values({
      email,
      displayName: user.displayName,
      role: "employee",
      department: "general",
      status: "pending",
      lastLoginAt: now,
      lastActivityAt: now,
      updatedAt: now,
    });
    await emitPortalNotification({
      eventType: "portal-user-pending",
      title: "حساب جديد ينتظر الاعتماد",
      message: `${user.displayName} (${email}) طلب الدخول إلى النظام الإداري.`,
      severity: "warning",
      module: "users",
      entityType: "portal-user",
      entityId: email,
      actionView: "users",
      targetRole: "admin",
      dedupeKey: `portal-user-pending:${email}`,
    }).catch(() => undefined);
    return { authorized: false, role: "employee", department: "general", status: "pending", user: { ...user, email }, functionalRoles: [] };
  }

  if (options.markLogin || activityDue || existing.displayName !== user.displayName) {
    await db
      .update(portalUsers)
      .set({
        displayName: user.displayName,
        ...(options.markLogin ? { lastLoginAt: now } : {}),
        ...(activityDue ? { lastActivityAt: now } : {}),
      })
      .where(eq(portalUsers.email, email));
  }

  const role = isPortalRole(existing.role) ? existing.role : "employee";
  const department = isPortalDepartment(existing.department) ? existing.department : "general";
  const status = isPortalStatus(existing.status) ? existing.status : "pending";
  const functionalRoles = status === "active" ? await activeFunctionalRoles(email) : [];
  return { authorized: status === "active", role, department, status, user: { ...user, email }, functionalRoles };
}

export async function requirePortalApiRole(allowed: PortalRole[]) {
  const user = await getChatGPTUser();
  if (!user) return null;
  if (getConfiguredAuthMode() === "credentials" && user.authStrength !== "mfa" && await userRequiresMfa(user.email)) return null;
  const session = await verifyPortalSession(user.email);
  if (session.status !== "valid") return null;
  const access = await resolvePortalAccess(user);
  const functionalAdmin = access.functionalRoles.includes("system_owner") || access.functionalRoles.includes("system_admin");
  if (!access.authorized || (!allowed.includes(access.role) && !(functionalAdmin && allowed.includes("admin")))) return null;
  return access;
}

export async function requirePortalSessionIdentity() {
  const user = await getChatGPTUser();
  if (!user) return null;
  if (getConfiguredAuthMode() === "credentials" && user.authStrength !== "mfa" && await userRequiresMfa(user.email)) return null;
  const session = await verifyPortalSession(user.email);
  if (session.status !== "valid") return null;
  return resolvePortalAccess(user);
}

export function canAccessPortalDepartment(
  access: Pick<PortalAccess, "role" | "department" | "functionalRoles">,
  department: Exclude<PortalDepartment, "general">,
  write = false,
) {
  if (access.role === "admin" || access.role === "manager") return true;
  if (access.functionalRoles.some((role) => functionalDepartmentAccess[role]?.[write ? "write" : "read"].includes(department))) return true;
  return !write && access.department === department;
}

export function canAccessPortalDocuments(access: Pick<PortalAccess, "role" | "department" | "functionalRoles">) {
  return access.role === "admin" || access.role === "manager" || access.department === "legal" || access.department === "finance" || access.functionalRoles.some((role) => functionalDepartmentAccess[role]?.read.some((department) => department === "legal" || department === "finance"));
}

export function canManagePortalDocuments(access: Pick<PortalAccess, "role" | "functionalRoles">) {
  return access.role === "admin" || access.role === "manager" || access.functionalRoles.some((role) => ["system_owner", "system_admin", "finance_director", "contracts_manager", "document_controller"].includes(role));
}

export function canManageCompanyAssets(access: Pick<PortalAccess, "role" | "functionalRoles">) {
  return access.role === "admin" || access.functionalRoles.some((role) => role === "system_owner" || role === "system_admin");
}

export function canManagePortalConversations(access: Pick<PortalAccess, "role" | "department" | "functionalRoles">) {
  return access.role === "admin" || access.role === "manager" || access.department === "workforce" || access.functionalRoles.some((role) => functionalDepartmentAccess[role]?.write.includes("workforce"));
}

export async function hasPortalPermission(
  access: Pick<PortalAccess, "role" | "department" | "user" | "functionalRoles">,
  resource: string,
  action: string,
) {
  if (access.role === "admin") return true;
  const explicit = await getDb().query.portalUserPermissions.findFirst({
    where: and(
      eq(portalUserPermissions.userEmail, normalizePortalEmail(access.user.email)),
      eq(portalUserPermissions.resource, resource),
      eq(portalUserPermissions.action, action),
    ),
  });
  if (explicit) return explicit.allowed;
  if (access.functionalRoles.includes("system_owner") || access.functionalRoles.includes("system_admin")) return true;
  if (action === "approve" && functionalApprovals[resource]?.some((role) => access.functionalRoles.includes(role))) return true;
  if (resource === "finance" && action === "post" && access.functionalRoles.includes("finance_director")) return true;
  if (["read", "write"].includes(action) && ["employees", "finance", "legal", "workforce", "construction"].includes(resource)) {
    return canAccessPortalDepartment(access, resource as Exclude<PortalDepartment, "general">, action === "write");
  }
  if (access.role === "manager") return action !== "administer";
  return action === "read" && (access.department === resource || resource === "overview");
}
