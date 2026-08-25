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
  return actor && await hasPortalPermission(actor, "workforce", "write") ? actor : null;
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
  const contractDirection:WorkforceContractDirection=payload.contractDirection==="dali_purchaser"?"dali_purchaser":payload.contractDirection==="dali_supplier"?"dali_supplier":contract.contractDirection as WorkforceContractDirection;
  const professions=await db.select().from(contractProfessions).where(eq(contractProfessions.contractId,id));
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
      firstPaymentDueDate: annualSchedule?.dueDates[0] || contract.firstPaymentDueDate,
      details: clean(payload.details, 12000) || contract.details,
      contractDirection,
      status: "draft", approvedBy: null, approvedAt: null, signedAt: null,
      versionNumber: contract.versionNumber + 1, updatedAt: now,
    }).where(and(eq(workforceContracts.id, id), eq(workforceContracts.versionNumber, contract.versionNumber))).returning();
    if (!changed) return null;
    await tx.update(companyDocuments).set({ expiryDate: endDate, updatedAt: now }).where(eq(companyDocuments.id, contract.documentId));
    if (annualSchedule?.dueDates.length && annualPayments.length) {
      const sortedPayments = annualPayments.sort((a, b) => a.installmentNumber - b.installmentNumber);
      for (const [index, payment] of sortedPayments.entries()) {
        const dueDate = annualSchedule.dueDates[index];
        await tx.update(contractPaymentSchedules).set({
          title: `استحقاق رواتب شهر ${dueDate.slice(0, 7)}`,
          dueDate,
          servicePeriod: dueDate.slice(0, 7),
          status: dueDate <= now.slice(0, 10) ? "due" : "scheduled",
          updatedAt: now,
        }).where(eq(contractPaymentSchedules.id, payment.id));
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
