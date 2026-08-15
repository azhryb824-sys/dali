import { desc, eq, ne } from "drizzle-orm";
import { getDb } from "@/db";
import {
  companyDocuments,
  capacityPlans,
  contractProfessions,
  contractWorkerAssignments,
  financialRecords,
  dataSubjectRequests,
  integrationOutbox,
  legalRecords,
  portalNotificationReads,
  portalNotifications,
  portalSettings,
  portalUsers,
  visitorConversations,
  quoteVersions,
  workflowApprovals,
  workerAttachments,
  workers,
  workforceContracts,
  workOrders,
} from "@/db/schema";
import { getBusinessHoursState } from "@/lib/business-hours";
import { emailDeliveryConfigured } from "@/lib/email-delivery";
import type { PortalAccess, PortalDepartment, PortalRole } from "@/lib/portal-access";
import { requirementsForProfession } from "@/lib/workforce-requirements";

export type NotificationSeverity = "info" | "success" | "warning" | "critical";
export type NotificationModule = "overview" | "notifications" | "employees" | "finance" | "legal" | "workforce" | "conversations" | "documents" | "users" | "sales" | "operations" | "privacy" | "capacity" | "website";

export type PortalNotificationInput = {
  eventType: string;
  title: string;
  message: string;
  severity?: NotificationSeverity;
  module?: NotificationModule;
  entityType?: string | null;
  entityId?: string | number | null;
  targetRole?: PortalRole | null;
  targetDepartment?: PortalDepartment | null;
  targetEmail?: string | null;
  actionView?: NotificationModule | null;
  dedupeKey?: string | null;
  source?: "event" | "system-check";
};

function normalizeEmail(value: string | null | undefined) {
  return value?.trim().toLowerCase() || null;
}

function daysUntil(value: string | null) {
  if (!value) return Number.POSITIVE_INFINITY;
  const target = new Date(`${value}T00:00:00`).getTime();
  return Math.ceil((target - Date.now()) / 86400000);
}

function formatAlertDate(value: string | null) {
  if (!value) return "غير محدد";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ar-SA", { day: "numeric", month: "short", year: "numeric" }).format(date);
}

export async function emitPortalNotification(input: PortalNotificationInput) {
  const db = getDb();
  const now = new Date().toISOString();
  const values = {
    eventType: input.eventType.slice(0, 80),
    title: input.title.trim().slice(0, 180),
    message: input.message.trim().slice(0, 700),
    severity: input.severity ?? "info",
    module: input.module ?? "overview",
    entityType: input.entityType?.slice(0, 80) || null,
    entityId: input.entityId == null ? null : String(input.entityId).slice(0, 120),
    targetRole: input.targetRole ?? null,
    targetDepartment: input.targetDepartment ?? null,
    targetEmail: normalizeEmail(input.targetEmail),
    actionView: input.actionView ?? input.module ?? "overview",
    dedupeKey: input.dedupeKey?.slice(0, 240) || null,
    source: input.source ?? "event",
    status: "active",
    updatedAt: now,
  };

  if (values.dedupeKey) {
    const [notification] = await db
      .insert(portalNotifications)
      .values(values)
      .onConflictDoUpdate({
        target: portalNotifications.dedupeKey,
        set: {
          eventType: values.eventType,
          title: values.title,
          message: values.message,
          severity: values.severity,
          module: values.module,
          entityType: values.entityType,
          entityId: values.entityId,
          targetRole: values.targetRole,
          targetDepartment: values.targetDepartment,
          targetEmail: values.targetEmail,
          actionView: values.actionView,
          source: values.source,
          status: "active",
          updatedAt: now,
        },
      })
      .returning();
    return notification;
  }

  const [notification] = await db.insert(portalNotifications).values(values).returning();
  return notification;
}

function notificationVisibleTo(
  access: Pick<PortalAccess, "role" | "department" | "user">,
  notification: typeof portalNotifications.$inferSelect,
) {
  const email = normalizeEmail(access.user.email);
  if (notification.targetEmail && normalizeEmail(notification.targetEmail) !== email) return false;
  if (notification.targetEmail && normalizeEmail(notification.targetEmail) === email) return true;
  if (access.role === "admin") return true;
  if (notification.targetRole && notification.targetRole !== access.role) return false;
  if (access.role === "manager") return true;
  if (notification.targetDepartment) return notification.targetDepartment === access.department;
  if (notification.module === access.department) return true;
  return notification.module === "documents" && (access.department === "legal" || access.department === "finance");
}

