import { and, eq } from "drizzle-orm";
import type { ChatGPTUser } from "@/app/chatgpt-auth";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getDb } from "@/db";
import { portalUserPermissions, portalUsers } from "@/db/schema";
import { getRuntimeEnv } from "@/lib/runtime-env";
import { emitPortalNotification } from "@/lib/portal-notifications";
import { verifyPortalSession } from "@/lib/portal-session";

export type PortalRole = "admin" | "manager" | "employee";
export type PortalStatus = "active" | "pending" | "suspended";
export type PortalDepartment = "employees" | "finance" | "legal" | "workforce" | "general";

export type PortalAccess = {
  authorized: boolean;
  role: PortalRole;
  department: PortalDepartment;
  status: PortalStatus;
  user: ChatGPTUser;
};

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function configuredAdminEmails() {
  const runtime = getRuntimeEnv();
  return new Set(
    (runtime.PORTAL_ADMIN_EMAILS ?? "")
      .split(",")
      .map(normalizeEmail)
      .filter(Boolean),
  );
}

function isPortalRole(value: string): value is PortalRole {
  return value === "admin" || value === "manager" || value === "employee";
}

function isPortalStatus(value: string): value is PortalStatus {
  return value === "active" || value === "pending" || value === "suspended";
}

function isPortalDepartment(value: string): value is PortalDepartment {
  return value === "employees" || value === "finance" || value === "legal" || value === "workforce" || value === "general";
}

export async function resolvePortalAccess(user: ChatGPTUser, options: { markLogin?: boolean } = {}): Promise<PortalAccess> {
  const db = getDb();
  const email = normalizeEmail(user.email);
  const now = new Date().toISOString();
  const existing = await db.query.portalUsers.findFirst({ where: eq(portalUsers.email, email) });
  const activityDue = !existing?.lastActivityAt || Date.now() - new Date(existing.lastActivityAt).getTime() >= 15 * 60 * 1000;

  if (configuredAdminEmails().has(email)) {
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

    return { authorized: true, role: "admin", department: "general", status: "active", user: { ...user, email } };
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
    return { authorized: false, role: "employee", department: "general", status: "pending", user: { ...user, email } };
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
  return { authorized: status === "active", role, department, status, user: { ...user, email } };
}

export async function requirePortalApiRole(allowed: PortalRole[]) {
  const user = await getChatGPTUser();
  if (!user) return null;
  const session = await verifyPortalSession(user.email);
  if (session.status !== "valid") return null;
  const access = await resolvePortalAccess(user);
  if (!access.authorized || !allowed.includes(access.role)) return null;
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
  access: Pick<PortalAccess, "role" | "department">,
  department: Exclude<PortalDepartment, "general">,
  write = false,
) {
  if (access.role === "admin" || access.role === "manager") return true;
  return !write && access.department === department;
}

export function canAccessPortalDocuments(access: Pick<PortalAccess, "role" | "department">) {
  return access.role === "admin" || access.role === "manager" || access.department === "legal" || access.department === "finance";
}

export function canManagePortalDocuments(access: Pick<PortalAccess, "role">) {
  return access.role === "admin" || access.role === "manager";
}

export function canManageCompanyAssets(access: Pick<PortalAccess, "role">) {
  return access.role === "admin";
}

export function canManagePortalConversations(access: Pick<PortalAccess, "role" | "department">) {
  return access.role === "admin" || access.role === "manager" || access.department === "workforce";
}

export async function hasPortalPermission(
  access: Pick<PortalAccess, "role" | "department" | "user">,
  resource: string,
  action: string,
) {
  if (access.role === "admin") return true;
  const explicit = await getDb().query.portalUserPermissions.findFirst({
    where: and(
      eq(portalUserPermissions.userEmail, normalizeEmail(access.user.email)),
      eq(portalUserPermissions.resource, resource),
      eq(portalUserPermissions.action, action),
    ),
  });
  if (explicit) return explicit.allowed;
  if (access.role === "manager") return action !== "administer";
  return action === "read" && (access.department === resource || resource === "overview");
}
