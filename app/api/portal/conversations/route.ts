import { and, asc, desc, eq, gt, inArray, or } from "drizzle-orm";
import { getDb } from "@/db";
import { portalActivity, portalSettings, visitorConversations, visitorMessages } from "@/db/schema";
import { getBusinessHoursState, normalizeBusinessHoursConfig } from "@/lib/business-hours";
import { getChatAutomationConfig, normalizeChatAutomationConfig } from "@/lib/chat-automation";
import { auditPortalAction } from "@/lib/audit";
import { canAccessPortalConversations, canAdministerPortalUsers, canManagePortalConversations, requirePortalApiRole } from "@/lib/portal-access";
import { emitPortalNotification } from "@/lib/portal-notifications";
import { readLimitedJson, rejectCrossSiteRequest, requestCorrelationId, requestSourceHash } from "@/lib/security";

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

async function requireConversationReadAccess() {
  const access = await requirePortalApiRole(["admin", "manager", "employee"]);
  return access && canAccessPortalConversations(access) ? access : null;
}

async function requireConversationWriteAccess() {
  const access = await requirePortalApiRole(["admin", "manager", "employee"]);
  return access && canManagePortalConversations(access) ? access : null;
}

async function listConversationData(request: Request) {
  const db = getDb();
  const params = new URL(request.url).searchParams;
  const conversationId = cleanText(params.get("conversationId"), 80);
  const afterMessageId = Math.max(0, Number(params.get("afterMessageId")) || 0);
  const updatedAfter = cleanText(params.get("updatedAfter"), 40);
  const conversationSelect = {
      id: visitorConversations.id,
      trackingCode: visitorConversations.trackingCode,
      visitorName: visitorConversations.visitorName,
      visitorEmail: visitorConversations.visitorEmail,
      visitorMobile: visitorConversations.visitorMobile,
      subject: visitorConversations.subject,
      status: visitorConversations.status,
      assignedTo: visitorConversations.assignedTo,
      relatedRequestId: visitorConversations.relatedRequestId,
      lastVisitorMessageAt: visitorConversations.lastVisitorMessageAt,
      lastStaffMessageAt: visitorConversations.lastStaffMessageAt,
      createdAt: visitorConversations.createdAt,
      updatedAt: visitorConversations.updatedAt,
      employeeRating: visitorConversations.employeeRating,
      companyRating: visitorConversations.companyRating,
      ratingComment: visitorConversations.ratingComment,
      ratedAt: visitorConversations.ratedAt,
  };
  const messageSelect = {
      id: visitorMessages.id,
      conversationId: visitorMessages.conversationId,
      senderType: visitorMessages.senderType,
      senderName: visitorMessages.senderName,
      senderEmail: visitorMessages.senderEmail,
      body: visitorMessages.body,
      readByVisitorAt: visitorMessages.readByVisitorAt,
      readByStaffAt: visitorMessages.readByStaffAt,
      createdAt: visitorMessages.createdAt,
  };
  if (conversationId) {
    const [conversation] = await db.select(conversationSelect).from(visitorConversations).where(eq(visitorConversations.id, conversationId)).limit(1);
    if (!conversation) return { conversations: [], messages: [], businessHours: await getBusinessHoursState(), chatAutomation: await getChatAutomationConfig(), delta: false };
    const messages = await db.select(messageSelect).from(visitorMessages).where(afterMessageId > 0 ? and(eq(visitorMessages.conversationId, conversationId), gt(visitorMessages.id, afterMessageId)) : eq(visitorMessages.conversationId, conversationId)).orderBy(asc(visitorMessages.createdAt)).limit(500);
    return { conversations: [conversation], messages, businessHours: await getBusinessHoursState(), chatAutomation: await getChatAutomationConfig(), delta: afterMessageId > 0 };
  }
  if (afterMessageId > 0 || updatedAfter) {
    const messages = afterMessageId > 0 ? await db.select(messageSelect).from(visitorMessages).where(gt(visitorMessages.id, afterMessageId)).orderBy(asc(visitorMessages.id)).limit(250) : [];
    const changedIds = Array.from(new Set(messages.map((item) => item.conversationId)));
    const condition = changedIds.length && updatedAfter
      ? or(inArray(visitorConversations.id, changedIds), gt(visitorConversations.updatedAt, updatedAfter))
      : changedIds.length ? inArray(visitorConversations.id, changedIds)
      : updatedAfter ? gt(visitorConversations.updatedAt, updatedAfter)
      : undefined;
    const conversations = condition ? await db.select(conversationSelect).from(visitorConversations).where(condition).orderBy(desc(visitorConversations.updatedAt)).limit(100) : [];
    return { conversations, messages, businessHours: await getBusinessHoursState(), chatAutomation: await getChatAutomationConfig(), delta: true };
  }
  const offset = Math.max(0, Number(params.get("offset")) || 0);
  const conversations = await db.select(conversationSelect).from(visitorConversations).orderBy(desc(visitorConversations.updatedAt)).limit(100).offset(offset);
  const ids = conversations.map((item) => item.id);
  const recentMessages = ids.length ? await db.select(messageSelect).from(visitorMessages).where(inArray(visitorMessages.conversationId, ids)).orderBy(desc(visitorMessages.id)).limit(1200) : [];
  return { conversations, messages: recentMessages.reverse(), businessHours: await getBusinessHoursState(), chatAutomation: await getChatAutomationConfig(), delta: false };
}

