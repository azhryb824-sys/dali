import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { portalActivity, workforceRequestReplies, workforceRequests } from "@/db/schema";
import { sendVisitorReplyEmail } from "@/lib/email-delivery";
import { emitPortalNotification } from "@/lib/portal-notifications";
import { requirePortalApiRole } from "@/lib/portal-access";
import { rejectCrossSiteRequest } from "@/lib/security";

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (rejectCrossSiteRequest(request)) return Response.json({ error: "مصدر الطلب غير مسموح" }, { status: 403 });
  const access = await requirePortalApiRole(["admin", "manager"]);
  if (!access) return Response.json({ error: "غير مصرح بالرد على طلبات الزوار" }, { status: 403 });

  const id = Number((await context.params).id);
  if (!Number.isInteger(id) || id < 1) return Response.json({ error: "رقم الطلب غير صحيح" }, { status: 400 });

  const db = getDb();
  let replyId: number | null = null;
  let visitorRequest: typeof workforceRequests.$inferSelect | null = null;
  try {
    const payload = await request.json() as Record<string, unknown>;
    const subject = cleanText(payload.subject, 180);
    const body = cleanText(payload.body, 10000);
    if (subject.length < 3 || body.length < 2) {
      return Response.json({ error: "اكتب عنواناً واضحاً ونص الرد" }, { status: 400 });
    }

    visitorRequest = await db.query.workforceRequests.findFirst({ where: eq(workforceRequests.id, id) }) ?? null;
    if (!visitorRequest) return Response.json({ error: "الطلب غير موجود" }, { status: 404 });

    const now = new Date().toISOString();
    const [reply] = await db.insert(workforceRequestReplies).values({
      requestId: visitorRequest.id,
      senderEmail: access.user.email,
      senderName: access.user.displayName,
      recipientEmail: visitorRequest.email,
      subject,
      body,
      deliveryStatus: "pending",
      updatedAt: now,
    }).returning();
    replyId = reply.id;

    const delivery = await sendVisitorReplyEmail({
      to: visitorRequest.email,
      recipientName: visitorRequest.fullName,
      subject,
      body,
      trackingCode: visitorRequest.trackingCode,
      idempotencyKey: `dali-request-reply-${reply.id}`,
    });

    const sentAt = new Date().toISOString();
    const [sentReply] = await db.update(workforceRequestReplies).set({
      deliveryStatus: "sent",
      providerMessageId: delivery.providerMessageId,
      failureReason: null,
      sentAt,
      updatedAt: sentAt,
    }).where(eq(workforceRequestReplies.id, reply.id)).returning();
    const [updatedRequest] = await db.update(workforceRequests).set({
      status: "contacted",
      assignedTo: access.user.email,
      updatedAt: sentAt,
    }).where(eq(workforceRequests.id, visitorRequest.id)).returning();

    await db.insert(portalActivity).values({
      actorEmail: access.user.email,
      action: "visitor-request-reply-sent",
      entityType: "workforce-request",
      entityId: String(visitorRequest.id),
    });
    await emitPortalNotification({
      eventType: "visitor-request-reply-sent",
      title: "تم إرسال رد للزائر",
      message: `${visitorRequest.trackingCode} — أُرسل الرد إلى ${visitorRequest.email}.`,
      severity: "success",
      module: "workforce",
      entityType: "workforce-request",
      entityId: visitorRequest.id,
      actionView: "workforce",
      targetDepartment: "workforce",
    });

    return Response.json({ reply: sentReply, request: updatedRequest }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN";
    let failedReply: typeof workforceRequestReplies.$inferSelect | null = null;
    if (replyId) {
      [failedReply] = await db.update(workforceRequestReplies).set({
        deliveryStatus: message === "EMAIL_NOT_CONFIGURED" ? "configuration_required" : "failed",
        failureReason: message.slice(0, 500),
        updatedAt: new Date().toISOString(),
      }).where(eq(workforceRequestReplies.id, replyId)).returning().catch(() => [null]);
    }
    if (visitorRequest) {
      await emitPortalNotification({
        eventType: "visitor-request-reply-failed",
        title: message === "EMAIL_NOT_CONFIGURED" ? "خدمة البريد تحتاج إلى تهيئة" : "تعذّر إرسال رد للزائر",
        message: `${visitorRequest.trackingCode} — لم يُرسل الرد إلى ${visitorRequest.email}.`,
        severity: "critical",
        module: "workforce",
        entityType: "workforce-request",
        entityId: visitorRequest.id,
        actionView: "workforce",
        targetRole: message === "EMAIL_NOT_CONFIGURED" ? "admin" : null,
      }).catch(() => undefined);
    }
    const clientMessage = message === "EMAIL_NOT_CONFIGURED"
      ? "خدمة البريد غير مهيأة بعد. حُفظت المحاولة في سجل الطلب ولم تُرسل الرسالة."
      : "تعذّر تسليم الرسالة عبر البريد. حُفظت المحاولة ويمكن إعادة الإرسال بعد معالجة السبب.";
    return Response.json({ error: clientMessage, reply: failedReply }, { status: message === "EMAIL_NOT_CONFIGURED" ? 503 : 502 });
  }
}
