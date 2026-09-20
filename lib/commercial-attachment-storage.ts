import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { quoteVersions, salesOpportunities, workforceRequestAttachments, workforceRequests } from "@/db/schema";
import { commercialAttachmentFields, commercialAttachmentRefs, withCommercialAttachments, type CommercialAttachmentKind } from "@/lib/commercial-attachments";
import { objectKey, safeFileName } from "@/lib/company-documents";
import { getRuntimeEnv } from "@/lib/runtime-env";
import { validateUploadedFile } from "@/lib/security";
import { auditPortalAction } from "@/lib/audit";
import { emitPortalNotification } from "@/lib/portal-notifications";

export class CommercialAttachmentError extends Error {
  constructor(message: string, public readonly status = 400) { super(message); }
}
export async function saveCommercialAttachment(target: { requestId: number } | { quoteId: number }, file: File, kind: CommercialAttachmentKind, actorEmail: string) {
  if (!commercialAttachmentFields.some(field => field.kind === kind)) throw new CommercialAttachmentError("نوع المرفق غير صحيح");
  const validation = await validateUploadedFile(file, { contentTypes: new Set(["application/pdf", "image/png", "image/jpeg"]), maxBytes: 10 * 1024 * 1024 });
  if (!validation.valid) throw new CommercialAttachmentError(validation.error);
  const fileName = safeFileName(file.name);
  const storageKey = objectKey("commercial-attachments", fileName);
  const db = getDb();
  let saved;
  try {
    await getRuntimeEnv().BUCKET.put(storageKey, validation.bytes, { httpMetadata: { contentType: file.type }, customMetadata: { validation: validation.validationDetails } });
    saved = await db.transaction(async tx => {
      const quoteTarget = "quoteId" in target;
      const record = quoteTarget
        ? (await tx.select().from(quoteVersions).where(eq(quoteVersions.id, target.quoteId)).for("update"))[0]
        : (await tx.select().from(workforceRequests).where(eq(workforceRequests.id, target.requestId)).for("update"))[0];
      if (!record) throw new CommercialAttachmentError("السجل غير موجود", 404);
      if (quoteTarget ? record.approvedBy || !["draft", "rejected", "pending_approval"].includes(record.status) : record.approvedBy || !("approvalStatus" in record) || !["pending", "changes_requested"].includes(record.approvalStatus)) throw new CommercialAttachmentError("لا يمكن تغيير مرفقات سجل معتمد؛ أنشئ إصدارًا جديدًا أو أعد الطلب للتعديل", 409);
      const originalTerms = "commercialTermsJson" in record ? record.commercialTermsJson : record.quotationTermsJson;
      const refs = commercialAttachmentRefs(originalTerms);
      const [attachment] = await tx.insert(workforceRequestAttachments).values({ requestId: "requestId" in target ? target.requestId : null, quoteVersionId: "quoteId" in target ? target.quoteId : null, fileName, storageKey, contentType: file.type, sizeBytes: file.size }).returning();
      const ref = { id: attachment.id, kind, fileName, sizeBytes: file.size };
      const terms = withCommercialAttachments(originalTerms, [...refs.filter(item => item.kind !== kind), ref]);
      const now = new Date().toISOString();
      if (quoteTarget && "recordVersion" in record) await tx.update(quoteVersions).set({ commercialTermsJson: terms, recordVersion: record.recordVersion + 1, documentId: null, updatedAt: now }).where(eq(quoteVersions.id, record.id));
      else if ("version" in record) await tx.update(workforceRequests).set({ quotationTermsJson: terms, version: record.version + 1, updatedAt: now }).where(eq(workforceRequests.id, record.id));
      return { attachment: ref, entityId: record.id, quoteTarget };
    });
  } catch (error) { await getRuntimeEnv().BUCKET.delete(storageKey).catch(() => undefined); throw error; }
  await auditPortalAction({ actorEmail, action: "commercial-attachment-saved", entityType: saved.quoteTarget ? "quote-version" : "workforce-request", entityId: saved.entityId, after: saved.attachment }).catch(() => undefined);
  await emitPortalNotification({ eventType: "commercial-attachment-saved", title: "حُفظ مرفق تعاقدي", message: fileName, severity: "info", module: "workforce", entityType: saved.quoteTarget ? "quote-version" : "workforce-request", entityId: saved.entityId, actionView: saved.quoteTarget ? "operations" : "workforce", targetDepartment: "workforce" }).catch(() => undefined);
  return saved.attachment;
}
/** Never resolve a browser-supplied object key or an attachment from an unrelated record. */
export async function storedQuoteAttachment(quote: typeof quoteVersions.$inferSelect, attachmentId: number) {
  if (!commercialAttachmentRefs(quote.commercialTermsJson).some(ref => ref.id === attachmentId)) return null;
  const db = getDb();
  const attachment = await db.query.workforceRequestAttachments.findFirst({ where: eq(workforceRequestAttachments.id, attachmentId) });
  if (!attachment) return null;
  if (attachment.quoteVersionId === quote.id) return attachment;
  if (attachment.quoteVersionId) {
    const source = await db.query.quoteVersions.findFirst({ where: and(eq(quoteVersions.id, attachment.quoteVersionId), eq(quoteVersions.quoteCode, quote.quoteCode), eq(quoteVersions.opportunityId, quote.opportunityId)) });
    return source ? attachment : null;
  }
  const opportunity = await db.query.salesOpportunities.findFirst({ where: eq(salesOpportunities.id, quote.opportunityId) });
  return opportunity?.sourceRequestId === attachment.requestId ? attachment : null;
}
