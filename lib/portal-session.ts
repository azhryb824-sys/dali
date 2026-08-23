import { and, asc, eq, inArray } from "drizzle-orm";
import { headers } from "next/headers";
import type { ChatGPTUser } from "@/app/chatgpt-auth";
import { getDb } from "@/db";
import { portalSessions } from "@/db/schema";
import { auditPortalAction } from "@/lib/audit";
import { closeAttendanceSession, enforceNightlyAttendanceCutoff, startAttendanceSession, touchAttendanceSession } from "@/lib/attendance-governance";
import { emitPortalNotification } from "@/lib/portal-notifications";
import { isSecureExternalRequest } from "@/lib/request-origin";
import { requestSourceHash, sha256 } from "@/lib/security";

export const PORTAL_SESSION_COOKIE = "__Host-dali_ps";
const PORTAL_DEV_SESSION_COOKIE = "dali_ps_dev";
const PORTAL_LEGACY_SESSION_COOKIE = "dali_ps";
export const PORTAL_IDLE_TIMEOUT_MINUTES = 30;
export const PORTAL_ABSOLUTE_TIMEOUT_HOURS = 8;

export type PortalSessionCheck =
  | { status: "missing" | "invalid" | "expired" }
  | { status: "valid"; sessionId: string; absoluteExpiresAt: string };

function cookieFromHeader(cookieHeader: string | null) {
  const parts = (cookieHeader || "").split(";").map((part) => part.trim());
  const match = [PORTAL_SESSION_COOKIE, PORTAL_DEV_SESSION_COOKIE, PORTAL_LEGACY_SESSION_COOKIE]
    .map((name) => parts.find((part) => part.startsWith(`${name}=`)))
    .find(Boolean);
  if (!match) return "";
  try {
    const value = decodeURIComponent(match.slice(match.indexOf("=") + 1));
    return /^[a-f0-9]{64}$/.test(value) ? value : "";
  } catch {
    return "";
  }
}

export function portalSessionCookie(request: Request, token: string) {
  const secure = isSecureExternalRequest(request);
  const name = secure ? PORTAL_SESSION_COOKIE : PORTAL_DEV_SESSION_COOKIE;
  return `${name}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${PORTAL_ABSOLUTE_TIMEOUT_HOURS * 3600}${secure ? "; Secure" : ""}; Priority=High`;
}

export function clearPortalSessionCookies(request: Request) {
  const secure = isSecureExternalRequest(request);
  return [PORTAL_SESSION_COOKIE, PORTAL_DEV_SESSION_COOKIE, PORTAL_LEGACY_SESSION_COOKIE]
    .map((name) => `${name}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure && name === PORTAL_SESSION_COOKIE ? "; Secure" : ""}; Priority=High`);
}

function safePortalReturnPath(value: string | null) {
  if (!value || !value.startsWith("/portal") || value.startsWith("//")) return "/portal";
  try {
    const parsed = new URL(value, "https://portal.local");
    if (parsed.origin !== "https://portal.local" || !parsed.pathname.startsWith("/portal")) return "/portal";
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "/portal";
  }
}

export function portalSessionStartPath(returnTo = "/portal") {
  return `/api/portal/session/start?returnTo=${encodeURIComponent(safePortalReturnPath(returnTo))}`;
}

export function portalSessionEndPath(returnTo = "/portal", reason = "logout") {
  const params = new URLSearchParams({ returnTo: safePortalReturnPath(returnTo), reason: reason.slice(0, 40) });
  return `/api/portal/session/end?${params.toString()}`;
}

function randomToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function requestUserAgentHash(request: Request) {
  return sha256(request.headers.get("user-agent") || "unknown");
}

export async function issuePortalSession(user: ChatGPTUser, request: Request) {
  const db = getDb();
  const email = user.email.trim().toLowerCase();
  const now = new Date();
  const nowIso = now.toISOString();
  const token = randomToken();
  const tokenHash = await sha256(token);
  const currentSessions = await db
    .select({ id: portalSessions.id })
    .from(portalSessions)
    .where(and(eq(portalSessions.userEmail, email), eq(portalSessions.status, "active")))
    .orderBy(asc(portalSessions.createdAt))
    .limit(20);

  if (currentSessions.length >= 5) {
    const expiredIds = currentSessions.slice(0, currentSessions.length - 4).map((item) => item.id);
    if (expiredIds.length) {
      await db.update(portalSessions).set({
        status: "revoked",
        revokedAt: nowIso,
        revocationReason: "concurrent-session-limit",
      }).where(inArray(portalSessions.id, expiredIds));
    }
  }

  const id = crypto.randomUUID();
  await db.insert(portalSessions).values({
    id,
    tokenHash,
    userEmail: email,
    status: "active",
    userAgentHash: await requestUserAgentHash(request),
    sourceHash: await requestSourceHash(request),
    createdAt: nowIso,
    lastActivityAt: nowIso,
    idleExpiresAt: new Date(now.getTime() + PORTAL_IDLE_TIMEOUT_MINUTES * 60_000).toISOString(),
    absoluteExpiresAt: new Date(now.getTime() + PORTAL_ABSOLUTE_TIMEOUT_HOURS * 3_600_000).toISOString(),
  });
  await startAttendanceSession(id, email, nowIso).catch((error) => console.warn("attendance-session-start-failed", error instanceof Error ? error.message : String(error)));
  await auditPortalAction({
    actorEmail: email,
    action: "portal-session-started",
    entityType: "portal-session",
    entityId: id,
    source: "security",
    ipHash: await requestSourceHash(request),
  });
  await emitPortalNotification({
    eventType: "portal-session-started",
    title: "تم تسجيل دخول آمن إلى حسابك",
    message: `بدأت جلسة إدارية جديدة باسم ${user.displayName}. تنتهي تلقائياً بعد الخمول أو بانقضاء مدة العمل الآمنة.`,
    severity: "info",
    module: "users",
    entityType: "portal-session",
    entityId: id,
    actionView: "overview",
    targetEmail: email,
  }).catch(() => undefined);
  return { token, id };
}

