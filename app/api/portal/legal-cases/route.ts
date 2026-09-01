import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  bankAccounts,
  financialRecords,
  journalEntries,
  legalCaseActionLog,
  legalCaseActivities,
  legalCaseAttachments,
  legalExternalShares,
  legalJudgmentPaymentRequests,
  legalLawyers,
  legalRecords,
} from "@/db/schema";
import { createDraftJournal, resolvePostingRule } from "@/lib/accounting";
import { auditPortalAction } from "@/lib/audit";
import { emitPortalNotification } from "@/lib/portal-notifications";
import { hasPortalPermission, requirePortalApiRole } from "@/lib/portal-access";
import {
  jsonNoStore,
  readLimitedJson,
  rejectCrossSiteRequest,
} from "@/lib/security";

const clean = (value: unknown, max = 1000) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";
type LegalActor = NonNullable<Awaited<ReturnType<typeof requirePortalApiRole>>>;
async function access(write = false) {
  const actor = await requirePortalApiRole(["admin", "manager", "employee"]);
  return actor &&
    (await hasPortalPermission(actor, "legal", write ? "write" : "read"))
    ? actor
    : null;
}
function isOwner(actor: LegalActor) {
  return (
    actor.role === "admin" ||
    actor.functionalRoles.some((role) =>
      ["system_owner", "system_admin"].includes(role),
    )
  );
}
function isSupervisor(actor: LegalActor) {
  return (
    actor.role === "admin" ||
    actor.functionalRoles.some((role) =>
      ["system_owner", "system_admin", "legal_supervisor"].includes(role),
    )
  );
}
function isCaseManager(actor: LegalActor) {
  return (
    isSupervisor(actor) ||
    actor.functionalRoles.includes("lawyer")
  );
}
function actorRole(actor: LegalActor) {
  if (actor.functionalRoles.includes("legal_supervisor"))
    return "legal_supervisor";
  if (actor.functionalRoles.includes("legal_lawyer")) return "legal_lawyer";
  if (actor.functionalRoles.includes("lawyer")) return "lawyer";
  if (actor.functionalRoles.includes("system_owner")) return "system_owner";
  if (actor.functionalRoles.includes("system_admin") || actor.role === "admin")
    return "system_admin";
  return "legal_staff";
}
function canAccessMatter(
  actor: LegalActor,
  matter: { assignedLawyerEmail: string | null },
) {
  return (
    isCaseManager(actor) ||
    matter.assignedLawyerEmail?.toLowerCase() === actor.user.email.toLowerCase()
  );
}

