import { and, desc, eq, gt, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { portalAccessScopes, portalRoles, portalUserPermissions, portalUserPresence, portalUsers, videoInterviews } from "@/db/schema";
import { parseRolePermissions } from "@/lib/portal-permissions";

export const liveInterviewStatuses = ["requested", "ringing", "transferred", "active"] as const;

export function interviewRoomUrl(roomName: string) {
  return `https://meet.jit.si/${encodeURIComponent(roomName)}#config.prejoinPageEnabled=false&config.disableDeepLinking=true`;
}

export function interviewReference() {
  return `VID-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0, 5).toUpperCase()}`;
}

export function interviewRoomName() {
  return `dally-${crypto.randomUUID().replaceAll("-", "")}`;
}

export async function listAvailableInterviewStaff(excludeEmail?: string) {
  const cutoff = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  const db = getDb();
  const rows = await db.select({
    email: portalUsers.email,
    displayName: portalUsers.displayName,
    role: portalUsers.role,
    availability: portalUserPresence.availability,
    lastSeenAt: portalUserPresence.lastSeenAt,
  }).from(portalUserPresence)
    .innerJoin(portalUsers, eq(portalUsers.email, portalUserPresence.userEmail))
    .where(and(eq(portalUsers.status, "active"), eq(portalUserPresence.availability, "online"), gt(portalUserPresence.lastSeenAt, cutoff)))
    .orderBy(portalUserPresence.lastSeenAt);
  const emails = rows.map((row) => row.email);
  if (!emails.length) return [];
  const [scopeRows, roleRows, explicitRows] = await Promise.all([
    db.select({ email: portalAccessScopes.userEmail, role: portalAccessScopes.functionalRole }).from(portalAccessScopes).where(and(inArray(portalAccessScopes.userEmail, emails), eq(portalAccessScopes.active, true))),
    db.select().from(portalRoles).where(eq(portalRoles.active, true)),
    db.select().from(portalUserPermissions).where(and(inArray(portalUserPermissions.userEmail, emails), eq(portalUserPermissions.resource, "video"), eq(portalUserPermissions.action, "manage"))),
  ]);
  const permissionsByRole = new Map(roleRows.map((role) => [role.roleKey, new Set(parseRolePermissions(role.permissionsJson))]));
  const rolesByEmail = new Map<string,string[]>();
  for (const scope of scopeRows) rolesByEmail.set(scope.email, [...(rolesByEmail.get(scope.email) || []), scope.role]);
  const explicitByEmail = new Map<string,boolean>();
  for (const rule of explicitRows) explicitByEmail.set(rule.userEmail, (explicitByEmail.get(rule.userEmail) ?? true) && rule.allowed);
  const eligible = rows.filter((row) => {
    if (row.email === excludeEmail) return false;
    if (row.role === "admin") return true;
    const explicit = explicitByEmail.get(row.email);
    if (explicit !== undefined) return explicit;
    const roles = rolesByEmail.get(row.email) || [];
    return roles.some((role) => role === "system_owner" || role === "system_admin" || permissionsByRole.get(role)?.has("*") || permissionsByRole.get(role)?.has("video.manage"));
  });
  const ownerRows = scopeRows.filter((row) => row.role === "system_owner");
  const owners = new Set(ownerRows.map((row) => row.email));
  return eligible.map((row) => ({ ...row, owner: owners.has(row.email) })).sort((a, b) => Number(b.owner) - Number(a.owner));
}

export async function touchInterviewPresence(userEmail: string, availability: "online" | "busy" | "away" | "offline" = "online", currentInterviewId: string | null = null) {
  const now = new Date().toISOString();
  await getDb().insert(portalUserPresence).values({ userEmail, availability, currentInterviewId, lastSeenAt: now, updatedAt: now }).onConflictDoUpdate({
    target: portalUserPresence.userEmail,
    set: { availability, currentInterviewId, lastSeenAt: now, updatedAt: now },
  });
  return now;
}

export async function expireOldVideoInterviews() {
  const now = new Date().toISOString();
  const db = getDb();
  const open = await db.select().from(videoInterviews).where(inArray(videoInterviews.status, [...liveInterviewStatuses])).orderBy(desc(videoInterviews.requestedAt)).limit(300);
  const expired = open.filter((item) => item.expiresAt <= now);
  for (const item of expired) await db.update(videoInterviews).set({ status: "expired", endedAt: now, updatedAt: now }).where(eq(videoInterviews.id, item.id));
  return expired.length;
}
