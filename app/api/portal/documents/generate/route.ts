import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import {
  companyAssets,
  companyDocuments,
  clients,
  contractPaymentSchedules,
  contractProfessions,
  contractWorkerAssignments,
  financialRecords,
  portalActivity,
  quoteItems,
  quoteVersions,
  salesOpportunities,
  salesRepresentatives,
  workers,
  workforceContracts,
  workforceRequests,
} from "@/db/schema";
import { cleanDate, cleanText, makeReference, objectKey, safeFileName } from "@/lib/company-documents";
import { generateIssuedPdf, issuedDocumentLabels, type IssuedDocumentType } from "@/lib/pdf-generator";
import { canManagePortalDocuments, requirePortalApiRole } from "@/lib/portal-access";
import { emitPortalNotification } from "@/lib/portal-notifications";
import { getRuntimeEnv } from "@/lib/runtime-env";
import { rejectCrossSiteRequest, validateUploadedFile } from "@/lib/security";

const prefixes: Record<IssuedDocumentType, string> = {
  workforce_contract: "CTR",
  quotation: "QTN",
  progress_claim: "CLM",
  invoice: "INV",
  receipt: "RCP",
  payment_voucher: "PAY",
  construction_record: "CST",
};

type ProfessionInput = { profession: string; requiredCount: number; unitSalaryHalalas: number; workerIds: number[] };
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

