import { and, asc, eq, gt, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { visitorConversations, visitorMessages } from "@/db/schema";
import { getBusinessHoursState } from "@/lib/business-hours";
import { buildAutomatedReplyPlan } from "@/lib/chat-automation";
import { emitPortalNotification } from "@/lib/portal-notifications";
import { enforcePublicRateLimit, jsonNoStore, rateLimitResponse, readLimitedJson, rejectCrossSiteRequest, requestSourceHash, sha256 } from "@/lib/security";

const COOKIE_NAME = "dali_live_chat";

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function cookieValue(request: Request) {
  const cookie = request.headers.get("cookie") || "";
  const match = cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE_NAME}=`));
  return match ? decodeURIComponent(match.slice(COOKIE_NAME.length + 1)) : "";
}

function sessionCookie(request: Request, conversationId: string, token: string) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${COOKIE_NAME}=${encodeURIComponent(`${conversationId}.${token}`)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${secure}`;
}

async function resolveConversation(request: Request) {
  const [conversationId, token] = cookieValue(request).split(".");
  if (!conversationId || !token) return null;
  const tokenHash = await sha256(token);
  const conversation = await getDb().query.visitorConversations.findFirst({
    where: and(eq(visitorConversations.id, conversationId), eq(visitorConversations.publicTokenHash, tokenHash)),
  });
  if (conversation?.tokenExpiresAt && conversation.tokenExpiresAt <= new Date().toISOString()) return null;
  return conversation;
}

function publicMessage(message: typeof visitorMessages.$inferSelect) {
  return {
    id: message.id,
    senderType: message.senderType,
    senderName: message.senderType === "visitor" ? message.senderName : "فريق دالي",
    body: message.body,
    createdAt: message.createdAt,
    readByStaffAt: message.senderType === "visitor" ? message.readByStaffAt : null,
  };
}

async function conversationPayload(conversation: typeof visitorConversations.$inferSelect, afterMessageId = 0) {
  const db = getDb();
  const messages = await db.select().from(visitorMessages)
    .where(afterMessageId > 0
      ? and(eq(visitorMessages.conversationId, conversation.id), gt(visitorMessages.id, afterMessageId))
      : eq(visitorMessages.conversationId, conversation.id))
    .orderBy(asc(visitorMessages.createdAt))
    .limit(afterMessageId > 0 ? 100 : 300);
  const now = new Date().toISOString();
  await db.update(visitorMessages).set({ readByVisitorAt: now }).where(and(
    eq(visitorMessages.conversationId, conversation.id),
    ne(visitorMessages.senderType, "visitor"),
  ));
  return {
    conversation: {
      trackingCode: conversation.trackingCode,
      visitorName: conversation.visitorName,
      subject: conversation.subject,
      status: conversation.status,
      assigned: Boolean(conversation.assignedTo),
      ratingSubmitted: Boolean(conversation.ratedAt),
    },
    messages: messages.map(publicMessage),
    delta: afterMessageId > 0,
  };
}

async function addAutomatedReplies(conversation: typeof visitorConversations.$inferSelect, messageBody: string, isStart: boolean) {
  const state = await getBusinessHoursState();
  const plan = await buildAutomatedReplyPlan({
    conversationId: conversation.id,
    trackingCode: conversation.trackingCode,
    visitorName: conversation.visitorName,
    subject: conversation.subject,
    messageBody,
    isStart,
    businessHours: state,
  });
  if (!plan.length) return { state, messages: [] as (typeof visitorMessages.$inferSelect)[] };
  const now = new Date().toISOString();
  const db = getDb();
  const messages: (typeof visitorMessages.$inferSelect)[] = [];
  for (const reply of plan) {
    const [message] = await db.insert(visitorMessages).values({
      conversationId: conversation.id,
      senderType: "system",
      senderName: "مساعد دالي",
      body: reply.body,
      clientMessageId: reply.key,
      createdAt: now,
    }).onConflictDoNothing({ target: visitorMessages.clientMessageId }).returning();
    if (message) messages.push(message);
  }
  if (!state.isOpen && messages.length) {
    await db.update(visitorConversations).set({ lastAutoReplyKey: state.replyKey, updatedAt: now })
      .where(eq(visitorConversations.id, conversation.id));
  }
  return { state, messages };
}

