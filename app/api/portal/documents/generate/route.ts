import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import {
  companyAssets,
  companyDocuments,
  clients,
  contractClauses,
  contractPaymentSchedules,
  contractProfessions,
  contractWorkerAssignments,
  financialRecords,
  portalActivity,
  quoteItems,
  quoteVersions,
  representativeRequests,
  salesOpportunities,
  salesRepresentatives,
  suppliers,
  workers,
  workforceContracts,
  workforceRequests,
} from "@/db/schema";
import { cleanDate, cleanText, makeReference, objectKey, safeFileName } from "@/lib/company-documents";
import { generateIssuedPdf, issuedDocumentLabels, type IssuedDocumentType } from "@/lib/pdf-generator";
import { canManagePortalDocuments, requirePortalApiRole } from "@/lib/portal-access";
import { emitPortalNotification } from "@/lib/portal-notifications";
import { getRuntimeEnv } from "@/lib/runtime-env";
import { rejectCrossSiteRequest, requestCorrelationId, validateUploadedFile } from "@/lib/security";
import { annualContractSchedule, parsePaymentSchedule, validateSeasonalSchedule } from "@/lib/payment-schedules";
import { parseWorkforceContractClauses, type WorkforceContractDirection } from "@/lib/workforce-contract-clauses";

const prefixes: Record<IssuedDocumentType, string> = {
  workforce_contract: "CTR",
  quotation: "QTN",
  progress_claim: "CLM",
  invoice: "INV",
  receipt: "RCP",
  payment_voucher: "PAY",
  construction_record: "CST",
  official_letter: "LTR",
};

type ProfessionInput = { profession: string; requiredCount: number; unitSalaryHalalas: number; sponsorshipType: "dali" | "other"; sponsorName: string | null; ajirContractStatus: "not_applicable" | "with_ajir" | "without_ajir"; workerIds: number[] };
type PaymentInput = { title: string; dueDate: string; percentageBps: number; subtotalHalalas: number; vatHalalas: number; amountHalalas: number; billingBasis: "monthly_salary" | "seasonal_percentage"; servicePeriod: string | null };

function isDocumentType(value: string): value is IssuedDocumentType {
  return value in issuedDocumentLabels;
}

function parsePositiveId(value: unknown) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function parseProfessions(value: unknown, legacyProfession: string, legacyCount: number): ProfessionInput[] {
  let raw: unknown = value;
  if (typeof raw === "string") {
    try { raw = JSON.parse(raw); } catch { raw = null; }
  }
  if (!Array.isArray(raw) || !raw.length) {
    raw = legacyProfession && legacyCount ? [{ profession: legacyProfession, requiredCount: legacyCount, workerIds: [] }] : [];
  }

  const items = Array.isArray(raw) ? raw : [];
  return items.map((item: unknown) => {
    const record = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const workerIds = Array.isArray(record.workerIds)
      ? Array.from(new Set(record.workerIds.map(Number).filter((id) => Number.isInteger(id) && id > 0)))
      : [];
    return {
      profession: cleanText(record.profession, 120),
      requiredCount: Number(record.requiredCount ?? record.count ?? 0),
      unitSalaryHalalas: Math.round(Number(record.unitSalary || 0) * 100),
      sponsorshipType: record.sponsorshipType === "other" ? "other" : "dali",
      sponsorName: record.sponsorshipType === "other" ? cleanText(record.sponsorName, 160) || null : null,
      ajirContractStatus: record.ajirContractStatus === "with_ajir" || record.ajirContractStatus === "without_ajir"
        ? record.ajirContractStatus
        : "not_applicable",
      workerIds,
    };
  });
}

function parsePayments(value: unknown, contractSubtotalHalalas: number, vatRateBps: number): PaymentInput[] {
  let raw: unknown = value;
  if (typeof raw === "string") { try { raw = JSON.parse(raw); } catch { raw = null; } }
  if (!Array.isArray(raw)) return [];
  const payments: PaymentInput[] = raw.map((item) => {
    const row = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const percentageBps = Math.round(Number(row.percentage || 0) * 100);
    const subtotalHalalas = Math.round(contractSubtotalHalalas * percentageBps / 10000);
    const vatHalalas = Math.round(subtotalHalalas * vatRateBps / 10000);
    return { title: cleanText(row.title, 160), dueDate: cleanDate(row.dueDate) || "", percentageBps, subtotalHalalas, vatHalalas, amountHalalas: subtotalHalalas + vatHalalas, billingBasis: "seasonal_percentage", servicePeriod: null };
  });
  if (payments.length && payments.reduce((sum, item) => sum + item.percentageBps, 0) === 10000) {
    const last = payments[payments.length - 1];
    last.subtotalHalalas = contractSubtotalHalalas - payments.slice(0, -1).reduce((sum, item) => sum + item.subtotalHalalas, 0);
    last.vatHalalas = Math.round(last.subtotalHalalas * vatRateBps / 10000);
    last.amountHalalas = last.subtotalHalalas + last.vatHalalas;
  }
  return payments;
}

