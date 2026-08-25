import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { portalAccessScopes, portalUsers, videoInterviewTransfers, videoInterviews, visitorConversations } from "@/db/schema";
import { auditPortalAction } from "@/lib/audit";
import { hasPortalPermission, requirePortalApiRole } from "@/lib/portal-access";
import { emitPortalNotification } from "@/lib/portal-notifications";
import { jsonNoStore, readLimitedJson, rejectCrossSiteRequest, requestCorrelationId } from "@/lib/security";
import { expireOldVideoInterviews, interviewRoomUrl, listAvailableInterviewStaff, liveInterviewStatuses, touchInterviewPresence } from "@/lib/video-interviews";

async function interviewAccess() {
  return requirePortalApiRole(["admin", "manager", "employee"]);
}

const isRoot = (access: NonNullable<Awaited<ReturnType<typeof interviewAccess>>>) => access.role === "admin" || access.functionalRoles.some((role) => role === "system_owner" || role === "system_admin");

async function payload(access: NonNullable<Awaited<ReturnType<typeof interviewAccess>>>) {
  await expireOldVideoInterviews();
  const db = getDb();
  const root = isRoot(access);
  const interviews = await db.select({
    id: videoInterviews.id, referenceCode: videoInterviews.referenceCode, conversationId: videoInterviews.conversationId,
    status: videoInterviews.status, assignedTo: videoInterviews.assignedTo, requestedAt: videoInterviews.requestedAt,
    acceptedAt: videoInterviews.acceptedAt, startedAt: videoInterviews.startedAt, expiresAt: videoInterviews.expiresAt,
    transferCount: videoInterviews.transferCount, visitorName: visitorConversations.visitorName, visitorMobile: visitorConversations.visitorMobile,
    subject: visitorConversations.subject, roomName: videoInterviews.roomName, employeeRating: videoInterviews.employeeRating,
    companyRating: videoInterviews.companyRating, ratingComment: videoInterviews.ratingComment, ratedAt: videoInterviews.ratedAt,
  }).from(videoInterviews).innerJoin(visitorConversations, eq(visitorConversations.id, videoInterviews.conversationId))
    .where(root ? inArray(videoInterviews.status, [...liveInterviewStatuses]) : and(eq(videoInterviews.assignedTo, access.user.email), inArray(videoInterviews.status, [...liveInterviewStatuses])))
    .orderBy(desc(videoInterviews.requestedAt)).limit(50);
  const availableStaff = await listAvailableInterviewStaff(access.user.email);
  const activeOwners = await db.select({ email: portalUsers.email, displayName: portalUsers.displayName }).from(portalAccessScopes)
    .innerJoin(portalUsers, eq(portalUsers.email, portalAccessScopes.userEmail))
    .where(and(eq(portalAccessScopes.functionalRole, "system_owner"), eq(portalAccessScopes.active, true), eq(portalUsers.status, "active")));
  const availableEmails = new Set(availableStaff.map((item) => item.email));
  const transferTargets = [...availableStaff, ...activeOwners.filter((item) => item.email !== access.user.email && !availableEmails.has(item.email)).map((item) => ({ ...item, availability: "offline", lastSeenAt: "", owner: true }))];
  return {
    interviews: interviews.map(({ roomName, ...item }) => ({ ...item, joinUrl: item.assignedTo === access.user.email || root ? interviewRoomUrl(roomName) : null })),
    availableStaff: transferTargets,
    canViewQueue: root,
  };
}

export async function GET() {
  const access = await interviewAccess();
  if (!access || !(await hasPortalPermission(access, "video", "read"))) return jsonNoStore({ error: "غير مصرح بالمقابلات المرئية" }, { status: 403 });
  await touchInterviewPresence(access.user.email, "online");
  return jsonNoStore(await payload(access));
}

