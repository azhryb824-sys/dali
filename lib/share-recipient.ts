import { and, desc, eq, inArray, or } from "drizzle-orm";
import { getDb } from "@/db";
import { clientContacts, clients, companyDocuments, quoteVersions, salesOpportunities, visitorConversations, workforceContracts, workforceRequests } from "@/db/schema";
import { normalizeSaudiWhatsAppNumber } from "@/lib/whatsapp";

export function documentMetadata(value: string | null | undefined): Record<string, unknown> {
  try { const parsed = JSON.parse(value || "{}"); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}; } catch { return {}; }
}

export async function resolveShareRecipient(source: { quoteId?: number; contractId?: number; documentId?: number }) {
  const db = getDb();
  let clientId: number | null = null;
  let requestId: number | null = null;
  let clientName = "";
  const candidates: Array<{ mobile: string; label: string }> = [];
  const contactEmails = new Set<string>();
  const addEmail = (value: unknown) => { if (typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) contactEmails.add(value.trim().toLowerCase()); };
  const add = (value: unknown, label: string) => {
    const mobile = normalizeSaudiWhatsAppNumber(typeof value === "string" ? value : "");
    if (mobile && !candidates.some(item => item.mobile === mobile)) candidates.push({ mobile, label });
  };
  let quoteId = source.quoteId;
  let contractId = source.contractId;
  if (source.documentId) {
    const doc = await db.query.companyDocuments.findFirst({ where: eq(companyDocuments.id, source.documentId) });
    if (!doc) throw new Error("المستند غير موجود");
    const meta = documentMetadata(doc.metadataJson);
    clientId = Number(meta.clientId) || null;
    requestId = Number(meta.sourceRequestId) || null;
    quoteId ||= Number(meta.quoteVersionId) || undefined;
    contractId ||= Number(meta.linkedContractId || meta.contractId) || undefined;
    const linkedContract = await db.query.workforceContracts.findFirst({ where: eq(workforceContracts.documentId, doc.id) });
    contractId ||= linkedContract?.id;
    clientName = doc.counterparty || "";
    add(meta.clientMobile || meta.mobile, "بيانات المستند");
    addEmail(meta.clientEmail);
    if (!clientId && meta.clientCr) {
      const match = await db.query.clients.findFirst({ where: eq(clients.commercialRegistration, String(meta.clientCr)) });
      clientId = match?.id || null;
    }
    // Names alone are not a safe identity match for a WhatsApp recipient.
  }
  if (contractId) {
    const contract = await db.query.workforceContracts.findFirst({ where: eq(workforceContracts.id, contractId) });
    if (!contract) throw new Error("العقد غير موجود");
    clientId ||= contract.clientId;
    requestId ||= contract.sourceRequestId;
    quoteId ||= contract.quoteVersionId || undefined;
    clientName ||= contract.clientName;
    const contractDoc = await db.query.companyDocuments.findFirst({ where: eq(companyDocuments.id, contract.documentId) });
    const contractMeta = documentMetadata(contractDoc?.metadataJson);
    add(contractMeta.clientMobile || contractMeta.mobile, "بيانات العقد");
    addEmail(contractMeta.clientEmail);
  }
  if (quoteId) {
    const quote = await db.query.quoteVersions.findFirst({ where: eq(quoteVersions.id, quoteId) });
    if (!quote) throw new Error("عرض السعر غير موجود");
    const opportunity = await db.query.salesOpportunities.findFirst({ where: eq(salesOpportunities.id, quote.opportunityId) });
    clientId ||= opportunity?.clientId || null;
    requestId ||= opportunity?.sourceRequestId || null;
    const terms = documentMetadata(quote.commercialTermsJson);
    add(terms.clientMobile, "بيانات عرض السعر");
    addEmail(terms.clientEmail);
  }
  if (clientId) {
    const client = await db.query.clients.findFirst({ where: eq(clients.id, clientId) });
    clientName ||= client?.legalName || "";
    requestId ||= client?.sourceRequestId || null;
    const contacts = await db.select().from(clientContacts).where(eq(clientContacts.clientId, clientId)).orderBy(desc(clientContacts.isPrimary), desc(clientContacts.updatedAt)).limit(50);
    contacts.forEach(contact => { add(contact.mobile, contact.fullName); addEmail(contact.email); });
  }
  const requests = await db.select().from(workforceRequests).where(or(requestId ? eq(workforceRequests.id, requestId) : undefined, clientId ? eq(workforceRequests.clientId, clientId) : undefined) || eq(workforceRequests.id, -1)).orderBy(desc(workforceRequests.createdAt)).limit(30);
  if (requestId) requests.sort((a, b) => Number(b.id === requestId) - Number(a.id === requestId));
  for (const item of requests) {
    add(item.mobile, `طلب ${item.trackingCode}`);
    const chats = await db.select().from(visitorConversations).where(or(eq(visitorConversations.relatedRequestId, item.id), item.email ? and(eq(visitorConversations.visitorEmail, item.email), eq(visitorConversations.visitorName, item.fullName)) : undefined)).orderBy(desc(visitorConversations.updatedAt)).limit(10);
    chats.forEach(chat => add(chat.visitorMobile, `محادثة ${chat.trackingCode}`));
  }
  if (contactEmails.size) {
    const chats = await db.select().from(visitorConversations).where(inArray(visitorConversations.visitorEmail, [...contactEmails])).orderBy(desc(visitorConversations.updatedAt)).limit(50);
    chats.forEach(chat => add(chat.visitorMobile, `محادثة ${chat.trackingCode}`));
  }
  return { clientName, mobile: candidates[0]?.mobile || "", candidates };
}