export async function listPortalNotifications(access: Pick<PortalAccess, "role" | "department" | "user">) {
  const db = getDb();
  const [notifications, reads] = await Promise.all([
    db.select().from(portalNotifications).where(eq(portalNotifications.status, "active")).orderBy(desc(portalNotifications.updatedAt)).limit(300),
    db.select().from(portalNotificationReads).where(eq(portalNotificationReads.userEmail, normalizeEmail(access.user.email)!)).limit(1000),
  ]);
  const readById = new Map(reads.map((item) => [item.notificationId, item]));
  return notifications
    .filter((item) => notificationVisibleTo(access, item))
    .filter((item) => !readById.get(item.id)?.dismissedAt)
    .map((item) => ({ ...item, readAt: readById.get(item.id)?.readAt ?? null }));
}

export async function refreshOperationalNotifications(options: { force?: boolean } = {}) {
  const db = getDb();
  const now = new Date();
  const marker = await db.query.portalSettings.findFirst({ where: eq(portalSettings.key, "operational-notifications-last-refresh") });
  if (!options.force && marker && now.getTime() - new Date(marker.updatedAt).getTime() < 5 * 60 * 1000) return;
  await db.insert(portalSettings).values({ key: "operational-notifications-last-refresh", valueJson: JSON.stringify({ refreshedAt: now.toISOString() }), updatedBy: "system", updatedAt: now.toISOString() }).onConflictDoUpdate({ target: portalSettings.key, set: { valueJson: JSON.stringify({ refreshedAt: now.toISOString() }), updatedBy: "system", updatedAt: now.toISOString() } });

  const [documents, legalItems, workerItems, workerFiles, financeItems, users, contracts, professions, assignments, conversations, businessHours, privacyRequests, quotes, orders, approvals, outboxEvents, plans] = await Promise.all([
    db.select().from(companyDocuments).where(eq(companyDocuments.status, "active")).limit(1000),
    db.select().from(legalRecords).where(ne(legalRecords.status, "closed")).limit(1000),
    db.select().from(workers).limit(2000),
    db.select().from(workerAttachments).limit(10000),
    db.select().from(financialRecords).limit(2000),
    db.select().from(portalUsers).limit(500),
    db.select().from(workforceContracts).where(eq(workforceContracts.status, "active")).limit(1000),
    db.select().from(contractProfessions).limit(5000),
    db.select().from(contractWorkerAssignments).where(eq(contractWorkerAssignments.status, "active")).limit(15000),
    db.select().from(visitorConversations).where(ne(visitorConversations.status, "closed")).limit(1000),
    getBusinessHoursState(),
    db.select().from(dataSubjectRequests).where(ne(dataSubjectRequests.status, "completed")).limit(500),
    db.select().from(quoteVersions).where(ne(quoteVersions.status, "accepted")).limit(1000),
    db.select().from(workOrders).where(ne(workOrders.status, "completed")).limit(1000),
    db.select().from(workflowApprovals).where(eq(workflowApprovals.status, "pending")).limit(1000),
    db.select().from(integrationOutbox).where(ne(integrationOutbox.status, "processed")).limit(500),
    db.select().from(capacityPlans).where(ne(capacityPlans.status, "completed")).limit(1000),
  ]);

  const pendingChecks = new Map<string, PortalNotificationInput & { dedupeKey: string }>();
  const ensure = (input: PortalNotificationInput & { dedupeKey: string }) => {
    pendingChecks.set(input.dedupeKey, input);
  };

  if (!emailDeliveryConfigured()) {
    ensure({
      dedupeKey: "system:email-delivery-not-configured",
      eventType: "email-delivery-not-configured",
      title: "الردود البريدية غير مفعّلة",
      message: "أضف مفتاح خدمة الإرسال وبريد المرسل لتفعيل الرد على طلبات زوار الموقع من داخل النظام.",
      severity: "critical",
      module: "users",
      entityType: "system-setting",
      entityId: "email-delivery",
      actionView: "overview",
      targetRole: "admin",
    });
  }

  for (const request of privacyRequests) {
    const dueDays = Math.ceil((new Date(request.dueAt).getTime() - Date.now()) / 86400000);
    if (dueDays > 5) continue;
    ensure({ dedupeKey: `privacy-request-due:${request.id}`, eventType: dueDays < 0 ? "privacy-request-overdue" : "privacy-request-due", title: dueDays < 0 ? "طلب خصوصية تجاوز المستهدف" : "طلب خصوصية يقترب من موعده", message: `${request.trackingCode} — ${request.fullName} — الحالة ${request.status}.`, severity: dueDays < 0 ? "critical" : "warning", module: "privacy", entityType: "data-subject-request", entityId: request.id, actionView: "operations", targetRole: "admin" });
  }
  for (const quote of quotes) {
    if (!["approved", "sent"].includes(quote.status)) continue;
    const days = daysUntil(quote.validUntil);
    if (!Number.isFinite(days) || days > 7) continue;
    ensure({ dedupeKey: `quote-expiry:${quote.id}:${quote.validUntil}`, eventType: days < 0 ? "quote-expired" : "quote-expiring", title: days < 0 ? "عرض سعر منتهي" : "عرض سعر ينتهي قريباً", message: `${quote.quoteCode} — الإصدار ${quote.versionNumber} — ${formatAlertDate(quote.validUntil)}.`, severity: days < 0 ? "critical" : "warning", module: "sales", entityType: "quote-version", entityId: quote.id, actionView: "operations", targetDepartment: "workforce" });
  }
  for (const order of orders) {
    if (order.status !== "staffing") continue;
    const days = daysUntil(order.startDate);
    if (!Number.isFinite(days) || days > 7) continue;
    ensure({ dedupeKey: `work-order-staffing:${order.id}`, eventType: "work-order-staffing-due", title: "أمر تشغيل يحتاج إلى استكمال العمالة", message: `${order.workOrderCode} — ${order.title} — يبدأ ${formatAlertDate(order.startDate)}.`, severity: days <= 2 ? "critical" : "warning", module: "operations", entityType: "work-order", entityId: order.id, actionView: "operations", targetDepartment: "workforce" });
  }
  for (const approval of approvals) {
    ensure({ dedupeKey: `workflow-approval:${approval.id}`, eventType: "workflow-approval-pending", title: "موافقة تشغيلية معلقة", message: `${approval.entityType} — خطوة ${approval.step}.`, severity: "warning", module: approval.entityType.includes("quote") ? "sales" : "operations", entityType: approval.entityType, entityId: approval.entityId, actionView: "operations", targetRole: (approval.assignedRole as PortalRole | null) || "manager", targetEmail: approval.assignedEmail });
  }
  for (const item of outboxEvents) {
    const ageMinutes = Math.floor((Date.now() - new Date(item.createdAt).getTime()) / 60000);
    if (item.status !== "failed" && ageMinutes < 15) continue;
    const failed = item.status === "failed";
    ensure({ dedupeKey: `outbox-attention:${item.id}`, eventType: failed ? "integration-event-failed" : "integration-event-delayed", title: failed ? "فشل حدث تكامل" : "حدث تكامل متأخر", message: `${item.eventType} — ${failed ? item.lastError || "يحتاج إلى إعادة المحاولة" : `معلّق منذ ${ageMinutes} دقيقة`}.`, severity: failed ? "critical" : "warning", module: "users", entityType: "integration-outbox", entityId: item.id, actionView: "operations", targetRole: "admin" });
  }
  for (const plan of plans) {
    const shortfall = plan.requiredCount - plan.availableCount - plan.reservedCount;
    if (shortfall <= 0 || !["planning", "approved", "active"].includes(plan.status)) continue;
    ensure({ dedupeKey: `capacity-shortfall:${plan.id}`, eventType: "capacity-plan-shortfall", title: "فجوة في خطة السعة الموسمية", message: `${plan.seasonName} — ${plan.profession} — نقص ${shortfall} عامل في ${plan.location}.`, severity: daysUntil(plan.startDate) <= 14 ? "critical" : "warning", module: "capacity", entityType: "capacity-plan", entityId: plan.id, actionView: "operations", targetDepartment: "workforce" });
  }

  for (const document of documents) {
    const days = daysUntil(document.expiryDate);
    if (!Number.isFinite(days) || days > 30) continue;
    const expired = days < 0;
    ensure({
      dedupeKey: `document-expiry:${document.id}:${document.expiryDate}`,
      eventType: expired ? "document-expired" : "document-expiring",
      title: expired ? "مستند شركة منتهي" : "مستند يقترب من الانتهاء",
      message: `${document.title} ${expired ? "انتهت صلاحيته" : `تنتهي صلاحيته خلال ${days} يوم`} (${formatAlertDate(document.expiryDate)}).`,
      severity: expired ? "critical" : "warning",
      module: "documents",
      entityType: "company-document",
      entityId: document.id,
      actionView: "documents",
    });
  }

  for (const item of legalItems) {
    const days = daysUntil(item.expiryDate);
    if (!Number.isFinite(days) || days > 30) continue;
    const expired = days < 0;
    ensure({
      dedupeKey: `legal-expiry:${item.id}:${item.expiryDate}`,
      eventType: expired ? "legal-record-expired" : "legal-record-expiring",
      title: expired ? "ملف قانوني تجاوز موعده" : "موعد قانوني خلال 30 يوماً",
      message: `${item.title} — ${item.counterparty} — ${formatAlertDate(item.expiryDate)}.`,
      severity: expired ? "critical" : "warning",
      module: "legal",
      entityType: "legal-record",
      entityId: item.id,
      actionView: "legal",
      targetDepartment: "legal",
    });
  }

  const filesByWorker = new Map<number, typeof workerFiles>();
  for (const file of workerFiles) filesByWorker.set(file.workerId, [...(filesByWorker.get(file.workerId) ?? []), file]);
  for (const worker of workerItems) {
    const days = daysUntil(worker.iqamaExpiry);
    if (Number.isFinite(days) && days <= 30) {
      const expired = days < 0;
      ensure({
        dedupeKey: `worker-iqama:${worker.id}:${worker.iqamaExpiry}`,
        eventType: expired ? "worker-iqama-expired" : "worker-iqama-expiring",
        title: expired ? "إقامة عامل منتهية" : "إقامة عامل تنتهي قريباً",
        message: `${worker.fullName} — ${worker.profession} — ${expired ? "منتهية" : `متبقٍ ${days} يوم`}.`,
        severity: expired ? "critical" : "warning",
        module: "workforce",
        entityType: "worker",
        entityId: worker.id,
        actionView: "workforce",
        targetDepartment: "workforce",
      });
    }

    const workerFileItems = filesByWorker.get(worker.id) ?? [];
    const uploadedCodes = new Set(workerFileItems.map((item) => item.requirementCode).filter(Boolean));
    const missing = requirementsForProfession(worker.profession).filter((item) => !uploadedCodes.has(item.code));
    const hasPhoto = workerFileItems.some((item) => item.documentType === "photo");
    const missingCount = missing.length + (hasPhoto ? 0 : 1) + (worker.iqamaNumber ? 0 : 1);
    if (missingCount > 0) {
      ensure({
        dedupeKey: `worker-file-incomplete:${worker.id}`,
        eventType: "worker-file-incomplete",
        title: "ملف عامل غير مكتمل",
        message: `${worker.fullName} — ينقص الملف ${missingCount} من متطلبات الجاهزية للمهنة.`,
        severity: "warning",
        module: "workforce",
        entityType: "worker",
        entityId: worker.id,
        actionView: "workforce",
        targetDepartment: "workforce",
      });
    }
  }

  for (const item of financeItems) {
    const days = daysUntil(item.dueDate);
    if (item.status === "paid" || !Number.isFinite(days) || days > 7) continue;
    const overdue = days < 0 || item.status === "overdue";
    ensure({
      dedupeKey: `finance-due:${item.id}:${item.dueDate}`,
      eventType: overdue ? "finance-overdue" : "finance-due-soon",
      title: overdue ? "استحقاق مالي متأخر" : "استحقاق مالي قريب",
      message: `${item.referenceCode} — ${item.description} — ${formatAlertDate(item.dueDate)}.`,
      severity: overdue ? "critical" : "warning",
      module: "finance",
      entityType: "financial-record",
      entityId: item.id,
      actionView: "finance",
      targetDepartment: "finance",
    });
  }

  const pendingUsers = users.filter((item) => item.status === "pending");
  for (const user of pendingUsers) {
    const requestComplete = Boolean(user.requestSubmittedAt && user.termsAcceptedAt);
    ensure({
      dedupeKey: `portal-user-pending:${user.email}`,
      eventType: "portal-user-pending",
      title: requestComplete ? "طلب انضمام مكتمل ينتظر الاعتماد" : "حساب لم يستكمل طلب الانضمام",
      message: requestComplete
        ? `${user.displayName} — ${user.requestedJobTitle || "دون مسمى"} — القسم المطلوب: ${user.requestedDepartment || "غير محدد"}.`
        : `${user.displayName} (${user.email}) تحققت هويته ولم يستكمل سبب الوصول وضوابط الاستخدام.`,
      severity: requestComplete ? "warning" : "info",
      module: "users",
      entityType: "portal-user",
      entityId: user.email,
      actionView: "users",
      targetRole: "admin",
    });
  }

  const requiredByContract = new Map<number, number>();
  for (const profession of professions) {
    requiredByContract.set(profession.contractId, (requiredByContract.get(profession.contractId) ?? 0) + profession.requiredCount);
  }
  const assignedByContract = new Map<number, number>();
  for (const assignment of assignments) {
    assignedByContract.set(assignment.contractId, (assignedByContract.get(assignment.contractId) ?? 0) + 1);
  }
  for (const contract of contracts) {
    const required = requiredByContract.get(contract.id) ?? 0;
    const assigned = assignedByContract.get(contract.id) ?? 0;
    if (assigned >= required) continue;
    const daysToStart = daysUntil(contract.startDate);
    const urgent = Number.isFinite(daysToStart) && daysToStart <= 7;
    ensure({
      dedupeKey: `contract-shortage:${contract.id}`,
      eventType: "contract-workforce-shortage",
      title: "عقد يحتاج إلى استكمال العمالة",
      message: `${contract.referenceCode} — ${contract.clientName} — متبقٍ ${Math.max(0, required - assigned)} عامل${urgent ? `، وموعد البدء ${formatAlertDate(contract.startDate)}` : ""}.`,
      severity: urgent ? "critical" : "warning",
      module: "workforce",
      entityType: "workforce-contract",
      entityId: contract.id,
      actionView: "workforce",
      targetDepartment: "workforce",
    });
  }

  if (businessHours.isOpen) {
    for (const conversation of conversations) {
      if (conversation.status !== "waiting") continue;
      const waitingMinutes = Math.floor((Date.now() - new Date(conversation.lastVisitorMessageAt).getTime()) / 60000);
      if (!Number.isFinite(waitingMinutes) || waitingMinutes < 10) continue;
      const waitingLabel = waitingMinutes >= 30 ? "أكثر من 30 دقيقة" : "أكثر من 10 دقائق";
      ensure({
        dedupeKey: `conversation-waiting:${conversation.id}`,
        eventType: "live-chat-waiting",
        title: "محادثة تنتظر الرد",
        message: `${conversation.trackingCode} — ${conversation.visitorName} ينتظر منذ ${waitingLabel}.`,
        severity: waitingMinutes >= 30 ? "critical" : "warning",
        module: "conversations",
        entityType: "visitor-conversation",
        entityId: conversation.id,
        actionView: "conversations",
        targetDepartment: "workforce",
      });
    }
  }

  const previousChecks = await db.select()
    .from(portalNotifications)
    .where(eq(portalNotifications.source, "system-check"))
    .limit(10000);

  const previousByKey = new Map(previousChecks.filter((item) => item.dedupeKey).map((item) => [item.dedupeKey!, item]));
  for (const check of pendingChecks.values()) {
    const previous = previousByKey.get(check.dedupeKey);
    const nextEntityId = check.entityId == null ? null : String(check.entityId);
    const changed = !previous
      || previous.status !== "active"
      || previous.eventType !== check.eventType
      || previous.title !== check.title
      || previous.message !== check.message
      || previous.severity !== (check.severity ?? "info")
      || previous.module !== (check.module ?? "overview")
      || previous.entityType !== (check.entityType ?? null)
      || previous.entityId !== nextEntityId
      || previous.targetRole !== (check.targetRole ?? null)
      || previous.targetDepartment !== (check.targetDepartment ?? null)
      || previous.actionView !== (check.actionView ?? check.module ?? "overview");
    if (!changed) continue;

    const saved = await emitPortalNotification({ ...check, source: "system-check" });
    if (previous && (previous.status !== "active" || previous.severity !== (check.severity ?? "info"))) {
      await db.delete(portalNotificationReads).where(eq(portalNotificationReads.notificationId, saved.id));
    }
  }

  const activeKeys = new Set(pendingChecks.keys());
  const staleIds = previousChecks
    .filter((item) => item.status === "active" && item.dedupeKey && !activeKeys.has(item.dedupeKey))
    .map((item) => item.id);
  for (const id of staleIds) {
    await db.update(portalNotifications).set({ status: "resolved", updatedAt: new Date().toISOString() }).where(eq(portalNotifications.id, id));
  }
}