export async function POST(request: Request) {
  if (rejectCrossSiteRequest(request)) return Response.json({ error: "مصدر الطلب غير مسموح" }, { status: 403 });
  const access = await requirePortalApiRole(["admin", "manager", "employee"]);
  if (!access || !canManagePortalDocuments(access)) return Response.json({ error: "غير مصرح بإصدار المستندات" }, { status: 403 });
  const correlationId = requestCorrelationId(request);

  let form: FormData;
  try {
    form = await request.formData();
  } catch (error) {
    console.error(`[issued-document-form-data:${correlationId}]`, error);
    return Response.json({
      error: `تعذّر قراءة ملفات العقد. تأكد أن الحجم الإجمالي للمرفقات لا يتجاوز 40 ميجابايت ثم أعد المحاولة. مرجع التتبع: ${correlationId}`,
    }, { status: 400, headers: { "x-correlation-id": correlationId } });
  }

  let storageKey = "";
  const auxiliaryStorageKeys: string[] = [];
  try {
    const payload = Object.fromEntries(form.entries()) as Record<string, unknown>;
    const commercialRegistrationFile = form.get("commercialRegistrationFile");
    const vatCertificateFile = form.get("vatCertificateFile");
    const nationalAddressFile = form.get("nationalAddressFile");
    const documentType = cleanText(payload.documentType, 40);
    const clientName = cleanText(payload.clientName, 160);
    const clientCr = cleanText(payload.clientCr, 30);
    const clientVat = cleanText(payload.clientVat, 30);
    const issueDate = cleanDate(payload.issueDate);
    const expiryDate = cleanDate(payload.expiryDate, true);
    const details = cleanText(payload.details, 4000);
    const workSite = cleanText(payload.workSite, 180);
    const clientAddress = cleanText(payload.clientAddress, 240);
    const clientRepresentative = cleanText(payload.clientRepresentative, 160);
    const clientRepresentativeTitle = cleanText(payload.clientRepresentativeTitle, 120);
    const paymentTerms = cleanText(payload.paymentTerms, 1200);
    const workingHours = cleanText(payload.workingHours, 240);
    const weeklyOff = cleanText(payload.weeklyOff, 120);
    const accommodationParty = cleanText(payload.accommodationParty, 120);
    const transportParty = cleanText(payload.transportParty, 120);
    const specialTerms = cleanText(payload.specialTerms, 2000);
    const showPaymentSchedule = payload.showPaymentSchedule !== "false" && payload.showPaymentSchedule !== "off";
    const legacyProfession = cleanText(payload.profession, 120);
    const startDate = cleanDate(payload.startDate, true);
    const legacyWorkerCount = Number(payload.workerCount || 0);
    const amount = Number(payload.amount || 0);
    const vatEnabled = payload.vatEnabled === true || payload.vatEnabled === "on" || payload.vatEnabled === "true";
    const vatRate = vatEnabled ? Number(payload.vatRate || 15) : 0;
    const linkedContractId = parsePositiveId(payload.linkedContractId);
    const sourceRequestId = parsePositiveId(payload.sourceRequestId);
    const salesRepresentativeId = parsePositiveId(payload.salesRepresentativeId);
    const representativeRequestId = parsePositiveId(payload.representativeRequestId);
    const quoteVersionId = parsePositiveId(payload.quoteVersionId);
    const quantityMode = payload.quantityMode === "open" ? "open" : "fixed";
    const contractDirection: WorkforceContractDirection = payload.contractDirection === "dali_purchaser" ? "dali_purchaser" : "dali_supplier";
    const seasonType = payload.seasonType === "ramadan" || payload.seasonType === "hajj" ? payload.seasonType : "regular";
    const billingMode = quantityMode === "open" ? "actual_usage" : seasonType === "regular" ? "monthly" : "seasonal_installments";
    const annualSchedule = documentType === "workforce_contract" && seasonType === "regular" && startDate
      ? annualContractSchedule(startDate)
      : null;
    const endDate = documentType === "workforce_contract" && seasonType === "regular"
      ? annualSchedule?.endDate || null
      : cleanDate(payload.endDate, true);
    let contractAmountHalalas = Math.round(amount * 100);
    let paymentSchedule: PaymentInput[] = [];
    const validatedClientFiles: Array<{ file: File; kind: string; label: string; bytes: Uint8Array; validationDetails: string }> = [];

    if (!isDocumentType(documentType) || documentType === "construction_record" || clientName.length < 2 || !issueDate || expiryDate === "" || details.length < 5) {
      return Response.json({ error: "بيانات المستند غير مكتملة أو غير صحيحة" }, { status: 400 });
    }
    const title = `${issuedDocumentLabels[documentType]} — ${clientName}`;
    if (!Number.isFinite(amount) || amount < 0 || amount > 1000000000 || (documentType === "workforce_contract" && quantityMode === "fixed" && seasonType !== "regular" && amount <= 0)) {
      return Response.json({ error: "قيمة المستند غير صحيحة" }, { status: 400 });
    }
    if (documentType === "quotation" && (!expiryDate || amount <= 0)) {
      return Response.json({ error: "صلاحية العرض وقيمة الخدمة من متطلبات نموذج عرض السعر" }, { status: 400 });
    }
    if (!Number.isFinite(vatRate) || vatRate < 0 || vatRate > 100 || (vatEnabled && !clientVat)) {
      return Response.json({ error: vatEnabled && !clientVat ? "أدخل الرقم الضريبي للعميل عند تفعيل الضريبة" : "نسبة الضريبة غير صحيحة" }, { status: 400 });
    }

    const professionInputs = documentType === "workforce_contract"
      ? parseProfessions(payload.professions, legacyProfession, legacyWorkerCount)
      : [];
    if (documentType === "workforce_contract") {
      if (seasonType === "regular" && !annualSchedule?.endDate) return Response.json({ error: "تاريخ بداية العقد السنوي غير صحيح" }, { status: 400 });
      const uniqueLabels = new Set(professionInputs.map((item) => item.profession));
      if (!workSite || !startDate || !endDate || endDate < startDate || !professionInputs.length || uniqueLabels.size !== professionInputs.length) {
        return Response.json({ error: "أكمل موقع العمل ومدة العقد وأضف كل مهنة مرة واحدة" }, { status: 400 });
      }
      if (professionInputs.some((item) => item.profession.length < 2 || item.profession === "أخرى" || !Number.isInteger(item.requiredCount) || (quantityMode === "fixed" ? item.requiredCount < 1 : item.requiredCount !== 0) || item.requiredCount > 100000 || !Number.isInteger(item.unitSalaryHalalas) || item.unitSalaryHalalas <= 0 || item.unitSalaryHalalas > 100000000 || (quantityMode === "fixed" && item.workerIds.length > item.requiredCount) || (quantityMode === "open" && item.workerIds.length > 0))) {
        return Response.json({ error: "اختر المهنة أو اكتب اسم المهنة الفعلي يدوياً عند اختيار «أخرى»، وأدخل عدد العمالة وراتب العامل الصحيح لكل مهنة" }, { status: 400 });
      }
      if (professionInputs.some((item) => !["with_ajir", "without_ajir", "not_applicable"].includes(item.ajirContractStatus)
        || (item.sponsorshipType === "other" && !item.sponsorName))) {
        return Response.json({ error: "أكمل جهة الكفالة وحالة عقد أجير لكل مهنة، ويمكن تحديد أجير أيضًا للعمالة على كفالة دالي" }, { status: 400 });
      }
      const vatRateBpsForSchedule = vatEnabled ? Math.round(vatRate * 100) : 0;
      if (quantityMode === "fixed" && seasonType === "regular") {
        const dueDates = annualSchedule?.dueDates || [];
        if (!endDate || dueDates.length !== 12) return Response.json({ error: "تعذر حساب مدة العقد السنوي وجدول دفعاته من تاريخ البداية" }, { status: 400 });
        const monthlySubtotal = professionInputs.reduce((sum, item) => sum + item.requiredCount * item.unitSalaryHalalas, 0);
        contractAmountHalalas = monthlySubtotal * dueDates.length;
        const totalVatHalalas = Math.round(contractAmountHalalas * vatRateBpsForSchedule / 10000);
        const standardVatHalalas = Math.round(monthlySubtotal * vatRateBpsForSchedule / 10000);
        const standardPercentageBps = Math.floor(10000 / dueDates.length);
        paymentSchedule = dueDates.map((dueDate, index) => {
          const finalInstallment = index === dueDates.length - 1;
          const installmentVatHalalas = finalInstallment ? totalVatHalalas - standardVatHalalas * index : standardVatHalalas;
          const percentageBps = finalInstallment ? 10000 - standardPercentageBps * index : standardPercentageBps;
          return { title: `استحقاق رواتب شهر ${dueDate.slice(0,7)}`, dueDate, percentageBps, subtotalHalalas: monthlySubtotal, vatHalalas: installmentVatHalalas, amountHalalas: monthlySubtotal + installmentVatHalalas, billingBasis: "monthly_salary", servicePeriod: dueDate.slice(0,7) };
        });
      } else if (quantityMode === "fixed") {
        paymentSchedule = parsePayments(payload.paymentSchedule, contractAmountHalalas, vatRateBpsForSchedule);
      }
      if (quantityMode === "fixed" && seasonType !== "regular" && (!paymentSchedule.length || paymentSchedule.some((item) => item.title.length < 2 || !item.dueDate || item.percentageBps <= 0 || item.amountHalalas <= 0) || paymentSchedule.reduce((sum, item) => sum + item.percentageBps, 0) !== 10000)) {
        return Response.json({ error: "يجب إضافة جدول دفعات صحيح مجموع نسبه 100% قبل إنشاء العقد" }, { status: 400 });
      }
      if (!clientCr || !clientVat || !clientAddress) {
        return Response.json({ error: "السجل التجاري والرقم الضريبي والعنوان الوطني للعميل بيانات إلزامية عند إنشاء العقد" }, { status: 400 });
      }
      for (const [file, kind, label] of [[commercialRegistrationFile, "commercial-registration", "السجل التجاري"], [vatCertificateFile, "vat-certificate", "الشهادة الضريبية"], [nationalAddressFile, "national-address", "العنوان الوطني"]] as const) {
        if (!(file instanceof File) || !file.size) return Response.json({ error: `ملف ${label} إلزامي عند إنشاء العقد` }, { status: 400 });
        const validation = await validateUploadedFile(file, { contentTypes: new Set(["application/pdf", "image/png", "image/jpeg"]), maxBytes: 12 * 1024 * 1024 });
        if (!validation.valid) return Response.json({ error: `${label}: ${validation.error}` }, { status: 400 });
        validatedClientFiles.push({ file, kind, label, bytes: validation.bytes, validationDetails: validation.validationDetails });
      }
      const allSelected = professionInputs.flatMap((item) => item.workerIds);
      if (new Set(allSelected).size !== allSelected.length) {
        return Response.json({ error: "لا يمكن اختيار العامل نفسه في أكثر من مهنة داخل العقد" }, { status: 400 });
      }
    }
    const allWorkersWithAjir = documentType === "workforce_contract" && professionInputs.length > 0 && professionInputs.every((item) => item.ajirContractStatus === "with_ajir");
    const clauseInputs = documentType === "workforce_contract" ? parseWorkforceContractClauses(payload.contractClauses, contractDirection, allWorkersWithAjir) : [];
    if (documentType === "workforce_contract" && !clauseInputs.length) return Response.json({ error: "يجب إبقاء بند تعاقدي واحد على الأقل" }, { status: 400 });

    const db = getDb();
    const [sourceRequest, salesRepresentative, representativeRequest, sourceQuote, existingQuoteContract] = await Promise.all([
      sourceRequestId ? db.query.workforceRequests.findFirst({ where: eq(workforceRequests.id, sourceRequestId) }) : Promise.resolve(null),
      salesRepresentativeId ? db.query.salesRepresentatives.findFirst({ where: eq(salesRepresentatives.id, salesRepresentativeId) }) : Promise.resolve(null),
      representativeRequestId ? db.query.representativeRequests.findFirst({ where: eq(representativeRequests.id, representativeRequestId) }) : Promise.resolve(null),
      quoteVersionId ? db.query.quoteVersions.findFirst({ where: eq(quoteVersions.id, quoteVersionId) }) : Promise.resolve(null),
      quoteVersionId ? db.query.workforceContracts.findFirst({ where: eq(workforceContracts.quoteVersionId, quoteVersionId) }) : Promise.resolve(null),
    ]);
    if (sourceRequestId && !sourceRequest) return Response.json({ error: "طلب الموقع المحدد غير موجود" }, { status: 404 });
    if (salesRepresentativeId && (!salesRepresentative || salesRepresentative.status !== "active")) return Response.json({ error: "المندوب المحدد غير موجود أو غير نشط" }, { status: 409 });
    if (salesRepresentative && salesRepresentative.representativeType !== (contractDirection === "dali_purchaser" ? "purchasing" : "sales")) return Response.json({ error: "نوع المندوب لا يطابق اتجاه عقد العمالة" }, { status: 409 });
    if (representativeRequestId && (!representativeRequest || representativeRequest.status !== "approved" || representativeRequest.requestType !== (contractDirection === "dali_purchaser" ? "purchase" : "sales"))) return Response.json({ error: "طلب المندوب غير معتمد أو لا يطابق اتجاه العقد" }, { status: 409 });
    if (quoteVersionId && (!sourceQuote || !["approved", "sent", "accepted"].includes(sourceQuote.status))) return Response.json({ error: "لا يمكن إنشاء عقد إلا من عرض سعر معتمد" }, { status: 409 });
    if (existingQuoteContract) return Response.json({ error: "تم تحويل عرض السعر إلى عقد سابقًا" }, { status: 409 });
    if (sourceQuote && sourceQuote.quantityMode !== quantityMode) return Response.json({ error: "نوع العدد في العقد يجب أن يطابق عرض السعر" }, { status: 409 });
    if (sourceQuote && sourceQuote.seasonType !== seasonType) return Response.json({ error: "نوع الموسم والفوترة في العقد يجب أن يطابق عرض السعر" }, { status: 409 });
    if (sourceQuote && seasonType !== "regular" && quantityMode === "fixed") {
      const sourceSchedule = parsePaymentSchedule(sourceQuote.paymentScheduleJson);
      if (!validateSeasonalSchedule(sourceSchedule)) return Response.json({ error: "عرض السعر الموسمي المرتبط لا يحتوي جدول دفعات معتمدًا" }, { status: 409 });
      paymentSchedule = parsePayments(sourceSchedule.map((row) => ({ title: row.title, dueDate: row.dueDate, percentage: row.percentageBps / 100 })), contractAmountHalalas, vatEnabled ? Math.round(vatRate * 100) : 0);
    }
    const sourceOpportunity = sourceQuote ? await db.query.salesOpportunities.findFirst({ where: eq(salesOpportunities.id, sourceQuote.opportunityId) }) : null;
    const sourceQuoteItems = sourceQuote ? await db.select().from(quoteItems).where(eq(quoteItems.quoteVersionId, sourceQuote.id)) : [];
    if (sourceQuote && (!sourceOpportunity || !sourceQuoteItems.length)) return Response.json({ error: "بيانات عرض السعر المرتبط غير مكتملة" }, { status: 409 });
    if (sourceQuote && (sourceQuote.quantityMode === "open" ? professionInputs.some(item => item.requiredCount !== 0) : sourceQuoteItems.some(item => !professionInputs.some(profession => profession.profession === item.profession && profession.requiredCount === item.quantity)))) return Response.json({ error: "مهن وأعداد العقد لا تطابق عرض السعر المقبول" }, { status: 409 });
    if (sourceQuote && sourceQuoteItems.some((quoteItem) => !professionInputs.some((profession) =>
      profession.profession === quoteItem.profession
      && profession.sponsorshipType === quoteItem.sponsorshipType
      && profession.sponsorName === quoteItem.sponsorName
      && profession.ajirContractStatus === quoteItem.ajirContractStatus
    ))) return Response.json({ error: "بيانات الكفالة وأجير في العقد يجب أن تطابق عرض السعر المقبول" }, { status: 409 });
    if (sourceQuote && sourceQuote.seasonType === "regular" && sourceQuoteItems.some((item) => item.durationMonths !== 12)) return Response.json({ error: "عرض السعر السنوي مرتبط بمدة غير 12 شهرًا؛ أنشئ إصدارًا مصححًا قبل تحويله إلى عقد" }, { status: 409 });
    if (sourceQuote && quantityMode === "fixed" && contractAmountHalalas !== sourceQuote.subtotalHalalas) return Response.json({ error: "قيمة العقد يجب أن تطابق قيمة عرض السعر قبل الضريبة" }, { status: 409 });
    if (sourceQuote && Math.round(vatRate * 100) !== sourceQuote.vatRateBps) return Response.json({ error: "نسبة ضريبة العقد يجب أن تطابق عرض السعر" }, { status: 409 });
    const assets = await db.select().from(companyAssets);
    if (!assets.some((asset) => asset.slot === "stamp") || !assets.some((asset) => asset.slot === "signature")) {
      return Response.json({ error: "ارفع الختم والتوقيع المعتمدين أولاً" }, { status: 409 });
    }

    const relevantWorkers = documentType === "workforce_contract"
      ? await db.select().from(workers).where(inArray(workers.profession, professionInputs.map((item) => item.profession)))
      : [];
    const selectedIds = professionInputs.flatMap((item) => item.workerIds);
    const selectedWorkers = selectedIds.length
      ? relevantWorkers.filter((worker) => selectedIds.includes(worker.id))
      : [];
    if (selectedWorkers.length !== selectedIds.length) {
      return Response.json({ error: "تعذّر العثور على أحد العمال المختارين ضمن المهنة المطلوبة" }, { status: 400 });
    }
    for (const item of professionInputs) {
      const selectedForProfession = selectedWorkers.filter((worker) => item.workerIds.includes(worker.id));
      if (selectedForProfession.some((worker) => worker.profession !== item.profession || worker.status !== "available"
        || worker.sponsorshipType !== item.sponsorshipType
        || (item.sponsorshipType === "other" && worker.sponsorName !== item.sponsorName))) {
        return Response.json({ error: `يجب أن تكون العمالة المختارة لمهنة ${item.profession} متاحة ومطابقة للمهنة وجهة الكفالة` }, { status: 409 });
      }
    }

    const capacity = professionInputs.map((item) => {
      const sponsorshipMatch = (worker: typeof workers.$inferSelect) => worker.sponsorshipType === item.sponsorshipType
        && (item.sponsorshipType !== "other" || worker.sponsorName === item.sponsorName);
      const registeredCount = relevantWorkers.filter((worker) => worker.profession === item.profession && sponsorshipMatch(worker)).length;
      const availableCount = relevantWorkers.filter((worker) => worker.profession === item.profession && worker.status === "available" && sponsorshipMatch(worker)).length;
      return {
        profession: item.profession,
        requiredCount: item.requiredCount,
        selectedCount: item.workerIds.length,
        registeredCount,
        availableCount,
        registeredShortage: Math.max(0, item.requiredCount - registeredCount),
        availableShortage: Math.max(0, item.requiredCount - availableCount),
        unassignedCount: item.requiredCount - item.workerIds.length,
      };
    });

    const referenceCode = makeReference(prefixes[documentType]);
    const subtotalHalalas = quantityMode === "open" ? undefined : contractAmountHalalas || undefined;
    const vatRateBps = vatEnabled ? Math.round(vatRate * 100) : 0;
    const vatHalalas = subtotalHalalas && vatRateBps ? Math.round((subtotalHalalas * vatRateBps) / 10000) : 0;
    const amountHalalas = subtotalHalalas ? subtotalHalalas + vatHalalas : undefined;
    const pdfBytes = await generateIssuedPdf({
      approvalState: documentType === "workforce_contract" ? "draft" : undefined,
      documentType,
      referenceCode,
      clientName,
      clientCr: clientCr || undefined,
      clientVat: clientVat || undefined,
      title,
      issueDate,
      expiryDate: documentType === "workforce_contract" ? endDate || undefined : expiryDate || undefined,
      amountHalalas,
      subtotalHalalas,
      vatHalalas,
      vatRateBps,
      quantityMode,
      contractDirection,
      contractClauses: clauseInputs,
      details,
      workSite: workSite || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      clientAddress: clientAddress || undefined,
      clientRepresentative: clientRepresentative || undefined,
      clientRepresentativeTitle: clientRepresentativeTitle || undefined,
      paymentTerms: paymentTerms || undefined,
      workingHours: workingHours || undefined,
      weeklyOff: weeklyOff || undefined,
      accommodationParty: accommodationParty || undefined,
      transportParty: transportParty || undefined,
      specialTerms: specialTerms || undefined,
      professions: professionInputs.map((item) => ({
        profession: item.profession,
        requiredCount: item.requiredCount,
        sponsorshipType: item.sponsorshipType,
        sponsorName: item.sponsorName,
        ajirContractStatus: item.ajirContractStatus,
        assignedWorkers: selectedWorkers
          .filter((worker) => item.workerIds.includes(worker.id))
          .map((worker) => ({ fullName: worker.fullName, iqamaNumber: worker.iqamaNumber })),
      })),
      paymentSchedule: showPaymentSchedule ? paymentSchedule : undefined,
    }, assets.map((asset) => ({ slot: asset.slot as "stamp" | "signature", storageKey: asset.storageKey, contentType: asset.contentType })));

    const fileName = `${referenceCode}.pdf`;
    storageKey = objectKey("issued-pdfs", fileName);
    await getRuntimeEnv().BUCKET.put(storageKey, pdfBytes, {
      httpMetadata: { contentType: "application/pdf" },
      customMetadata: { issuedBy: access.user.email, referenceCode, documentType },
    });
    const storedPdf = await getRuntimeEnv().BUCKET.get(storageKey);
    if (!storedPdf || (await storedPdf.arrayBuffer()).byteLength !== pdfBytes.byteLength) throw new Error("تعذر التحقق من حفظ ملف العقد");

    const category = documentType === "workforce_contract" ? "contract" : ["invoice", "receipt", "payment_voucher", "progress_claim"].includes(documentType) ? "finance" : "other";
    const uploadedClientFiles: Array<{ kind: string; label: string; fileName: string; storageKey: string; contentType: string; sizeBytes: number; validationDetails: string }> = [];
    for (const { file, kind, label, bytes, validationDetails } of validatedClientFiles) {
      const clientFileName = safeFileName(file.name);
      const clientStorageKey = objectKey("client-documents", clientFileName);
      auxiliaryStorageKeys.push(clientStorageKey);
      await getRuntimeEnv().BUCKET.put(clientStorageKey, bytes, { httpMetadata: { contentType: file.type }, customMetadata: { uploadedBy: access.user.email, clientName, commercialRegistration: clientCr, contractReference: referenceCode, documentKind: kind, validation: validationDetails } });
      const storedClientFile = await getRuntimeEnv().BUCKET.get(clientStorageKey);
      if (!storedClientFile || (await storedClientFile.arrayBuffer()).byteLength !== bytes.byteLength) throw new Error(`تعذر التحقق من حفظ ملف ${label}`);
      uploadedClientFiles.push({ kind, label, fileName: clientFileName, storageKey: clientStorageKey, contentType: file.type, sizeBytes: file.size, validationDetails });
    }

    const updatedWorkers: Array<typeof workers.$inferSelect> = [];
    const financialCategory: Partial<Record<IssuedDocumentType, string>> = {
      invoice: "workforce_invoice",
      receipt: "receipt_voucher",
      payment_voucher: "payment_voucher",
      progress_claim: "progress_claim",
    };
    const persisted = await db.transaction(async (tx) => {
      let client: typeof clients.$inferSelect | null = null;
      let supplier: typeof suppliers.$inferSelect | null = null;
      let createdClientId: number | null = null;
      if (documentType === "workforce_contract") {
        if (contractDirection === "dali_purchaser") {
          const [existingSupplier] = await tx.select().from(suppliers).where(eq(suppliers.commercialRegistration, clientCr)).limit(1);
          if (existingSupplier) [supplier] = await tx.update(suppliers).set({ legalName: clientName, vatNumber: clientVat, address: clientAddress, status: "active", updatedAt: new Date().toISOString() }).where(eq(suppliers.id, existingSupplier.id)).returning();
          else [supplier] = await tx.insert(suppliers).values({ supplierCode: makeReference("SUP"), legalName: clientName, commercialRegistration: clientCr, vatNumber: clientVat, address: clientAddress, status: "active", createdBy: access.user.email }).returning();
        } else {
          const [existingClient] = await tx.select().from(clients).where(eq(clients.commercialRegistration, clientCr)).limit(1);
          if (existingClient) [client] = await tx.update(clients).set({ legalName: clientName, vatNumber: clientVat, address: clientAddress, status: "active", sourceRequestId, salesRepresentativeId, updatedAt: new Date().toISOString(), version: existingClient.version + 1 }).where(eq(clients.id, existingClient.id)).returning();
          else { [client] = await tx.insert(clients).values({ clientCode: makeReference("CLI"), legalName: clientName, commercialRegistration: clientCr, vatNumber: clientVat, address: clientAddress, status: "active", sourceRequestId, salesRepresentativeId, createdBy: access.user.email }).returning(); createdClientId = client.id; }
        }
      }

      const [saved] = await tx.insert(companyDocuments).values({
        referenceCode,
        title,
        category,
        documentType,
        counterparty: clientName,
        fileName,
        storageKey,
        contentType: "application/pdf",
        sizeBytes: pdfBytes.byteLength,
        expiryDate: documentType === "workforce_contract" ? endDate : expiryDate,
        source: "generated",
        metadataJson: JSON.stringify({ clientId: client?.id || null, supplierId: supplier?.id || null, sourceRequestId, representativeRequestId, salesRepresentativeId, quoteVersionId, quantityMode, contractDirection, contractClauses: clauseInputs, allWorkersWithAjir, clientCr, clientVat, clientAddress, clientRepresentative, clientRepresentativeTitle, issueDate, amountHalalas, subtotalHalalas, vatHalalas, vatRateBps, details, workSite, startDate, endDate, paymentTerms, paymentSchedule, showPaymentSchedule, workingHours, weeklyOff, accommodationParty, transportParty, specialTerms, professions: professionInputs, capacity, linkedContractId, templateVersion: "letterhead-v5-contract-controls" }),
        createdBy: access.user.email,
      }).returning();

      let contract: typeof workforceContracts.$inferSelect | null = null;
      let professionRecords: Array<typeof contractProfessions.$inferSelect> = [];
      const assignmentRecords: Array<typeof contractWorkerAssignments.$inferSelect> = [];
      if (documentType === "workforce_contract") {
        [contract] = await tx.insert(workforceContracts).values({
          referenceCode,
          documentId: saved.id,
          clientName,
          clientCr: clientCr || null,
          clientVat: clientVat || null,
          clientId: client?.id || null,
          supplierId: supplier?.id || null,
          sourceRequestId,
          salesRepresentativeId,
          representativeRequestId,
          opportunityId: sourceOpportunity?.id || null,
          quoteVersionId,
          title,
          workSite,
          issueDate,
          startDate: startDate!,
          endDate: endDate!,
          amountHalalas: amountHalalas || 0,
          contractDirection,
          quantityMode,
          vatRateBps,
          seasonType,
          billingMode,
          firstPaymentDueDate: paymentSchedule[0]?.dueDate || null,
          showPaymentSchedule,
          accommodationParty: accommodationParty || null,
          transportParty: transportParty || null,
          details,
          createdBy: access.user.email,
        }).returning();
        if (representativeRequestId) await tx.update(representativeRequests).set({ status: "converted", updatedAt: new Date().toISOString() }).where(eq(representativeRequests.id, representativeRequestId));
        await tx.insert(contractClauses).values(clauseInputs.map((clause, index) => ({ contractId: contract!.id, clauseNumber: index + 1, section: clause.section, sectionEn: clause.sectionEn || null, title: clause.title, titleEn: clause.titleEn || null, body: clause.body, bodyEn: clause.bodyEn || null, isOptional: false, isIncluded: clause.included })));
        if (paymentSchedule.length) await tx.insert(contractPaymentSchedules).values(paymentSchedule.map((payment, index) => ({ contractId: contract!.id, installmentNumber: index + 1, title: payment.title, dueDate: payment.dueDate, percentageBps: payment.percentageBps, subtotalHalalas: payment.subtotalHalalas, vatHalalas: payment.vatHalalas, vatRateBps, amountHalalas: payment.amountHalalas, billingBasis: payment.billingBasis, servicePeriod: payment.servicePeriod, status: payment.dueDate <= new Date().toISOString().slice(0, 10) ? "due" : "scheduled", createdBy: access.user.email })));
        for (const uploaded of uploadedClientFiles) {
          await tx.insert(companyDocuments).values({ referenceCode: makeReference("CLD"), title: `${uploaded.label} - ${clientName}`, category: "certificate", documentType: uploaded.kind, counterparty: clientName, fileName: uploaded.fileName, storageKey: uploaded.storageKey, contentType: uploaded.contentType, sizeBytes: uploaded.sizeBytes, source: "uploaded", validationStatus: "signature-validated", validationDetails: uploaded.validationDetails, metadataJson: JSON.stringify({ clientId: client?.id || null, supplierId: supplier?.id || null, clientName, contractId: contract.id, contractReference: contract.referenceCode, documentKind: uploaded.kind }), createdBy: access.user.email });
        }
        professionRecords = await tx.insert(contractProfessions).values(professionInputs.map((item) => ({ contractId: contract!.id, profession: item.profession, requiredCount: item.requiredCount, unitSalaryHalalas: item.unitSalaryHalalas, sponsorshipType: item.sponsorshipType, sponsorName: item.sponsorName, ajirContractStatus: item.ajirContractStatus }))).returning();
        for (const professionRecord of professionRecords) {
          const input = professionInputs.find((item) => item.profession === professionRecord.profession)!;
          if (!input.workerIds.length) continue;
          const inserted = await tx.insert(contractWorkerAssignments).values(input.workerIds.map((workerId) => ({ contractId: contract!.id, contractProfessionId: professionRecord.id, workerId, status: "planned", assignedBy: access.user.email }))).returning();
          assignmentRecords.push(...inserted);
        }
      }

      let financialRecord: typeof financialRecords.$inferSelect | null = null;
      if (financialCategory[documentType] && amountHalalas) {
        [financialRecord] = await tx.insert(financialRecords).values({ referenceCode: makeReference("FIN"), category: financialCategory[documentType]!, description: `${issuedDocumentLabels[documentType]} ${referenceCode} — ${clientName}`, amountHalalas, subtotalHalalas, vatHalalas, vatRateBps, dueDate: expiryDate || issueDate, contractId: linkedContractId, documentId: saved.id, notes: details.slice(0, 500), status: documentType === "invoice" || documentType === "progress_claim" ? "pending" : "paid" }).returning();
      }
      await tx.insert(portalActivity).values({ actorEmail: access.user.email, action: documentType === "workforce_contract" ? "workforce-contract-created" : "official-pdf-issued", entityType: "company-document", entityId: String(saved.id) });
      if (createdClientId) await tx.insert(portalActivity).values({ actorEmail: access.user.email, action: "client-created-from-contract", entityType: "client", entityId: String(createdClientId) });
      return { saved, client, contract, professionRecords, assignmentRecords, financialRecord };
    });
    const { saved, client, contract, professionRecords, assignmentRecords, financialRecord } = persisted;
    const unassignedCount = capacity.reduce((total, item) => total + item.unassignedCount, 0);
    await emitPortalNotification(documentType === "workforce_contract" && contract ? {
      eventType: "workforce-contract-created",
      title: unassignedCount ? "أُنشئ عقد يحتاج إلى استكمال العمالة" : "أُنشئ عقد عمالة مكتمل الإسناد",
      message: `${contract.referenceCode} — ${contract.clientName}${unassignedCount ? ` — متبقٍ ${unassignedCount} عامل` : " — اكتمل الإسناد الأولي"}.`,
      severity: unassignedCount ? "warning" : "success",
      module: "workforce",
      entityType: "workforce-contract",
      entityId: contract.id,
      actionView: "workforce",
      targetDepartment: "workforce",
    } : {
      eventType: "official-pdf-issued",
      title: "صدر ملف PDF رسمي",
      message: `${saved.referenceCode} — ${saved.title}.`,
      severity: "success",
      module: category === "finance" ? "finance" : "documents",
      entityType: "company-document",
      entityId: saved.id,
      actionView: category === "finance" ? "finance" : "documents",
      targetDepartment: category === "finance" ? "finance" : null,
    }).catch(() => undefined);
    return Response.json({
      document: saved,
      client,
      contract,
      professions: professionRecords,
      assignments: assignmentRecords,
      workers: updatedWorkers,
      financialRecord,
      capacity: documentType === "workforce_contract" ? capacity : null,
    }, { status: 201 });
  } catch (error) {
    if (storageKey) await getRuntimeEnv().BUCKET.delete(storageKey).catch(() => undefined);
    for (const key of auxiliaryStorageKeys) await getRuntimeEnv().BUCKET.delete(key).catch(() => undefined);
    console.error(`[issued-document-save:${correlationId}]`, error);
    const safeMessage = error instanceof Error && error.message.startsWith("تعذر التحقق من حفظ ملف")
      ? error.message
      : `تعذّر حفظ المستند في قاعدة بيانات السيرفر. مرجع التتبع: ${correlationId}`;
    return Response.json({ error: safeMessage }, { status: 500, headers: { "x-correlation-id": correlationId } });
  }
}
