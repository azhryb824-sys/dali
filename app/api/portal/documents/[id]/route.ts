import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { companyDocuments, contractPaymentSchedules, portalActivity } from "@/db/schema";
import { attachmentHeaders } from "@/lib/company-documents";
import { canAccessPortalDocuments, hasPortalPermission, requirePortalApiRole } from "@/lib/portal-access";
import { getRuntimeEnv } from "@/lib/runtime-env";
import { regenerateIssuedDocumentPdf } from "@/lib/issued-document-regeneration";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const access = await requirePortalApiRole(["admin", "manager", "employee"]);
  if (!access) return Response.json({ error: "غير مصرح بتنزيل المستند" }, { status: 403 });
  const canReadDocuments = canAccessPortalDocuments(access);
  const [canReadContracts, canReadFinance] = await Promise.all([
    hasPortalPermission(access, "contracts", "read"),
    hasPortalPermission(access, "finance", "read"),
  ]);
  if (!canReadDocuments && !canReadContracts && !canReadFinance) {
    return Response.json({ error: "غير مصرح بتنزيل المستند" }, { status: 403 });
  }

  const { id: value } = await context.params;
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) return Response.json({ error: "المستند غير صحيح" }, { status: 400 });

  const db = getDb();
  const document = await db.query.companyDocuments.findFirst({ where: eq(companyDocuments.id, id) });
  if (!document || document.status !== "active") return Response.json({ error: "المستند غير موجود" }, { status: 404 });
  const contractualTypes = new Set(["workforce_contract", "quotation", "official_letter", "contract", "letter"]);
  const financialTypes = new Set(["invoice", "receipt", "payment_voucher", "progress_claim"]);
  const linkedContractPayment = canReadContracts && financialTypes.has(document.documentType || "")
    ? await db.query.contractPaymentSchedules.findFirst({ where: eq(contractPaymentSchedules.invoiceDocumentId, id) })
    : null;
  const allowed = canReadDocuments
    || (canReadContracts && (contractualTypes.has(document.documentType || "") || Boolean(linkedContractPayment)))
    || (canReadFinance && (document.category === "finance" || financialTypes.has(document.documentType || "")));
  if (!allowed) return Response.json({ error: "غير مصرح بتنزيل المستند" }, { status: 403 });
  const inline = new URL(request.url).searchParams.get("inline") === "1";
  const requestedLanguage = new URL(request.url).searchParams.get("language");
  const pdfLanguage = requestedLanguage === "en" ? "en" : requestedLanguage === "bilingual" ? "bilingual" : "ar";
  if (document.source === "generated" && document.documentType === "workforce_contract") {
    const regenerated = await regenerateIssuedDocumentPdf(id, pdfLanguage);
    if (!regenerated) return Response.json({ error: "تعذّر إعادة إنشاء العقد" }, { status: 404 });
    await db.insert(portalActivity).values({ actorEmail: access.user.email, action: "contract-regenerated-and-downloaded", entityType: "company-document", entityId: String(id) });
    return new Response(new Uint8Array(regenerated.bytes).buffer, { headers: attachmentHeaders(document.fileName.replace(/\.pdf$/i, `-${pdfLanguage}.pdf`), "application/pdf", undefined, inline ? "inline" : "attachment") });
  }
  if (document.source === "generated" && document.contentType === "application/pdf") {
    const regenerated = await regenerateIssuedDocumentPdf(id, pdfLanguage);
    if (!regenerated) return Response.json({ error: "تعذّر تحديث ملف PDF وفق القالب الحالي" }, { status: 409 });
    await db.insert(portalActivity).values({ actorEmail: access.user.email, action: "issued-pdf-regenerated-and-downloaded", entityType: "company-document", entityId: String(id) });
    return new Response(new Uint8Array(regenerated.bytes).buffer, { headers: attachmentHeaders(document.fileName.replace(/\.pdf$/i, `-${pdfLanguage}.pdf`), "application/pdf", undefined, inline ? "inline" : "attachment") });
  }
  const object = await getRuntimeEnv().BUCKET.get(document.storageKey);
  if (!object) return Response.json({ error: "ملف المستند غير متاح" }, { status: 404 });

  await db.insert(portalActivity).values({ actorEmail: access.user.email, action: "document-downloaded", entityType: "company-document", entityId: String(id) });
  return new Response(object.body, { headers: attachmentHeaders(document.fileName, document.contentType, object.httpEtag, inline ? "inline" : "attachment") });
}
