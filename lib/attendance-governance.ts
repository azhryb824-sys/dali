import { and, eq, inArray, lte } from "drizzle-orm";
import { getDb } from "@/db";
import { employeeAttendance, portalAccessScopes, portalAttendancePolicies, portalAttendanceSessions, portalSessions } from "@/db/schema";

const RIYADH_TIME_ZONE = "Asia/Riyadh";

function riyadhParts(value: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: RIYADH_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(value);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")), minute: Number(get("minute")) };
}

function durationMinutes(loginAt: string, endAt: string) {
  return Math.max(0, Math.floor((new Date(endAt).getTime() - new Date(loginAt).getTime()) / 60_000));
}

async function trackedPolicy(userEmail: string) {
  const db = getDb();
  const policy = await db.query.portalAttendancePolicies.findFirst({ where: and(eq(portalAttendancePolicies.userEmail, userEmail), eq(portalAttendancePolicies.trackingEnabled, true)) });
  if (!policy) return null;
  const systemAdmin = await db.query.portalAccessScopes.findFirst({ where: and(eq(portalAccessScopes.userEmail, userEmail), eq(portalAccessScopes.functionalRole, "system_admin"), eq(portalAccessScopes.active, true)) });
  return systemAdmin ? null : policy;
}

export async function startAttendanceSession(sessionId: string, userEmail: string, loginAt: string) {
  const policy = await trackedPolicy(userEmail);
  if (!policy) return;
  const now = new Date().toISOString();
  await getDb().insert(portalAttendanceSessions).values({
    sessionId, userEmail, employeeId: policy.employeeId, workDate: riyadhParts(new Date(loginAt)).date,
    loginAt, lastActivityAt: loginAt, durationMinutes: 0, status: "active", createdAt: now, updatedAt: now,
  }).onConflictDoNothing();
}

export async function touchAttendanceSession(sessionId: string, touchedAt: string) {
  const db = getDb();
  const row = await db.query.portalAttendanceSessions.findFirst({ where: and(eq(portalAttendanceSessions.sessionId, sessionId), eq(portalAttendanceSessions.status, "active")) });
  if (!row) return;
  await db.update(portalAttendanceSessions).set({ lastActivityAt: touchedAt, durationMinutes: durationMinutes(row.loginAt, touchedAt), updatedAt: touchedAt }).where(eq(portalAttendanceSessions.sessionId, sessionId));
}

async function syncEmployeeAttendance(employeeId: number | null, workDate: string, createdBy: string) {
  if (!employeeId) return;
  const db = getDb();
  const sessions = await db.select().from(portalAttendanceSessions).where(and(eq(portalAttendanceSessions.employeeId, employeeId), eq(portalAttendanceSessions.workDate, workDate)));
  if (!sessions.length) return;
  const policy = await db.query.portalAttendancePolicies.findFirst({ where: eq(portalAttendancePolicies.employeeId, employeeId) });
  if (!policy) return;
  const sorted = [...sessions].sort((a,b)=>a.loginAt.localeCompare(b.loginAt));
  const checkInAt = sorted[0].loginAt;
  const checkOutAt = sorted.map((row)=>row.logoutAt||row.lastActivityAt).sort().at(-1) || null;
  const worked = sessions.reduce((sum,row)=>sum+row.durationMinutes,0);
  const shiftStartUtc = new Date(`${workDate}T${policy.shiftStart}:00+03:00`);
  const lateMinutes = Math.max(0, durationMinutes(shiftStartUtc.toISOString(), checkInAt) - policy.graceMinutes);
  const overtimeMinutes = Math.max(0, worked - policy.requiredMinutes);
  const now = new Date().toISOString();
  await db.insert(employeeAttendance).values({ employeeId, attendanceDate: workDate, checkInAt, checkOutAt, status: "present", lateMinutes, overtimeMinutes, notes: `محسوب من جلسات النظام: ${worked} دقيقة`, createdBy, createdAt: now, updatedAt: now }).onConflictDoUpdate({
    target: [employeeAttendance.employeeId, employeeAttendance.attendanceDate],
    set: { checkInAt, checkOutAt, status: "present", lateMinutes, overtimeMinutes, notes: `محسوب من جلسات النظام: ${worked} دقيقة`, updatedAt: now },
  });
}

export async function closeAttendanceSession(sessionId: string, logoutAt: string, reason: string, automatic = false) {
  const db = getDb();
  const row = await db.query.portalAttendanceSessions.findFirst({ where: eq(portalAttendanceSessions.sessionId, sessionId) });
  if (!row || row.status !== "active") return;
  const effectiveEnd = logoutAt < row.lastActivityAt ? row.lastActivityAt : logoutAt;
  await db.update(portalAttendanceSessions).set({
    lastActivityAt: effectiveEnd, logoutAt: effectiveEnd, durationMinutes: durationMinutes(row.loginAt, effectiveEnd),
    status: automatic ? "auto_closed" : "closed", closeReason: reason.slice(0,120), updatedAt: new Date().toISOString(),
  }).where(eq(portalAttendanceSessions.sessionId, sessionId));
  await syncEmployeeAttendance(row.employeeId, row.workDate, row.userEmail);
}

export async function enforceNightlyAttendanceCutoff(now = new Date()) {
  const local = riyadhParts(now);
  if (local.hour < 20) return 0;
  const idleCutoff = new Date(now.getTime() - 10 * 60_000).toISOString();
  const db = getDb();
  const stale = await db.select().from(portalAttendanceSessions).where(and(eq(portalAttendanceSessions.status, "active"), lte(portalAttendanceSessions.lastActivityAt, idleCutoff))).limit(300);
  if (!stale.length) return 0;
  const closedAt = now.toISOString();
  const ids = stale.map((row)=>row.sessionId);
  await db.update(portalSessions).set({ status: "expired", revokedAt: closedAt, revocationReason: "attendance-20h-idle-cutoff" }).where(and(inArray(portalSessions.id, ids), eq(portalSessions.status, "active")));
  for (const row of stale) {
    const creditedUntil = new Date(Math.min(now.getTime(), new Date(row.lastActivityAt).getTime() + 10 * 60_000)).toISOString();
    await closeAttendanceSession(row.sessionId, creditedUntil, "attendance-20h-idle-cutoff", true);
  }
  return stale.length;
}