function monthlyDueDates(firstDueDate: string, endDate: string) {
  const dates: string[] = [];
  const [year, month, day] = firstDueDate.split("-").map(Number);
  if (!year || !month || !day) return dates;
  for (let offset = 0; offset < 240; offset += 1) {
    const base = new Date(Date.UTC(year, month - 1 + offset, 1));
    const lastDay = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).getUTCDate();
    const value = `${base.getUTCFullYear()}-${String(base.getUTCMonth() + 1).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
    if (value > endDate) break;
    dates.push(value);
  }
  return dates;
}

export async function POST(request: Request) {
  if (rejectCrossSiteRequest(request)) return Response.json({ error: "مصدر الطلب غير مسموح" }, { status: 403 });
  const access = await requirePortalApiRole(["admin", "manager", "employee"]);
  if (!access || !canManagePortalDocuments(access)) return Response.json({ error: "غير مصرح بإصدار المستندات" }, { status: 403 });

  let storageKey = "";
  let savedDocumentId: number | null = null;
  let savedContractId: number | null = null;
  let createdClientId: number | null = null;
  const auxiliaryStorageKeys: string[] = [];
  const auxiliaryDocumentIds: number[] = [];
  try {
    const form = await request.formData();
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
    const legacyProfession = cleanText(payload.profession, 120);
    const startDate = cleanDate(payload.startDate, true);
    const endDate = cleanDate(payload.endDate, true);
    const legacyWorkerCount = Number(payload.workerCount || 0);
    const amount = Number(payload.amount || 0);
    const vatEnabled = payload.vatEnabled === true || payload.vatEnabled === "on" || payload.vatEnabled === "true";
    const vatRate = vatEnabled ? Number(payload.vatRate || 15) : 0;
    const linkedContractId = parsePositiveId(payload.linkedContractId);
    const sourceRequestId = parsePositiveId(payload.sourceRequestId);
    const salesRepresentativeId = parsePositiveId(payload.salesRepresentativeId);
    const quoteVersionId = parsePositiveId(payload.quoteVersionId);
    const quantityMode = payload.quantityMode === "open" ? "open" : "fixed";
    const seasonType = payload.seasonType === "ramadan" || payload.seasonType === "hajj" ? payload.seasonType : "regular";
    const billingMode = quantityMode === "open" ? "actual_usage" : seasonType === "regular" ? "monthly" : "seasonal_installments";
    const firstPaymentDueDate = cleanDate(payload.firstPaymentDueDate, true);
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
    if (!Number.isFinite(vatRate) || vatRate < 0 || vatRate > 100 || (vatEnabled && !clientVat)) {
      return Response.json({ error: vatEnabled && !clientVat ? "أدخل الرقم الضريبي للعميل عند تفعيل الضريبة" : "نسبة الضريبة غير صحيحة" }, { status: 400 });
    }

    const professionInputs = documentType === "workforce_contract"
      ? parseProfessions(payload.professions, legacyProfession, legacyWorkerCount)
      : [];
    if (documentType === "workforce_contract") {
      const uniqueLabels = new Set(professionInputs.map((item) => item.profession));
      if (!workSite || !startDate || !endDate || endDate < startDate || !professionInputs.length || uniqueLabels.size !== professionInputs.length) {
        return Response.json({ error: "أكمل موقع العمل ومدة العقد وأضف كل مهنة مرة واحدة" }, { status: 400 });
      }
      if (professionInputs.some((item) => item.profession.length < 2 || item.profession === "أخرى" || !Number.isInteger(item.requiredCount) || (quantityMode === "fixed" ? item.requiredCount < 1 : item.requiredCount !== 0) || item.requiredCount > 100000 || (quantityMode === "fixed" && (!Number.isInteger(item.unitSalaryHalalas) || item.unitSalaryHalalas <= 0)) || (quantityMode === "fixed" && item.workerIds.length > item.requiredCount) || (quantityMode === "open" && item.workerIds.length > 0))) {
        return Response.json({ error: "اختر المهنة أو اكتب اسم المهنة الفعلي يدوياً عند اختيار «أخرى»، وأدخل عدد العمالة وراتب العامل الصحيح لكل مهنة" }, { status: 400 });
      }
      const vatRateBpsForSchedule = vatEnabled ? Math.round(vatRate * 100) : 0;
      if (quantityMode === "fixed" && seasonType === "regular") {
        if (!firstPaymentDueDate || firstPaymentDueDate === "" || !endDate || firstPaymentDueDate > endDate) return Response.json({ error: "أدخل تاريخ استحقاق أول دفعة شهرية على ألا يتجاوز نهاية العقد" }, { status: 400 });
        const monthlySubtotal = professionInputs.reduce((sum, item) => sum + item.requiredCount * item.unitSalaryHalalas, 0);
        const dueDates = monthlyDueDates(firstPaymentDueDate, endDate);
        if (!dueDates.length) return Response.json({ error: "تعذر إنشاء جدول الدفعات الشهرية من التاريخ المحدد" }, { status: 400 });
        paymentSchedule = dueDates.map((dueDate) => { const vatHalalas = Math.round(monthlySubtotal * vatRateBpsForSchedule / 10000); return { title: `استحقاق رواتب شهر ${dueDate.slice(0,7)}`, dueDate, percentageBps: Math.round(10000 / dueDates.length), subtotalHalalas: monthlySubtotal, vatHalalas, amountHalalas: monthlySubtotal + vatHalalas, billingBasis: "monthly_salary", servicePeriod: dueDate.slice(0,7) }; });
        contractAmountHalalas = monthlySubtotal * dueDates.length;
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

    const db = getDb();
    const [sourceRequest, salesRepresentative, sourceQuote, existingQuoteContract] = await Promise.all([
      sourceRequestId ? db.query.workforceRequests.findFirst({ where: eq(workforceRequests.id, sourceRequestId) }) : Promise.resolve(null),
      salesRepresentativeId ? db.query.salesRepresentatives.findFirst({ where: eq(salesRepresentatives.id, salesRepresentativeId) }) : Promise.resolve(null),
      quoteVersionId ? db.query.quoteVersions.findFirst({ where: eq(quoteVersions.id, quoteVersionId) }) : Promise.resolve(null),
      quoteVersionId ? db.query.workforceContracts.findFirst({ where: eq(workforceContracts.quoteVersionId, quoteVersionId) }) : Promise.resolve(null),
    ]);
    if (sourceRequestId && !sourceRequest) return Response.json({ error: "طلب الموقع المحدد غير موجود" }, { status: 404 });
    if (salesRepresentativeId && (!salesRepresentative || salesRepresentative.status !== "active")) return Response.json({ error: "المندوب المحدد غير موجود أو غير نشط" }, { status: 409 });
    if (quoteVersionId && (!sourceQuote || sourceQuote.status !== "accepted")) return Response.json({ error: "لا يمكن إنشاء عقد إلا من عرض سعر مقبول" }, { status: 409 });
    if (existingQuoteContract) return Response.json({ error: "تم تحويل عرض السعر إلى عقد سابقًا" }, { status: 409 });
    if (sourceQuote && sourceQuote.quantityMode !== quantityMode) return Response.json({ error: "نوع العدد في العقد يجب أن يطابق عرض السعر" }, { status: 409 });
    const sourceOpportunity = sourceQuote ? await db.query.salesOpportunities.findFirst({ where: eq(salesOpportunities.id, sourceQuote.opportunityId) }) : null;
    const sourceQuoteItems = sourceQuote ? await db.select().from(quoteItems).where(eq(quoteItems.quoteVersionId, sourceQuote.id)) : [];
    if (sourceQuote && (!sourceOpportunity || !sourceQuoteItems.length)) return Response.json({ error: "بيانات عرض السعر المرتبط غير مكتملة" }, { status: 409 });
    if (sourceQuote && (sourceQuote.quantityMode === "open" ? professionInputs.some(item => item.requiredCount !== 0) : sourceQuoteItems.some(item => !professionInputs.some(profession => profession.profession === item.profession && profession.requiredCount === item.quantity)))) return Response.json({ error: "مهن وأعداد العقد لا تطابق عرض السعر المقبول" }, { status: 409 });
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
      if (selectedForProfession.some((worker) => worker.profession !== item.profession || worker.status !== "available")) {
        return Response.json({ error: `يجب أن تكون العمالة المختارة لمهنة ${item.profession} متاحة ومطابقة للمهنة` }, { status: 409 });
      }
    }

    const capacity = professionInputs.map((item) => {
      const registeredCount = relevantWorkers.filter((worker) => worker.profession === item.profession).length;
      const availableCount = relevantWorkers.filter((worker) => worker.profession === item.profession && worker.status === "available").length;
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
        assignedWorkers: selectedWorkers
          .filter((worker) => item.workerIds.includes(worker.id))
          .map((worker) => ({ fullName: worker.fullName, iqamaNumber: worker.iqamaNumber })),
      })),
      paymentSchedule,
    }, assets.map((asset) => ({ slot: asset.slot as "stamp" | "signature", storageKey: asset.storageKey, contentType: asset.contentType })));

    let client = null;
    if (documentType === "workforce_contract") {
      const existingClient = await db.query.clients.findFirst({ where: eq(clients.commercialRegistration, clientCr) });
      if (existingClient) {
        [client] = await db.update(clients).set({ legalName: clientName, vatNumber: clientVat, address: clientAddress, status: "active", sourceRequestId, salesRepresentativeId, updatedAt: new Date().toISOString(), version: existingClient.version + 1 }).where(eq(clients.id, existingClient.id)).returning();
      } else {
        [client] = await db.insert(clients).values({ clientCode: makeReference("CLI"), legalName: clientName, commercialRegistration: clientCr, vatNumber: clientVat, address: clientAddress, status: "active", sourceRequestId, salesRepresentativeId, createdBy: access.user.email }).returning();
        createdClientId = client.id;
      }
    }

    const fileName = `${referenceCode}.pdf`;
    storageKey = objectKey("issued-pdfs", fileName);
    await getRuntimeEnv().BUCKET.put(storageKey, pdfBytes, {
      httpMetadata: { contentType: "application/pdf" },
      customMetadata: { issuedBy: access.user.email, referenceCode, documentType },
    });
    const storedPdf = await getRuntimeEnv().BUCKET.get(storageKey);
    if (!storedPdf || (await storedPdf.arrayBuffer()).byteLength !== pdfBytes.byteLength) throw new Error("تعذر التحقق من حفظ ملف العقد");

    const category = documentType === "workforce_contract" ? "contract" : ["invoice", "receipt", "payment_voucher", "progress_claim"].includes(documentType) ? "finance" : "other";
    const [saved] = await db.insert(companyDocuments).values({
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
      metadataJson: JSON.stringify({ clientId: client?.id || null, sourceRequestId, salesRepresentativeId, quoteVersionId, quantityMode, clientCr, clientVat, clientAddress, clientRepresentative, clientRepresentativeTitle, issueDate, amountHalalas, subtotalHalalas, vatHalalas, vatRateBps, workSite, startDate, endDate, paymentTerms, paymentSchedule, workingHours, weeklyOff, accommodationParty, transportParty, specialTerms, professions: professionInputs, capacity, linkedContractId }),
      createdBy: access.user.email,
    }).returning();
    savedDocumentId = saved.id;

    let contract = null;
    let professionRecords: Array<typeof contractProfessions.$inferSelect> = [];
    const assignmentRecords: Array<typeof contractWorkerAssignments.$inferSelect> = [];
    const updatedWorkers: Array<typeof workers.$inferSelect> = [];

    if (documentType === "workforce_contract") {
      [contract] = await db.insert(workforceContracts).values({
        referenceCode,
        documentId: saved.id,
        clientName,
        clientCr: clientCr || null,
        clientVat: clientVat || null,
        clientId: client!.id,
        sourceRequestId,
        salesRepresentativeId,
        opportunityId: sourceOpportunity?.id || null,
        quoteVersionId,
        title,
        workSite,
        issueDate,
        startDate: startDate!,
        endDate: endDate!,
        amountHalalas: amountHalalas || 0,
        quantityMode,
        vatRateBps,
        seasonType,
        billingMode,
        firstPaymentDueDate: firstPaymentDueDate || null,
        details,
        createdBy: access.user.email,
      }).returning();
      savedContractId = contract.id;
      if (paymentSchedule.length) await db.insert(contractPaymentSchedules).values(paymentSchedule.map((payment, index) => ({ contractId: contract!.id, installmentNumber: index + 1, title: payment.title, dueDate: payment.dueDate, percentageBps: payment.percentageBps, subtotalHalalas: payment.subtotalHalalas, vatHalalas: payment.vatHalalas, vatRateBps, amountHalalas: payment.amountHalalas, billingBasis: payment.billingBasis, servicePeriod: payment.servicePeriod, status: payment.dueDate <= new Date().toISOString().slice(0, 10) ? "due" : "scheduled", createdBy: access.user.email })));
      for (const { file, kind, label, bytes, validationDetails } of validatedClientFiles) {
        const fileName=safeFileName(file.name);const clientStorageKey=objectKey("client-documents",fileName);auxiliaryStorageKeys.push(clientStorageKey);
        await getRuntimeEnv().BUCKET.put(clientStorageKey,bytes,{httpMetadata:{contentType:file.type},customMetadata:{uploadedBy:access.user.email,clientName,clientId:String(client!.id),contractReference:contract.referenceCode,documentKind:kind,validation:validationDetails}});
        const storedClientFile = await getRuntimeEnv().BUCKET.get(clientStorageKey);if(!storedClientFile||(await storedClientFile.arrayBuffer()).byteLength!==bytes.byteLength)throw new Error(`تعذر التحقق من حفظ ملف ${label}`);
        const[clientDocument]=await db.insert(companyDocuments).values({referenceCode:makeReference("CLD"),title:`${label} - ${clientName}`,category:"certificate",documentType:kind,counterparty:clientName,fileName,storageKey:clientStorageKey,contentType:file.type,sizeBytes:file.size,source:"uploaded",validationStatus:"signature-validated",validationDetails,metadataJson:JSON.stringify({clientId:client!.id,clientName,contractId:contract.id,contractReference:contract.referenceCode,documentKind:kind}),createdBy:access.user.email}).returning();auxiliaryDocumentIds.push(clientDocument.id);
      }
      professionRecords = await db.insert(contractProfessions).values(professionInputs.map((item) => ({
        contractId: contract!.id,
        profession: item.profession,
        requiredCount: item.requiredCount,
        unitSalaryHalalas: item.unitSalaryHalalas,
      }))).returning();

      for (const professionRecord of professionRecords) {
        const input = professionInputs.find((item) => item.profession === professionRecord.profession)!;
        if (!input.workerIds.length) continue;
        const inserted = await db.insert(contractWorkerAssignments).values(input.workerIds.map((workerId) => ({
          contractId: contract!.id,
          contractProfessionId: professionRecord.id,
          workerId,
          status: "planned",
          assignedBy: access.user.email,
        }))).returning();
        assignmentRecords.push(...inserted);
      }
    }

    let financialRecord = null;
    const financialCategory: Partial<Record<IssuedDocumentType, string>> = {
      invoice: "workforce_invoice",
      receipt: "receipt_voucher",
      payment_voucher: "payment_voucher",
      progress_claim: "progress_claim",
    };
    if (financialCategory[documentType] && amountHalalas) {
      [financialRecord] = await db.insert(financialRecords).values({
        referenceCode: makeReference("FIN"),
        category: financialCategory[documentType]!,
        description: `${issuedDocumentLabels[documentType]} ${referenceCode} — ${clientName}`,
        amountHalalas,
        subtotalHalalas,
        vatHalalas,
        vatRateBps,
        dueDate: expiryDate || issueDate,
        contractId: linkedContractId,
        documentId: saved.id,
        notes: details.slice(0, 500),
        status: documentType === "invoice" || documentType === "progress_claim" ? "pending" : "paid",
      }).returning();
    }

    await db.insert(portalActivity).values({
      actorEmail: access.user.email,
      action: documentType === "workforce_contract" ? "workforce-contract-created" : "official-pdf-issued",
      entityType: "company-document",
      entityId: String(saved.id),
    });
    if (createdClientId) await db.insert(portalActivity).values({ actorEmail: access.user.email, action: "client-created-from-contract", entityType: "client", entityId: String(createdClientId) });
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
    const db = getDb();
    if (savedContractId) {
      await db.delete(contractWorkerAssignments).where(eq(contractWorkerAssignments.contractId, savedContractId)).catch(() => undefined);
      await db.delete(contractProfessions).where(eq(contractProfessions.contractId, savedContractId)).catch(() => undefined);
      await db.delete(contractPaymentSchedules).where(eq(contractPaymentSchedules.contractId, savedContractId)).catch(() => undefined);
      await db.delete(workforceContracts).where(eq(workforceContracts.id, savedContractId)).catch(() => undefined);
    }
    if (savedDocumentId) await db.delete(companyDocuments).where(eq(companyDocuments.id, savedDocumentId)).catch(() => undefined);
    for (const id of auxiliaryDocumentIds) await db.delete(companyDocuments).where(eq(companyDocuments.id,id)).catch(()=>undefined);
    if (createdClientId) await db.delete(clients).where(eq(clients.id, createdClientId)).catch(() => undefined);
    if (storageKey) await getRuntimeEnv().BUCKET.delete(storageKey).catch(() => undefined);
    for (const key of auxiliaryStorageKeys) await getRuntimeEnv().BUCKET.delete(key).catch(() => undefined);
    const message = error instanceof Error ? error.message : "";
    return Response.json({ error: message || "تعذّر إصدار ملف PDF حالياً" }, { status: 500 });
  }
}
