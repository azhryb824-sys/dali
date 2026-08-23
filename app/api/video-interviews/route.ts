import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { portalUsers, videoInterviews, visitorConversations } from "@/db/schema";
import { auditPortalAction } from "@/lib/audit";
import { getBusinessHoursState } from "@/lib/business-hours";
import { emitPortalNotification } from "@/lib/portal-notifications";
import { enforcePublicRateLimit, jsonNoStore, rateLimitResponse, readLimitedJson, rejectCrossSiteRequest, sha256 } from "@/lib/security";
import { interviewReference, interviewRoomName, interviewRoomUrl, listAvailableInterviewStaff, liveInterviewStatuses } from "@/lib/video-interviews";

const COOKIE_NAME = "dali_live_chat";

async function publicConversation(request: Request) {
  const cookie = request.headers.get("cookie") || "";
  const raw = cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE_NAME}=`));
  const [conversationId, token] = raw ? decodeURIComponent(raw.slice(COOKIE_NAME.length + 1)).split(".") : [];
  if (!conversationId || !token) return null;
  const conversation = await getDb().query.visitorConversations.findFirst({ where: and(eq(visitorConversations.id, conversationId), eq(visitorConversations.publicTokenHash, await sha256(token))) });
  if (!conversation || (conversation.tokenExpiresAt && conversation.tokenExpiresAt <= new Date().toISOString())) return null;
  return conversation;
}

async function publicPayload(conversationId: string) {
  const interview = await getDb().query.videoInterviews.findFirst({
    where: and(eq(videoInterviews.conversationId, conversationId), inArray(videoInterviews.status, [...liveInterviewStatuses])),
    orderBy: [desc(videoInterviews.createdAt)],
  });
  if (!interview) return null;
  const assignee = interview.assignedTo ? await getDb().query.portalUsers.findFirst({ where: eq(portalUsers.email, interview.assignedTo) }) : null;
  return {
    id: interview.id,
    referenceCode: interview.referenceCode,
    status: interview.status,
    assignedName: assignee?.displayName || null,
    requestedAt: interview.requestedAt,
    expiresAt: interview.expiresAt,
    joinUrl: interview.status === "active" ? interviewRoomUrl(interview.roomName) : null,
  };
}

export async function GET(request: Request) {
  const conversation = await publicConversation(request);
  if (!conversation) return jsonNoStore({ interview: null, businessHours: await getBusinessHoursState() });
  return jsonNoStore({ interview: await publicPayload(conversation.id), businessHours: await getBusinessHoursState() });
}

export async function POST(request: Request) {
  if (rejectCrossSiteRequest(request)) return jsonNoStore({ error: "مصدر الطلب غير مسموح" }, { status: 403 });
  const parsed = await readLimitedJson(request, 2_000);
  if (!parsed.ok) return parsed.response;
  const rateLimit = await enforcePublicRateLimit(request, { scope: "video-interview", limit: 5, windowSeconds: 1800, blockSeconds: 3600 });
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit.retryAfterSeconds);
  const conversation = await publicConversation(request);
  if (!conversation) return jsonNoStore({ error: "ابدأ المحادثة أولاً لطلب مقابلة مرئية" }, { status: 401 });
  const businessHours = await getBusinessHoursState();
  if (!businessHours.isOpen) return jsonNoStore({ error: `المقابلة المرئية متاحة خلال ساعات العمل فقط. العودة ${businessHours.nextOpenLabel}.`, businessHours }, { status: 409 });
  const db = getDb();
  const existing = await db.query.videoInterviews.findFirst({ where: and(eq(videoInterviews.conversationId, conversation.id), inArray(videoInterviews.status, [...liveInterviewStatuses])), orderBy: [desc(videoInterviews.createdAt)] });
  if (existing) return jsonNoStore({ interview: await publicPayload(conversation.id), businessHours });
  const now = new Date().toISOString();
  const available = await listAvailableInterviewStaff();
  const assignee = available[0] || null;
  const [interview] = await db.insert(videoInterviews).values({
    id: crypto.randomUUID(), referenceCode: interviewReference(), conversationId: conversation.id, roomName: interviewRoomName(),
    status: assignee ? "ringing" : "requested", assignedTo: assignee?.email || null, requestedAt: now,
    expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(), createdAt: now, updatedAt: now,
  }).returning();
  await auditPortalAction({ actorEmail: conversation.visitorEmail || "public-site", action: "video-interview-requested", entityType: "video-interview", entityId: interview.id, after: { referenceCode: interview.referenceCode, conversationId: conversation.id, assignedTo: interview.assignedTo }, reason: "طلب مقابلة مرئية من زائر الموقع", source: "public" });
  await emitPortalNotification({ eventType: "video-interview-requested", title: "طلب مقابلة مرئية جديد", message: `${interview.referenceCode} — ${conversation.visitorName} — ${conversation.subject}`, severity: "critical", module: "conversations", entityType: "video-interview", entityId: interview.id, actionView: "conversations", ...(assignee ? { targetEmail: assignee.email } : { targetRole: "admin" }), dedupeKey: `video-interview:${interview.id}:requested` }).catch(() => undefined);
  return jsonNoStore({ interview: await publicPayload(conversation.id), businessHours }, { status: 201 });
}
