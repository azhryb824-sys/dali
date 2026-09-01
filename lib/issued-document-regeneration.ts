import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { companyAssets, companyDocuments, contractPaymentSchedules, financialRecords, workforceContracts } from "@/db/schema";
import { generateIssuedPdf, issuedDocumentLabels, type IssuedDocumentInput, type IssuedDocumentType } from "@/lib/pdf-generator";
import { getRuntimeEnv } from "@/lib/runtime-env";
import { regenerateWorkforceContractPdf } from "@/lib/workforce-contract-pdf";

export const CURRENT_ISSUED_PDF_TEMPLATE = "letterhead-v4-english-invoice";

function record(value: string | null) {
  try { return value ? JSON.parse(value) as Record<string, unknown> : {}; }
  catch { return {}; }
}

function text(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : undefined; }
function number(value: unknown) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : undefined; }

export async function regenerateIssuedDocumentPdf(documentId: number, pdfLanguage: "ar" | "en" | "bilingual" = "ar") {
  const db = getDb();
  const document = await db.query.companyDocuments.findFirst({ where: eq(companyDocuments.id, documentId) });
  if (!document || document.source !== "generated" || !document.documentType) return null;
  if (document.documentType === "workforce_contract") return regenerateWorkforceContractPdf(documentId, pdfLanguage);
  if (!(document.documentType in issuedDocumentLabels)) return null;

  const metadata = record(document.metadataJson);
  const documentType = document.documentType as IssuedDocumentType;
  const paymentScheduleId = number(metadata.paymentScheduleId);
  const contractId = number(metadata.contractId);
  const [assets, financial, payment, contract] = await Promise.all([
    db.select().from(companyAssets),
    db.query.financialRecords.findFirst({ where: eq(financialRecords.documentId, document.id) }),
    paymentScheduleId ? db.query.contractPaymentSchedules.findFirst({ where: eq(contractPaymentSchedules.id, paymentScheduleId) }) : Promise.resolve(null),
    contractId ? db.query.workforceContracts.findFirst({ where: eq(workforceContracts.id, contractId) }) : Promise.resolve(null),
  ]);
  const purchaser = (text(metadata.contractDirection) || contract?.contractDirection) === "dali_purchaser";
  const absenceDeductionHalalas = number(metadata.absenceDeductionHalalas) || payment?.absenceDeductionHalalas || 0;
  const legacyInvoiceDetails = payment && contract
    ? `خصم غياب العمالة قبل الضريبة: ${(absenceDeductionHalalas / 100).toFixed(2)} ر.س.\n${purchaser ? `استحقاق المورد للدفعة رقم ${payment.installmentNumber} (${payment.title}) من عقد شراء العمالة ${contract.referenceCode}.` : `فاتورة الدفعة رقم ${payment.installmentNumber} (${payment.title}) من العقد ${contract.referenceCode}.`}`
    : undefined;
  const details = text(metadata.details) || legacyInvoiceDetails || financial?.notes || document.title;
  const input: IssuedDocumentInput = {
    pdfLanguage,
    approvalState: "approved",
    documentType,
    referenceCode: document.referenceCode,
    clientName: document.counterparty || "الجهة المستفيدة",
    clientCr: text(metadata.clientCr) || contract?.clientCr || undefined,
    clientVat: text(metadata.clientVat) || contract?.clientVat || undefined,
    clientAddress: text(metadata.clientAddress),
    clientRepresentative: text(metadata.clientRepresentative),
    clientRepresentativeTitle: text(metadata.clientRepresentativeTitle),
    title: document.title,
    issueDate: text(metadata.issueDate) || document.createdAt.slice(0, 10),
    expiryDate: document.expiryDate || undefined,
    amountHalalas: number(metadata.amountHalalas) || number(metadata.netAmountHalalas) || financial?.amountHalalas || undefined,
    subtotalHalalas: number(metadata.subtotalHalalas) || number(metadata.netSubtotalHalalas) || financial?.subtotalHalalas || undefined,
    vatHalalas: number(metadata.vatHalalas) || number(metadata.netVatHalalas) || financial?.vatHalalas || undefined,
    vatRateBps: number(metadata.vatRateBps) || financial?.vatRateBps || undefined,
    quantityMode: metadata.quantityMode === "open" ? "open" : "fixed",
    details,
    workSite: text(metadata.workSite),
    paymentTerms: text(metadata.paymentTerms),
  };
  const pdfBytes = await generateIssuedPdf(input, assets.map((asset) => ({ slot: asset.slot as "stamp" | "signature", storageKey: asset.storageKey, contentType: asset.contentType })));
  if (pdfLanguage === "ar") {
    const nextMetadata = JSON.stringify({ ...metadata, details, templateVersion: CURRENT_ISSUED_PDF_TEMPLATE, regeneratedAt: new Date().toISOString() });
    await getRuntimeEnv().BUCKET.put(document.storageKey, pdfBytes, {
      httpMetadata: { contentType: "application/pdf" },
      customMetadata: { regenerated: "true", referenceCode: document.referenceCode, template: CURRENT_ISSUED_PDF_TEMPLATE },
    });
    await db.update(companyDocuments).set({ sizeBytes: pdfBytes.byteLength, metadataJson: nextMetadata, updatedAt: new Date().toISOString() }).where(eq(companyDocuments.id, document.id));
  }
  return { bytes: pdfBytes, document };
}
