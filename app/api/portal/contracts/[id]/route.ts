import { readCommercialTerms } from "@/lib/commercial-terms";
import { parseCommercialLineItems } from "@/lib/commercial-line-items";
import { and, eq, isNotNull, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { companyDocuments, complianceObligations, contractClauses, contractPaymentSchedules, contractProfessions, contractSignatureRequests, contractWorkerAbsences, contractWorkerAssignments, costCenters, documentShareLinks, financialRecords, journalLines, legalExternalShareBundleItems, legalRecords, officialLetters, purchaseInvoices, representativeRequests, workforceContracts, workOrders } from "@/db/schema";
import { auditPortalAction } from "@/lib/audit";
import { cleanDate } from "@/lib/company-documents";
import { parsePaymentSchedule, validateSeasonalSchedule, annualContractSchedule, annualInstallmentPercentages } from "@/lib/payment-schedules";
import { emitPortalNotification } from "@/lib/portal-notifications";
import { hasPortalPermission, requirePortalApiRole } from "@/lib/portal-access";
import { getRuntimeEnv } from "@/lib/runtime-env";
import { jsonNoStore, rejectCrossSiteRequest, readLimitedJson } from "@/lib/security";
import { invoicePaymentTitleEnglish } from "@/lib/invoice-pdf-copy";
import { parseWorkforceContractClauses, type WorkforceContractDirection } from "@/lib/workforce-contract-clauses";

const clean = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";

async function access() {
  const actor = await requirePortalApiRole(["admin", "manager", "employee"]);
  if (!actor) return null;
  const elevated = actor.role === "admin" || actor.functionalRoles.includes("system_owner") || actor.functionalRoles.includes("system_admin");
  return elevated || await hasPortalPermission(actor, "contracts", "write") ? actor : null;
}

class ContractEditError extends Error { constructor(message: string, public status = 400) { super(message); } }
function metadataObject(value: string | null): Record<string, unknown> { try { const parsed = JSON.parse(value || "{}"); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}; } catch { return {}; } }

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const actor = await access();
  if (!actor) return jsonNoStore({ error: "غير مصرح بتعديل العقد" }, { status: 403 });
  const id = Number((await context.params).id);
  if (!Number.isSafeInteger(id) || id < 1) return jsonNoStore({ error: "رقم العقد غير صحيح" }, { status: 400 });
  const db = getDb(), contract = await db.query.workforceContracts.findFirst({ where: eq(workforceContracts.id, id) });
  if (!contract) return jsonNoStore({ error: "العقد غير موجود" }, { status: 404 });
  const [document, professions, payments, clauses] = await Promise.all([
    db.query.companyDocuments.findFirst({ where: eq(companyDocuments.id, contract.documentId) }),
    db.select().from(contractProfessions).where(eq(contractProfessions.contractId,id)).orderBy(contractProfessions.id),
    db.select().from(contractPaymentSchedules).where(eq(contractPaymentSchedules.contractId,id)).orderBy(contractPaymentSchedules.installmentNumber),
    db.select().from(contractClauses).where(eq(contractClauses.contractId,id)).orderBy(contractClauses.clauseNumber),
  ]);
  const terms = readCommercialTerms({ ...metadataObject(document?.metadataJson || null), ...contract, contractClauses: clauses.map(row=>({...row,included:row.isIncluded})) });
  return jsonNoStore({ contract, professions, payments, terms });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (rejectCrossSiteRequest(request)) return jsonNoStore({ error: "مصدر الطلب غير مسموح" }, { status: 403 });
  const actor = await access();
  if (!actor) return jsonNoStore({ error: "غير مصرح بتعديل العقد" }, { status: 403 });
  const id = Number((await context.params).id);
  if (!Number.isSafeInteger(id) || id < 1) return jsonNoStore({ error: "رقم العقد غير صحيح" }, { status: 400 });
  const parsed = await readLimitedJson(request, 200_000);
  if (!parsed.ok) return parsed.response;
  const payload = parsed.value as Record<string, unknown>;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return jsonNoStore({ error: "بيانات التعديل غير صحيحة" }, { status: 400 });
  try {
    const db = getDb(), now = new Date().toISOString();
    const result = await db.transaction(async tx => {
      await tx.execute(sql`select id from workforce_contracts where id = ${id} for update`);
      const contract = await tx.query.workforceContracts.findFirst({ where: eq(workforceContracts.id,id) });
      if (!contract) throw new ContractEditError("العقد غير موجود",404);
      if (["active", "suspended", "signed", "expired", "terminated", "cancelled", "superseded"].includes(contract.status)) throw new ContractEditError("لا يمكن تعديل عقد بدأت آثاره التشغيلية أو المالية؛ أنشئ ملحقًا أو إصدارًا جديدًا",409);
      if (payload.versionNumber !== undefined && Number(payload.versionNumber) !== contract.versionNumber) throw new ContractEditError("تغير العقد قبل حفظ التعديل؛ حدّث الصفحة",409);
      const [document, professions, allPayments, assignments, absences, signedCopies] = await Promise.all([
        tx.query.companyDocuments.findFirst({ where: eq(companyDocuments.id,contract.documentId) }),
        tx.select().from(contractProfessions).where(eq(contractProfessions.contractId,id)).orderBy(contractProfessions.id),
        tx.select().from(contractPaymentSchedules).where(eq(contractPaymentSchedules.contractId,id)).orderBy(contractPaymentSchedules.installmentNumber).for("update"),
        tx.select().from(contractWorkerAssignments).where(eq(contractWorkerAssignments.contractId,id)),
        tx.select().from(contractWorkerAbsences).where(eq(contractWorkerAbsences.contractId,id)).limit(1),
        tx.select().from(contractSignatureRequests).where(and(eq(contractSignatureRequests.contractId,id),eq(contractSignatureRequests.status,"uploaded"))).limit(1),
      ]);
      if (!document) throw new ContractEditError("مستند العقد غير موجود",409);
      if (allPayments.some(row => row.invoiceDocumentId || row.financialRecordId || row.paymentJournalEntryId || row.paidAmountHalalas || row.absenceDeductionHalalas || !["scheduled","due"].includes(row.status)) || absences.length || signedCopies.length || assignments.some(row=>row.status !== "planned")) throw new ContractEditError("لا يمكن تعديل الأسعار أو المهن أو جدول الدفعات بعد بدء المعالجة المالية",409);
      const quantityMode = payload.quantityMode === undefined ? contract.quantityMode : String(payload.quantityMode);
      const seasonType = payload.seasonType === undefined ? contract.seasonType : String(payload.seasonType);
      if (!["fixed","open"].includes(quantityMode) || !["regular","hajj","ramadan"].includes(seasonType)) throw new ContractEditError("نوع العدد أو الموسم غير صحيح");
      const metadata = metadataObject(document.metadataJson);
      const terms = readCommercialTerms({ ...metadata, ...contract, ...payload });
      const startDate = cleanDate(terms.startDate), issueDate = cleanDate(payload.issueDate ?? contract.issueDate);
      const annualSchedule = seasonType === "regular" && startDate ? annualContractSchedule(startDate) : null;
      const endDate = annualSchedule?.endDate || cleanDate(terms.endDate);
      if (!startDate || !endDate || !issueDate || endDate < startDate || !terms.clientName || !terms.title || !terms.workSite || !terms.details || terms.details.length < 5) throw new ContractEditError("أكمل بيانات العقد وتواريخه ونطاق العمل");
      const normalizeProfession = (row: typeof professions[number]) => ({ profession: row.profession, requiredCount: row.requiredCount, unitSalaryHalalas: row.unitSalaryHalalas, actualSalaryHalalas: row.actualSalaryHalalas, sponsorshipType: row.sponsorshipType || "dali", sponsorName: row.sponsorName || null, ajirContractStatus: row.ajirContractStatus || "not_applicable" });
      const rawProfessions = Array.isArray(payload.professions) ? payload.professions as Record<string,unknown>[] : null;
      let editedProfessions: ReturnType<typeof normalizeProfession>[] | null = rawProfessions ? parseCommercialLineItems(rawProfessions.map(row=>({ ...row, quantity: row.requiredCount, durationMonths: 12, unitPrice: Number(row.unitSalaryHalalas)/100, actualSalary: Number(row.actualSalaryHalalas)/100 })), { workforce: true, quantityMode: quantityMode as "fixed"|"open", seasonType: seasonType as "regular"|"hajj"|"ramadan" }).map(row=>({ profession: row.profession, requiredCount: row.quantity, unitSalaryHalalas: row.unitPriceHalalas, actualSalaryHalalas: row.actualSalaryHalalas, sponsorshipType: row.sponsorshipType!, sponsorName: row.sponsorName, ajirContractStatus: row.ajirContractStatus! })) : null;
      if (editedProfessions && JSON.stringify(editedProfessions) === JSON.stringify(professions.map(normalizeProfession))) editedProfessions = null;
      if (assignments.length && (editedProfessions || quantityMode !== contract.quantityMode)) throw new ContractEditError("لا يمكن تغيير المهن بعد إسناد عمالة؛ ألغِ الإسناد أولًا أو أنشئ ملحقًا",409);
      if (!editedProfessions && quantityMode !== contract.quantityMode) {
        if (quantityMode === "fixed") throw new ContractEditError("حدد عدد العمالة لكل مهنة قبل التحويل إلى عدد محدد");
        editedProfessions = professions.map(row=>({...normalizeProfession(row),requiredCount:0}));
      }
      const commercialProfessions = editedProfessions || professions;
      if (!commercialProfessions.length) throw new ContractEditError("أضف المهن والأعداد والأسعار");
      const vatRateBps = payload.vatRateBps === undefined ? contract.vatRateBps : Number(payload.vatRateBps);
      if (!Number.isInteger(vatRateBps) || vatRateBps < 0 || vatRateBps > 10000) throw new ContractEditError("نسبة الضريبة غير صحيحة");
      const monthlySubtotalHalalas = commercialProfessions.reduce((sum,row)=>sum+row.requiredCount*row.unitSalaryHalalas,0);
      const contractSubtotalHalalas = quantityMode === "open" ? 0 : seasonType === "regular" ? monthlySubtotalHalalas*12 : payload.amount === undefined ? Math.round(contract.amountHalalas / (1 + contract.vatRateBps/10000)) : Math.round(Number(payload.amount)*100);
      const vatHalalas = Math.round(contractSubtotalHalalas*vatRateBps/10000), amountHalalas = contractSubtotalHalalas+vatHalalas;
      if (![contractSubtotalHalalas,amountHalalas].every(value=>Number.isSafeInteger(value)&&value>=0&&value<=2147483647) || (quantityMode === "fixed" && !contractSubtotalHalalas)) throw new ContractEditError("قيمة العقد غير صحيحة");
      const annualPayments = annualSchedule?.dueDates.map((dueDate,index)=>({ title:`استحقاق رواتب شهر ${dueDate.slice(0,7)}`, titleEn:`Salary installment for ${dueDate.slice(0,7)}`, dueDate, percentageBps:annualInstallmentPercentages()[index] })) || [];
      const paymentDrafts = quantityMode === "open" ? [] : seasonType === "regular" ? annualPayments : parsePaymentSchedule(payload.paymentSchedule === undefined ? allPayments : payload.paymentSchedule);
      if (quantityMode === "fixed" && (!validateSeasonalSchedule(paymentDrafts) || paymentDrafts.some(row=>!cleanDate(row.dueDate)))) throw new ContractEditError("جدول الدفعات غير صحيح؛ يجب أن يكون مجموع النسب 100%");
      let allocatedSubtotal = 0, allocatedVat = 0;
      const payments = paymentDrafts.map((row,index)=>{
        const last = index === paymentDrafts.length-1;
        const subtotal = last ? contractSubtotalHalalas-allocatedSubtotal : seasonType === "regular" ? monthlySubtotalHalalas : Math.round(contractSubtotalHalalas*row.percentageBps/10000);
        const vat = last ? vatHalalas-allocatedVat : Math.round(subtotal*vatRateBps/10000);
        allocatedSubtotal += subtotal; allocatedVat += vat;
        return { contractId:id, installmentNumber:index+1, ...row, titleEn:invoicePaymentTitleEnglish(row.title,row.titleEn,index+1), subtotalHalalas:subtotal, vatHalalas:vat, vatRateBps, amountHalalas:subtotal+vat, billingBasis:seasonType === "regular" ? "monthly_salary" : "seasonal_percentage", servicePeriod:seasonType === "regular" ? row.dueDate.slice(0,7) : null, status:"scheduled", createdBy:actor.user.email, updatedAt:now };
      });
      const clauses = payload.contractClauses === undefined ? null : parseWorkforceContractClauses(payload.contractClauses,terms.contractDirection,commercialProfessions.every(row=>row.ajirContractStatus === "with_ajir"));
      if (clauses && !clauses.length) throw new ContractEditError("يجب إبقاء بند تعاقدي واحد على الأقل");
      const [updated] = await tx.update(workforceContracts).set({
        clientName:terms.clientName, clientCr:terms.clientCr || null, clientVat:terms.clientVat || null, title:terms.title,
        workSite:terms.workSite, issueDate,startDate,endDate,details:terms.details,amountHalalas,vatRateBps,quantityMode,seasonType,
        billingMode:quantityMode === "open" ? "actual_usage" : seasonType === "regular" ? "monthly" : "seasonal_installments",
        firstPaymentDueDate:payments[0]?.dueDate || null, contractDirection:terms.contractDirection,
        accommodationParty:payload.accommodationParty === undefined ? contract.accommodationParty : clean(payload.accommodationParty,120),
        transportParty:payload.transportParty === undefined ? contract.transportParty : clean(payload.transportParty,120),
        showPaymentSchedule:terms.showPaymentSchedule,status:"draft",approvedBy:null,approvedAt:null,signedAt:null,versionNumber:contract.versionNumber+1,updatedAt:now,
      }).where(and(eq(workforceContracts.id,id),eq(workforceContracts.versionNumber,contract.versionNumber))).returning();
      if (!updated) throw new ContractEditError("تغير العقد قبل حفظ التعديل؛ حدّث الصفحة",409);
      await tx.update(companyDocuments).set({ title:updated.title,counterparty:updated.clientName,expiryDate:endDate,metadataJson:JSON.stringify({ ...metadata,...terms,...updated,subtotalHalalas:contractSubtotalHalalas,vatHalalas,paymentSchedule:payments,professions:commercialProfessions,...(clauses?{contractClauses:clauses}:{}) }),updatedAt:now }).where(eq(companyDocuments.id,document.id));
      if (editedProfessions) { await tx.delete(contractProfessions).where(eq(contractProfessions.contractId,id)); await tx.insert(contractProfessions).values(editedProfessions.map(row=>({contractId:id,...row}))); }
      if (allPayments.length === payments.length) { for (const [index,row] of payments.entries()) await tx.update(contractPaymentSchedules).set(row).where(eq(contractPaymentSchedules.id,allPayments[index].id)); }
      else { await tx.delete(contractPaymentSchedules).where(eq(contractPaymentSchedules.contractId,id)); if(payments.length) await tx.insert(contractPaymentSchedules).values(payments); }
      if (clauses) { await tx.delete(contractClauses).where(eq(contractClauses.contractId,id)); await tx.insert(contractClauses).values(clauses.map((row,index)=>({contractId:id,clauseNumber:index+1,section:row.section,sectionEn:row.sectionEn || null,title:row.title,titleEn:row.titleEn || null,body:row.body,bodyEn:row.bodyEn || null,isIncluded:row.included,isOptional:false}))); }
      await tx.delete(documentShareLinks).where(eq(documentShareLinks.documentId,document.id));
      const savedProfessions = await tx.select().from(contractProfessions).where(eq(contractProfessions.contractId,id));
      return { before:contract,contract:updated,professions:savedProfessions };
    });
    await auditPortalAction({actorEmail:actor.user.email,action:"workforce-contract-edited",entityType:"workforce-contract",entityId:id,before:result.before,after:result.contract}).catch(error=>console.error("contract-edit-audit",error));
    await emitPortalNotification({ eventType:"workforce-contract-edited",title:"عُدّل عقد وأعيد للمسودة",message:`${result.contract.referenceCode} — يتطلب اعتماد المالك مجددًا.`,severity:"warning",module:"workforce",entityType:"workforce-contract",entityId:id,actionView:"workforce",targetRole:"admin" }).catch(()=>undefined);
    return jsonNoStore({contract:result.contract,professions:result.professions});
  } catch (error) {
    if (error instanceof ContractEditError) return jsonNoStore({error:error.message},{status:error.status});
    console.error("contract-full-edit-failed",error);
    return jsonNoStore({error:"تعذر حفظ تعديل العقد؛ راجع البيانات أو حدّث الصفحة"},{status:400});
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  if (rejectCrossSiteRequest(request)) return jsonNoStore({ error: "مصدر الطلب غير مسموح" }, { status: 403 });
  const actor = await access();
  if (!actor) return jsonNoStore({ error: "غير مصرح بحذف العقد" }, { status: 403 });
  const id = Number((await context.params).id);
  if (!Number.isSafeInteger(id) || id < 1) return jsonNoStore({ error: "رقم العقد غير صحيح" }, { status: 400 });
  const db = getDb();
  try {
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`select id from workforce_contracts where id = ${id} for update`);
      const contract = await tx.query.workforceContracts.findFirst({ where: eq(workforceContracts.id, id) });
      if (!contract) return { kind: "missing" as const };
      if (contract.approvedBy || contract.status !== "draft")
        return {
          kind: "blocked" as const,
          error: contract.status === "active" ? "لا يمكن حذف عقد ساري ومعتمد" : "لا يمكن حذف العقد بعد دخوله مسار الاعتماد؛ ألغِه وفق الصلاحية للحفاظ على أثره النظامي",
        };

      const document = await tx.query.companyDocuments.findFirst({ where: eq(companyDocuments.id, contract.documentId) });
      const [
        payments,
        assignments,
        absences,
        legalMatter,
        bundleItem,
        signatureRequests,
        financialLinks,
        purchaseInvoiceLinks,
        workOrderLinks,
        costCenterLinks,
        journalLinks,
        complianceLinks,
        letterLinks,
        childContracts,
      ] = await Promise.all([
        tx.select().from(contractPaymentSchedules).where(eq(contractPaymentSchedules.contractId, id)),
        tx.select({ id: contractWorkerAssignments.id, status: contractWorkerAssignments.status }).from(contractWorkerAssignments).where(eq(contractWorkerAssignments.contractId, id)),
        tx.select({ id: contractWorkerAbsences.id }).from(contractWorkerAbsences).where(eq(contractWorkerAbsences.contractId, id)).limit(1),
        tx.select({ id: legalRecords.id }).from(legalRecords).where(eq(legalRecords.contractId, id)).limit(1),
        tx.select({ id: legalExternalShareBundleItems.id }).from(legalExternalShareBundleItems).where(eq(legalExternalShareBundleItems.documentId, contract.documentId)).limit(1),
        tx.select().from(contractSignatureRequests).where(eq(contractSignatureRequests.contractId, id)),
        tx.select({ id: financialRecords.id }).from(financialRecords).where(or(eq(financialRecords.contractId, id), eq(financialRecords.documentId, contract.documentId))).limit(1),
        tx.select({ id: purchaseInvoices.id }).from(purchaseInvoices).where(or(eq(purchaseInvoices.contractId, id), eq(purchaseInvoices.documentId, contract.documentId))).limit(1),
        tx.select({ id: workOrders.id }).from(workOrders).where(eq(workOrders.contractId, id)).limit(1),
        tx.select({ id: costCenters.id }).from(costCenters).where(eq(costCenters.contractId, id)).limit(1),
        tx.select({ id: journalLines.id }).from(journalLines).where(eq(journalLines.contractId, id)).limit(1),
        tx.select({ id: complianceObligations.id }).from(complianceObligations).where(eq(complianceObligations.documentId, contract.documentId)).limit(1),
        tx.select({ id: officialLetters.id }).from(officialLetters).where(eq(officialLetters.documentId, contract.documentId)).limit(1),
        tx.select({ id: workforceContracts.id }).from(workforceContracts).where(eq(workforceContracts.parentContractId, id)).limit(1),
      ]);
      const hasFinancialEffect = payments.some((payment) =>
        Boolean(payment.invoiceDocumentId || payment.financialRecordId || payment.paymentJournalEntryId) ||
        !["scheduled", "due"].includes(payment.status),
      );
      const hasOperationalAssignment = assignments.some((assignment) => assignment.status !== "planned");
      const hasSignedCopy = signatureRequests.some((signature) => signature.status === "uploaded" || Boolean(signature.signedStorageKey));
      const hasProtectedLink = financialLinks.length || purchaseInvoiceLinks.length || workOrderLinks.length || costCenterLinks.length || journalLinks.length || complianceLinks.length || letterLinks.length || childContracts.length;
      if (hasFinancialEffect || hasOperationalAssignment || absences.length || legalMatter.length || bundleItem.length || hasSignedCopy || hasProtectedLink)
        return {
          kind: "blocked" as const,
          error: "لا يمكن حذف هذه المسودة لوجود أثر مالي أو تشغيلي أو قانوني أو نسخة موقعة؛ استخدم إلغاء العقد للحفاظ على السجل",
        };

      const storageKeys = new Set<string>();
      if (document?.storageKey) storageKeys.add(document.storageKey);
      for (const signature of signatureRequests) {
        if (signature.originalStorageKey) storageKeys.add(signature.originalStorageKey);
        if (signature.signedStorageKey) storageKeys.add(signature.signedStorageKey);
      }
      await tx.delete(contractSignatureRequests).where(eq(contractSignatureRequests.contractId, id));
      await tx.delete(contractWorkerAbsences).where(eq(contractWorkerAbsences.contractId, id));
      await tx.delete(contractWorkerAssignments).where(eq(contractWorkerAssignments.contractId, id));
      await tx.delete(contractPaymentSchedules).where(eq(contractPaymentSchedules.contractId, id));
      await tx.delete(contractClauses).where(eq(contractClauses.contractId, id));
      await tx.delete(contractProfessions).where(eq(contractProfessions.contractId, id));
      if (document) await tx.delete(documentShareLinks).where(eq(documentShareLinks.documentId, document.id));
      const [deleted] = await tx.delete(workforceContracts).where(and(eq(workforceContracts.id, id), eq(workforceContracts.status, "draft"), isNotNull(workforceContracts.documentId))).returning();
      if (!deleted) throw new Error("CONTRACT_CHANGED_DURING_DELETE");
      if (document) await tx.delete(companyDocuments).where(eq(companyDocuments.id, document.id));
      if (deleted.representativeRequestId) {
        const siblingContract = await tx.select({ id: workforceContracts.id }).from(workforceContracts).where(eq(workforceContracts.representativeRequestId, deleted.representativeRequestId)).limit(1);
        if (!siblingContract.length)
          await tx.update(representativeRequests).set({ status: "approved", updatedAt: new Date().toISOString() }).where(and(eq(representativeRequests.id, deleted.representativeRequestId), eq(representativeRequests.status, "converted")));
      }
      return { kind: "deleted" as const, contract: deleted, storageKeys: [...storageKeys] };
    });
    if (result.kind === "missing") return jsonNoStore({ error: "العقد غير موجود" }, { status: 404 });
    if (result.kind === "blocked") return jsonNoStore({ error: result.error, code: "CONTRACT_DELETE_BLOCKED" }, { status: 409 });
    await Promise.all(result.storageKeys.map((storageKey) => getRuntimeEnv().BUCKET.delete(storageKey).catch((error) => console.warn("contract-delete-storage-cleanup-failed", storageKey, error))));
    await auditPortalAction({ actorEmail: actor.user.email, action: "workforce-contract-deleted", entityType: "workforce-contract", entityId: id, before: result.contract });
    await emitPortalNotification({ eventType: "workforce-contract-deleted", title: "حُذفت مسودة عقد", message: `${result.contract.referenceCode} — ${result.contract.clientName}.`, severity: "warning", module: "workforce", entityType: "workforce-contract", entityId: id, actionView: "workforce", targetDepartment: "workforce" }).catch(() => undefined);
    return jsonNoStore({ deleted: true, id });
  } catch (error) {
    console.error("workforce-contract-delete-failed", { id, error });
    const changed = error instanceof Error && error.message === "CONTRACT_CHANGED_DURING_DELETE";
    return jsonNoStore({ error: changed ? "تغيرت حالة العقد أثناء الحذف؛ حدّث الصفحة وحاول مجددًا" : "تعذر حذف المسودة لوجود سجل تابع محمي؛ استخدم إلغاء العقد أو راجع الارتباطات", code: "CONTRACT_DELETE_BLOCKED" }, { status: 409 });
  }
}
