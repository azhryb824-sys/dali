import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { companyDocuments, contractClauses, contractPaymentSchedules, contractProfessions, contractWorkerAssignments, workforceContracts } from "@/db/schema";
import { auditPortalAction } from "@/lib/audit";
import { cleanDate } from "@/lib/company-documents";
import { annualContractSchedule } from "@/lib/payment-schedules";
import { emitPortalNotification } from "@/lib/portal-notifications";
import { hasPortalPermission, requirePortalApiRole } from "@/lib/portal-access";
import { getRuntimeEnv } from "@/lib/runtime-env";
import { jsonNoStore, rejectCrossSiteRequest } from "@/lib/security";
import { parseWorkforceContractClauses, type WorkforceContractDirection } from "@/lib/workforce-contract-clauses";

const clean = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";

async function access() {
  const actor = await requirePortalApiRole(["admin", "manager", "employee"]);
  if (!actor) return null;
  const elevated = actor.role === "admin" || actor.functionalRoles.includes("system_owner") || actor.functionalRoles.includes("system_admin");
  return elevated || await hasPortalPermission(actor, "contracts", "write") ? actor : null;
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (rejectCrossSiteRequest(request)) return jsonNoStore({ error: "مصدر الطلب غير مسموح" }, { status: 403 });
  const actor = await access();
  if (!actor) return jsonNoStore({ error: "غير مصرح بتعديل العقد" }, { status: 403 });
  const id = Number((await context.params).id);
  const db = getDb();
  const contract = await db.query.workforceContracts.findFirst({ where: eq(workforceContracts.id, id) });
  if (!contract) return jsonNoStore({ error: "العقد غير موجود" }, { status: 404 });
  if (["active", "suspended", "expired", "terminated", "superseded"].includes(contract.status)) return jsonNoStore({ error: "لا يمكن تعديل عقد بدأت آثاره التشغيلية أو المالية؛ أنشئ ملحقًا أو إصدارًا جديدًا" }, { status: 409 });
  const payload = await request.json() as Record<string, unknown>;
  const professionPayload = Array.isArray(payload.professions) ? payload.professions as Array<Record<string, unknown>> : null;
  const editedProfessions = professionPayload?.map((item) => ({
    profession: clean(item.profession, 120),
    requiredCount: contract.quantityMode === "open" ? 0 : Math.max(0, Math.floor(Number(item.requiredCount))),
    unitSalaryHalalas: Math.max(0, Math.round(Number(item.unitSalaryHalalas))),
    actualSalaryHalalas: Math.max(0, Math.round(Number(item.actualSalaryHalalas))),
    sponsorshipType: item.sponsorshipType === "other" ? "other" : "dali",
    sponsorName: item.sponsorshipType === "other" ? clean(item.sponsorName, 180) : null,
    ajirContractStatus: ["with_ajir", "without_ajir"].includes(String(item.ajirContractStatus)) ? String(item.ajirContractStatus) : "not_applicable",
  })) || null;
  if (editedProfessions && (!editedProfessions.length || editedProfessions.some((item) => !item.profession || (contract.quantityMode !== "open" && item.requiredCount < 1) || item.unitSalaryHalalas < 1 || item.actualSalaryHalalas < 0))) return jsonNoStore({ error: "أكمل المهنة والعدد وسعر العامل لكل صف" }, { status: 400 });
  if (editedProfessions && new Set(editedProfessions.map((item) => `${item.profession}|${item.sponsorshipType}|${item.sponsorName || ""}|${item.ajirContractStatus}`)).size !== editedProfessions.length) return jsonNoStore({ error: "يوجد تكرار في توزيع المهنة والكفيل وأجير" }, { status: 400 });
  const paymentPayload = Array.isArray(payload.paymentSchedule) ? payload.paymentSchedule as Array<Record<string, unknown>> : null;
  const editedPayments = paymentPayload?.map((item) => ({ id: Number(item.id), title: clean(item.title, 160), dueDate: cleanDate(item.dueDate), percentageBps: Math.round(Number(item.percentageBps)) })) || null;
  if (editedPayments && (!editedPayments.length || editedPayments.some((item) => !Number.isInteger(item.id) || item.id < 1 || item.title.length < 2 || !item.dueDate || item.percentageBps < 1) || editedPayments.reduce((sum, item) => sum + item.percentageBps, 0) !== 10000)) return jsonNoStore({ error: "جدول الدفعات غير صحيح؛ يجب أن يكون مجموع النسب 100%" }, { status: 400 });
  const contractDirection:WorkforceContractDirection=payload.contractDirection==="dali_purchaser"?"dali_purchaser":payload.contractDirection==="dali_supplier"?"dali_supplier":contract.contractDirection as WorkforceContractDirection;
  const professions=await db.select().from(contractProfessions).where(eq(contractProfessions.contractId,id));
  const assignments = editedProfessions ? await db.select().from(contractWorkerAssignments).where(eq(contractWorkerAssignments.contractId, id)) : [];
  if (editedProfessions && assignments.length) return jsonNoStore({ error: "لا يمكن تغيير المهن بعد إسناد عمالة؛ ألغِ الإسناد أولًا أو أنشئ ملحقًا" }, { status: 409 });
  const allWorkersWithAjir=professions.length>0&&professions.every(item=>item.ajirContractStatus==="with_ajir");
  const clauses=payload.contractClauses===undefined?null:parseWorkforceContractClauses(payload.contractClauses,contractDirection,allWorkersWithAjir);
  if(clauses&&!clauses.length)return jsonNoStore({error:"يجب إبقاء بند تعاقدي واحد على الأقل"},{status:400});
  const requestedStartDate = payload.startDate === undefined ? contract.startDate : cleanDate(payload.startDate);
  if (!requestedStartDate) return jsonNoStore({ error: "تاريخ بداية العقد غير صحيح" }, { status: 400 });
  const startDate = requestedStartDate;
  const annualSchedule = contract.seasonType === "regular" ? annualContractSchedule(startDate) : null;
  if (contract.seasonType === "regular" && !annualSchedule?.endDate) return jsonNoStore({ error: "تاريخ بداية العقد السنوي غير صحيح" }, { status: 400 });
  const requestedEndDate = payload.endDate === undefined ? contract.endDate : cleanDate(payload.endDate);
  const endDate = annualSchedule?.endDate || requestedEndDate;
  if (!endDate) return jsonNoStore({ error: "تاريخ نهاية العقد غير صحيح" }, { status: 400 });
  if (endDate < startDate) return jsonNoStore({ error: "تاريخ نهاية العقد يسبق بدايته" }, { status: 400 });
  const annualPayments = contract.seasonType === "regular" && contract.quantityMode === "fixed"
    ? await db.select().from(contractPaymentSchedules).where(eq(contractPaymentSchedules.contractId, id))
    : [];
  if (contract.seasonType === "regular" && contract.quantityMode === "fixed") {
    if (annualSchedule?.dueDates.length !== 12 || annualPayments.length !== 12) return jsonNoStore({ error: "جدول العقد السنوي غير مكتمل؛ يجب أن يحتوي على 12 دفعة شهرية" }, { status: 409 });
    if (annualPayments.some((payment) => !["scheduled", "due"].includes(payment.status))) return jsonNoStore({ error: "لا يمكن تغيير بداية العقد بعد بدء معالجة إحدى دفعاته ماليًا" }, { status: 409 });
  }
  const allPayments = annualPayments.length ? annualPayments : await db.select().from(contractPaymentSchedules).where(eq(contractPaymentSchedules.contractId, id));
  if ((editedProfessions || editedPayments || payload.vatRateBps !== undefined) && allPayments.some((payment) => payment.invoiceDocumentId || payment.financialRecordId || !["scheduled", "due"].includes(payment.status))) return jsonNoStore({ error: "لا يمكن تعديل الأسعار أو المهن أو جدول الدفعات بعد بدء المعالجة المالية" }, { status: 409 });
  if (editedPayments && (editedPayments.length !== allPayments.length || editedPayments.some((item) => !allPayments.some((payment) => payment.id === item.id)))) return jsonNoStore({ error: "جدول الدفعات لا يطابق دفعات العقد الحالية" }, { status: 409 });
  const vatRateBps = payload.vatRateBps === undefined ? contract.vatRateBps : Math.min(10000, Math.max(0, Math.round(Number(payload.vatRateBps))));
  const commercialProfessions = editedProfessions || professions;
  const monthlySubtotalHalalas = contract.quantityMode === "open" ? 0 : commercialProfessions.reduce((sum, item) => sum + item.requiredCount * item.unitSalaryHalalas, 0);
  const contractSubtotalHalalas = contract.quantityMode === "open" ? 0 : contract.seasonType === "regular" ? monthlySubtotalHalalas * 12 : Math.max(0, Math.round(contract.amountHalalas / (1 + contract.vatRateBps / 10000)));
  const contractAmountHalalas = contract.quantityMode === "open" ? 0 : contractSubtotalHalalas + Math.round(contractSubtotalHalalas * vatRateBps / 10000);
  const now = new Date().toISOString();
  const updated = await db.transaction(async (tx) => {
    const [changed] = await tx.update(workforceContracts).set({
      clientName: clean(payload.clientName, 180) || contract.clientName,
      clientCr: payload.clientCr === undefined ? contract.clientCr : clean(payload.clientCr, 40) || null,
      clientVat: payload.clientVat === undefined ? contract.clientVat : clean(payload.clientVat, 40) || null,
      title: clean(payload.title, 220) || contract.title,
      workSite: clean(payload.workSite, 180) || contract.workSite,
      issueDate: clean(payload.issueDate, 10) || contract.issueDate,
      startDate,
      endDate,
      amountHalalas: contractAmountHalalas,
      vatRateBps,
      accommodationParty: payload.accommodationParty === undefined ? contract.accommodationParty : clean(payload.accommodationParty, 180) || null,
      transportParty: payload.transportParty === undefined ? contract.transportParty : clean(payload.transportParty, 180) || null,
      showPaymentSchedule: payload.showPaymentSchedule === undefined ? contract.showPaymentSchedule : Boolean(payload.showPaymentSchedule),
      firstPaymentDueDate: annualSchedule?.dueDates[0] || contract.firstPaymentDueDate,
      details: clean(payload.details, 12000) || contract.details,
      contractDirection,
      status: "draft", approvedBy: null, approvedAt: null, signedAt: null,
      versionNumber: contract.versionNumber + 1, updatedAt: now,
    }).where(and(eq(workforceContracts.id, id), eq(workforceContracts.versionNumber, contract.versionNumber))).returning();
    if (!changed) return null;
    await tx.update(companyDocuments).set({ title: clean(payload.title, 220) || contract.title, counterparty: clean(payload.clientName, 180) || contract.clientName, expiryDate: endDate, updatedAt: now }).where(eq(companyDocuments.id, contract.documentId));
    if (annualSchedule?.dueDates.length && annualPayments.length) {
      const sortedPayments = annualPayments.sort((a, b) => a.installmentNumber - b.installmentNumber);
      for (const [index, payment] of sortedPayments.entries()) {
        const dueDate = annualSchedule.dueDates[index];
        await tx.update(contractPaymentSchedules).set({
          title: `استحقاق رواتب شهر ${dueDate.slice(0, 7)}`,
          dueDate,
          servicePeriod: dueDate.slice(0, 7),
          subtotalHalalas: monthlySubtotalHalalas,
          vatHalalas: Math.round(monthlySubtotalHalalas * vatRateBps / 10000),
          vatRateBps,
          amountHalalas: monthlySubtotalHalalas + Math.round(monthlySubtotalHalalas * vatRateBps / 10000),
          status: dueDate <= now.slice(0, 10) ? "due" : "scheduled",
          updatedAt: now,
        }).where(eq(contractPaymentSchedules.id, payment.id));
      }
    }
    if (editedProfessions) {
      await tx.delete(contractProfessions).where(eq(contractProfessions.contractId, id));
      await tx.insert(contractProfessions).values(editedProfessions.map((item) => ({ contractId: id, ...item })));
    }
    if (editedPayments) {
      for (const payment of editedPayments) {
        const subtotalHalalas = Math.round(contractSubtotalHalalas * payment.percentageBps / 10000);
        const vatHalalas = Math.round(subtotalHalalas * vatRateBps / 10000);
        await tx.update(contractPaymentSchedules).set({ title: payment.title, dueDate: payment.dueDate!, percentageBps: payment.percentageBps, subtotalHalalas, vatHalalas, vatRateBps, amountHalalas: subtotalHalalas + vatHalalas, status: payment.dueDate! <= now.slice(0, 10) ? "due" : "scheduled", updatedAt: now }).where(eq(contractPaymentSchedules.id, payment.id));
      }
    }
    if (clauses) {
      await tx.delete(contractClauses).where(eq(contractClauses.contractId, id));
      await tx.insert(contractClauses).values(clauses.map((clause, index) => ({ contractId: id, clauseNumber: index + 1, section: clause.section, sectionEn: clause.sectionEn || null, title: clause.title, titleEn: clause.titleEn || null, body: clause.body, bodyEn: clause.bodyEn || null, isIncluded: clause.included, isOptional: false })));
    }
    return changed;
  });
  if (!updated) return jsonNoStore({ error: "تغير العقد قبل حفظ التعديل؛ حدّث الصفحة" }, { status: 409 });
  await auditPortalAction({ actorEmail: actor.user.email, action: "workforce-contract-edited", entityType: "workforce-contract", entityId: id, before: contract, after: updated });
  await emitPortalNotification({ eventType: "workforce-contract-edited", title: "عُدّل عقد وأعيد للمسودة", message: `${contract.referenceCode} — يتطلب اعتماد المالك مجددًا.`, severity: "warning", module: "workforce", entityType: "workforce-contract", entityId: id, actionView: "workforce", targetRole: "admin" }).catch(() => undefined);
  return jsonNoStore({ contract: updated });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  if (rejectCrossSiteRequest(request)) return jsonNoStore({ error: "مصدر الطلب غير مسموح" }, { status: 403 });
  const actor = await access();
  if (!actor) return jsonNoStore({ error: "غير مصرح بحذف العقد" }, { status: 403 });
  const id = Number((await context.params).id);
  const db = getDb();
  const contract = await db.query.workforceContracts.findFirst({ where: eq(workforceContracts.id, id) });
  if (!contract) return jsonNoStore({ error: "العقد غير موجود" }, { status: 404 });
  if (contract.approvedBy || contract.status !== "draft") return jsonNoStore({ error: contract.status === "active" ? "لا يمكن حذف عقد ساري ومعتمد" : "لا يمكن حذف العقد بعد دخوله مسار الاعتماد؛ أعده للمسودة أو ألغِه وفق الصلاحية", code: "CONTRACT_DELETE_BLOCKED" }, { status: 409 });
  const document = await db.query.companyDocuments.findFirst({ where: eq(companyDocuments.id, contract.documentId) });
  await db.transaction(async (tx) => {
    await tx.delete(contractWorkerAssignments).where(eq(contractWorkerAssignments.contractId, id));
    await tx.delete(contractPaymentSchedules).where(eq(contractPaymentSchedules.contractId, id));
    await tx.delete(contractClauses).where(eq(contractClauses.contractId, id));
    await tx.delete(contractProfessions).where(eq(contractProfessions.contractId, id));
    await tx.delete(workforceContracts).where(and(eq(workforceContracts.id, id), eq(workforceContracts.status, "draft")));
    if (document) await tx.delete(companyDocuments).where(eq(companyDocuments.id, document.id));
  });
  if (document) {
    await getRuntimeEnv().BUCKET.delete(document.storageKey).catch(() => undefined);
  }
  await auditPortalAction({ actorEmail: actor.user.email, action: "workforce-contract-deleted", entityType: "workforce-contract", entityId: id, before: contract });
  await emitPortalNotification({ eventType: "workforce-contract-deleted", title: "حُذفت مسودة عقد", message: `${contract.referenceCode} — ${contract.clientName}.`, severity: "warning", module: "workforce", entityType: "workforce-contract", entityId: id, actionView: "workforce", targetDepartment: "workforce" }).catch(() => undefined);
  return jsonNoStore({ deleted: true, id });
}
