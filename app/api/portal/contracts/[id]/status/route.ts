import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { companyDocuments, contractPaymentSchedules, contractSignatureRequests, contractProfessions, contractWorkerAssignments, documentStamps, financialRecords, workers, workforceContracts } from "@/db/schema";
import { applyContractCancellation } from "@/lib/contract-cancellation";
import { auditPortalAction, recordStatusChange } from "@/lib/audit";
import { emitPortalNotification } from "@/lib/portal-notifications";
import { hasPortalPermission, requirePortalApiRole } from "@/lib/portal-access";
import { jsonNoStore, rejectCrossSiteRequest } from "@/lib/security";
import { annualContractSchedule, annualInstallmentPercentages } from "@/lib/payment-schedules";
import { hashShareToken } from "@/lib/company-documents";
import { isRecoverablePreApprovalInvoice } from "@/lib/contract-payment-integrity";

const transitions: Record<string, string[]> = {
  draft: ["internal_review", "approved", "cancelled"],
  internal_review: ["draft", "legal_review", "approved", "cancelled"],
  legal_review: ["internal_review", "approved", "cancelled"],
  approved: ["sent", "active", "cancelled"],
  sent: ["signed", "cancelled"],
  signed: ["active", "cancelled"],
  active: ["suspended", "terminated", "expired", "superseded"],
  suspended: ["active", "terminated"],
  expired: ["superseded"],
  terminated: [], cancelled: [], superseded: [],
};

