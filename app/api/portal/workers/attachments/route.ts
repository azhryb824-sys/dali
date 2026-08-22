import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { portalActivity, workerAttachments, workers } from "@/db/schema";
import { cleanDate, cleanText, objectKey, safeFileName } from "@/lib/company-documents";
import { canAccessPortalDepartment, requirePortalApiRole } from "@/lib/portal-access";
import { emitPortalNotification } from "@/lib/portal-notifications";
import { getRuntimeEnv } from "@/lib/runtime-env";
import { requirementsForProfession } from "@/lib/workforce-requirements";
import { rejectCrossSiteRequest, validateUploadedFile } from "@/lib/security";

const TYPES = new Set(["application/pdf", "image/png", "image/jpeg"]);

export async function POST(request: Request) {
  if (rejectCrossSiteRequest(request)) return Response.json({ error: "مصدر الطلب غير مسموح" }, { status: 403 });
  const access = await requirePortalApiRole(["admin", "manager", "employee"]);
  if (!access || !canAccessPortalDepartment(access, "workforce", true)) return Response.json({ error: "غير مصرح برفع مرفقات العامل" }, { status: 403 });

  let storageKey = "";
  try {
    const form = await request.formData();
    const workerId = Number(form.get("workerId"));
    const requirementCode = cleanText(form.get("requirementCode"), 60) || null;
    const customTitle = cleanText(form.get("title"), 160);
    const expiryDate = cleanDate(form.get("expiryDate"), true);
    const file = form.get("file");
    if (!Number.isInteger(workerId) || workerId < 1 || !(file instanceof File) || expiryDate === "") {
      return Response.json({ error: "المرفق غير صحيح أو يتجاوز 12 ميجابايت" }, { status: 400 });
    }
    const validation = await validateUploadedFile(file, { contentTypes: TYPES, maxBytes: 12 * 1024 * 1024 });
    if (!validation.valid) return Response.json({ error: validation.error }, { status: 400 });

    const db = getDb();
    const worker = await db.query.workers.findFirst({ where: eq(workers.id, workerId) });
    if (!worker) return Response.json({ error: "العامل غير موجود" }, { status: 404 });
    const requirement = requirementsForProfession(worker.profession).find((item) => item.code === requirementCode);
    if (requirementCode && !requirement) return Response.json({ error: "نوع المستند لا يطابق متطلبات مهنة العامل" }, { status: 400 });
    const title = requirement?.label || customTitle || "شهادة مهنية إضافية";
    const fileName = safeFileName(file.name);
    storageKey = objectKey("worker-files", fileName);
    await getRuntimeEnv().BUCKET.put(storageKey, validation.bytes, { httpMetadata: { contentType: file.type }, customMetadata: { uploadedBy: access.user.email, workerId: String(workerId), validation: validation.validationDetails } });

    const [attachment] = await db.insert(workerAttachments).values({ workerId, documentType: "certificate", requirementCode, expiryDate, title, fileName, storageKey, contentType: file.type, sizeBytes: file.size, validationStatus: "signature-validated", validationDetails: validation.validationDetails, createdBy: access.user.email }).returning();
    await db.insert(portalActivity).values({ actorEmail: access.user.email, action: "worker-certificate-uploaded", entityType: "worker", entityId: String(workerId) });
    await emitPortalNotification({ eventType: "worker-certificate-uploaded", title: "أُضيف مستند إلى ملف عامل", message: `${worker.fullName} — ${title}.`, severity: "success", module: "workforce", entityType: "worker", entityId: workerId, actionView: "workforce", targetDepartment: "workforce" }).catch(() => undefined);
    return Response.json({ attachment }, { status: 201 });
  } catch {
    if (storageKey) await getRuntimeEnv().BUCKET.delete(storageKey).catch(() => undefined);
    return Response.json({ error: "تعذّر رفع مرفق العامل" }, { status: 500 });
  }
}
