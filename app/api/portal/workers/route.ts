import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { portalActivity, workerAttachments, workers } from "@/db/schema";
import { cleanDate, cleanText, objectKey, safeFileName } from "@/lib/company-documents";
import { canAccessPortalDepartment, requirePortalApiRole } from "@/lib/portal-access";
import { emitPortalNotification } from "@/lib/portal-notifications";
import { getRuntimeEnv } from "@/lib/runtime-env";
import { requirementsForProfession, workforceNationalities, workforceProfessions } from "@/lib/workforce-requirements";
import { rejectCrossSiteRequest, validateUploadedFile } from "@/lib/security";

const PHOTO_TYPES = new Set(["image/png", "image/jpeg"]);
const CERTIFICATE_TYPES = new Set(["application/pdf", "image/png", "image/jpeg"]);
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const MAX_CERTIFICATE_BYTES = 12 * 1024 * 1024;
const MAX_TOTAL_BYTES = 50 * 1024 * 1024;

type PendingAttachment = { documentType: "photo" | "certificate"; requirementCode: string | null; title: string; file: File };

function validMobile(value: string) {
  return /^\+?[0-9\s()-]{8,20}$/.test(value);
}

async function requireWorkforceWrite() {
  const access = await requirePortalApiRole(["admin", "manager", "employee"]);
  if (!access || !canAccessPortalDepartment(access, "workforce", true)) return null;
  return access;
}