export async function GET() {
  const actor = await access();
  if (!actor) return jsonNoStore({ error: "غير مصرح" }, { status: 403 });
  const db = getDb();
  const cases = isCaseManager(actor)
    ? await db
        .select()
        .from(legalRecords)
        .orderBy(asc(legalRecords.status), asc(legalRecords.createdAt))
    : await db
        .select()
        .from(legalRecords)
        .where(
          eq(legalRecords.assignedLawyerEmail, actor.user.email.toLowerCase()),
        )
        .orderBy(asc(legalRecords.status), asc(legalRecords.createdAt));
  const caseIds = cases.map((item) => item.id);
  const visibleCase = caseIds.length
    ? inArray(legalCaseActivities.legalRecordId, caseIds)
    : sql`false`;
  const [
    activities,
    attachments,
    actionLog,
    judgmentPayments,
    banks,
    lawyers,
    externalShares,
  ] =
    await Promise.all([
      db
        .select()
        .from(legalCaseActivities)
        .where(visibleCase)
        .orderBy(
          asc(legalCaseActivities.dueAt),
          asc(legalCaseActivities.createdAt),
        ),
      db
        .select()
        .from(legalCaseAttachments)
        .where(
          caseIds.length
            ? inArray(legalCaseAttachments.legalRecordId, caseIds)
            : sql`false`,
        )
        .orderBy(asc(legalCaseAttachments.createdAt)),
      db
        .select()
        .from(legalCaseActionLog)
        .where(
          caseIds.length
            ? inArray(legalCaseActionLog.legalRecordId, caseIds)
            : sql`false`,
        )
        .orderBy(asc(legalCaseActionLog.createdAt)),
      db
        .select()
        .from(legalJudgmentPaymentRequests)
        .where(
          caseIds.length
            ? inArray(legalJudgmentPaymentRequests.legalRecordId, caseIds)
            : sql`false`,
        )
        .orderBy(asc(legalJudgmentPaymentRequests.requestedAt)),
      db
        .select()
        .from(bankAccounts)
        .where(eq(bankAccounts.status, "active"))
        .orderBy(asc(bankAccounts.bankName)),
      db
        .select()
        .from(legalLawyers)
        .orderBy(asc(legalLawyers.status), asc(legalLawyers.fullName)),
      db
        .select({
          id: legalExternalShares.id,
          legalRecordId: legalExternalShares.legalRecordId,
          attachmentId: legalExternalShares.attachmentId,
          lawyerId: legalExternalShares.lawyerId,
          channel: legalExternalShares.channel,
          expiresAt: legalExternalShares.expiresAt,
          revokedAt: legalExternalShares.revokedAt,
          revokedBy: legalExternalShares.revokedBy,
          maxDownloads: legalExternalShares.maxDownloads,
          downloadCount: legalExternalShares.downloadCount,
          lastAccessedAt: legalExternalShares.lastAccessedAt,
          sharedBy: legalExternalShares.sharedBy,
          sharedAt: legalExternalShares.sharedAt,
        })
        .from(legalExternalShares)
        .where(
          caseIds.length
            ? inArray(legalExternalShares.legalRecordId, caseIds)
            : sql`false`,
        )
        .orderBy(desc(legalExternalShares.sharedAt)),
    ]);
  return jsonNoStore({
    cases,
    activities,
    attachments,
    actionLog,
    judgmentPayments,
    banks,
    lawyers,
    externalShares,
    currentActorEmail: actor.user.email,
    currentActorRole: actorRole(actor),
    canWrite: await hasPortalPermission(actor, "legal", "write"),
    canApprove: await hasPortalPermission(actor, "legal", "approve"),
    canManageCases: isCaseManager(actor),
    canSupervise: isSupervisor(actor),
    canShareExternally: isCaseManager(actor),
    canPayJudgments: isOwner(actor),
  });
}

