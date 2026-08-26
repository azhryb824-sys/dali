import { and, eq, inArray, or } from "drizzle-orm";
import { getDb } from "@/db";
import { clients, companyDocuments, contractPaymentSchedules, contractProfessions, contractWorkerAssignments, documentStamps, financialRecords, legalCaseActivities, legalRecords, workers, workforceContracts } from "@/db/schema";
import { auditPortalAction, recordStatusChange } from "@/lib/audit";
import { emitPortalNotification } from "@/lib/portal-notifications";
import { hasPortalPermission, requirePortalApiRole } from "@/lib/portal-access";
import { jsonNoStore, rejectCrossSiteRequest } from "@/lib/security";
import { annualContractSchedule } from "@/lib/payment-schedules";

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
      const overdue = await db.select().from(contractPaymentSchedules).where(and(eq(contractPaymentSchedules.contractId, id), inArray(contractPaymentSchedules.status, ["due","referred","invoiced"]))).orderBy(contractPaymentSchedules.dueDate);
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
    if (status === "active") {
      for (const assignment of plannedAssignments) {
        const worker = await db.query.workers.findFirst({ where: eq(workers.id, assignment.workerId) });
        if (!worker || worker.status !== "available") return jsonNoStore({ error: `تعذّر تفعيل العقد لأن العامل رقم ${assignment.workerId} لم يعد متاحًا` }, { status: 409 });
      }
    }
    const approvalInstallments = status === "approved" && contract.seasonType === "regular" && contract.quantityMode === "fixed"
      ? await db.select().from(contractPaymentSchedules).where(eq(contractPaymentSchedules.contractId, id))
      : [];
    const annualApprovalDueDates = status === "approved" && contract.seasonType === "regular" && contract.quantityMode === "fixed"
      ? annualContractSchedule(contract.startDate).dueDates
      : [];
    if (status === "approved" && contract.seasonType === "regular" && contract.quantityMode === "fixed" && (approvalInstallments.length !== 12 || annualApprovalDueDates.length !== 12)) {
      return jsonNoStore({ error: "جدول العقد السنوي غير مكتمل؛ يجب أن يحتوي على 12 دفعة شهرية" }, { status: 409 });
    }
    if (approvalInstallments.some((payment) => !["scheduled", "due"].includes(payment.status))) {
      return jsonNoStore({ error: "تعذر اعتماد العقد لوجود دفعة تمت معالجتها ماليًا" }, { status: 409 });
    }
    const now = new Date().toISOString();
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
      if (annualApprovalDueDates.length) {
        const editable = approvalInstallments.sort((a, b) => a.installmentNumber - b.installmentNumber);
        for (const [index, payment] of editable.entries()) {
          const dueDate = annualApprovalDueDates[index];
          await tx.update(contractPaymentSchedules).set({ dueDate, servicePeriod: dueDate.slice(0, 7), status: dueDate <= now.slice(0, 10) ? "due" : "scheduled", updatedAt: now }).where(eq(contractPaymentSchedules.id, payment.id));
        }
        await tx.update(workforceContracts).set({ firstPaymentDueDate: annualApprovalDueDates[0], updatedAt: now }).where(eq(workforceContracts.id, id));
      }
      return annualApprovalDueDates.length
        ? { ...changed, firstPaymentDueDate: annualApprovalDueDates[0] }
        : changed;
    });
    if (!updated) return jsonNoStore({ error: "تغيرت حالة العقد قبل حفظ القرار" }, { status: 409 });
    if (annualApprovalDueDates.length) {
      await emitPortalNotification({ eventType: "annual-contract-payments-scheduled", title: "جُدولت دفعات العقد السنوي", message: `${contract.referenceCode} — تبدأ الدفعة الأولى بعد شهر من بداية العقد في ${annualApprovalDueDates[0]}.`, severity: "info", module: "finance", entityType: "workforce-contract", entityId: id, actionView: "finance", targetDepartment: "finance" }).catch(() => undefined);
    }
    if (["cancelled", "terminated"].includes(status)) {
      await db.update(contractPaymentSchedules).set({ status: "cancelled", updatedAt: now }).where(and(eq(contractPaymentSchedules.contractId, id), inArray(contractPaymentSchedules.status, ["scheduled", "due", "referred"])));
      if (reasonCode !== "late_payment") {
        await db.update(financialRecords).set({ status: "cancelled", postingStatus: "not_applicable", notes: `أُلغي تبعًا لإلغاء العقد ${contract.referenceCode}: ${reason}`.slice(0,1000), updatedAt: now }).where(and(eq(financialRecords.contractId, id), eq(financialRecords.postingStatus, "unposted"), inArray(financialRecords.status, ["pending","due"])));
      }
      const assignments = await db.select().from(contractWorkerAssignments).where(and(eq(contractWorkerAssignments.contractId, id), inArray(contractWorkerAssignments.status, ["planned", "active"])));
      for (const assignment of assignments) {
        await db.update(contractWorkerAssignments).set({ status: "released", releasedAt: now }).where(eq(contractWorkerAssignments.id, assignment.id));
        await db.update(workers).set({ status: "available", beneficiaryName: null, clientSite: "غير مسند", assignmentStartDate: null, updatedAt: now }).where(eq(workers.id, assignment.workerId));
      }
      const [client, documents, payments, finances, professions, allAssignments] = await Promise.all([
        contract.clientId ? db.query.clients.findFirst({ where: eq(clients.id, contract.clientId) }) : Promise.resolve(null),
        db.select().from(companyDocuments).where(or(eq(companyDocuments.id, contract.documentId), eq(companyDocuments.counterparty, contract.clientName))),
        db.select().from(contractPaymentSchedules).where(eq(contractPaymentSchedules.contractId, id)),
        db.select().from(financialRecords).where(eq(financialRecords.contractId, id)),
        db.select().from(contractProfessions).where(eq(contractProfessions.contractId, id)),
        db.select().from(contractWorkerAssignments).where(eq(contractWorkerAssignments.contractId, id)),
      ]);
      const assignedWorkerIds = [...new Set(allAssignments.map((item) => item.workerId))];
      const linkedWorkers = assignedWorkerIds.length ? await db.select().from(workers).where(inArray(workers.id, assignedWorkerIds)) : [];
      const caseSnapshot = { capturedAt: now, cancellation: { status, reason, referredBy: access.user.email }, client, contract: updated, documents, payments, finances, professions, assignments: allAssignments, workers: linkedWorkers };
      const legalReference = `LGL-CAN-${contract.referenceCode}`.slice(0, 120);
      const [createdLegal] = await db.insert(legalRecords).values({ referenceCode: legalReference, category: "case", title: `${status === "terminated" ? "إنهاء" : "إلغاء"} العقد ${contract.referenceCode}`, counterparty: contract.clientName, clientId: contract.clientId, contractId: id, referralReason: reason, referredBy: access.user.email, referredAt: now, fileSnapshotJson: JSON.stringify(caseSnapshot), expiryDate: null, status: "reviewing" }).onConflictDoNothing().returning();
      let legal = createdLegal || await db.query.legalRecords.findFirst({ where: eq(legalRecords.referenceCode, legalReference) });
      if (legal && !createdLegal) [legal] = await db.update(legalRecords).set({ clientId: contract.clientId, contractId: id, referralReason: reason, referredBy: access.user.email, referredAt: now, fileSnapshotJson: JSON.stringify(caseSnapshot), status: "reviewing", updatedAt: now }).where(eq(legalRecords.id, legal.id)).returning();
      if (legal) {
        if(createdLegal)await db.insert(legalCaseActivities).values([{legalRecordId:legal.id,activityType:"task",title:"مراجعة العقد وسبب الإلغاء",details:"مراجعة البنود والإشعارات والمراسلات وتحديد المركز النظامي.",priority:"high",status:"open",assignedTo:null,createdBy:access.user.email},{legalRecordId:legal.id,activityType:"task",title:"مطابقة الرصيد المالي والفواتير",details:"مطابقة الدفعات المسددة والمستحقة والفواتير والقيود قبل أي مطالبة.",priority:"high",status:"open",assignedTo:null,createdBy:access.user.email},{legalRecordId:legal.id,activityType:"deadline",title:"تحديد مهلة الإشعار أو المطالبة",details:"تحديد الموعد وفق العقد والأنظمة بعد مراجعة قانونية بشرية.",priority:"critical",status:"open",dueAt:new Date(Date.now()+3*86400000).toISOString(),assignedTo:null,createdBy:access.user.email}]);
        await auditPortalAction({ actorEmail: access.user.email, action: "contract-cancellation-referred-legal", entityType: "legal-record", entityId: legal.id, after: { ...legal, snapshotCounts: { documents: documents.length, payments: payments.length, finances: finances.length, workers: linkedWorkers.length } }, reason });
        await emitPortalNotification({ eventType: "contract-cancellation-referred-legal", title: "ملف عميل كامل محال للشؤون القانونية", message: `${contract.referenceCode} — ${contract.clientName} — ${documents.length} مستندات، ${finances.length} سجلات مالية، ${payments.length} دفعات.`, severity: "critical", module: "legal", entityType: "legal-record", entityId: legal.id, actionView: "legal", targetDepartment: "legal" }).catch(() => undefined);
      }
      const accountingReviewCount = finances.filter((item) => item.postingStatus === "draft" || item.postingStatus === "posted").length;
      if (accountingReviewCount) await emitPortalNotification({ eventType: "contract-cancellation-accounting-review", title: "مراجعة محاسبية لازمة لإلغاء عقد", message: `${contract.referenceCode} — يوجد ${accountingReviewCount} سجل مالي بقيد مسودة أو مرحّل؛ يلزم إصدار عكس أو تسوية دون حذف الأثر التاريخي.`, severity: "critical", module: "finance", entityType: "workforce-contract", entityId: id, actionView: "finance", targetDepartment: "finance" }).catch(() => undefined);
    }
    if (status === "active") {
      try {
        for (const assignment of plannedAssignments) {
          await db.update(contractWorkerAssignments).set({ status: "active", assignedAt: now }).where(and(eq(contractWorkerAssignments.id, assignment.id), eq(contractWorkerAssignments.status, "planned")));
          const assignedWorkers = await db.update(workers).set({ status: "assigned", beneficiaryName: contract.clientName, clientSite: contract.workSite, assignmentStartDate: contract.startDate, updatedAt: now }).where(and(eq(workers.id, assignment.workerId), eq(workers.status, "available"))).returning();
          if (!assignedWorkers.length) throw new Error(`تعارض إسناد العامل رقم ${assignment.workerId}`);
        }
      } catch (error) {
        await db.update(workforceContracts).set({ status: contract.status, effectiveAt: null, updatedAt: now }).where(eq(workforceContracts.id, id)).catch(() => undefined);
        for (const assignment of plannedAssignments) {
          await db.update(contractWorkerAssignments).set({ status: "planned" }).where(eq(contractWorkerAssignments.id, assignment.id)).catch(() => undefined);
          await db.update(workers).set({ status: "available", beneficiaryName: null, clientSite: "غير مسند", assignmentStartDate: null, updatedAt: now }).where(and(eq(workers.id, assignment.workerId), eq(workers.status, "assigned"), eq(workers.beneficiaryName, contract.clientName))).catch(() => undefined);
        }
        throw error;
      }
    }
    const correlationId = await recordStatusChange({ entityType: "workforce-contract", entityId: id, fromStatus: contract.status, toStatus: status, reason: reason || null, actorEmail: access.user.email });
    await auditPortalAction({ actorEmail: access.user.email, action: "workforce-contract-status-changed", entityType: "workforce-contract", entityId: id, before: contract, after: updated, reason: reason || null, correlationId });
    await emitPortalNotification({ eventType: "workforce-contract-status-changed", title: "تغيّرت حالة عقد عمالة", message: `${updated.referenceCode} — ${updated.clientName} — ${contract.status} ← ${status}.`, severity: ["cancelled", "terminated", "suspended"].includes(status) ? "warning" : "info", module: "workforce", entityType: "workforce-contract", entityId: id, actionView: "workforce", targetDepartment: "workforce" }).catch(() => undefined);
    return jsonNoStore({ contract: updated });
  } catch (error) {
    return jsonNoStore({ error: error instanceof Error ? error.message : "تعذّر تحديث العقد" }, { status: 400 });
  }
}
