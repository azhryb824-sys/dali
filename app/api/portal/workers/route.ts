import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { contractWorkerAssignments, financialRecords, portalActivity, workerAttachments, workers } from "@/db/schema";
import { cleanDate, cleanText, objectKey, safeFileName } from "@/lib/company-documents";
import { canAccessPortalDepartment, requirePortalApiRole } from "@/lib/portal-access";
import { emitPortalNotification } from "@/lib/portal-notifications";
import { getRuntimeEnv } from "@/lib/runtime-env";
import { requirementsForProfession, workforceNationalities, workforceProfessions } from "@/lib/workforce-requirements";
import { isSaudiBank } from "@/lib/saudi-banks";
import { rejectCrossSiteRequest, validateUploadedFile } from "@/lib/security";

const PHOTO_TYPES = new Set(["image/png", "image/jpeg"]);
const CERTIFICATE_TYPES = new Set(["application/pdf", "image/png", "image/jpeg"]);
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const MAX_CERTIFICATE_BYTES = 12 * 1024 * 1024;
const MAX_TOTAL_BYTES = 50 * 1024 * 1024;

type PendingAttachment = { documentType: "photo" | "certificate"; requirementCode: string | null; title: string; expiryDate: string | null; file: File };

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
    const iban = cleanText(form.get("iban"), 40).replace(/\s+/g, "").toUpperCase();
    const bankName = cleanText(form.get("bankName"), 120);
    const monthlySalary = Number(form.get("monthlySalary") || 0);
    const isCompanySponsored = form.get("isCompanySponsored") === "true";
    const iqamaExpiry = cleanDate(form.get("iqamaExpiry"));
    const medicalInsuranceExpiry = cleanDate(form.get("medicalInsuranceExpiry"));
    const photo = form.get("photo");
    const iqamaDocument = form.get("iqamaDocument");
    const ibanCertificate = form.get("ibanCertificate");
    const workContract = form.get("workContract");

    if (!workerNumber || !/^\d{10}$/.test(iqamaNumber) || !/^SA\d{22}$/.test(iban) || !isSaudiBank(bankName) || !Number.isFinite(monthlySalary) || monthlySalary <= 0 || monthlySalary > 1000000 || fullName.length < 2 || !workforceNationalities.includes(nationality as (typeof workforceNationalities)[number]) || !workforceProfessions.some((item) => item.label === profession) || !validMobile(mobile) || !iqamaExpiry || !medicalInsuranceExpiry) {
      return Response.json({ error: "بيانات العامل غير مكتملة؛ رقم الإقامة 10 أرقام والآيبان السعودي يبدأ SA ويتبعه 22 رقماً" }, { status: 400 });
    }
    if (!(photo instanceof File)) {
      return Response.json({ error: "صورة العامل مطلوبة بصيغة PNG أو JPG وبحجم لا يتجاوز 5 ميجابايت" }, { status: 400 });
    }
    if (!(iqamaDocument instanceof File) || iqamaDocument.size < 1) return Response.json({ error: "صورة الإقامة إلزامية لكل عامل" }, { status: 400 });
    if (!(ibanCertificate instanceof File) || ibanCertificate.size < 1) return Response.json({ error: "شهادة الآيبان إلزامية لكل عامل" }, { status: 400 });
    if (isCompanySponsored && (!(workContract instanceof File) || workContract.size < 1)) return Response.json({ error: "عقد العمل إلزامي للعامل الذي على كفالة الشركة" }, { status: 400 });

    const pending: PendingAttachment[] = [{ documentType: "photo", requirementCode: "worker-photo", title: "صورة العامل", expiryDate: null, file: photo }, { documentType: "certificate", requirementCode: "iqama-copy", title: "صورة الإقامة", expiryDate: iqamaExpiry, file: iqamaDocument }, { documentType: "certificate", requirementCode: "iban-certificate", title: "شهادة الآيبان", expiryDate: null, file: ibanCertificate }];
    if (isCompanySponsored && workContract instanceof File) pending.push({ documentType: "certificate", requirementCode: "work-contract", title: "عقد العمل", expiryDate: null, file: workContract });
    for (const requirement of requirementsForProfession(profession)) {
      const file = form.get(`requirement:${requirement.code}`);
      if (file instanceof File && file.size > 0) pending.push({ documentType: "certificate", requirementCode: requirement.code, title: requirement.label, expiryDate: null, file });
    }
    for (const entry of form.getAll("extraCertificates")) {
      if (entry instanceof File && entry.size > 0) pending.push({ documentType: "certificate", requirementCode: null, title: `مرفق إضافي: ${safeFileName(entry.name)}`, expiryDate: null, file: entry });
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
      iban,
      bankName,
      monthlySalaryHalalas: Math.round(monthlySalary * 100),
      isCompanySponsored,
      beneficiaryName: null,
      clientSite: "غير مسند",
      assignmentStartDate: null,
      iqamaExpiry,
      medicalInsuranceExpiry,
      status: "available",
      updatedAt: now,
    }).returning();
    workerId = worker.id;

    const attachments = await db.insert(workerAttachments).values(uploaded.map((item) => ({
      workerId: worker.id,
      documentType: item.documentType,
      requirementCode: item.requirementCode,
      expiryDate: item.expiryDate,
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

export async function DELETE(request: Request) {
  if (rejectCrossSiteRequest(request)) return Response.json({ error: "مصدر الطلب غير مسموح" }, { status: 403 });
  const access = await requirePortalApiRole(["admin", "manager"]);
  if (!access || !(access.role === "admin" || access.functionalRoles.includes("system_owner") || access.functionalRoles.includes("system_admin"))) return Response.json({ error: "حذف العامل متاح للمالك ومدير النظام فقط" }, { status: 403 });
  try {
    const payload = await request.json() as Record<string, unknown>;
    const id = Number(payload.id);
    const reason = cleanText(payload.reason, 1000);
    if (!Number.isInteger(id) || id < 1 || reason.length < 10) return Response.json({ error: "حدد العامل واكتب سبب حذف لا يقل عن 10 أحرف" }, { status: 400 });
    const db = getDb();
    const worker = await db.query.workers.findFirst({ where: eq(workers.id, id) });
    if (!worker) return Response.json({ error: "العامل غير موجود" }, { status: 404 });
    if (worker.archivedAt) return Response.json({ error: "ملف العامل مؤرشف مسبقًا" }, { status: 409 });
    const activeAssignment = await db.query.contractWorkerAssignments.findFirst({ where: and(eq(contractWorkerAssignments.workerId, id), eq(contractWorkerAssignments.status, "active")) });
    if (activeAssignment) return Response.json({ error: "لا يمكن حذف عامل مرتبط بعقد نشط؛ أنهِ إسناده من العقد أولاً" }, { status: 409 });
    const linkedFinancial = await db.select({ id: financialRecords.id }).from(financialRecords).where(eq(financialRecords.workerId, id));
    const now = new Date().toISOString();
    const [archived] = await db.update(workers).set({ status: "suspended", archivedAt: now, archivedBy: access.user.email, archiveReason: reason, beneficiaryName: null, clientSite: "مؤرشف", assignmentStartDate: null, updatedAt: now }).where(eq(workers.id, id)).returning();
    await db.insert(portalActivity).values({ actorEmail: access.user.email, action: "worker-profile-archived", entityType: "worker", entityId: String(id) });
    await emitPortalNotification({ eventType: "worker-profile-archived", title: "أُرشف ملف عامل", message: `${worker.fullName} — حُفظت ${linkedFinancial.length} حركة مالية مرتبطة دون حذف.`, severity: "warning", module: "workforce", entityType: "worker", entityId: id, actionView: "workforce", targetRole: "admin" }).catch(() => undefined);
    return Response.json({ worker: archived, preservedFinancialRecords: linkedFinancial.length });
  } catch {
    return Response.json({ error: "تعذّر أرشفة ملف العامل" }, { status: 500 });
  }
}