export async function POST(request: Request) {
  if (rejectCrossSiteRequest(request))
    return jsonNoStore({ error: "مصدر الطلب غير مسموح" }, { status: 403 });
  const actor = await access(true);
  if (!actor) return jsonNoStore({ error: "غير مصرح" }, { status: 403 });
  const parsed = await readLimitedJson(request, 10000);
  if (!parsed.ok) return parsed.response;
  const body = parsed.value as Record<string, unknown>;
  const requestAction = clean(body.action, 40);
  if (requestAction === "request-judgment-payment") {
    const legalRecordId = Number(body.legalRecordId),
      amountHalalas = Math.round(Number(body.amount) * 100),
      description = clean(body.description, 1000);
    if (
      !Number.isInteger(legalRecordId) ||
      legalRecordId < 1 ||
      !Number.isSafeInteger(amountHalalas) ||
      amountHalalas < 1 ||
      description.length < 5
    )
      return jsonNoStore(
        { error: "بيانات طلب سداد المحكوم به غير مكتملة" },
        { status: 400 },
      );
    const db = getDb();
    const matter = await db.query.legalRecords.findFirst({
      where: eq(legalRecords.id, legalRecordId),
    });
    if (!matter)
      return jsonNoStore(
        { error: "الملف القانوني غير موجود" },
        { status: 404 },
      );
    if (!canAccessMatter(actor, matter))
      return jsonNoStore({ error: "القضية غير مسندة إليك" }, { status: 403 });
    const [openRequest] = await db
      .select({
        total: sql<number>`coalesce(sum(${legalJudgmentPaymentRequests.amountHalalas}),0)`,
      })
      .from(legalJudgmentPaymentRequests)
      .where(
        and(
          eq(legalJudgmentPaymentRequests.legalRecordId, legalRecordId),
          inArray(legalJudgmentPaymentRequests.status, [
            "requested",
            "changes_requested",
            "paid",
          ]),
        ),
      );
    if (
      (matter.judgmentAmountHalalas || 0) > 0 &&
      Number(openRequest?.total || 0) + amountHalalas >
        Number(matter.judgmentAmountHalalas)
    )
      return jsonNoStore(
        { error: "إجمالي طلبات السداد يتجاوز قيمة الحكم المسجلة" },
        { status: 409 },
      );
    const duplicate = await db.query.legalJudgmentPaymentRequests.findFirst({
      where: and(
        eq(legalJudgmentPaymentRequests.legalRecordId, legalRecordId),
        eq(legalJudgmentPaymentRequests.description, description),
        inArray(legalJudgmentPaymentRequests.status, [
          "requested",
          "changes_requested",
        ]),
      ),
    });
    if (duplicate)
      return jsonNoStore(
        { error: "يوجد طلب سداد قائم لنفس الحكم والوصف" },
        { status: 409 },
      );
    const saved = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(legalJudgmentPaymentRequests)
        .values({
          legalRecordId,
          amountHalalas,
          description,
          requestedBy: actor.user.email,
        })
        .returning();
      await tx.insert(legalCaseActionLog).values({
        legalRecordId,
        activityId: null,
        action: "created",
        details: `طلب سداد محكوم به بقيمة ${(amountHalalas / 100).toFixed(2)} ر.س — ${description}`,
        actorEmail: actor.user.email,
        actorRole: actorRole(actor),
      });
      return row;
    });
    await auditPortalAction({
      actorEmail: actor.user.email,
      action: "legal-judgment-payment-requested",
      entityType: "legal-judgment-payment",
      entityId: saved.id,
      after: saved,
    });
    await emitPortalNotification({
      eventType: "legal-judgment-payment-requested",
      title: "طلب سداد محكوم به",
      message: `${matter.referenceCode} — ${(amountHalalas / 100).toFixed(2)} ر.س`,
      severity: "critical",
      module: "legal",
      entityType: "legal-record",
      entityId: legalRecordId,
      actionView: "legal",
      targetRole: "admin",
    }).catch(() => undefined);
    return jsonNoStore({ payment: saved }, { status: 201 });
  }
  const legalRecordId = Number(body.legalRecordId);
  const activityType = clean(body.activityType, 30);
  const title = clean(body.title, 180);
  const details = clean(body.details, 5000);
  const priority = clean(body.priority, 20) || "medium";
  const dueAt = clean(body.dueAt, 30) || null;
  const requestedAssignee = clean(body.assignedTo, 180) || null;
  const assignedTo = isCaseManager(actor)
    ? requestedAssignee
    : actor.user.email || null;
  if (
    !Number.isInteger(legalRecordId) ||
    legalRecordId < 1 ||
    title.length < 3 ||
    ![
      "task",
      "deadline",
      "note",
      "communication",
      "hearing",
      "settlement",
    ].includes(activityType) ||
    !["low", "medium", "high", "critical"].includes(priority)
  )
    return jsonNoStore(
      { error: "بيانات نشاط القضية غير مكتملة" },
      { status: 400 },
    );
  const db = getDb();
  const matter = await db.query.legalRecords.findFirst({
    where: eq(legalRecords.id, legalRecordId),
  });
  if (!matter)
    return jsonNoStore({ error: "الملف القانوني غير موجود" }, { status: 404 });
  if (!canAccessMatter(actor, matter))
    return jsonNoStore({ error: "القضية غير مسندة إليك" }, { status: 403 });
  const now = new Date().toISOString();
  const saved = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(legalCaseActivities)
      .values({
        legalRecordId,
        activityType,
        title,
        details: details || null,
        priority,
        dueAt,
        assignedTo,
        createdBy: actor.user.email,
        updatedAt: now,
      })
      .returning();
    await tx.insert(legalCaseActionLog).values({
      legalRecordId,
      activityId: row.id,
      action:
        assignedTo && assignedTo !== actor.user.email ? "assigned" : "created",
      fromStatus: null,
      toStatus: "open",
      details: assignedTo
        ? `الإجراء: ${title} — أُسند إلى ${assignedTo}`
        : `الإجراء: ${title}`,
      actorEmail: actor.user.email,
      actorRole: actorRole(actor),
    });
    return row;
  });
  await auditPortalAction({
    actorEmail: actor.user.email,
    action: "legal-case-activity-created",
    entityType: "legal-case-activity",
    entityId: saved.id,
    after: { ...saved, actorRole: actorRole(actor) },
  });
  await emitPortalNotification({
    eventType: "legal-case-activity-created",
    title:
      activityType === "deadline" ? "أضيف موعد قانوني" : "أضيف إجراء إلى قضية",
    message: `${matter.referenceCode} — ${title}`,
    severity:
      priority === "critical"
        ? "critical"
        : priority === "high"
          ? "warning"
          : "info",
    module: "legal",
    entityType: "legal-record",
    entityId: legalRecordId,
    actionView: "legal",
    targetDepartment: "legal",
    targetEmail: assignedTo,
  }).catch(() => undefined);
  return jsonNoStore({ activity: saved }, { status: 201 });
}

