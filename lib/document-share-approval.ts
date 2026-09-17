import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { companyDocuments, quoteVersions, workforceContracts } from "@/db/schema";
import { documentMetadata } from "@/lib/share-recipient";

/** Enforced both when minting a link and on every anonymous download. */
export async function documentShareApprovalError(document: typeof companyDocuments.$inferSelect) {
  const db = getDb();
  const metadata = documentMetadata(document.metadataJson);
  if (document.documentType === "quotation") {
    const quote = await db.query.quoteVersions.findFirst({ where: eq(quoteVersions.documentId, document.id) });
    if (!quote?.approvedBy || !["approved", "sent", "accepted"].includes(quote.status)) return "لا يمكن مشاركة العرض قبل اعتماده أو بعد إلغائه";
  }
  if (document.documentType === "workforce_contract" || document.documentType === "signed_contract" || metadata.contractSignature) {
    const contract = await db.query.workforceContracts.findFirst({ where: eq(workforceContracts.documentId, document.id) });
    if (contract && !contract.approvedBy) return "لا يمكن مشاركة العقد قبل اعتماده";
    if (document.documentType === "workforce_contract" && !contract) return "العقد غير متاح للمشاركة";
  }
  return null;
}
