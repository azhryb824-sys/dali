import { and, eq, gte, isNull, lte, or } from "drizzle-orm";
import type { ChatGPTUser } from "@/app/chatgpt-auth";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getDb, getSqlClient } from "@/db";
import { portalAccessScopes, portalRoles, portalUserPermissions, portalUsers } from "@/db/schema";
import { emitPortalNotification } from "@/lib/portal-notifications";
import { getPortalAdminConfig, normalizePortalEmail } from "@/lib/portal-auth-config";
import { verifyPortalSession } from "@/lib/portal-session";

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
  functionalPermissions: string[];
  preferredLanguage: "ar" | "en" | "bn" | null;
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
  hr_officer: { read: ["employees"], write: ["employees"] },
  government_relations_officer: { read: [], write: [] },
  regional_manager: { read: ["construction", "workforce"], write: ["construction", "workforce"] },
  client_consultant: { read: ["construction"], write: [] },
  subcontractor: { read: ["construction"], write: [] },
  accountant: { read: ["finance"], write: ["finance"] },
  legal_affairs: { read: ["legal"], write: ["legal"] },
  sales_representative: { read: ["workforce"], write: ["workforce"] },
  purchasing_representative: { read: ["finance", "construction"], write: ["finance"] },
  administrative_assistant: { read: [], write: [] },
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

function fallbackPermissions(roles: string[]) {
  const permissions = new Set<string>();
  for (const role of roles) {
    if (role === "system_owner" || role === "system_admin") permissions.add("*");
    const access = functionalDepartmentAccess[role];
    access?.read.forEach((department) => permissions.add(`${department}.read`));
    access?.write.forEach((department) => permissions.add(`${department}.write`));
    for (const [resource, approvers] of Object.entries(functionalApprovals)) if (approvers.includes(role)) permissions.add(`${resource}.approve`);
    if (role === "finance_director") permissions.add("finance.post");
    if (role === "government_relations_officer") { permissions.add("government.read"); permissions.add("government.write"); }
    if (role === "administrative_assistant") { ["operations.read","operations.write","contracts.read","contracts.write","documents.read","documents.write","documents.share"].forEach((permission) => permissions.add(permission)); }
  }
  return [...permissions];
}

async function activeFunctionalPermissions(roles: string[]) {
  if (!roles.length) return [];
  let definitions: Array<typeof portalRoles.$inferSelect> = [];
  try {
    definitions = await getDb().select().from(portalRoles);
  } catch (error) {
    // Render starts the HTTP process before additive migrations finish. Keep
    // existing users able to sign in during that short deployment window.
    console.warn("portal-role-catalog-unavailable", error instanceof Error ? error.message : String(error));
    return fallbackPermissions(roles);
  }
  if (!definitions.length) return fallbackPermissions(roles);
  const permissions = new Set<string>();
  const definitionByKey = new Map(definitions.filter((item) => item.active).map((item) => [item.roleKey, item]));
  for (const role of roles) {
    // مالك النظام ومشرف النظام صلاحيتان جذريتان لا يجوز أن تنقصهما
    // إعدادات دور قديمة أو تعريف ديناميكي ناقص.
    if (role === "system_owner" || role === "system_admin") permissions.add("*");
    const definition = definitionByKey.get(role);
    if (!definition) continue;
    try {
      const parsed = JSON.parse(definition.permissionsJson) as unknown;
      if (Array.isArray(parsed)) parsed.filter((item): item is string => typeof item === "string").forEach((item) => permissions.add(item));
    } catch { /* An invalid role definition grants nothing. */ }
  }
  return [...permissions];
}