export async function GET(request: Request) {
  try {
    const businessHours = await getBusinessHoursState();
    const conversation = await resolveConversation(request);
    if (!conversation) {
      return Response.json({ conversation: null, messages: [], businessHours }, { headers: { "cache-control": "no-store" } });
    }
    const afterMessageId = Math.max(0, Number(new URL(request.url).searchParams.get("after") || 0) || 0);
    const payload = await conversationPayload(conversation, afterMessageId);
    return jsonNoStore({ ...payload, businessHours });
  } catch (error) {
    console.error("public-chat-get-failed", error);
    return Response.json({ error: "تعذّر تحميل المحادثة حالياً." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    if (rejectCrossSiteRequest(request)) return jsonNoStore({ error: "مصدر الطلب غير مسموح." }, { status: 403 });
    const parsed = await readLimitedJson(request, 16_000);
    if (!parsed.ok) return parsed.response;
    const rateLimit = await enforcePublicRateLimit(request, { scope: "live-chat", limit: 30, windowSeconds: 900, blockSeconds: 1800 });
    if (!rateLimit.allowed) return rateLimitResponse(rateLimit.retryAfterSeconds);
    const payload = parsed.value as Record<string, unknown>;
    if (cleanText(payload.website, 200)) return Response.json({ accepted: true }, { status: 202 });
    const action = cleanText(payload.action, 20);
    const body = cleanText(payload.message, 2000);
    const clientMessageId = cleanText(payload.clientMessageId, 80);

    const db = getDb();
    const now = new Date().toISOString();

    if (action === "start") {
      if (body.length < 2) return Response.json({ error: "اكتب رسالتك قبل الإرسال." }, { status: 400 });
      const activeConversation = await resolveConversation(request);
      if (activeConversation) {
        return jsonNoStore({ ...(await conversationPayload(activeConversation)), businessHours: await getBusinessHoursState(), duplicate: true });
      }
      const visitorName = cleanText(payload.visitorName, 100);
      const visitorMobile = cleanText(payload.visitorMobile, 20);
      const visitorEmail = cleanText(payload.visitorEmail, 160).toLowerCase();
      const subject = cleanText(payload.subject, 160) || "استفسار من الموقع";
      if (visitorName.length < 2 || !/^\+?[0-9\s()-]{8,20}$/.test(visitorMobile) || (visitorEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(visitorEmail))) {
        return Response.json({ error: "تحقق من الاسم ورقم الجوال والبريد الإلكتروني." }, { status: 400 });
      }

      const id = crypto.randomUUID();
      const token = `${crypto.randomUUID()}${crypto.randomUUID()}`;
      const businessHours = await getBusinessHoursState();
      const trackingCode = `CHAT-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`;
      const [conversation] = await db.insert(visitorConversations).values({
        id,
        trackingCode,
        publicTokenHash: await sha256(token),
        visitorName,
        visitorEmail: visitorEmail || null,
        visitorMobile,
        subject,
        status: "waiting",
        sourceHash: await requestSourceHash(request),
        lastVisitorMessageAt: now,
        tokenExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        slaDueAt: new Date(Date.now() + (businessHours.isOpen ? 15 * 60 * 1000 : 24 * 60 * 60 * 1000)).toISOString(),
        privacyNoticeVersion: "2026-08-14",
        privacyAcknowledgedAt: now,
        createdAt: now,
        updatedAt: now,
      }).returning();
      await db.insert(visitorMessages).values({
        conversationId: id,
        senderType: "visitor",
        senderName: visitorName,
        senderEmail: visitorEmail || null,
        body,
        clientMessageId: clientMessageId || null,
        createdAt: now,
      });
      const automation = await addAutomatedReplies(conversation, body, true);
      await emitPortalNotification({
        eventType: "live-chat-started",
        title: automation.state.isOpen ? "محادثة مباشرة جديدة" : "رسالة جديدة خارج الدوام",
        message: `${trackingCode} — ${visitorName} — ${subject}.`,
        severity: "critical",
        module: "conversations",
        entityType: "visitor-conversation",
        entityId: id,
        actionView: "conversations",
        targetDepartment: "workforce",
      }).catch(() => undefined);
      const latest = await db.query.visitorConversations.findFirst({ where: eq(visitorConversations.id, id) }) || conversation;
      const responsePayload = await conversationPayload(latest);
      return Response.json({ ...responsePayload, businessHours: automation.state }, {
        status: 201,
        headers: { "set-cookie": sessionCookie(request, id, token), "cache-control": "no-store" },
      });
    }

    if (action === "send") {
      if (body.length < 2) return Response.json({ error: "اكتب رسالتك قبل الإرسال." }, { status: 400 });
      const conversation = await resolveConversation(request);
      if (!conversation) return Response.json({ error: "انتهت جلسة المحادثة. ابدأ محادثة جديدة." }, { status: 401 });
      if (conversation.status === "closed") return jsonNoStore({ error: "هذه المحادثة مغلقة. ابدأ محادثة جديدة." }, { status: 409 });
      if (clientMessageId) {
        const existing = await db.query.visitorMessages.findFirst({ where: eq(visitorMessages.clientMessageId, clientMessageId) });
        if (existing && existing.conversationId === conversation.id) {
          return jsonNoStore({ message: publicMessage(existing), autoReply: null, businessHours: await getBusinessHoursState(), duplicate: true });
        }
      }
      const insert = db.insert(visitorMessages).values({
        conversationId: conversation.id,
        senderType: "visitor",
        senderName: conversation.visitorName,
        senderEmail: conversation.visitorEmail,
        body,
        clientMessageId: clientMessageId || null,
        createdAt: now,
      });
      const [message] = clientMessageId
        ? await insert.onConflictDoNothing({ target: visitorMessages.clientMessageId }).returning()
        : await insert.returning();
      if (!message && clientMessageId) {
        const existing = await db.query.visitorMessages.findFirst({ where: eq(visitorMessages.clientMessageId, clientMessageId) });
        if (existing?.conversationId === conversation.id) return jsonNoStore({ message: publicMessage(existing), autoReply: null, businessHours: await getBusinessHoursState(), duplicate: true });
      }
      if (!message) throw new Error("chat-message-insert-failed");
      const [updated] = await db.update(visitorConversations).set({
        status: "waiting",
        lastVisitorMessageAt: now,
        updatedAt: now,
      }).where(eq(visitorConversations.id, conversation.id)).returning();
      const automation = await addAutomatedReplies(updated, body, false);
      await emitPortalNotification({
        eventType: "live-chat-message-received",
        title: "رسالة جديدة في المحادثات",
        message: `${conversation.trackingCode} — ${conversation.visitorName}: ${body.slice(0, 120)}`,
        severity: "warning",
        module: "conversations",
        entityType: "visitor-conversation",
        entityId: conversation.id,
        actionView: "conversations",
        targetDepartment: "workforce",
      }).catch(() => undefined);
      return jsonNoStore({
        message: publicMessage(message),
        autoReply: automation.messages[0] ? publicMessage(automation.messages[0]) : null,
        autoReplies: automation.messages.map(publicMessage),
        businessHours: automation.state,
      }, { status: 201 });
    }

    if (action === "end") {
      const conversation = await resolveConversation(request);
      if (!conversation) return jsonNoStore({ error: "انتهت جلسة المحادثة." }, { status: 401 });
      if (conversation.status === "closed") return jsonNoStore({ ...(await conversationPayload(conversation)), duplicate: true });
      const [updated] = await db.update(visitorConversations).set({ status: "closed", closedAt: now, updatedAt: now })
        .where(eq(visitorConversations.id, conversation.id)).returning();
      await emitPortalNotification({ eventType: "live-chat-ended-by-visitor", title: "أنهى الزائر المحادثة", message: `${conversation.trackingCode} — ${conversation.visitorName}.`, severity: "info", module: "conversations", entityType: "visitor-conversation", entityId: conversation.id, actionView: "conversations", targetDepartment: "workforce" }).catch(() => undefined);
      return jsonNoStore(await conversationPayload(updated));
    }

    if (action === "rate") {
      const conversation = await resolveConversation(request);
      if (!conversation) return jsonNoStore({ error: "انتهت جلسة المحادثة." }, { status: 401 });
      if (conversation.status !== "closed") return jsonNoStore({ error: "يمكن التقييم بعد إنهاء المحادثة." }, { status: 409 });
      if (conversation.ratedAt) return jsonNoStore({ error: "تم إرسال تقييم هذه المحادثة مسبقًا." }, { status: 409 });
      const employeeRating = Number(payload.employeeRating);
      const companyRating = Number(payload.companyRating);
      if (![employeeRating, companyRating].every((value) => Number.isInteger(value) && value >= 1 && value <= 5)) return jsonNoStore({ error: "اختر تقييم الموظف والشركة من 1 إلى 5." }, { status: 400 });
      const ratingComment = cleanText(payload.ratingComment, 1000) || null;
      const [updated] = await db.update(visitorConversations).set({ employeeRating, companyRating, ratingComment, ratedAt: now, updatedAt: now })
        .where(eq(visitorConversations.id, conversation.id)).returning();
      await emitPortalNotification({ eventType: "live-chat-rated", title: "تقييم جديد للمحادثة", message: `${conversation.trackingCode} — الموظف ${employeeRating}/5 · الشركة ${companyRating}/5.`, severity: Math.min(employeeRating, companyRating) <= 2 ? "warning" : "success", module: "conversations", entityType: "visitor-conversation", entityId: conversation.id, actionView: "conversations", targetRole: "admin" }).catch(() => undefined);
      return jsonNoStore({ conversation: { trackingCode: updated.trackingCode, status: updated.status, ratingSubmitted: true }, accepted: true });
    }

    return Response.json({ error: "إجراء المحادثة غير صحيح." }, { status: 400 });
  } catch (error) {
    console.error("public-chat-post-failed", error);
    return Response.json({ error: "تعذّر إرسال الرسالة حالياً. يرجى المحاولة مرة أخرى." }, { status: 500 });
  }
}