export async function PATCH(request: Request) {
  if (rejectCrossSiteRequest(request))
    return jsonNoStore({ error: "مصدر الطلب غير مسموح" }, { status: 403 });
  const actor = await access(true);
  if (!actor) return jsonNoStore({ error: "غير مصرح" }, { status: 403 });
  const parsed = await readLimitedJson(request, 5000);
  if (!parsed.ok) return parsed.response;
  const body = parsed.value as Record<string, unknown>;
  const actionRequest = clean(body.action, 30);
  const db = getDb();
  if (actionRequest === "update-case-details") {
    if (!isCaseManager(actor))
      return jsonNoStore(
        { error: "تحديث بيانات الملف من صلاحيات مدير القضايا" },
        { status: 403 },
      );
    const legalRecordId = Number(body.legalRecordId),
      before = await db.query.legalRecords.findFirst({
        where: eq(legalRecords.id, legalRecordId),
      });
    if (!before)
      return jsonNoStore(
        { error: "الملف القانوني غير موجود" },
        { status: 404 },
      );
    const toAmount = (value: unknown) => {
      const number = Math.round(Number(value || 0) * 100);
      return Number.isSafeInteger(number) && number >= 0 ? number : null;
    };
    const claimAmountHalalas = toAmount(body.claimAmount),
      judgmentAmountHalalas = toAmount(body.judgmentAmount);
    if (claimAmountHalalas === null || judgmentAmountHalalas === null)
      return jsonNoStore(
        { error: "قيم المطالبة أو الحكم غير صحيحة" },
        { status: 400 },
      );
    const [row] = await db
      .update(legalRecords)
      .set({
        courtCaseNumber: clean(body.courtCaseNumber, 120) || null,
        courtName: clean(body.courtName, 180) || null,
        circuitName: clean(body.circuitName, 180) || null,
        claimType: clean(body.claimType, 120) || null,
        companyCapacity: clean(body.companyCapacity, 80) || null,
        currentHearingNumber: clean(body.currentHearingNumber, 80) || null,
        claimAmountHalalas,
        judgmentAmountHalalas,
        enforcementInstrumentNumber:
          clean(body.enforcementInstrumentNumber, 120) || null,
        opposingCounsel: clean(body.opposingCounsel, 180) || null,
        litigationStage: clean(body.litigationStage, 100) || null,
        litigationLevel: clean(body.litigationLevel, 100) || null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(legalRecords.id, legalRecordId))
      .returning();
    await auditPortalAction({
      actorEmail: actor.user.email,
      action: "legal-case-details-updated",
      entityType: "legal-record",
      entityId: legalRecordId,
      before,
      after: row,
    });
    return jsonNoStore({ case: row });
  }
  if (actionRequest === "update-case-status") {
    if (!isCaseManager(actor))
      return jsonNoStore(
        { error: "تغيير حالة الملف من صلاحيات مدير القضايا" },
        { status: 403 },
      );
    const legalRecordId = Number(body.legalRecordId),
      status = clean(body.status, 30),
      reason = clean(body.reason, 1000);
    if (
      !Number.isInteger(legalRecordId) ||
      !["reviewing", "active", "in_progress", "closed", "cancelled"].includes(
        status,
      )
    )
      return jsonNoStore({ error: "حالة الملف غير صحيحة" }, { status: 400 });
    const matter = await db.query.legalRecords.findFirst({
      where: eq(legalRecords.id, legalRecordId),
    });
    if (!matter)
      return jsonNoStore(
        { error: "الملف القانوني غير موجود" },
        { status: 404 },
      );
    if (status === "closed") {
      const [openActivity, openPayment] = await Promise.all([
        db.query.legalCaseActivities.findFirst({
          where: and(
            eq(legalCaseActivities.legalRecordId, legalRecordId),
            inArray(legalCaseActivities.status, ["open", "in_progress"]),
          ),
        }),
        db.query.legalJudgmentPaymentRequests.findFirst({
          where: and(
            eq(legalJudgmentPaymentRequests.legalRecordId, legalRecordId),
            inArray(legalJudgmentPaymentRequests.status, [
              "requested",
              "changes_requested",
            ]),
          ),
        }),
      ]);
      if (openActivity || openPayment || reason.length < 5)
        return jsonNoStore(
          {
            error:
              "لا يُغلق الملف قبل اكتمال الإجراءات وطلبات السداد وكتابة سبب الإغلاق",
          },
          { status: 409 },
        );
    }
    const now = new Date().toISOString();
    const [row] = await db
      .update(legalRecords)
      .set({
        status,
        closureReason: status === "closed" ? reason : null,
        closedBy: status === "closed" ? actor.user.email : null,
        closedAt: status === "closed" ? now : null,
        updatedAt: now,
      })
      .where(eq(legalRecords.id, legalRecordId))
      .returning();
    await auditPortalAction({
      actorEmail: actor.user.email,
      action: "legal-case-status-updated",
      entityType: "legal-record",
      entityId: legalRecordId,
      before: matter,
      after: row,
      reason,
    });
    return jsonNoStore({ case: row });
  }
  if (
    ["reject-judgment", "cancel-judgment", "request-judgment-changes"].includes(
      actionRequest,
    )
  ) {
    const paymentId = Number(body.paymentId),
      reason = clean(body.reason, 1000);
    if (!Number.isInteger(paymentId) || reason.length < 5)
      return jsonNoStore({ error: "اكتب سبب القرار بوضوح" }, { status: 400 });
    const payment = await db.query.legalJudgmentPaymentRequests.findFirst({
      where: eq(legalJudgmentPaymentRequests.id, paymentId),
    });
    if (
      !payment ||
      !["requested", "changes_requested"].includes(payment.status)
    )
      return jsonNoStore(
        { error: "طلب السداد غير متاح للمعالجة" },
        { status: 409 },
      );
    if (
      actionRequest === "cancel-judgment" &&
      payment.requestedBy !== actor.user.email &&
      !isSupervisor(actor)
    )
      return jsonNoStore(
        { error: "لا يمكن إلغاء طلب مستخدم آخر" },
        { status: 403 },
      );
    if (actionRequest !== "cancel-judgment" && !isSupervisor(actor))
      return jsonNoStore(
        { error: "القرار من صلاحيات المشرف القانوني" },
        { status: 403 },
      );
    const status =
      actionRequest === "reject-judgment"
        ? "rejected"
        : actionRequest === "cancel-judgment"
          ? "cancelled"
          : "changes_requested";
    const [row] = await db
      .update(legalJudgmentPaymentRequests)
      .set({
        status,
        responseReason: reason,
        rejectionReason: status === "rejected" ? reason : null,
        updatedAt: new Date().toISOString(),
      })
      .where(
        and(
          eq(legalJudgmentPaymentRequests.id, payment.id),
          eq(legalJudgmentPaymentRequests.status, payment.status),
        ),
      )
      .returning();
    if (!row)
      return jsonNoStore(
        { error: "تمت معالجة الطلب من مستخدم آخر" },
        { status: 409 },
      );
    await auditPortalAction({
      actorEmail: actor.user.email,
      action: `legal-judgment-${status}`,
      entityType: "legal-judgment-payment",
      entityId: payment.id,
      before: payment,
      after: row,
      reason,
    });
    return jsonNoStore({ payment: row });
  }
  if (actionRequest === "pay-judgment") {
    if (!isOwner(actor))
      return jsonNoStore(
        { error: "تأكيد سداد المحكوم به من صلاحيات المالك أو مشرف النظام" },
        { status: 403 },
      );
    const paymentId = Number(body.paymentId),
      bankAccountId = Number(body.bankAccountId),
      paymentReference = clean(body.paymentReference, 180);
    const [payment, bank] = await Promise.all([
      db.query.legalJudgmentPaymentRequests.findFirst({
        where: eq(legalJudgmentPaymentRequests.id, paymentId),
      }),
      db.query.bankAccounts.findFirst({
        where: and(
          eq(bankAccounts.id, bankAccountId),
          eq(bankAccounts.status, "active"),
        ),
      }),
    ]);
    if (!payment || payment.status !== "requested")
      return jsonNoStore(
        { error: "طلب سداد المحكوم به غير متاح" },
        { status: 409 },
      );
    if (!bank)
      return jsonNoStore(
        { error: "اختر الحساب البنكي الذي تم السداد منه" },
        { status: 409 },
      );
    const matter = await db.query.legalRecords.findFirst({
      where: eq(legalRecords.id, payment.legalRecordId),
    });
    if (!matter)
      return jsonNoStore(
        { error: "الملف القانوني غير موجود" },
        { status: 404 },
      );
    const now = new Date().toISOString();
    let journalId = 0,
      financialId = 0;
    try {
      const [financial] = await db
        .insert(financialRecords)
        .values({
          referenceCode: `FIN-LGL-${payment.id}`,
          category: "legal_judgment",
          subCategory: "court_judgment",
          description: `سداد محكوم به — ${matter.referenceCode} — ${payment.description}`,
          amountHalalas: payment.amountHalalas,
          subtotalHalalas: payment.amountHalalas,
          vatHalalas: 0,
          vatRateBps: 0,
          dueDate: now.slice(0, 10),
          contractId: matter.contractId,
          paymentMethod: "bank_transfer",
          bankAccountId: bank.id,
          notes: paymentReference ? `مرجع العملية: ${paymentReference}` : null,
          status: "paid",
          postingStatus: "unposted",
          updatedAt: now,
        })
        .returning();
      financialId = financial.id;
      const postingRule = await resolvePostingRule("legal_judgment_payment", {
        debitCode: "5290",
        creditCode: bank.accountCode,
      });
      const journal = await createDraftJournal({
        entryDate: now.slice(0, 10),
        description: `سداد محكوم به — ${matter.referenceCode}`,
        sourceType: "financial-record",
        sourceId: String(financial.id),
        actorEmail: actor.user.email,
        lines: [
          {
            accountId: postingRule.debitAccountId,
            debitHalalas: payment.amountHalalas,
            description: payment.description,
            contractId: matter.contractId,
          },
          {
            accountId: bank.ledgerAccountId,
            bankAccountId: bank.id,
            creditHalalas: payment.amountHalalas,
            description: `سداد من ${bank.bankName}${paymentReference ? ` — ${paymentReference}` : ""}`,
            contractId: matter.contractId,
          },
        ],
      });
      journalId = journal.entry.id;
      const result = await db.transaction(async (tx) => {
        await tx
          .update(financialRecords)
          .set({ journalEntryId: journal.entry.id, updatedAt: now })
          .where(eq(financialRecords.id, financial.id));
        const [row] = await tx
          .update(legalJudgmentPaymentRequests)
          .set({
            status: "paid",
            bankAccountId: bank.id,
            journalEntryId: journal.entry.id,
            paidBy: actor.user.email,
            paidAt: now,
            updatedAt: now,
          })
          .where(
            and(
              eq(legalJudgmentPaymentRequests.id, payment.id),
              eq(legalJudgmentPaymentRequests.status, "requested"),
            ),
          )
          .returning();
        if (!row) throw new Error("تمت معالجة الطلب من مستخدم آخر");
        await tx.insert(legalCaseActionLog).values({
          legalRecordId: payment.legalRecordId,
          activityId: null,
          action: "completed",
          fromStatus: "requested",
          toStatus: "paid",
          details: `سداد المحكوم به من ${bank.bankName}; القيد ${journal.entry.entryNumber}`,
          actorEmail: actor.user.email,
          actorRole: actorRole(actor),
        });
        return { payment: row, financial, journal: journal.entry, bank };
      });
      await auditPortalAction({
        actorEmail: actor.user.email,
        action: "legal-judgment-payment-paid",
        entityType: "legal-judgment-payment",
        entityId: payment.id,
        before: payment,
        after: result,
      });
      return jsonNoStore(result);
    } catch (error) {
      if (journalId)
        await db
          .delete(journalEntries)
          .where(eq(journalEntries.id, journalId))
          .catch(() => undefined);
      if (financialId)
        await db
          .delete(financialRecords)
          .where(eq(financialRecords.id, financialId))
          .catch(() => undefined);
      throw error;
    }
  }
  if (actionRequest === "assign-case") {
    if (!isCaseManager(actor))
      return jsonNoStore(
        { error: "إسناد القضية من صلاحيات المالك أو المشرف أو مستخدم المحامي" },
        { status: 403 },
      );
    const legalRecordId = Number(body.legalRecordId);
    const assignedLawyerId = Number(body.assignedLawyerId);
    if (
      !Number.isInteger(legalRecordId) ||
      legalRecordId < 1 ||
      !Number.isInteger(assignedLawyerId) ||
      assignedLawyerId < 1
    )
      return jsonNoStore(
        { error: "اختر المحامي المستلم للقضية" },
        { status: 400 },
      );
    const beforeCase = await db.query.legalRecords.findFirst({
      where: eq(legalRecords.id, legalRecordId),
    });
    if (!beforeCase)
      return jsonNoStore(
        { error: "الملف القانوني غير موجود" },
        { status: 404 },
      );
    const targetLawyer = await db.query.legalLawyers.findFirst({
      where: and(
        eq(legalLawyers.id, assignedLawyerId),
        eq(legalLawyers.status, "active"),
      ),
    });
    if (!targetLawyer)
      return jsonNoStore(
        { error: "المحامي المحدد غير موجود أو غير نشط" },
        { status: 409 },
      );
    const now = new Date().toISOString();
    const updatedCase = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(legalRecords)
        .set({
          assignedLawyerId: targetLawyer.id,
          assignedLawyerEmail: targetLawyer.portalUserEmail,
          assignedBy: actor.user.email,
          assignedAt: now,
          updatedAt: now,
        })
        .where(eq(legalRecords.id, legalRecordId))
        .returning();
      await tx.insert(legalCaseActionLog).values({
        legalRecordId,
        activityId: null,
        action: "assigned",
        fromStatus: null,
        toStatus: null,
        details: `إسناد القضية إلى المحامي ${targetLawyer.fullName}${targetLawyer.portalUserEmail ? ` — ${targetLawyer.portalUserEmail}` : " — محامٍ خارجي"}`,
        actorEmail: actor.user.email,
        actorRole: actorRole(actor),
      });
      return row;
    });
    await auditPortalAction({
      actorEmail: actor.user.email,
      action: "legal-case-assigned",
      entityType: "legal-record",
      entityId: legalRecordId,
      before: beforeCase,
      after: updatedCase,
    });
    await emitPortalNotification({
      eventType: "legal-case-assigned",
      title: targetLawyer.portalUserEmail
        ? "أُسند ملف قانوني إليك"
        : "أُسند ملف قانوني إلى محامٍ خارجي",
      message: `${updatedCase.referenceCode} — ${updatedCase.title} — ${targetLawyer.fullName}`,
      severity: "info",
      module: "legal",
      entityType: "legal-record",
      entityId: legalRecordId,
      actionView: "legal",
      ...(targetLawyer.portalUserEmail
        ? { targetEmail: targetLawyer.portalUserEmail }
        : { targetDepartment: "legal" as const }),
    }).catch(() => undefined);
    return jsonNoStore({ case: updatedCase, lawyer: targetLawyer });
  }
  const id = Number(body.id);
  const status = clean(body.status, 20);
  if (
    !Number.isInteger(id) ||
    id < 1 ||
    !["open", "in_progress", "completed", "cancelled"].includes(status)
  )
    return jsonNoStore({ error: "الحالة غير صحيحة" }, { status: 400 });
  const before = await db.query.legalCaseActivities.findFirst({
    where: eq(legalCaseActivities.id, id),
  });
  if (!before)
    return jsonNoStore({ error: "الإجراء غير موجود" }, { status: 404 });
  if (
    !isCaseManager(actor) &&
    before.assignedTo?.toLowerCase() !== actor.user.email.toLowerCase() &&
    before.createdBy.toLowerCase() !== actor.user.email.toLowerCase()
  )
    return jsonNoStore(
      { error: "لا يمكن تحديث إجراء غير مسند إلى المستخدم" },
      { status: 403 },
    );
  if (status === "cancelled" && !isCaseManager(actor))
    return jsonNoStore(
      { error: "إلغاء الإجراء من صلاحيات مدير القضايا" },
      { status: 403 },
    );
  const now = new Date().toISOString();
  const action =
    status === "in_progress"
      ? "started"
      : status === "completed"
        ? "completed"
        : status === "cancelled"
          ? "cancelled"
          : "assigned";
  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(legalCaseActivities)
      .set({
        status,
        completedAt: status === "completed" ? now : null,
        updatedAt: now,
      })
      .where(
        and(
          eq(legalCaseActivities.id, id),
          eq(legalCaseActivities.status, before.status),
        ),
      )
      .returning();
    if (!row) return null;
    await tx.insert(legalCaseActionLog).values({
      legalRecordId: before.legalRecordId,
      activityId: id,
      action,
      fromStatus: before.status,
      toStatus: status,
      details: `${before.title}: ${before.status} ← ${status}`,
      actorEmail: actor.user.email,
      actorRole: actorRole(actor),
    });
    return row;
  });
  if (!updated)
    return jsonNoStore({ error: "تغير الإجراء قبل الحفظ" }, { status: 409 });
  await auditPortalAction({
    actorEmail: actor.user.email,
    action: "legal-case-activity-updated",
    entityType: "legal-case-activity",
    entityId: id,
    before,
    after: { ...updated, actorRole: actorRole(actor) },
  });
  return jsonNoStore({ activity: updated });
}