function clean(value: unknown, length: number) { return typeof value === "string" ? value.trim().slice(0, length) : ""; }

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (rejectCrossSiteRequest(request)) return jsonNoStore({ error: "مصدر الطلب غير مسموح" }, { status: 403 });
  const access = await requirePortalApiRole(["admin", "manager", "employee"]);
  const elevated = access && (access.role === "admin" || access.functionalRoles.includes("system_owner") || access.functionalRoles.includes("system_admin"));
  if (!access || (!elevated && !(await hasPortalPermission(access, "contracts", "write")))) return jsonNoStore({ error: "غير مصرح" }, { status: 403 });
  try {
    const id = Number((await context.params).id);
    const payload = await request.json() as Record<string, unknown>;
    const status = clean(payload.status, 30);
    let reason = clean(payload.reason, 1000);
    const reasonCode = clean(payload.reasonCode, 40);
    if (!Number.isSafeInteger(id) || id < 1) return jsonNoStore({ error: "رقم العقد غير صحيح" }, { status: 400 });
    const db = getDb();
    const contract = await db.query.workforceContracts.findFirst({ where: eq(workforceContracts.id, id) });
    if (!contract) return jsonNoStore({ error: "العقد غير موجود" }, { status: 404 });
    if (!transitions[contract.status]?.includes(status)) return jsonNoStore({ error: "انتقال حالة العقد غير مسموح" }, { status: 409 });
    if (["cancelled", "terminated"].includes(status) && reasonCode === "late_payment") {
      const overdue = await db.select().from(contractPaymentSchedules).where(and(eq(contractPaymentSchedules.contractId, id), inArray(contractPaymentSchedules.status, ["due","referred","invoiced","partially_paid"]))).orderBy(contractPaymentSchedules.dueDate);
      const oldest = overdue.find((payment) => payment.dueDate < new Date().toISOString().slice(0, 10));
      if (!oldest) return jsonNoStore({ error: "لا توجد دفعة متأخرة مثبتة على العقد لاحتساب سبب الإلغاء آليًا" }, { status: 409 });
      reason = `إلغاء بسبب تأخر سداد الدفعة رقم ${oldest.installmentNumber} (${oldest.title}) المستحقة بتاريخ ${oldest.dueDate}، وعدم تسجيل سدادها حتى تاريخ القرار.`;
    }
    if (["cancelled", "terminated", "suspended"].includes(status) && reason.length < 10) return jsonNoStore({ error: "اكتب سببًا واضحًا لا يقل عن 10 أحرف" }, { status: 400 });
    const canApprove = access.role === "admin" || access.functionalRoles.some((role) => role === "system_owner" || role === "system_admin");
    if (status === "approved" && !canApprove) return jsonNoStore({ error: "اعتماد العقد متاح للمالك أو مشرف النظام فقط" }, { status: 403 });
    const stampId = Number(payload.stampId || 0);
    if (status === "approved") {
      if (!Number.isSafeInteger(stampId) || stampId < 1) return jsonNoStore({ error: "اختيار ختم الاعتماد إلزامي" }, { status: 400 });
      const stamp = await db.query.documentStamps.findFirst({ where: and(eq(documentStamps.id, stampId), eq(documentStamps.active, true)) });
      if (!stamp) return jsonNoStore({ error: "الختم المختار غير موجود أو غير نشط" }, { status: 409 });
    }
    if (["signed", "terminated", "cancelled", "superseded"].includes(status) && !canApprove) return jsonNoStore({ error: "هذه المرحلة تتطلب صلاحية المالك أو مشرف النظام" }, { status: 403 });
    if (status === "active" && !contract.approvedBy) return jsonNoStore({ error: "لا يمكن تفعيل العقد قبل اعتماده من المالك أو مشرف النظام" }, { status: 409 });
    const plannedAssignments = status === "active"
      ? await db.select().from(contractWorkerAssignments).where(and(eq(contractWorkerAssignments.contractId, id), eq(contractWorkerAssignments.status, "planned")))
      : [];
    if (plannedAssignments.length && !(await hasPortalPermission(access, "workforce", "write"))) {
      return jsonNoStore({ error: "تفعيل عقد يحتوي عمالة مخططة يتطلب صلاحية إدارة القوى العاملة" }, { status: 403 });
    }
    if (status === "active") {
      for (const assignment of plannedAssignments) {
        const worker = await db.query.workers.findFirst({ where: eq(workers.id, assignment.workerId) });
        if (!worker || worker.status !== "available") return jsonNoStore({ error: `تعذّر تفعيل العقد لأن العامل رقم ${assignment.workerId} لم يعد متاحًا` }, { status: 409 });
      }
    }
    const approvalInstallments = status === "approved" && contract.seasonType === "regular" && contract.quantityMode === "fixed"
      ? await db.select().from(contractPaymentSchedules).where(eq(contractPaymentSchedules.contractId, id))
      : [];
    const approvalProfessions = status === "approved" && contract.seasonType === "regular" && contract.quantityMode === "fixed"
      ? await db.select().from(contractProfessions).where(eq(contractProfessions.contractId, id))
      : [];
    const annualApprovalDueDates = status === "approved" && contract.seasonType === "regular" && contract.quantityMode === "fixed"
      ? annualContractSchedule(contract.startDate).dueDates
      : [];
    if (status === "approved" && contract.seasonType === "regular" && contract.quantityMode === "fixed" && annualApprovalDueDates.length !== 12) {
      return jsonNoStore({ error: "تعذر حساب جدول العقد السنوي من تاريخ البداية؛ صحح تاريخ بداية العقد" }, { status: 409 });
    }
    const processedApprovalInstallments = approvalInstallments.filter((payment) =>
      !["scheduled", "due"].includes(payment.status) ||
      Boolean(payment.invoiceDocumentId) ||
      Boolean(payment.financialRecordId),
    );
    const processedDocumentIds = processedApprovalInstallments.flatMap((payment) => payment.invoiceDocumentId ? [payment.invoiceDocumentId] : []);
    const processedFinancialIds = processedApprovalInstallments.flatMap((payment) => payment.financialRecordId ? [payment.financialRecordId] : []);
    const [processedDocuments, processedFinancials] = await Promise.all([
      processedDocumentIds.length ? db.select().from(companyDocuments).where(inArray(companyDocuments.id, processedDocumentIds)) : Promise.resolve([]),
      processedFinancialIds.length ? db.select().from(financialRecords).where(inArray(financialRecords.id, processedFinancialIds)) : Promise.resolve([]),
    ]);
    const processedDocumentById = new Map(processedDocuments.map((document) => [document.id, document]));
    const processedFinancialById = new Map(processedFinancials.map((financial) => [financial.id, financial]));
    const recoverablePreApprovalInvoices = processedApprovalInstallments.length > 0 && processedApprovalInstallments.every((payment) =>
      isRecoverablePreApprovalInvoice({
        contractId: id,
        expectedDueDate: annualApprovalDueDates[payment.installmentNumber - 1] || "",
        payment,
        document: payment.invoiceDocumentId ? processedDocumentById.get(payment.invoiceDocumentId) : undefined,
        financial: payment.financialRecordId ? processedFinancialById.get(payment.financialRecordId) : undefined,
      }),
    );
    if (processedApprovalInstallments.length && !recoverablePreApprovalInvoices) {
      return jsonNoStore({ error: "تعذر اعتماد العقد لوجود دفعة تمت معالجتها ماليًا" }, { status: 409 });
    }
    const installmentNumbers = new Set(approvalInstallments.map((payment) => payment.installmentNumber));
    const annualScheduleNeedsRepair = annualApprovalDueDates.length === 12 && (
      approvalInstallments.length !== 12 ||
      installmentNumbers.size !== 12 ||
      approvalInstallments.some((payment) => payment.installmentNumber < 1 || payment.installmentNumber > 12)
    );
    if (annualScheduleNeedsRepair && processedApprovalInstallments.length) {
      return jsonNoStore({ error: "تعذر إصلاح جدول العقد لأن بعض دفعاته عولجت ماليًا" }, { status: 409 });
    }
    const monthlySubtotalHalalas = annualScheduleNeedsRepair
      ? approvalProfessions.reduce(
          (sum, profession) =>
            sum + profession.requiredCount * profession.unitSalaryHalalas,
          0,
        )
      : 0;
    if (annualScheduleNeedsRepair && monthlySubtotalHalalas < 1) {
      return jsonNoStore({ error: "تعذر إصلاح جدول الاعتماد تلقائيًا لعدم اكتمال أسعار وأعداد المهن" }, { status: 409 });
    }
    const repairedPercentages = annualScheduleNeedsRepair
      ? annualInstallmentPercentages(12)
      : [];
    const totalAnnualVatHalalas = annualScheduleNeedsRepair
      ? Math.round(monthlySubtotalHalalas * 12 * contract.vatRateBps / 10000)
      : 0;
    const standardMonthlyVatHalalas = annualScheduleNeedsRepair
      ? Math.round(monthlySubtotalHalalas * contract.vatRateBps / 10000)
      : 0;
    const now = new Date().toISOString();
    const approvedDocument = status === "approved"
      ? await db.query.companyDocuments.findFirst({ where: eq(companyDocuments.id, contract.documentId) })
      : null;
    if (status === "approved" && (!approvedDocument || approvedDocument.status !== "active")) {
      return jsonNoStore({ error: "مستند العقد المعتمد غير موجود أو غير نشط" }, { status: 409 });
    }
    const signatureToken = status === "approved"
      ? crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "")
      : "";
    const signatureTokenHash = signatureToken ? await hashShareToken(signatureToken) : "";
    const signatureRequestId = signatureToken ? crypto.randomUUID() : "";
    const signatureUploadExpiresAt = signatureToken ? new Date(Date.now() + 14 * 86400000).toISOString() : "";
    let cancellation: Awaited<ReturnType<typeof applyContractCancellation>> | null = null;
    const updated = await db.transaction(async (tx) => {
      const [changed] = await tx.update(workforceContracts).set({
        status,
        ...(status === "approved" ? { approvedBy: access.user.email, approvedAt: now, stampId } : {}),
        ...(status === "signed" ? { signedAt: now } : {}),
        ...(status === "active" ? { effectiveAt: now, suspendedAt: null } : {}),
        ...(status === "suspended" ? { suspendedAt: now, cancellationReason: reason } : {}),
        ...(status === "terminated" ? { terminatedAt: now, cancellationReason: reason } : {}),
        ...(status === "cancelled" ? { cancellationReason: reason } : {}),
        updatedAt: now,
      }).where(and(eq(workforceContracts.id, id), eq(workforceContracts.status, contract.status))).returning();
      if (!changed) return null;
      if (status === "approved" && approvedDocument) {
        await tx.update(contractSignatureRequests).set({ status: "revoked", updatedAt: now })
          .where(and(eq(contractSignatureRequests.contractId, id), eq(contractSignatureRequests.status, "pending")));
        await tx.insert(contractSignatureRequests).values({
          id: signatureRequestId,
          contractId: id,
          documentId: approvedDocument.id,
          tokenHash: signatureTokenHash,
          status: "pending",
          expiresAt: signatureUploadExpiresAt,
          originalStorageKey: approvedDocument.storageKey,
          createdBy: access.user.email,
          createdAt: now,
          updatedAt: now,
        });
      }
      if (annualScheduleNeedsRepair) {
        await tx.delete(contractPaymentSchedules).where(eq(contractPaymentSchedules.contractId, id));
        await tx.insert(contractPaymentSchedules).values(
          annualApprovalDueDates.map((dueDate, index) => {
            const vatHalalas = index === annualApprovalDueDates.length - 1
              ? totalAnnualVatHalalas - standardMonthlyVatHalalas * index
              : standardMonthlyVatHalalas;
            return {
              contractId: id,
              installmentNumber: index + 1,
              title: `استحقاق رواتب شهر ${dueDate.slice(0, 7)}`,
              titleEn: `Salary installment for ${dueDate.slice(0, 7)}`,
              dueDate,
              percentageBps: repairedPercentages[index],
              subtotalHalalas: monthlySubtotalHalalas,
              vatHalalas,
              vatRateBps: contract.vatRateBps,
              amountHalalas: monthlySubtotalHalalas + vatHalalas,
              billingBasis: "monthly_salary",
              servicePeriod: dueDate.slice(0, 7),
              status: dueDate <= now.slice(0, 10) ? "due" : "scheduled",
              createdBy: access.user.email,
              updatedAt: now,
            };
          }),
        );
        await tx.update(workforceContracts).set({ firstPaymentDueDate: annualApprovalDueDates[0], updatedAt: now }).where(eq(workforceContracts.id, id));
      } else if (annualApprovalDueDates.length) {
        const editable = [...approvalInstallments].sort((a, b) => a.installmentNumber - b.installmentNumber);
        for (const payment of editable) {
          if (payment.invoiceDocumentId || payment.financialRecordId || !["scheduled", "due"].includes(payment.status)) continue;
          const dueDate = annualApprovalDueDates[payment.installmentNumber - 1];
          await tx.update(contractPaymentSchedules).set({ dueDate, servicePeriod: dueDate.slice(0, 7), status: dueDate <= now.slice(0, 10) ? "due" : "scheduled", updatedAt: now }).where(eq(contractPaymentSchedules.id, payment.id));
        }
        await tx.update(workforceContracts).set({ firstPaymentDueDate: annualApprovalDueDates[0], updatedAt: now }).where(eq(workforceContracts.id, id));
      }
      if (status === "active" && plannedAssignments.length) {
        const professionIds = [...new Set(plannedAssignments.map((assignment) => assignment.contractProfessionId))].sort((a, b) => a - b);
        const workerIds = [...new Set(plannedAssignments.map((assignment) => assignment.workerId))].sort((a, b) => a - b);
        for (const professionId of professionIds) await tx.execute(sql`select id from contract_professions where id = ${professionId} for update`);
        for (const workerId of workerIds) await tx.execute(sql`select id from workers where id = ${workerId} for update`);
        for (const assignment of [...plannedAssignments].sort((a, b) => a.workerId - b.workerId)) {
          const [assignedWorker] = await tx.update(workers).set({
            status: "assigned",
            beneficiaryName: contract.clientName,
            clientSite: contract.workSite,
            clientId: contract.clientId,
            assignmentStartDate: now.slice(0, 10),
            updatedAt: now,
          }).where(and(eq(workers.id, assignment.workerId), eq(workers.status, "available"))).returning();
          if (!assignedWorker) throw new Error(`تعذر تفعيل العقد لأن العامل رقم ${assignment.workerId} لم يعد متاحًا`);
          const [activatedAssignment] = await tx.update(contractWorkerAssignments).set({ status: "active", assignedAt: now })
            .where(and(eq(contractWorkerAssignments.id, assignment.id), eq(contractWorkerAssignments.status, "planned"))).returning();
          if (!activatedAssignment) throw new Error(`تغير إسناد العامل رقم ${assignment.workerId} قبل تفعيل العقد`);
        }
      }
      if (["cancelled", "terminated", "expired", "superseded"].includes(status)) {
        await tx.execute(sql`
          select id from contract_worker_assignments
          where contract_id = ${id} and status in ('planned', 'active')
          order by id for update
        `);
        const assignmentsToRelease = await tx.select().from(contractWorkerAssignments).where(and(
          eq(contractWorkerAssignments.contractId, id),
          inArray(contractWorkerAssignments.status, ["planned", "active"]),
        ));
        const workerIds = [...new Set(assignmentsToRelease.map((assignment) => assignment.workerId))].sort((a, b) => a - b);
        for (const workerId of workerIds) await tx.execute(sql`select id from workers where id = ${workerId} for update`);
        for (const assignment of assignmentsToRelease) {
          await tx.update(contractWorkerAssignments).set({ status: "released", releasedAt: now })
            .where(and(eq(contractWorkerAssignments.id, assignment.id), inArray(contractWorkerAssignments.status, ["planned", "active"])));
        }
        for (const workerId of workerIds) {
          const [otherActive] = await tx.select({ id: contractWorkerAssignments.id }).from(contractWorkerAssignments).where(and(
            eq(contractWorkerAssignments.workerId, workerId),
            eq(contractWorkerAssignments.status, "active"),
          )).limit(1);
          if (!otherActive) {
            const [worker] = await tx.select().from(workers).where(eq(workers.id, workerId)).limit(1);
            if (worker) await tx.update(workers).set({
              status: worker.archivedAt ? "suspended" : worker.status === "assigned" ? "available" : worker.status,
              beneficiaryName: null,
              clientSite: "غير مسند",
              clientId: null,
              assignmentStartDate: null,
              updatedAt: now,
            }).where(eq(workers.id, workerId));
          }
        }
      }
      if (["cancelled", "terminated"].includes(status)) {
        cancellation = await applyContractCancellation(tx, { contract, status, reason, actorEmail: access.user.email, now });
        await tx.update(contractSignatureRequests).set({ status: "revoked", updatedAt: now })
          .where(and(eq(contractSignatureRequests.contractId, id), eq(contractSignatureRequests.status, "pending")));
      }
      return annualApprovalDueDates.length
        ? { ...changed, firstPaymentDueDate: annualApprovalDueDates[0] }
        : changed;
    });
    if (!updated) return jsonNoStore({ error: "تغيرت حالة العقد قبل حفظ القرار" }, { status: 409 });
    if (annualApprovalDueDates.length) {
      await emitPortalNotification({ eventType: "annual-contract-payments-scheduled", title: "جُدولت دفعات العقد السنوي", message: `${contract.referenceCode} — تبدأ الدفعة الأولى بعد شهر من بداية العقد في ${annualApprovalDueDates[0]}.`, severity: "info", module: "finance", entityType: "workforce-contract", entityId: id, actionView: "finance", targetDepartment: "finance" }).catch(() => undefined);
    }
    if (annualScheduleNeedsRepair) {
      await auditPortalAction({
        actorEmail: access.user.email,
        action: "contract-approval-schedule-repaired",
        entityType: "workforce-contract",
        entityId: id,
        before: { installmentCount: approvalInstallments.length },
        after: { installmentCount: 12, firstPaymentDueDate: annualApprovalDueDates[0] },
        reason: "إصلاح آمن لجدول عقد سنوي غير مكتمل أثناء الاعتماد قبل أي معالجة مالية",
      });
      await emitPortalNotification({
        eventType: "contract-approval-schedule-repaired",
        title: "أُصلح جدول عقد أثناء الاعتماد",
        message: `${contract.referenceCode} — أُعيد إنشاء 12 دفعة شهرية قبل الاعتماد دون وجود معالجة مالية سابقة.`,
        severity: "warning",
        module: "finance",
        entityType: "workforce-contract",
        entityId: id,
        actionView: "contractual-documents",
        targetRole: "admin",
      }).catch(() => undefined);
    }
    if (recoverablePreApprovalInvoices) {
      const preservedPaymentIds = processedApprovalInstallments.map((payment) => payment.id);
      await auditPortalAction({
        actorEmail: access.user.email,
        action: "contract-approved-with-preserved-legacy-auto-invoices",
        entityType: "workforce-contract",
        entityId: id,
        before: { status: contract.status, approvedBy: contract.approvedBy, paymentIds: preservedPaymentIds },
        after: { status: updated.status, approvedBy: updated.approvedBy, paymentIds: preservedPaymentIds },
        reason: "اعتماد عقد قديم مع الحفاظ على فواتير تلقائية غير مرحلة أُنشئت قبل إضافة قيد الاعتماد",
      });
      await emitPortalNotification({
        eventType: "contract-approved-with-preserved-legacy-auto-invoices",
        title: "اعتمد عقد قديم مع فواتير تلقائية محفوظة",
        message: `${contract.referenceCode} — حُفظت ${preservedPaymentIds.length} فواتير تلقائية غير مرحلة، ويلزم التحقق المحاسبي منها دون حذف السجل التاريخي.`,
        severity: "warning",
        module: "finance",
        entityType: "workforce-contract",
        entityId: id,
        actionView: "finance",
        targetDepartment: "finance",
      }).catch(() => undefined);
    }
    if (cancellation) {
      const result = cancellation as Awaited<ReturnType<typeof applyContractCancellation>>;
      await emitPortalNotification({ eventType: "contract-cancellation-referred-legal", title: "أحيل إلغاء العقد إلى القانونية", message: `${contract.referenceCode} — ${reason}`, severity: "critical", module: "legal", entityType: "legal-record", entityId: result.legalRecordId, actionView: "legal", targetDepartment: "legal" }).catch(() => undefined);
      await emitPortalNotification({ eventType: "contract-cancellation-accounting-review", title: "تسوية إلغاء عقد ومطابقة مستحقاته", message: `${contract.referenceCode} — ألغيت الالتزامات المستقبلية غير المعالجة وحُفظت المستحقات السابقة. ${result.summary.reviewPaymentIds.length} دفعات تحتاج مراجعة المبلغ النهائي أو إشعار دائن أو استرداد.`, severity: "critical", module: "finance", entityType: "workforce-contract", entityId: id, actionView: "contractual-documents", targetDepartment: "finance" }).catch(() => undefined);
    }
    const correlationId = await recordStatusChange({ entityType: "workforce-contract", entityId: id, fromStatus: contract.status, toStatus: status, reason: reason || null, actorEmail: access.user.email });
    await auditPortalAction({ actorEmail: access.user.email, action: "workforce-contract-status-changed", entityType: "workforce-contract", entityId: id, before: contract, after: updated, reason: reason || null, correlationId });
    await emitPortalNotification({ eventType: "workforce-contract-status-changed", title: "تغيّرت حالة عقد عمالة", message: `${updated.referenceCode} — ${updated.clientName} — ${contract.status} ← ${status}.`, severity: ["cancelled", "terminated", "suspended"].includes(status) ? "warning" : "info", module: "workforce", entityType: "workforce-contract", entityId: id, actionView: "workforce", targetDepartment: "workforce" }).catch(() => undefined);
    const signatureUploadUrl = signatureToken
      ? `${new URL(request.url).origin}/contracts/signature/${signatureToken}`
      : undefined;
    if (signatureUploadUrl) {
      await emitPortalNotification({
        eventType: "contract-signature-link-created",
        title: "تم إنشاء رابط توقيع العقد",
        message: `${updated.referenceCode} — الرابط صالح حتى ${signatureUploadExpiresAt} ويمكن استخدامه مرة واحدة.`,
        severity: "info",
        module: "documents",
        entityType: "workforce-contract",
        entityId: id,
        actionView: "contractual-documents",
        targetDepartment: "workforce",
      }).catch(() => undefined);
    }
    const assignmentStateChanged = status === "active" || ["cancelled", "terminated", "expired", "superseded"].includes(status);
    const synchronizedAssignments = assignmentStateChanged
      ? await db.select().from(contractWorkerAssignments).where(eq(contractWorkerAssignments.contractId, id))
      : [];
    const synchronizedWorkerIds = [...new Set(synchronizedAssignments.map((assignment) => assignment.workerId))];
    const synchronizedWorkers = synchronizedWorkerIds.length
      ? await db.select().from(workers).where(inArray(workers.id, synchronizedWorkerIds))
      : [];
    return jsonNoStore({
      contract: cancellation ? { ...updated, cancellationEffectiveDate: now.slice(0, 10), cancellationSummaryJson: JSON.stringify((cancellation as Awaited<ReturnType<typeof applyContractCancellation>>).summary) } : updated,
      assignments: assignmentStateChanged ? synchronizedAssignments : undefined,
      workers: assignmentStateChanged ? synchronizedWorkers : undefined,
      signatureUploadUrl,
      signatureUploadExpiresAt: signatureUploadExpiresAt || undefined,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("WORKER_COVERING_ABSENCE")) return jsonNoStore({ error: "تعذر تفعيل العقد لأن أحد العمال مسجل كبديل لتغطية غياب اليوم" }, { status: 409 });
    return jsonNoStore({ error: message || "تعذّر تحديث العقد" }, { status: 400 });
  }
}