export async function GET(request: Request) {
  const access = await requireConversationReadAccess();
  if (!access) return Response.json({ error: "غير مصرح بالوصول إلى المحادثات" }, { status: 403 });
  try {
    return Response.json(await listConversationData(request), { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ error: "تعذّر تحديث المحادثات" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (rejectCrossSiteRequest(request)) return Response.json({ error: "مصدر الطلب غير مسموح" }, { status: 403 });
  const access = await requireConversationWriteAccess();
  if (!access) return Response.json({ error: "غير مصرح بالرد على المحادثات" }, { status: 403 });
  try {
    const parsed = await readLimitedJson(request, 12_000);
    if (!parsed.ok) return parsed.response;
    const payload = parsed.value as Record<string, unknown>;
    const conversationId = cleanText(payload.conversationId, 80);
    const body = cleanText(payload.body, 4000);
    if (!conversationId || body.length < 2) return Response.json({ error: "اكتب الرد قبل الإرسال" }, { status: 400 });
    const db = getDb();
    const conversation = await db.query.visitorConversations.findFirst({ where: eq(visitorConversations.id, conversationId) });
    if (!conversation) return Response.json({ error: "المحادثة غير موجودة" }, { status: 404 });
    if (conversation.status === "closed") return Response.json({ error: "المحادثة مغلقة. أعد فتحها قبل إرسال رد جديد." }, { status: 409 });
    const now = new Date().toISOString();
    const [message] = await db.insert(visitorMessages).values({
      conversationId,
      senderType: "staff",
      senderName: access.user.displayName,
      senderEmail: access.user.email,
      body,
      createdAt: now,
    }).returning();
    const [updated] = await db.update(visitorConversations).set({
      status: "open",
      assignedTo: access.user.email,
      lastStaffMessageAt: now,
      firstResponseAt: conversation.firstResponseAt || now,
      updatedAt: now,
    }).where(eq(visitorConversations.id, conversationId)).returning();
    await db.update(visitorMessages).set({ readByStaffAt: now }).where(and(
      eq(visitorMessages.conversationId, conversationId),
      eq(visitorMessages.senderType, "visitor"),
    ));
    await db.insert(portalActivity).values({
      actorEmail: access.user.email,
      action: "live-chat-replied",
      entityType: "visitor-conversation",
      entityId: conversationId,
    });
    await emitPortalNotification({
      eventType: "live-chat-replied",
      title: "تم الرد في المحادثة المباشرة",
      message: `${conversation.trackingCode} — رد ${access.user.displayName} على ${conversation.visitorName}.`,
      severity: "success",
      module: "conversations",
      entityType: "visitor-conversation",
      entityId: conversationId,
      actionView: "conversations",
      targetDepartment: "workforce",
    }).catch(() => undefined);
    return Response.json({ conversation: updated, message }, { status: 201 });
  } catch {
    return Response.json({ error: "تعذّر إرسال الرد" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  if (rejectCrossSiteRequest(request)) return Response.json({ error: "مصدر الطلب غير مسموح" }, { status: 403 });
  const access = await requireConversationWriteAccess();
  if (!access) return Response.json({ error: "غير مصرح بإدارة المحادثات" }, { status: 403 });
  try {
    const parsed = await readLimitedJson(request, 40_000);
    if (!parsed.ok) return parsed.response;
    const payload = parsed.value as Record<string, unknown>;
    const action = cleanText(payload.action, 40);
    const db = getDb();
    const now = new Date().toISOString();

    if (action === "settings") {
      if (!canAdministerPortalUsers(access)) return Response.json({ error: "إعدادات الدوام متاحة لمالك النظام أو مشرفه فقط" }, { status: 403 });
      const config = normalizeBusinessHoursConfig(payload.config);
      const automation = normalizeChatAutomationConfig(payload.automation);
      const [beforeHours, beforeAutomation] = await Promise.all([getBusinessHoursState(), getChatAutomationConfig()]);
      await db.insert(portalSettings).values({
        key: "business-hours",
        valueJson: JSON.stringify(config),
        updatedBy: access.user.email,
        updatedAt: now,
      }).onConflictDoUpdate({
        target: portalSettings.key,
        set: { valueJson: JSON.stringify(config), updatedBy: access.user.email, updatedAt: now },
      });
      await db.insert(portalSettings).values({
        key: "chat-automation",
        valueJson: JSON.stringify(automation),
        updatedBy: access.user.email,
        updatedAt: now,
      }).onConflictDoUpdate({
        target: portalSettings.key,
        set: { valueJson: JSON.stringify(automation), updatedBy: access.user.email, updatedAt: now },
      });
      await auditPortalAction({
        actorEmail: access.user.email,
        action: "chat-automation-updated",
        entityType: "system-setting",
        entityId: "chat-automation",
        before: { businessHours: beforeHours, chatAutomation: beforeAutomation },
        after: { businessHours: config, chatAutomation: automation },
        reason: "تحديث نظام الرد الآلي وساعات الخدمة",
        correlationId: requestCorrelationId(request),
        source: "portal",
        ipHash: await requestSourceHash(request),
      });
      await emitPortalNotification({
        eventType: "chat-automation-updated",
        title: "تم تحديث نظام الرد الآلي",
        message: `الدوام من ${config.opensAt} إلى ${config.closesAt} بتوقيت مكة، و${automation.rules.filter((rule) => rule.enabled).length} مسارات توجيه مفعّلة.`,
        severity: "info",
        module: "conversations",
        entityType: "system-setting",
        entityId: "chat-automation",
        actionView: "conversations",
        targetRole: "admin",
      }).catch(() => undefined);
      return Response.json({ businessHours: await getBusinessHoursState(), chatAutomation: await getChatAutomationConfig() });
    }

    const conversationId = cleanText(payload.conversationId, 80);
    if (!conversationId) return Response.json({ error: "المحادثة غير محددة" }, { status: 400 });
    const conversation = await db.query.visitorConversations.findFirst({ where: eq(visitorConversations.id, conversationId) });
    if (!conversation) return Response.json({ error: "المحادثة غير موجودة" }, { status: 404 });

    if (action === "mark-read") {
      await db.update(visitorMessages).set({ readByStaffAt: now }).where(and(
        eq(visitorMessages.conversationId, conversationId),
        eq(visitorMessages.senderType, "visitor"),
      ));
      return Response.json({ accepted: true, readAt: now });
    }

    if (action === "status") {
      const status = cleanText(payload.status, 20);
      if (!new Set(["waiting", "open", "closed"]).has(status)) return Response.json({ error: "حالة المحادثة غير صحيحة" }, { status: 400 });
      const [updated] = await db.update(visitorConversations).set({
        status,
        assignedTo: status === "closed" ? conversation.assignedTo : access.user.email,
        closedAt: status === "closed" ? now : null,
        updatedAt: now,
      }).where(eq(visitorConversations.id, conversationId)).returning();
      await db.insert(portalActivity).values({
        actorEmail: access.user.email,
        action: status === "closed" ? "live-chat-closed" : "live-chat-status-updated",
        entityType: "visitor-conversation",
        entityId: conversationId,
      });
      await emitPortalNotification({
        eventType: status === "closed" ? "live-chat-closed" : "live-chat-status-updated",
        title: status === "closed" ? "أُغلقت محادثة زائر" : "تغيّرت حالة محادثة",
        message: `${conversation.trackingCode} — الحالة الجديدة: ${status}.`,
        severity: status === "closed" ? "success" : "info",
        module: "conversations",
        entityType: "visitor-conversation",
        entityId: conversationId,
        actionView: "conversations",
        targetDepartment: "workforce",
      }).catch(() => undefined);
      return Response.json({ conversation: updated });
    }

    return Response.json({ error: "إجراء المحادثة غير صحيح" }, { status: 400 });
  } catch {
    return Response.json({ error: "تعذّر تحديث المحادثة" }, { status: 500 });
  }
}
