import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { companyAssets, companyDocuments, financialRecords } from "@/db/schema";
import { generateIssuedPdf, issuedDocumentLabels, type IssuedDocumentInput, type IssuedDocumentType } from "@/lib/pdf-generator";
import { getRuntimeEnv } from "@/lib/runtime-env";
import { regenerateWorkforceContractPdf } from "@/lib/workforce-contract-pdf";

export const CURRENT_ISSUED_PDF_TEMPLATE = "letterhead-v3-unified-quotation";

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

  const [assets, financial] = await Promise.all([
    db.select().from(companyAssets),
    db.query.financialRecords.findFirst({ where: eq(financialRecords.documentId, document.id) }),
  ]);
  const metadata = record(document.metadataJson);
  const documentType = document.documentType as IssuedDocumentType;
  const details = text(metadata.details) || financial?.notes || document.title;
  const input: IssuedDocumentInput = {
    pdfLanguage,
    documentType,
    referenceCode: document.referenceCode,
    clientName: document.counterparty || "الجهة المستفيدة",
    clientCr: text(metadata.clientCr),
    clientVat: text(metadata.clientVat),
    clientAddress: text(metadata.clientAddress),
    clientRepresentative: text(metadata.clientRepresentative),
    clientRepresentativeTitle: text(metadata.clientRepresentativeTitle),
    title: document.title,
    issueDate: text(metadata.issueDate) || document.createdAt.slice(0, 10),
    expiryDate: document.expiryDate || undefined,
    amountHalalas: number(metadata.amountHalalas) || financial?.amountHalalas || undefined,
    subtotalHalalas: number(metadata.subtotalHalalas) || financial?.subtotalHalalas || undefined,
    vatHalalas: number(metadata.vatHalalas) || financial?.vatHalalas || undefined,
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
