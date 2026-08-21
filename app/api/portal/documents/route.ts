import { getDb } from "@/db";
import { companyDocuments, portalActivity } from "@/db/schema";
import { cleanDate, cleanText, documentCategories, makeReference, objectKey, safeFileName, uploadContentTypes } from "@/lib/company-documents";
import { canManagePortalDocuments, requirePortalApiRole } from "@/lib/portal-access";
import { emitPortalNotification } from "@/lib/portal-notifications";
import { getRuntimeEnv } from "@/lib/runtime-env";
import { rejectCrossSiteRequest, validateUploadedFile } from "@/lib/security";

const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;

export async function POST(request: Request) {
  if (rejectCrossSiteRequest(request)) return Response.json({ error: "مصدر الطلب غير مسموح" }, { status: 403 });
  const access = await requirePortalApiRole(["admin", "manager", "employee"]);
  if (!access || !canManagePortalDocuments(access)) return Response.json({ error: "غير مصرح برفع المستندات" }, { status: 403 });

  let storageKey = "";
  try {
    const form = await request.formData();
    const file = form.get("file");
    const title = cleanText(form.get("title"), 180);
    const category = cleanText(form.get("category"), 30);
    const counterparty = cleanText(form.get("counterparty"), 160) || null;
    const expiryDate = cleanDate(form.get("expiryDate"), true);
    const retentionUntil = cleanDate(form.get("retentionUntil"), true);
    const lockedUntil = cleanDate(form.get("lockedUntil"), true);

    if (!(file instanceof File)) {
      return Response.json({ error: "اختر ملفاً لا يتجاوز حجمه 20 ميجابايت" }, { status: 400 });
    }
    const validation = await validateUploadedFile(file, { contentTypes: uploadContentTypes, maxBytes: MAX_DOCUMENT_BYTES });
    if (!validation.valid) return Response.json({ error: validation.error }, { status: 400 });
    if (title.length < 3 || !documentCategories.has(category) || expiryDate === "" || retentionUntil === "" || lockedUntil === "") {
      return Response.json({ error: "بيانات المستند غير مكتملة أو غير صحيحة" }, { status: 400 });
    }

    const fileName = safeFileName(file.name);
    storageKey = objectKey("company-documents", fileName);
    await getRuntimeEnv().BUCKET.put(storageKey, validation.bytes, {
      httpMetadata: { contentType: file.type },
      customMetadata: { uploadedBy: access.user.email, originalName: fileName, validation: validation.validationDetails },
    });

    const db = getDb();
    const [saved] = await db.insert(companyDocuments).values({
      referenceCode: makeReference("DOC"),
      title,
      category,
      counterparty,
      fileName,
      storageKey,
      contentType: file.type,
      sizeBytes: file.size,
      expiryDate,
      retentionUntil,
      lockedUntil,
      source: "uploaded",
      validationStatus: "signature-validated",
      validationDetails: validation.validationDetails,
      createdBy: access.user.email,
    }).returning();

    await db.insert(portalActivity).values({
      actorEmail: access.user.email,
      action: "company-document-uploaded",
      entityType: "company-document",
      entityId: String(saved.id),
    });
    await emitPortalNotification({ eventType: "company-document-uploaded", title: "رُفع مستند شركة جديد", message: `${saved.referenceCode} — ${saved.title}.`, severity: "info", module: "documents", entityType: "company-document", entityId: saved.id, actionView: "documents" }).catch(() => undefined);
    return Response.json({ document: saved }, { status: 201 });
  } catch {
    if (storageKey) await getRuntimeEnv().BUCKET.delete(storageKey).catch(() => undefined);
    return Response.json({ error: "تعذّر رفع المستند حالياً" }, { status: 500 });
  }
}
