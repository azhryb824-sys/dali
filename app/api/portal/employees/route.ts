import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { employeeDocuments, employeeProfileChanges, employees, portalUsers } from "@/db/schema";
import { auditPortalAction } from "@/lib/audit";
import { objectKey, safeFileName } from "@/lib/company-documents";
import { canAccessPortalDepartment, hasPortalPermission, requirePortalApiRole } from "@/lib/portal-access";
import { emitPortalNotification } from "@/lib/portal-notifications";
import { getRuntimeEnv } from "@/lib/runtime-env";
import { bankNameFromSaudiIban, isValidSaudiIban, normalizeSaudiIban } from "@/lib/saudi-banks";
import { rejectCrossSiteRequest, validateUploadedFile } from "@/lib/security";

const imageTypes = new Set(["image/png", "image/jpeg"]);
const documentTypes = new Set(["application/pdf", "image/png", "image/jpeg"]);
const latinDigits = (value: string) => value.replace(/[٠-٩۰-۹]/g, digit => String("٠١٢٣٤٥٦٧٨٩".includes(digit) ? "٠١٢٣٤٥٦٧٨٩".indexOf(digit) : "۰۱۲۳۴۵۶۷۸۹".indexOf(digit)));
const clean = (value: FormDataEntryValue | null, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";
const cleanDigits = (value: FormDataEntryValue | null, max: number) => latinDigits(clean(value, max));
const money = (value: FormDataEntryValue | null) => Math.round(Number(latinDigits(typeof value === "string" ? value : "0").replace(",", ".")) * 100);
const validDate = (value: string | null | undefined) => Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
const validEmail = (value: string | null) => !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const isSaudiNationality = (value: string | null) => /^(?:سعودي|سعودية|السعودية|saudi|saudi arabian)$/i.test((value || "").trim());
const employeeTypes = new Set(["full_time", "part_time", "temporary"]);
const contractTypes = new Set(["fixed_term", "indefinite"]);

export async function POST(request: Request) {
  if (rejectCrossSiteRequest(request)) return Response.json({ error: "مصدر الطلب غير مسموح" }, { status: 403 });
  const access = await requirePortalApiRole(["admin", "manager", "employee"]);
  if (!access || !canAccessPortalDepartment(access, "employees", true)) return Response.json({ error: "غير مصرح بإضافة الموظفين" }, { status: 403 });
  const storedKeys: string[] = [];
  let employeeId: number | null = null;
  const db = getDb();
  try {
    const form = await request.formData();
    const employeeNumber = latinDigits(clean(form.get("employeeNumber"), 30)).toUpperCase();
    const fullName = clean(form.get("fullName"), 120), nationalId = cleanDigits(form.get("nationalId"), 10);
    const jobTitle = clean(form.get("jobTitle"), 100), department = clean(form.get("department"), 100);
    const mobile = cleanDigits(form.get("mobile"), 20), email = clean(form.get("email"), 160).toLowerCase() || null;
    const rawResidencyType = clean(form.get("residencyType"), 10);
    const residencyType = rawResidencyType === "citizen" || rawResidencyType === "resident" ? rawResidencyType : null;
    const requestedNationality = clean(form.get("nationality"), 80) || null;
    const nationality = residencyType === "citizen" ? "السعودية" : requestedNationality;
    const hireDate = clean(form.get("hireDate"), 10), probationEndDate = clean(form.get("probationEndDate"), 10) || null;
    const iqamaExpiry = residencyType === "resident" ? clean(form.get("iqamaExpiry"), 10) : null;
    const workPermitExpiry = residencyType === "resident" ? clean(form.get("workPermitExpiry"), 10) : null;
    const portalUserEmail = clean(form.get("portalUserEmail"), 160).toLowerCase();
    const sponsorshipType = residencyType === "resident" ? clean(form.get("sponsorshipType"), 10) : "dali";
    const sponsorName = residencyType === "resident" && sponsorshipType === "other" ? clean(form.get("sponsorName"), 160) : null;
    const employmentType = clean(form.get("employmentType"), 30) || "full_time";
    const contractType = clean(form.get("contractType"), 30) || "fixed_term";
    const contractEndDate = contractType === "fixed_term" ? clean(form.get("contractEndDate"), 10) : null;
    const workLocation = clean(form.get("workLocation"), 120) || null;
    const gosiNumber = cleanDigits(form.get("gosiNumber"), 40) || null;
    const managerId = Number(cleanDigits(form.get("managerId"), 12)) || null;
    const annualLeaveDays = Number(cleanDigits(form.get("annualLeaveDays"), 3) || "21");
    const rawIban = cleanDigits(form.get("iban"), 50), iban = rawIban && rawIban !== "SA" ? normalizeSaudiIban(rawIban) : null;
    const bankName = iban ? bankNameFromSaudiIban(iban) : null;
    const baseSalaryHalalas = money(form.get("baseSalary")), housingAllowanceHalalas = money(form.get("housingAllowance"));
    const transportAllowanceHalalas = money(form.get("transportAllowance")), otherAllowanceHalalas = money(form.get("otherAllowance"));
    const photo = form.get("photo"), iqamaDocument = form.get("iqamaDocument"), employmentContract = form.get("employmentContract");
    const amounts = [baseSalaryHalalas, housingAllowanceHalalas, transportAllowanceHalalas, otherAllowanceHalalas];
    if (!employeeNumber || fullName.length < 2 || !/^\d{10}$/.test(nationalId) || !portalUserEmail || !jobTitle || !department || !/^\+?[0-9\s()-]{8,20}$/.test(mobile) || !validDate(hireDate) || !residencyType || !employeeTypes.has(employmentType) || !contractTypes.has(contractType) || (probationEndDate && !validDate(probationEndDate)) || (contractType === "fixed_term" && !validDate(contractEndDate)) || (residencyType === "citizen" && !nationalId.startsWith("1")) || (residencyType === "resident" && (!nationalId.startsWith("2") || !nationality || isSaudiNationality(nationality) || !validDate(iqamaExpiry) || !validDate(workPermitExpiry) || !["dali", "other"].includes(sponsorshipType) || (sponsorshipType === "other" && (!sponsorName || sponsorName.length < 2)))) || !validEmail(email) || !Number.isSafeInteger(annualLeaveDays) || annualLeaveDays < 0 || annualLeaveDays > 365 || amounts.some(value => !Number.isSafeInteger(value) || value < 0) || (iban && !isValidSaudiIban(iban))) return Response.json({ error: "استكمل بيانات الموظف، واختر مواطنًا أو مقيمًا، وأدخل تواريخ الإقامة ورخصة العمل للمقيم فقط، وتأكد من صحة الهوية والآيبان" }, { status: 400 });
    if (!(iqamaDocument instanceof File) || iqamaDocument.size < 1) return Response.json({ error: residencyType === "citizen" ? "صورة الهوية الوطنية إلزامية" : "صورة الإقامة إلزامية" }, { status: 400 });
    if (!(employmentContract instanceof File) || employmentContract.size < 1) return Response.json({ error: "عقد العمل إلزامي لإكمال ملف الموظف" }, { status: 400 });
    if (photo instanceof File && photo.size > 0 && !imageTypes.has(photo.type)) return Response.json({ error: "الصورة الشخصية يجب أن تكون PNG أو JPG" }, { status: 400 });
    const user = await db.query.portalUsers.findFirst({ where: eq(portalUsers.email, portalUserEmail) });
    if (!user || user.status !== "active") return Response.json({ error: "اختر مستخدمًا نشطًا للموظف" }, { status: 400 });
    const linked = await db.query.employees.findFirst({ where: eq(employees.portalUserEmail, portalUserEmail) });
    if (linked) return Response.json({ error: "هذا المستخدم مرتبط بموظف آخر" }, { status: 409 });
    if (managerId) {
      const manager = await db.query.employees.findFirst({ where: and(eq(employees.id, managerId), isNull(employees.archivedAt)) });
      if (!manager) return Response.json({ error: "المدير المباشر المحدد غير موجود" }, { status: 400 });
    }
    const pending = [
      { file: iqamaDocument, type: "national_id", title: residencyType === "citizen" ? "صورة الهوية الوطنية" : "صورة الإقامة", expiryDate: iqamaExpiry || "", allowed: documentTypes },
      { file: employmentContract, type: "employment_contract", title: "عقد العمل", expiryDate: contractEndDate || "", allowed: documentTypes },
    ];
    if (photo instanceof File && photo.size > 0) pending.push({ file: photo, type: "personal_photo", title: "الصورة الشخصية", expiryDate: "", allowed: imageTypes });
    const uploaded: Array<(typeof pending)[number] & { fileName: string; storageKey: string }> = [];
    for (const item of pending) {
      const validation = await validateUploadedFile(item.file, { contentTypes: item.allowed, maxBytes: item.type === "personal_photo" ? 5 * 1024 * 1024 : 12 * 1024 * 1024 });
      if (!validation.valid) throw new Error(validation.error);
      const fileName = safeFileName(item.file.name), storageKey = objectKey("employee-files", fileName);
      await getRuntimeEnv().BUCKET.put(storageKey, validation.bytes, { httpMetadata: { contentType: item.file.type }, customMetadata: { uploadedBy: access.user.email, documentType: item.type, employeeNumber } });
      storedKeys.push(storageKey); uploaded.push({ ...item, fileName, storageKey });
    }
    const now = new Date().toISOString();
    const saved = await db.transaction(async (tx) => {
      const [employee] = await tx.insert(employees).values({ employeeNumber, fullName, jobTitle, department, mobile, email, portalUserEmail, managerId, workLocation, employmentType, contractType, gosiNumber, nationalId, nationality, residencyType, sponsorshipType, sponsorName, iqamaExpiry, contractEndDate, workPermitExpiry, hireDate, probationEndDate, bankName, iban, baseSalaryHalalas, housingAllowanceHalalas, transportAllowanceHalalas, otherAllowanceHalalas, annualLeaveDays, leaveBalanceDays: annualLeaveDays, updatedAt: now }).returning();
      await tx.insert(employeeDocuments).values(uploaded.map(item => ({ employeeId: employee.id, documentType: item.type, documentNumber: item.type === "national_id" ? nationalId : null, expiryDate: item.expiryDate || null, fileName: item.fileName, storageKey: item.storageKey, status: "valid", notes: item.title, createdBy: access.user.email, updatedAt: now })));
      return employee;
    });
    employeeId = saved.id;
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

export async function PATCH(request: Request) {
  if (rejectCrossSiteRequest(request)) return Response.json({ error: "مصدر الطلب غير مسموح" }, { status: 403 });
  const access = await requirePortalApiRole(["admin", "manager", "employee"]);
  if (!access || !canAccessPortalDepartment(access, "employees", true)) return Response.json({ error: "غير مصرح بتحديث الموظفين" }, { status: 403 });
  try {
    const payload = await request.json() as Record<string, unknown>;
    const id = Number(payload.id);
    if (!Number.isInteger(id) || id < 1) return Response.json({ error: "رقم الموظف غير صحيح" }, { status: 400 });
    const db = getDb(), existing = await db.query.employees.findFirst({ where: and(eq(employees.id, id), isNull(employees.archivedAt)) });
    if (!existing) return Response.json({ error: "الموظف غير موجود" }, { status: 404 });

    const value = (key: string, max: number, fallback: string | null = "") => payload[key] === undefined ? (fallback || "") : String(payload[key] || "").trim().slice(0, max);
    const digits = (key: string, max: number, fallback: string | null = "") => latinDigits(value(key, max, fallback));
    const halalas = (key: string, fallback: number) => payload[key] === undefined ? fallback : Math.round(Number(latinDigits(String(payload[key] || "0")).replace(",", ".")) * 100);
    const employeeNumber = latinDigits(value("employeeNumber", 30, existing.employeeNumber)).toUpperCase();
    const fullName = value("fullName", 120, existing.fullName);
    const nationalId = digits("nationalId", 10, existing.nationalId);
    const rawResidencyType = value("residencyType", 10, existing.residencyType);
    const residencyType = rawResidencyType === "citizen" || rawResidencyType === "resident" ? rawResidencyType : null;
    const requestedNationality = value("nationality", 80, existing.nationality) || null;
    const nationality = residencyType === "citizen" ? "السعودية" : requestedNationality;
    const mobile = digits("mobile", 20, existing.mobile);
    const email = value("email", 160, existing.email).toLowerCase() || null;
    const portalUserEmail = value("portalUserEmail", 160, existing.portalUserEmail).toLowerCase();
    const workLocation = value("workLocation", 120, existing.workLocation) || null;
    const employmentType = value("employmentType", 30, existing.employmentType);
    const contractType = value("contractType", 30, existing.contractType);
    const gosiNumber = digits("gosiNumber", 40, existing.gosiNumber) || null;
    const hireDate = value("hireDate", 10, existing.hireDate);
    const probationEndDate = value("probationEndDate", 10, existing.probationEndDate) || null;
    const annualLeaveDays = Number(digits("annualLeaveDays", 3, String(existing.annualLeaveDays)));
    const sponsorshipType = residencyType === "resident" ? value("sponsorshipType", 10, existing.sponsorshipType) : "dali";
    const sponsorName = residencyType === "resident" && sponsorshipType === "other" ? value("sponsorName", 160, existing.sponsorName) || null : null;
    const iqamaExpiry = residencyType === "resident" ? value("iqamaExpiry", 10, existing.iqamaExpiry) || null : null;
    const workPermitExpiry = residencyType === "resident" ? value("workPermitExpiry", 10, existing.workPermitExpiry) || null : null;
    const contractEndDate = contractType === "fixed_term" ? value("contractEndDate", 10, existing.contractEndDate) || null : null;

    const jobTitle = value("jobTitle", 100, existing.jobTitle);
    const department = value("department", 100, existing.department);
    const managerId = payload.managerId === undefined ? existing.managerId : Number(payload.managerId) || null;
    const baseSalaryHalalas = halalas("baseSalary", existing.baseSalaryHalalas);
    const housingAllowanceHalalas = halalas("housingAllowance", existing.housingAllowanceHalalas);
    const transportAllowanceHalalas = halalas("transportAllowance", existing.transportAllowanceHalalas);
    const otherAllowanceHalalas = halalas("otherAllowance", existing.otherAllowanceHalalas);
    const rawIban = payload.iban === undefined ? existing.iban || "" : digits("iban", 50);
    const iban = rawIban && rawIban !== "SA" ? normalizeSaudiIban(rawIban) : null;
    const bankName = iban ? bankNameFromSaudiIban(iban) : null;

    const datesAreValid = validDate(hireDate)
      && (!probationEndDate || validDate(probationEndDate))
      && (contractType !== "fixed_term" || validDate(contractEndDate))
      && (residencyType !== "resident" || (validDate(iqamaExpiry) && validDate(workPermitExpiry)));
    const amounts = [baseSalaryHalalas, housingAllowanceHalalas, transportAllowanceHalalas, otherAllowanceHalalas];
    if (!employeeNumber || fullName.length < 2 || !jobTitle || !department || !portalUserEmail || !/^\d{10}$/.test(nationalId) || !/^\+?[0-9\s()-]{8,20}$/.test(mobile) || !validEmail(email) || !residencyType || !employeeTypes.has(employmentType) || !contractTypes.has(contractType) || !datesAreValid || (residencyType === "citizen" && !nationalId.startsWith("1")) || (residencyType === "resident" && (!nationalId.startsWith("2") || !nationality || isSaudiNationality(nationality) || !["dali", "other"].includes(sponsorshipType) || (sponsorshipType === "other" && (!sponsorName || sponsorName.length < 2)))) || !Number.isSafeInteger(annualLeaveDays) || annualLeaveDays < 0 || annualLeaveDays > 365 || amounts.some(amount => !Number.isSafeInteger(amount) || amount < 0) || (iban && !isValidSaudiIban(iban))) {
      return Response.json({ error: "بيانات الموظف غير مكتملة؛ إقامة ورخصة العمل مطلوبة للمقيم فقط، والهوية الوطنية مطلوبة للمواطن" }, { status: 400 });
    }

    const user = await db.query.portalUsers.findFirst({ where: eq(portalUsers.email, portalUserEmail) });
    if (!user || user.status !== "active") return Response.json({ error: "اختر مستخدمًا نشطًا للموظف" }, { status: 400 });
    const linked = await db.query.employees.findFirst({ where: eq(employees.portalUserEmail, portalUserEmail) });
    if (linked && linked.id !== id) return Response.json({ error: "هذا المستخدم مرتبط بموظف آخر" }, { status: 409 });
    if (managerId === id) return Response.json({ error: "لا يمكن أن يكون الموظف مديرًا لنفسه" }, { status: 400 });
    if (managerId && !(await db.query.employees.findFirst({ where: and(eq(employees.id, managerId), isNull(employees.archivedAt)) }))) return Response.json({ error: "المدير المباشر المحدد غير موجود" }, { status: 400 });

    const organizationalChanged = jobTitle !== existing.jobTitle || department !== existing.department || managerId !== existing.managerId;
    const financialChanged = baseSalaryHalalas !== existing.baseSalaryHalalas || housingAllowanceHalalas !== existing.housingAllowanceHalalas || transportAllowanceHalalas !== existing.transportAllowanceHalalas || otherAllowanceHalalas !== existing.otherAllowanceHalalas || bankName !== existing.bankName || iban !== existing.iban;
    const changeEffectiveDate = value("changeEffectiveDate", 10);
    const changeReason = value("changeReason", 500);
    if ((organizationalChanged || financialChanged) && (!validDate(changeEffectiveDate) || changeReason.length < 10)) return Response.json({ error: "حدد تاريخ نفاذ واكتب سببًا واضحًا للتغييرات المالية أو التنظيمية الحساسة" }, { status: 400 });
    if (organizationalChanged && await db.query.employeeProfileChanges.findFirst({ where: and(eq(employeeProfileChanges.employeeId, id), eq(employeeProfileChanges.changeType, "organizational"), eq(employeeProfileChanges.status, "pending")) })) return Response.json({ error: "يوجد تغيير تنظيمي معلق لهذا الموظف" }, { status: 409 });
    if (financialChanged && await db.query.employeeProfileChanges.findFirst({ where: and(eq(employeeProfileChanges.employeeId, id), eq(employeeProfileChanges.changeType, "financial"), eq(employeeProfileChanges.status, "pending")) })) return Response.json({ error: "يوجد تعديل مالي معلق لهذا الموظف" }, { status: 409 });

    const now = new Date().toISOString();
    const result = await db.transaction(async (tx) => {
      const [employee] = await tx.update(employees).set({ employeeNumber, fullName, mobile, email, portalUserEmail, workLocation, employmentType, contractType, gosiNumber, nationalId, nationality, residencyType, sponsorshipType, sponsorName, iqamaExpiry, workPermitExpiry, contractEndDate, hireDate, probationEndDate, annualLeaveDays, updatedAt: now }).where(eq(employees.id, id)).returning();
      await tx.update(employeeDocuments).set({ expiryDate: iqamaExpiry, notes: residencyType === "citizen" ? "صورة الهوية الوطنية" : "صورة الإقامة", updatedAt: now }).where(and(eq(employeeDocuments.employeeId, id), eq(employeeDocuments.documentType, "national_id")));
      await tx.update(employeeDocuments).set({ expiryDate: contractEndDate, updatedAt: now }).where(and(eq(employeeDocuments.employeeId, id), eq(employeeDocuments.documentType, "employment_contract")));
      const pendingChanges: Array<typeof employeeProfileChanges.$inferSelect> = [];
      if (organizationalChanged) {
        const [change] = await tx.insert(employeeProfileChanges).values({ employeeId: id, changeType: "organizational", effectiveDate: changeEffectiveDate, beforeJson: JSON.stringify({ jobTitle: existing.jobTitle, department: existing.department, managerId: existing.managerId }), afterJson: JSON.stringify({ jobTitle, department, managerId }), reason: changeReason, status: "pending", requestedBy: access.user.email, createdAt: now }).returning();
        pendingChanges.push(change);
      }
      if (financialChanged) {
        const [change] = await tx.insert(employeeProfileChanges).values({ employeeId: id, changeType: "financial", effectiveDate: changeEffectiveDate, beforeJson: JSON.stringify({ baseSalaryHalalas: existing.baseSalaryHalalas, housingAllowanceHalalas: existing.housingAllowanceHalalas, transportAllowanceHalalas: existing.transportAllowanceHalalas, otherAllowanceHalalas: existing.otherAllowanceHalalas, bankName: existing.bankName, iban: existing.iban }), afterJson: JSON.stringify({ baseSalaryHalalas, housingAllowanceHalalas, transportAllowanceHalalas, otherAllowanceHalalas, bankName, iban }), reason: changeReason, status: "pending", requestedBy: access.user.email, createdAt: now }).returning();
        pendingChanges.push(change);
      }
      return { employee, pendingChanges };
    });
    await auditPortalAction({ actorEmail: access.user.email, action: "employee-compliance-updated", entityType: "employee", entityId: id, before: existing, after: result.employee });
    for (const change of result.pendingChanges) await auditPortalAction({ actorEmail: access.user.email, action: `employee-${change.changeType}-change-requested`, entityType: "employee-profile-change", entityId: change.id, before: existing, after: change, reason: change.reason });
    await emitPortalNotification({ eventType: "employee-compliance-updated", title: "تحديث بيانات موظف", message: `${result.employee.employeeNumber} — ${result.employee.fullName}${result.pendingChanges.length ? " — أُرسلت التغييرات الحساسة للاعتماد المنفصل." : "."}`, severity: result.pendingChanges.length ? "warning" : "info", module: "employees", entityType: "employee", entityId: id, actionView: "employees", targetDepartment: "employees" }).catch(() => undefined);
    return Response.json({ employee: result.employee, pendingChangeTypes: result.pendingChanges.map(change => change.changeType) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "تعذر تحديث الموظف";
    return Response.json({ error: message.toLowerCase().includes("unique") ? "الرقم الوظيفي أو المستخدم مرتبط بسجل آخر" : message }, { status: message.toLowerCase().includes("unique") ? 409 : 400 });
  }
}

export async function DELETE(request: Request) {
  if (rejectCrossSiteRequest(request)) return Response.json({ error: "مصدر الطلب غير مسموح" }, { status: 403 });
  const access = await requirePortalApiRole(["admin", "manager", "employee"]);
  if (!access || !(await hasPortalPermission(access, "employees", "approve"))) return Response.json({ error: "أرشفة الموظف تتطلب صلاحية اعتماد شؤون الموظفين" }, { status: 403 });
  try {
    const id = Number(new URL(request.url).searchParams.get("id"));
    if (!Number.isInteger(id) || id < 1) return Response.json({ error: "رقم الموظف غير صحيح" }, { status: 400 });
    const db = getDb(), employee = await db.query.employees.findFirst({ where: and(eq(employees.id, id), isNull(employees.archivedAt)) });
    if (!employee) return Response.json({ error: "الموظف غير موجود" }, { status: 404 });
    const now = new Date().toISOString();
    const [archived] = await db.update(employees).set({ status: "ended", archivedAt: now, terminationDate: now.slice(0, 10), terminationReason: "حذف آمن من السجل التشغيلي", updatedAt: now }).where(eq(employees.id, id)).returning();
    await auditPortalAction({ actorEmail: access.user.email, action: "employee-archived", entityType: "employee", entityId: id, before: employee, after: archived, reason: "حذف آمن مع حفظ التاريخ المالي والوظيفي" });
    await emitPortalNotification({ eventType: "employee-archived", title: "حُذف موظف من السجل النشط", message: `${employee.employeeNumber} — ${employee.fullName} — حُفظ تاريخه المالي والوظيفي للأرشفة.`, severity: "warning", module: "employees", entityType: "employee", entityId: id, actionView: "employees", targetRole: "admin" }).catch(() => undefined);
    return Response.json({ success: true, archived: true });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "تعذر حذف الموظف" }, { status: 400 }); }
}