async function applyExplicitUserPermissions(email: string, permissions: string[]) {
  const effective = new Set(permissions);
  const rules = await getDb().select().from(portalUserPermissions).where(eq(portalUserPermissions.userEmail, normalizePortalEmail(email)));
  for (const rule of rules) {
    const permission = `${rule.resource}.${rule.action}`;
    if (rule.allowed) effective.add(permission);
    else effective.delete(permission);
  }
  return [...effective];
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

// Keep access resolution compatible with a database that is still applying
// additive migrations. Drizzle relational queries select every schema column,
// so adding an optional profile field in code could otherwise take login down
// until the corresponding migration finishes.
const portalAccessUserSelection = {
  email: portalUsers.email,
  displayName: portalUsers.displayName,
  role: portalUsers.role,
  department: portalUsers.department,
  status: portalUsers.status,
  requestedDepartment: portalUsers.requestedDepartment,
  requestedJobTitle: portalUsers.requestedJobTitle,
  requestReason: portalUsers.requestReason,
  requestSubmittedAt: portalUsers.requestSubmittedAt,
  termsAcceptedAt: portalUsers.termsAcceptedAt,
  approvedBy: portalUsers.approvedBy,
  approvedAt: portalUsers.approvedAt,
  suspendedAt: portalUsers.suspendedAt,
  createdAt: portalUsers.createdAt,
  updatedAt: portalUsers.updatedAt,
  lastLoginAt: portalUsers.lastLoginAt,
  lastActivityAt: portalUsers.lastActivityAt,
};

async function readPreferredLanguage(email: string): Promise<PortalAccess["preferredLanguage"]> {
  try {
    const rows = await getSqlClient().unsafe<Array<{ preferred_language: string | null }>>(
      "select preferred_language from portal_users where email = $1 limit 1",
      [email],
    );
    const locale = rows[0]?.preferred_language;
    return locale === "ur" ? "bn" : locale === "ar" || locale === "en" || locale === "bn" ? locale : null;
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
    if (code !== "42703") console.warn("portal-language-unavailable", error instanceof Error ? error.message : String(error));
    return null;
  }
}

async function upsertLegacyCompatibleAdminUser(email: string, displayName: string, now: string, markLogin: boolean) {
  await getSqlClient().unsafe(
    `insert into portal_users
      (email, display_name, role, department, status, updated_at, last_login_at, last_activity_at)
     values ($1, $2, 'admin', 'general', 'active', $3, $4, $3)
     on conflict (email) do update set
       display_name = excluded.display_name,
       role = 'admin',
       department = 'general',
       status = 'active',
       updated_at = excluded.updated_at,
       last_login_at = coalesce(excluded.last_login_at, portal_users.last_login_at),
       last_activity_at = excluded.last_activity_at`,
    [email, displayName, now, markLogin ? now : null],
  );
}

async function insertLegacyCompatiblePendingUser(email: string, displayName: string, now: string) {
  await getSqlClient().unsafe(
    `insert into portal_users
      (email, display_name, role, department, status, updated_at, last_login_at, last_activity_at)
     values ($1, $2, 'employee', 'general', 'pending', $3, $3, $3)
     on conflict (email) do nothing`,
    [email, displayName, now],
  );
}

export async function resolvePortalAccess(user: ChatGPTUser, options: { markLogin?: boolean } = {}): Promise<PortalAccess> {
  const db = getDb();
  const email = normalizePortalEmail(user.email);
  const now = new Date().toISOString();
  const [existing] = await db
    .select(portalAccessUserSelection)
    .from(portalUsers)
    .where(eq(portalUsers.email, email))
    .limit(1);
  const activityDue = !existing?.lastActivityAt || Date.now() - new Date(existing.lastActivityAt).getTime() >= 15 * 60 * 1000;

  if (getPortalAdminConfig().emails.has(email)) {
    await upsertLegacyCompatibleAdminUser(email, user.displayName, now, Boolean(options.markLogin));
    const preferredLanguage = await readPreferredLanguage(email);
    return { authorized: true, role: "admin", department: "general", status: "active", user: { ...user, email }, functionalRoles: ["system_owner"], functionalPermissions: ["*"], preferredLanguage };
  }

  if (!existing) {
    await insertLegacyCompatiblePendingUser(email, user.displayName, now);
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
    return { authorized: false, role: "employee", department: "general", status: "pending", user: { ...user, email }, functionalRoles: [], functionalPermissions: [], preferredLanguage: null };
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
  const rolePermissions = status === "active" ? await activeFunctionalPermissions(functionalRoles) : [];
  const functionalPermissions = status === "active" ? await applyExplicitUserPermissions(email, rolePermissions) : [];
  const preferredLanguage = await readPreferredLanguage(email);
  return { authorized: status === "active", role, department, status, user: { ...user, email }, functionalRoles, functionalPermissions, preferredLanguage };
}

export async function requirePortalApiRole(allowed: PortalRole[]) {
  const user = await getChatGPTUser();
  if (!user) return null;
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
  const session = await verifyPortalSession(user.email);
  if (session.status !== "valid") return null;
  return resolvePortalAccess(user);
}

export function canAccessPortalDepartment(
  access: Pick<PortalAccess, "role" | "department" | "functionalRoles" | "functionalPermissions">,
  department: Exclude<PortalDepartment, "general">,
  write = false,
) {
  if (access.role === "admin") return true;
  if (access.functionalPermissions.includes("*") || access.functionalPermissions.includes(`${department}.${write ? "write" : "read"}`)) return true;
  return !write && access.department === department;
}

export function canAccessPortalDocuments(access: Pick<PortalAccess, "role" | "department" | "functionalRoles" | "functionalPermissions">) {
  return access.role === "admin" || access.department === "legal" || access.department === "finance" || access.functionalPermissions.includes("*") || access.functionalPermissions.includes("documents.read") || access.functionalPermissions.includes("legal.read") || access.functionalPermissions.includes("finance.read");
}

export function canManagePortalDocuments(access: Pick<PortalAccess, "role" | "functionalRoles" | "functionalPermissions">) {
  return access.role === "admin" || access.functionalPermissions.includes("*") || access.functionalPermissions.includes("documents.write") || access.functionalPermissions.includes("finance.write");
}

export function canManageCompanyAssets(access: Pick<PortalAccess, "role" | "functionalRoles" | "functionalPermissions">) {
  return access.role === "admin" || access.functionalPermissions.includes("*") || access.functionalPermissions.includes("assets.administer");
}

export function canAdministerPortalUsers(access: Pick<PortalAccess, "role" | "functionalRoles" | "functionalPermissions">) {
  return access.role === "admin" || access.functionalRoles.includes("system_owner") || access.functionalRoles.includes("system_admin") || access.functionalPermissions.includes("*") || access.functionalPermissions.includes("users.administer");
}

export function canManagePortalConversations(access: Pick<PortalAccess, "role" | "department" | "functionalRoles" | "functionalPermissions">) {
  return access.role === "admin" || access.department === "workforce" || access.functionalPermissions.includes("*") || access.functionalPermissions.includes("workforce.write") || access.functionalPermissions.includes("conversations.write");
}

export async function hasPortalPermission(
  access: Pick<PortalAccess, "role" | "department" | "user" | "functionalRoles" | "functionalPermissions">,
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
  if (access.functionalPermissions.includes("*") || access.functionalPermissions.includes(`${resource}.${action}`)) return true;
  if (["read", "write"].includes(action) && ["employees", "finance", "legal", "workforce", "construction"].includes(resource)) {
    return canAccessPortalDepartment(access, resource as Exclude<PortalDepartment, "general">, action === "write");
  }
  return action === "read" && (access.department === resource || resource === "overview");
}
