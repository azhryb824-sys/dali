import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { legalCaseActionLog, legalCaseAttachments, legalRecords, portalActivity } from "@/db/schema";
import { cleanText, objectKey, safeFileName } from "@/lib/company-documents";
import { emitPortalNotification } from "@/lib/portal-notifications";
import { hasPortalPermission, requirePortalApiRole } from "@/lib/portal-access";
import { getRuntimeEnv } from "@/lib/runtime-env";
import { rejectCrossSiteRequest, validateUploadedFile } from "@/lib/security";

const TYPES = new Set(["application/pdf", "image/png", "image/jpeg"]);

export async function POST(request: Request) {
  if (rejectCrossSiteRequest(request)) return Response.json({ error: "مصدر الطلب غير مسموح" }, { status: 403 });
  const actor = await requirePortalApiRole(["admin", "manager", "employee"]);
  if (!actor || !(await hasPortalPermission(actor, "legal", "write"))) return Response.json({ error: "غير مصرح برفع مرفقات قانونية" }, { status: 403 });
  let storageKey = "";
  try {
    const form = await request.formData();
    const legalRecordId = Number(form.get("legalRecordId"));
    const file = form.get("file");
    const requestedTitle = cleanText(form.get("title"), 180);
    if (!Number.isInteger(legalRecordId) || legalRecordId < 1 || !(file instanceof File)) return Response.json({ error: "بيانات المرفق غير مكتملة" }, { status: 400 });
    const validation = await validateUploadedFile(file, { contentTypes: TYPES, maxBytes: 20 * 1024 * 1024 });
    if (!validation.valid) return Response.json({ error: validation.error }, { status: 400 });
    const db = getDb();
    const matter = await db.query.legalRecords.findFirst({ where: eq(legalRecords.id, legalRecordId) });
    if (!matter) return Response.json({ error: "الملف القانوني غير موجود" }, { status: 404 });
    const fileName = safeFileName(file.name);
    const title = requestedTitle || fileName;
    storageKey = objectKey("legal-case-files", fileName);
    await getRuntimeEnv().BUCKET.put(storageKey, validation.bytes, { httpMetadata: { contentType: file.type }, customMetadata: { uploadedBy: actor.user.email, legalRecordId: String(legalRecordId), validation: validation.validationDetails } });
    const attachment = await db.transaction(async tx => {
      const [saved] = await tx.insert(legalCaseAttachments).values({ legalRecordId, title, fileName, storageKey, contentType: file.type, sizeBytes: validation.bytes.byteLength, validationStatus: "signature-validated", validationDetails: validation.validationDetails, createdBy: actor.user.email }).returning();
      const role = actor.functionalRoles.includes("legal_supervisor") ? "legal_supervisor" : actor.functionalRoles.includes("legal_lawyer") || actor.functionalRoles.includes("lawyer") ? "legal_lawyer" : actor.role === "admin" ? "system_admin" : "legal_staff";
      await tx.insert(legalCaseActionLog).values({ legalRecordId, activityId: null, action: "attachment_added", details: `إضافة المرفق: ${title}`, actorEmail: actor.user.email, actorRole: role });
      await tx.insert(portalActivity).values({ actorEmail: actor.user.email, action: "legal-case-attachment-uploaded", entityType: "legal-record", entityId: String(legalRecordId), afterJson: JSON.stringify({ attachmentId: saved.id, title }) });
      return saved;
    });
    await emitPortalNotification({ eventType: "legal-case-attachment-uploaded", title: "أُضيف مرفق إلى ملف قانوني", message: `${matter.referenceCode} — ${title}`, severity: "info", module: "legal", entityType: "legal-record", entityId: legalRecordId, actionView: "legal", targetDepartment: "legal" }).catch(() => undefined);
    return Response.json({ attachment }, { status: 201 });
  } catch {
    if (storageKey) await getRuntimeEnv().BUCKET.delete(storageKey).catch(() => undefined);
    return Response.json({ error: "تعذّر رفع المرفق القانوني" }, { status: 500 });
  }
}
