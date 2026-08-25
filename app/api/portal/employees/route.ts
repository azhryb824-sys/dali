import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { employeeDocuments, employees, portalUsers } from "@/db/schema";
import { auditPortalAction } from "@/lib/audit";
import { objectKey, safeFileName } from "@/lib/company-documents";
import { canAccessPortalDepartment, requirePortalApiRole } from "@/lib/portal-access";
import { emitPortalNotification } from "@/lib/portal-notifications";
import { getRuntimeEnv } from "@/lib/runtime-env";
import { bankNameFromSaudiIban, isValidSaudiIban, normalizeSaudiIban } from "@/lib/saudi-banks";
import { rejectCrossSiteRequest, validateUploadedFile } from "@/lib/security";

const imageTypes = new Set(["image/png", "image/jpeg"]);
const documentTypes = new Set(["application/pdf", "image/png", "image/jpeg"]);
const clean = (value: FormDataEntryValue | null, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";
const money = (value: FormDataEntryValue | null) => Math.round(Number(value || 0) * 100);

export async function POST(request: Request) {
  if (rejectCrossSiteRequest(request)) return Response.json({ error: "مصدر الطلب غير مسموح" }, { status: 403 });
  const access = await requirePortalApiRole(["admin", "manager", "employee"]);
  if (!access || !canAccessPortalDepartment(access, "employees", true)) return Response.json({ error: "غير مصرح بإضافة الموظفين" }, { status: 403 });
  const storedKeys: string[] = [];
  let employeeId: number | null = null;
  const db = getDb();
  try {
    const form = await request.formData();
    const employeeNumber = clean(form.get("employeeNumber"), 30).toUpperCase();
    const fullName = clean(form.get("fullName"), 120), nationalId = clean(form.get("nationalId"), 10);
    const jobTitle = clean(form.get("jobTitle"), 100), department = clean(form.get("department"), 100);
    const mobile = clean(form.get("mobile"), 20), email = clean(form.get("email"), 160).toLowerCase() || null;
    const nationality = clean(form.get("nationality"), 80) || null, hireDate = clean(form.get("hireDate"), 10);
    const iqamaExpiry = clean(form.get("iqamaExpiry"), 10), portalUserEmail = clean(form.get("portalUserEmail"), 160).toLowerCase();
    const rawIban = clean(form.get("iban"), 50), iban = rawIban && rawIban !== "SA" ? normalizeSaudiIban(rawIban) : null;
    const bankName = iban ? bankNameFromSaudiIban(iban) : null;
    const baseSalaryHalalas = money(form.get("baseSalary")), housingAllowanceHalalas = money(form.get("housingAllowance"));
    const transportAllowanceHalalas = money(form.get("transportAllowance")), otherAllowanceHalalas = money(form.get("otherAllowance"));
    const photo = form.get("photo"), iqamaDocument = form.get("iqamaDocument"), employmentContract = form.get("employmentContract");
    const amounts = [baseSalaryHalalas, housingAllowanceHalalas, transportAllowanceHalalas, otherAllowanceHalalas];
    if (!employeeNumber || fullName.length < 2 || !/^\d{10}$/.test(nationalId) || !portalUserEmail || !jobTitle || !department || !/^\+?[0-9\s()-]{8,20}$/.test(mobile) || !/^\d{4}-\d{2}-\d{2}$/.test(hireDate) || !/^\d{4}-\d{2}-\d{2}$/.test(iqamaExpiry) || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) || amounts.some(value => !Number.isSafeInteger(value) || value < 0) || (iban && !isValidSaudiIban(iban))) return Response.json({ error: "استكمل بيانات الموظف الإلزامية وتأكد من صحة الإقامة والمستخدم والآيبان السعودي" }, { status: 400 });
    if (!(iqamaDocument instanceof File) || iqamaDocument.size < 1) return Response.json({ error: "صورة الإقامة إلزامية" }, { status: 400 });
    if (!(employmentContract instanceof File) || employmentContract.size < 1) return Response.json({ error: "عقد العمل إلزامي لإكمال ملف الموظف" }, { status: 400 });
    if (photo instanceof File && photo.size > 0 && !imageTypes.has(photo.type)) return Response.json({ error: "الصورة الشخصية يجب أن تكون PNG أو JPG" }, { status: 400 });
    const user = await db.query.portalUsers.findFirst({ where: eq(portalUsers.email, portalUserEmail) });
    if (!user || user.status !== "active") return Response.json({ error: "اختر مستخدمًا نشطًا للموظف" }, { status: 400 });
    const linked = await db.query.employees.findFirst({ where: eq(employees.portalUserEmail, portalUserEmail) });
    if (linked) return Response.json({ error: "هذا المستخدم مرتبط بموظف آخر" }, { status: 409 });
    const pending = [
      { file: iqamaDocument, type: "national_id", title: "صورة الإقامة", expiryDate: iqamaExpiry, allowed: documentTypes },
      { file: employmentContract, type: "employment_contract", title: "عقد العمل", expiryDate: "", allowed: documentTypes },
    ];
    if (photo instanceof File && photo.size > 0) pending.push({ file: photo, type: "personal_photo", title: "الصورة الشخصية", expiryDate: "", allowed: imageTypes });
    const uploaded = [];
    for (const item of pending) {
      const validation = await validateUploadedFile(item.file, { contentTypes: item.allowed, maxBytes: item.type === "personal_photo" ? 5 * 1024 * 1024 : 12 * 1024 * 1024 });
      if (!validation.valid) throw new Error(validation.error);
      const fileName = safeFileName(item.file.name), storageKey = objectKey("employee-files", fileName);
      await getRuntimeEnv().BUCKET.put(storageKey, validation.bytes, { httpMetadata: { contentType: item.file.type }, customMetadata: { uploadedBy: access.user.email, documentType: item.type, employeeNumber } });
      storedKeys.push(storageKey); uploaded.push({ ...item, fileName, storageKey });
    }
    const now = new Date().toISOString();
    const [saved] = await db.insert(employees).values({ employeeNumber, fullName, jobTitle, department, mobile, email, portalUserEmail, nationalId, nationality, hireDate, bankName, iban, baseSalaryHalalas, housingAllowanceHalalas, transportAllowanceHalalas, otherAllowanceHalalas, updatedAt: now }).returning();
    employeeId = saved.id;
    await db.insert(employeeDocuments).values(uploaded.map(item => ({ employeeId: saved.id, documentType: item.type, documentNumber: item.type === "national_id" ? nationalId : null, expiryDate: item.expiryDate || null, fileName: item.fileName, storageKey: item.storageKey, status: "valid", notes: item.title, createdBy: access.user.email, updatedAt: now })));
    await auditPortalAction({ actorEmail: access.user.email, action: "employee-profile-created", entityType: "employee", entityId: saved.id, after: { ...saved, files: uploaded.map(item => item.type) } });
    await emitPortalNotification({ eventType: "employee-profile-created", title: "اكتمل إنشاء ملف موظف", message: `${saved.employeeNumber} — ${saved.fullName} — مرتبط بالمستخدم ${portalUserEmail}.`, severity: "success", module: "employees", entityType: "employee", entityId: saved.id, actionView: "employees", targetDepartment: "employees" }).catch(() => undefined);
    return Response.json({ employee: saved }, { status: 201 });
  } catch (error) {
    if (employeeId) await db.delete(employees).where(eq(employees.id, employeeId)).catch(() => undefined);
    await Promise.all(storedKeys.map(key => getRuntimeEnv().BUCKET.delete(key).catch(() => undefined)));
    const message = error instanceof Error ? error.message : "تعذر إنشاء ملف الموظف";
    return Response.json({ error: message.toLowerCase().includes("unique") ? "الرقم الوظيفي أو الهوية أو الآيبان مستخدم مسبقًا" : message }, { status: message.toLowerCase().includes("unique") ? 409 : 500 });
  }
}