export async function verifyPortalSession(userEmail: string, options: { touch?: boolean } = {}): Promise<PortalSessionCheck> {
  const requestHeaders = await headers();
  const token = cookieFromHeader(requestHeaders.get("cookie"));
  if (!token) return { status: "missing" };
  const db = getDb();
  await enforceNightlyAttendanceCutoff().catch((error) => console.warn("attendance-nightly-cutoff-failed", error instanceof Error ? error.message : String(error)));
  const tokenHash = await sha256(token);
  const session = await db.query.portalSessions.findFirst({ where: eq(portalSessions.tokenHash, tokenHash) });
  if (!session || session.userEmail !== userEmail.trim().toLowerCase() || session.status !== "active") {
    return { status: session?.status === "expired" ? "expired" : "invalid" };
  }

  const now = new Date();
  const nowIso = now.toISOString();
  if (session.idleExpiresAt <= nowIso || session.absoluteExpiresAt <= nowIso) {
    await db.update(portalSessions).set({
      status: "expired",
      revokedAt: nowIso,
      revocationReason: session.absoluteExpiresAt <= nowIso ? "absolute-timeout" : "idle-timeout",
    }).where(and(eq(portalSessions.id, session.id), eq(portalSessions.status, "active")));
    await auditPortalAction({
      actorEmail: session.userEmail,
      action: "portal-session-expired",
      entityType: "portal-session",
      entityId: session.id,
      reason: session.absoluteExpiresAt <= nowIso ? "absolute-timeout" : "idle-timeout",
      source: "security",
    });
    await closeAttendanceSession(session.id, nowIso, session.absoluteExpiresAt <= nowIso ? "absolute-timeout" : "idle-timeout", true).catch(() => undefined);
    return { status: "expired" };
  }

  const currentAgentHash = await sha256(requestHeaders.get("user-agent") || "unknown");
  if (currentAgentHash !== session.userAgentHash) {
    await db.update(portalSessions).set({
      status: "revoked",
      revokedAt: nowIso,
      revocationReason: "user-agent-changed",
    }).where(and(eq(portalSessions.id, session.id), eq(portalSessions.status, "active")));
    await auditPortalAction({
      actorEmail: session.userEmail,
      action: "portal-session-anomaly",
      entityType: "portal-session",
      entityId: session.id,
      reason: "user-agent-changed",
      source: "security",
    });
    await emitPortalNotification({
      eventType: "portal-session-anomaly",
      title: "أُوقفت جلسة إدارية غير معتادة",
      message: "رصد النظام تغيراً في بيئة المتصفح أثناء الجلسة وأوقفها احترازياً. أعد تسجيل الدخول إذا كنت صاحب العملية.",
      severity: "critical",
      module: "users",
      entityType: "portal-session",
      entityId: session.id,
      actionView: "users",
      targetRole: "admin",
      dedupeKey: `portal-session-anomaly:${session.id}`,
    }).catch(() => undefined);
    return { status: "invalid" };
  }

  if (options.touch && now.getTime() - new Date(session.lastActivityAt).getTime() >= 60_000) {
    await db.update(portalSessions).set({
      lastActivityAt: nowIso,
      idleExpiresAt: new Date(now.getTime() + PORTAL_IDLE_TIMEOUT_MINUTES * 60_000).toISOString(),
    }).where(and(eq(portalSessions.id, session.id), eq(portalSessions.status, "active")));
    await touchAttendanceSession(session.id, nowIso).catch(() => undefined);
  }
  return { status: "valid", sessionId: session.id, absoluteExpiresAt: session.absoluteExpiresAt };
}

export async function revokeCurrentPortalSession(request: Request, reason: string) {
  const token = cookieFromHeader(request.headers.get("cookie"));
  if (!token) return null;
  const db = getDb();
  const tokenHash = await sha256(token);
  const session = await db.query.portalSessions.findFirst({ where: eq(portalSessions.tokenHash, tokenHash) });
  if (!session) return null;
  const now = new Date().toISOString();
  await db.update(portalSessions).set({ status: "revoked", revokedAt: now, revocationReason: reason.slice(0, 120) })
    .where(eq(portalSessions.id, session.id));
  await closeAttendanceSession(session.id, now, reason, false).catch(() => undefined);
  await auditPortalAction({
    actorEmail: session.userEmail,
    action: "portal-session-ended",
    entityType: "portal-session",
    entityId: session.id,
    reason,
    source: "security",
    ipHash: await requestSourceHash(request),
  });
  return session;
}

export async function revokePortalSessionsForUser(userEmail: string, reason: string) {
  const now = new Date().toISOString();
  const db = getDb();
  const active = await db.select({ id: portalSessions.id }).from(portalSessions).where(and(eq(portalSessions.userEmail, userEmail.trim().toLowerCase()), eq(portalSessions.status, "active")));
  await db.update(portalSessions).set({
    status: "revoked",
    revokedAt: now,
    revocationReason: reason.slice(0, 120),
  }).where(and(eq(portalSessions.userEmail, userEmail.trim().toLowerCase()), eq(portalSessions.status, "active")));
  for (const session of active) await closeAttendanceSession(session.id, now, reason, false).catch(() => undefined);
}