export async function POST(request: Request) {
  if (rejectCrossSiteRequest(request)) return jsonNoStore({ error: "مصدر الطلب غير مسموح" }, { status: 403 });
  const access = await interviewAccess();
  if (!access) return jsonNoStore({ error: "غير مصرح بالمقابلات المرئية" }, { status: 403 });
  const parsed = await readLimitedJson(request, 8_000);
  if (!parsed.ok) return parsed.response;
  const body = parsed.value as Record<string, unknown>;
  const action = typeof body.action === "string" ? body.action : "";
  if (action === "heartbeat") {
    if (!(await hasPortalPermission(access, "video", "read"))) return jsonNoStore({ error: "غير مصرح بالمقابلات المرئية" }, { status: 403 });
    const availability = body.availability === "away" || body.availability === "offline" ? body.availability : "online";
    await touchInterviewPresence(access.user.email, availability);
    return jsonNoStore({ accepted: true });
  }
  const interviewId = typeof body.interviewId === "string" ? body.interviewId.slice(0, 80) : "";
  if (!interviewId) return jsonNoStore({ error: "المقابلة غير محددة" }, { status: 400 });
  const requiredAction = action === "transfer" ? "transfer" : "manage";
  if (!(await hasPortalPermission(access, "video", requiredAction))) return jsonNoStore({ error: "لا تملك صلاحية تنفيذ هذا الإجراء على المقابلة" }, { status: 403 });
  const db = getDb();
  const interview = await db.query.videoInterviews.findFirst({ where: eq(videoInterviews.id, interviewId) });
  if (!interview) return jsonNoStore({ error: "المقابلة غير موجودة" }, { status: 404 });
  const root = isRoot(access);
  if (!root && interview.assignedTo !== access.user.email) return jsonNoStore({ error: "المقابلة مسندة إلى مستخدم آخر" }, { status: 403 });
  const now = new Date().toISOString();

  if (action === "accept") {
    if (!["requested", "ringing", "transferred"].includes(interview.status) || interview.expiresAt <= now) return jsonNoStore({ error: "لم تعد المقابلة قابلة للقبول" }, { status: 409 });
    const [updated] = await db.update(videoInterviews).set({ status: "active", assignedTo: access.user.email, acceptedAt: interview.acceptedAt || now, startedAt: interview.startedAt || now, updatedAt: now }).where(eq(videoInterviews.id, interview.id)).returning();
    await touchInterviewPresence(access.user.email, "busy", interview.id);
    await auditPortalAction({ actorEmail: access.user.email, action: "video-interview-accepted", entityType: "video-interview", entityId: interview.id, before: interview, after: updated, correlationId: requestCorrelationId(request) });
    await emitPortalNotification({ eventType: "video-interview-accepted", title: "تم قبول المقابلة المرئية", message: `${interview.referenceCode} — بدأ ${access.user.displayName} استقبال الزائر.`, severity: "success", module: "conversations", entityType: "video-interview", entityId: interview.id, actionView: "conversations", targetRole: "admin" }).catch(() => undefined);
    return jsonNoStore(await payload(access));
  }

  if (action === "transfer") {
    const toEmail = typeof body.toEmail === "string" ? body.toEmail.trim().toLowerCase().slice(0, 254) : "";
    const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : "";
    if (!toEmail || toEmail === access.user.email || reason.length < 5) return jsonNoStore({ error: "اختر المستلم واكتب سبب التحويل" }, { status: 400 });
    const target = await db.query.portalUsers.findFirst({ where: and(eq(portalUsers.email, toEmail), eq(portalUsers.status, "active")) });
    if (!target) return jsonNoStore({ error: "المستخدم المستلم غير نشط" }, { status: 409 });
    const available = await listAvailableInterviewStaff();
    const owner = await db.query.portalAccessScopes.findFirst({ where: and(eq(portalAccessScopes.userEmail, toEmail), eq(portalAccessScopes.functionalRole, "system_owner"), eq(portalAccessScopes.active, true)) });
    if (!owner && !available.some((item) => item.email === toEmail)) return jsonNoStore({ error: "الموظف غير متاح حالياً؛ يمكن التحويل للمالك في أي وقت" }, { status: 409 });
    const [updated] = await db.update(videoInterviews).set({ status: "transferred", assignedTo: toEmail, transferCount: interview.transferCount + 1, lastTransferredBy: access.user.email, transferReason: reason, updatedAt: now }).where(eq(videoInterviews.id, interview.id)).returning();
    await db.insert(videoInterviewTransfers).values({ interviewId: interview.id, fromEmail: interview.assignedTo, toEmail, transferredBy: access.user.email, reason, createdAt: now });
    await touchInterviewPresence(access.user.email, "online");
    await auditPortalAction({ actorEmail: access.user.email, action: "video-interview-transferred", entityType: "video-interview", entityId: interview.id, before: interview, after: updated, reason, correlationId: requestCorrelationId(request) });
    await emitPortalNotification({ eventType: "video-interview-transferred", title: "حُوّلت إليك مقابلة مرئية", message: `${interview.referenceCode} — من ${access.user.displayName}: ${reason}`, severity: "critical", module: "conversations", entityType: "video-interview", entityId: interview.id, actionView: "conversations", targetEmail: toEmail, dedupeKey: `video-interview:${interview.id}:transfer:${interview.transferCount + 1}` }).catch(() => undefined);
    return jsonNoStore(await payload(access));
  }

  if (action === "complete" || action === "cancel") {
    const nextStatus = action === "complete" ? "completed" : "cancelled";
    const [updated] = await db.update(videoInterviews).set({ status: nextStatus, endedAt: now, updatedAt: now }).where(eq(videoInterviews.id, interview.id)).returning();
    await touchInterviewPresence(access.user.email, "online");
    await auditPortalAction({ actorEmail: access.user.email, action: `video-interview-${nextStatus}`, entityType: "video-interview", entityId: interview.id, before: interview, after: updated, correlationId: requestCorrelationId(request) });
    await emitPortalNotification({ eventType: `video-interview-${nextStatus}`, title: nextStatus === "completed" ? "اكتملت المقابلة المرئية" : "أُلغيت المقابلة المرئية", message: interview.referenceCode, severity: nextStatus === "completed" ? "success" : "warning", module: "conversations", entityType: "video-interview", entityId: interview.id, actionView: "conversations", targetRole: "admin" }).catch(() => undefined);
    return jsonNoStore(await payload(access));
  }

  return jsonNoStore({ error: "إجراء المقابلة غير صحيح" }, { status: 400 });
}
