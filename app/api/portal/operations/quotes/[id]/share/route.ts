import { ownRepresentativeQuote } from "@/lib/quote-request-workflow";
import { normalizeSaudiWhatsAppNumber } from "@/lib/whatsapp";
import { whatsappSharePayload } from "@/lib/whatsapp-share-payload";
import { resolveShareRecipient } from "@/lib/share-recipient";
import { externalRequestUrl } from "@/lib/request-origin";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { companyDocuments, documentShareLinks, quoteVersions, salesOpportunities } from "@/db/schema";
import { auditPortalAction } from "@/lib/audit";
import { hashShareToken, objectKey } from "@/lib/company-documents";
import { canSharePortalDocuments, hasPortalPermission, requirePortalApiRole } from "@/lib/portal-access";
import { emitPortalNotification } from "@/lib/portal-notifications";
import { getRuntimeEnv } from "@/lib/runtime-env";
import { readLimitedJson, rejectCrossSiteRequest } from "@/lib/security";
import { GET as renderPdf } from "../pdf/route";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (rejectCrossSiteRequest(request)) return Response.json({ error: "مصدر الطلب غير مسموح" }, { status: 403 });
  const id = Number((await context.params).id);
  const access = await requirePortalApiRole(["admin", "manager", "employee"]);
  if (!access || !((await hasPortalPermission(access, "contracts", "write") && canSharePortalDocuments(access)) || await ownRepresentativeQuote(access,id))) {
    return Response.json({ error: "مشاركة عرض السعر تتطلب صلاحيتي العقود ومشاركة المستندات" }, { status: 403 });
  }

  const db = getDb();
  const quote = await db.query.quoteVersions.findFirst({ where: eq(quoteVersions.id, id) });
  if (!quote?.approvedBy || !["approved", "sent", "accepted"].includes(quote.status)) {
    return Response.json({ error: "لا يمكن مشاركة العرض قبل اعتماده" }, { status: 409 });
  }
  const opportunity = await db.query.salesOpportunities.findFirst({ where: eq(salesOpportunities.id, quote.opportunityId) });
  if (!opportunity?.clientId) return Response.json({ error: "العرض غير مرتبط بعميل" }, { status: 409 });
  const parsed = await readLimitedJson(request, 2000);
  if (!parsed.ok) return parsed.response;
  const body = parsed.value as Record<string, unknown>;
  const recipient = await resolveShareRecipient({ quoteId: id });
  const mobile = normalizeSaudiWhatsAppNumber(typeof body.whatsappNumber === "string" ? body.whatsappNumber : recipient.mobile);
  if (!mobile) return Response.json({ error: "اكتب رقم واتساب سعودي صحيحًا" }, { status: 400 });

  let document = quote.documentId ? await db.query.companyDocuments.findFirst({ where: eq(companyDocuments.id, quote.documentId) }) : null;
  if (!document) {
    const pdfResponse = await renderPdf(request, { params: Promise.resolve({ id: String(id) }) });
    if (!pdfResponse.ok) return pdfResponse;
    const bytes = new Uint8Array(await pdfResponse.arrayBuffer());
    const fileName = `${quote.quoteCode}-V${quote.versionNumber}.pdf`;
    const storageKey = objectKey("issued-pdfs", fileName);
    await getRuntimeEnv().BUCKET.put(storageKey, bytes, {
      httpMetadata: { contentType: "application/pdf" },
      customMetadata: { issuedBy: access.user.email, quoteVersionId: String(id) },
    });
    [document] = await db.insert(companyDocuments).values({
      referenceCode: `${quote.quoteCode}-V${quote.versionNumber}`,
      title: `عرض سعر ${quote.quoteCode}`,
      category: "contract",
      documentType: "quotation",
      counterparty: recipient.clientName,
      fileName,
      storageKey,
      contentType: "application/pdf",
      sizeBytes: bytes.byteLength,
      expiryDate: quote.validUntil,
      source: "generated",
      metadataJson: JSON.stringify({ quoteVersionId: id, clientId: opportunity.clientId }),
      createdBy: access.user.email,
    }).returning();
    await db.update(quoteVersions).set({ documentId: document.id, updatedAt: new Date().toISOString() }).where(eq(quoteVersions.id, id));
  }

  const token = `${crypto.randomUUID().replaceAll("-", "")}${crypto.randomUUID().replaceAll("-", "")}`;
  const tokenHash = await hashShareToken(token);
  const expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();
  const shareId = crypto.randomUUID();
  await db.insert(documentShareLinks).values({ id: shareId, documentId: document.id, tokenHash, expiresAt, maxDownloads: 20, createdBy: access.user.email });
  const shareUrl = externalRequestUrl(request, `/api/shared-documents/${token}`).toString();
  await auditPortalAction({ actorEmail: access.user.email, action: "quotation-whatsapp-share-created", entityType: "quote-version", entityId: id, after: { documentId: document.id, expiresAt, mobile: "[محجوب]" } });
  await emitPortalNotification({ eventType: "quotation-whatsapp-share-created", title: "جُهز عرض سعر للمشاركة عبر واتساب", message: `${quote.quoteCode} — الرابط صالح 7 أيام.`, severity: "info", module: "documents", entityType: "quote-version", entityId: id, actionView: "contractual-documents" }).catch(() => undefined);
  const message = `السلام عليكم، نرفق لكم عرض السعر المعتمد ${quote.quoteCode}.\n${shareUrl}`;
  return Response.json({ shareUrl, clientName: recipient.clientName, expiresAt, ...whatsappSharePayload(request, access.user.email, mobile, message, [{ url: shareUrl, fileName: document.fileName, contentType: document.contentType, sizeBytes: document.sizeBytes }]) });
}