export async function POST(request: Request) {
  if (rejectCrossSiteRequest(request)) return Response.json({ error: "مصدر الطلب غير مسموح" }, { status: 403 });
  const access = await requireWorkforceWrite();
  if (!access) return Response.json({ error: "غير مصرح بإضافة العمالة" }, { status: 403 });

  const storedKeys: string[] = [];
  let workerId: number | null = null;
  const db = getDb();
  try {
    const form = await request.formData();
    const workerNumber = cleanText(form.get("workerNumber"), 30).toUpperCase();
    const iqamaNumber = cleanText(form.get("iqamaNumber"), 10);
    const fullName = cleanText(form.get("fullName"), 120);
    const nationality = cleanText(form.get("nationality"), 80);
    const profession = cleanText(form.get("profession"), 120);
    const mobile = cleanText(form.get("mobile"), 20);
    const iqamaExpiry = cleanDate(form.get("iqamaExpiry"));
    const photo = form.get("photo");

    if (!workerNumber || !/^\d{10}$/.test(iqamaNumber) || fullName.length < 2 || !workforceNationalities.includes(nationality as (typeof workforceNationalities)[number]) || !workforceProfessions.some((item) => item.label === profession) || !validMobile(mobile) || !iqamaExpiry) {
      return Response.json({ error: "بيانات العامل غير مكتملة أو غير صحيحة، ورقم الإقامة يجب أن يتكون من 10 أرقام" }, { status: 400 });
    }
    if (!(photo instanceof File)) {
      return Response.json({ error: "صورة العامل مطلوبة بصيغة PNG أو JPG وبحجم لا يتجاوز 5 ميجابايت" }, { status: 400 });
    }

    const pending: PendingAttachment[] = [{ documentType: "photo", requirementCode: null, title: "صورة العامل", file: photo }];
    for (const requirement of requirementsForProfession(profession)) {
      const file = form.get(`requirement:${requirement.code}`);
      if (!(file instanceof File) || file.size < 1) return Response.json({ error: `المستند المطلوب غير مرفق: ${requirement.label}` }, { status: 400 });
      pending.push({ documentType: "certificate", requirementCode: requirement.code, title: requirement.label, file });
    }
    for (const entry of form.getAll("extraCertificates")) {
      if (entry instanceof File && entry.size > 0) pending.push({ documentType: "certificate", requirementCode: null, title: `شهادة إضافية: ${safeFileName(entry.name)}`, file: entry });
    }

    const certificateFiles = pending.filter((item) => item.documentType === "certificate");
    if (certificateFiles.some((item) => item.file.size > MAX_CERTIFICATE_BYTES || !CERTIFICATE_TYPES.has(item.file.type))) {
      return Response.json({ error: "يجب أن تكون الشهادات بصيغة PDF أو PNG أو JPG، وألا يتجاوز الملف 12 ميجابايت" }, { status: 400 });
    }
    if (pending.reduce((total, item) => total + item.file.size, 0) > MAX_TOTAL_BYTES) {
      return Response.json({ error: "إجمالي المرفقات يتجاوز 50 ميجابايت" }, { status: 400 });
    }

    const uploaded = await Promise.all(pending.map(async (item) => {
      const validation = await validateUploadedFile(item.file, { contentTypes: item.documentType === "photo" ? PHOTO_TYPES : CERTIFICATE_TYPES, maxBytes: item.documentType === "photo" ? MAX_PHOTO_BYTES : MAX_CERTIFICATE_BYTES });
      if (!validation.valid) throw new Error(`${item.title}: ${validation.error}`);
      const fileName = safeFileName(item.file.name);
      const storageKey = objectKey("worker-files", fileName);
      await getRuntimeEnv().BUCKET.put(storageKey, validation.bytes, {
        httpMetadata: { contentType: item.file.type },
        customMetadata: { uploadedBy: access.user.email, documentType: item.documentType, iqamaNumber, validation: validation.validationDetails },
      });
      storedKeys.push(storageKey);
      return { ...item, fileName, storageKey, validationDetails: validation.validationDetails };
    }));

    const now = new Date().toISOString();
    const [worker] = await db.insert(workers).values({
      workerNumber,
      iqamaNumber,
      fullName,
      nationality,
      profession,
      mobile,
      beneficiaryName: null,
      clientSite: "غير مسند",
      assignmentStartDate: null,
      iqamaExpiry,
      status: "available",
      updatedAt: now,
    }).returning();
    workerId = worker.id;

    const attachments = await db.insert(workerAttachments).values(uploaded.map((item) => ({
      workerId: worker.id,
      documentType: item.documentType,
      requirementCode: item.requirementCode,
      title: item.title,
      fileName: item.fileName,
      storageKey: item.storageKey,
      contentType: item.file.type,
      sizeBytes: item.file.size,
      validationStatus: "signature-validated",
      validationDetails: item.validationDetails,
      createdBy: access.user.email,
    }))).returning();

    await db.insert(portalActivity).values({ actorEmail: access.user.email, action: "worker-profile-created", entityType: "worker", entityId: String(worker.id) });
    await emitPortalNotification({ eventType: "worker-profile-created", title: "ملف عامل جديد جاهز للمراجعة", message: `${worker.fullName} — ${worker.profession} — ${worker.workerNumber}.`, severity: "success", module: "workforce", entityType: "worker", entityId: worker.id, actionView: "workforce", targetDepartment: "workforce" }).catch(() => undefined);
    return Response.json({ worker, attachments }, { status: 201 });
  } catch (error) {
    await Promise.all(storedKeys.map((key) => getRuntimeEnv().BUCKET.delete(key).catch(() => undefined)));
    if (workerId) await db.delete(workers).where(eq(workers.id, workerId)).catch(() => undefined);
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (message.includes("unique")) return Response.json({ error: "رقم العامل أو رقم الإقامة مستخدم في ملف آخر" }, { status: 409 });
    return Response.json({ error: "تعذّر إنشاء ملف العامل حالياً" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  if (rejectCrossSiteRequest(request)) return Response.json({ error: "مصدر الطلب غير مسموح" }, { status: 403 });
  const access = await requireWorkforceWrite();
  if (!access) return Response.json({ error: "غير مصرح بتحديث إسناد العامل" }, { status: 403 });

  try {
    const payload = await request.json() as Record<string, unknown>;
    const id = Number(payload.id);
    const status = cleanText(payload.status, 30);
    if (!Number.isInteger(id) || id < 1 || !["available", "leave", "suspended"].includes(status)) {
      return Response.json({ error: "بيانات الإسناد غير صحيحة" }, { status: 400 });
    }

    const current = await getDb().query.workers.findFirst({ where: eq(workers.id, id) });
    if (!current) return Response.json({ error: "العامل غير موجود" }, { status: 404 });
    if (current.status === "assigned") {
      return Response.json({ error: "يجب إنهاء إسناد العامل من العقد النشط أولاً" }, { status: 409 });
    }

    const [updated] = await getDb().update(workers).set({
      status,
      beneficiaryName: null,
      clientSite: "غير مسند",
      assignmentStartDate: null,
      updatedAt: new Date().toISOString(),
    }).where(eq(workers.id, id)).returning();
    if (!updated) return Response.json({ error: "العامل غير موجود" }, { status: 404 });

    await getDb().insert(portalActivity).values({ actorEmail: access.user.email, action: "worker-assignment-updated", entityType: "worker", entityId: String(id) });
    await emitPortalNotification({ eventType: "worker-status-updated", title: "تغيّرت حالة عامل", message: `${updated.fullName} — الحالة الجديدة: ${status}.`, severity: "info", module: "workforce", entityType: "worker", entityId: updated.id, actionView: "workforce", targetDepartment: "workforce" }).catch(() => undefined);
    return Response.json({ worker: updated });
  } catch {
    return Response.json({ error: "تعذّر تحديث إسناد العامل" }, { status: 500 });
  }
}
