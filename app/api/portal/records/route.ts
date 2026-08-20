import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { bankAccounts, employees, financialRecords, legalRecords, workers, workforceContracts } from "@/db/schema";
import { auditPortalAction, recordStatusChange } from "@/lib/audit";
import { emitPortalNotification, type NotificationModule, type NotificationSeverity } from "@/lib/portal-notifications";
import { canAccessPortalDepartment, requirePortalApiRole, type PortalDepartment } from "@/lib/portal-access";
import { rejectCrossSiteRequest } from "@/lib/security";

type RecordEntity = Exclude<PortalDepartment, "general">;

const entityStatuses: Record<RecordEntity, Set<string>> = {
  employees: new Set(["active", "leave", "suspended", "ended"]),
  finance: new Set(["pending", "approved", "paid", "overdue"]),
  legal: new Set(["active", "reviewing", "renewal", "closed"]),
  workforce: new Set(["available", "assigned", "leave", "suspended"]),
};

const financeCategories = new Set([
  "worker_salary", "worker_advance", "worker_deduction", "worker_expense",
  "workforce_invoice", "receipt_voucher", "payment_voucher", "progress_claim",
  "invoice", "expense", "payroll", "advance",
]);
const workerFinanceCategories = new Set(["worker_salary", "worker_advance", "worker_deduction", "worker_expense"]);
const paymentMethods = new Set(["bank_transfer", "cash", "cheque", "payroll_file", "other", ""]);
const legalCategories = new Set(["contract", "case", "license", "compliance"]);

function isEntity(value: unknown): value is RecordEntity {
  return value === "employees" || value === "finance" || value === "legal" || value === "workforce";
}

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function cleanDate(value: unknown, optional = false) {
  const date = cleanText(value, 10);
  if (!date && optional) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "";
}

function code(prefix: string) {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`;
}

async function recordActivity(actorEmail: string, action: string, entity: string, id: number, before?: unknown, after?: unknown) {
  const correlationId = crypto.randomUUID();
  await auditPortalAction({ actorEmail, action, entityType: entity, entityId: id, before, after, correlationId });
  const previousStatus = before && typeof before === "object" && "status" in before ? String((before as { status: unknown }).status) : null;
  const nextStatus = after && typeof after === "object" && "status" in after ? String((after as { status: unknown }).status) : null;
  if (previousStatus && nextStatus && previousStatus !== nextStatus) await recordStatusChange({ entityType: entity, entityId: id, fromStatus: previousStatus, toStatus: nextStatus, actorEmail, correlationId });
  const notificationMeta: Record<string, { title: string; module: NotificationModule; severity: NotificationSeverity }> = {
    "employee-created": { title: "تمت إضافة موظف", module: "employees", severity: "success" },
    "financial-record-created": { title: "تمت إضافة حركة مالية", module: "finance", severity: "info" },
    "legal-record-created": { title: "تمت إضافة ملف قانوني", module: "legal", severity: "info" },
    "employees-status-updated": { title: "تغيّرت حالة موظف", module: "employees", severity: "info" },
    "finance-status-updated": { title: "تغيّرت حالة سجل مالي", module: "finance", severity: "info" },
    "legal-status-updated": { title: "تغيّرت حالة ملف قانوني", module: "legal", severity: "info" },
    "workforce-status-updated": { title: "تغيّرت حالة عامل", module: "workforce", severity: "info" },
  };
  const meta = notificationMeta[action];
  if (meta) await emitPortalNotification({
    eventType: action,
    title: meta.title,
    message: `السجل رقم ${id} — تم التحديث بواسطة ${actorEmail}.`,
    severity: meta.severity,
    module: meta.module,
    entityType: entity,
    entityId: id,
    actionView: meta.module,
    targetDepartment: (["employees", "finance", "legal", "workforce"] as const).includes(meta.module as "employees" | "finance" | "legal" | "workforce") ? meta.module as Exclude<PortalDepartment, "general"> : null,
  }).catch(() => undefined);
}

export async function POST(request: Request) {
  if (rejectCrossSiteRequest(request)) return Response.json({ error: "مصدر الطلب غير مسموح" }, { status: 403 });
  const access = await requirePortalApiRole(["admin", "manager", "employee"]);
  if (!access) return Response.json({ error: "غير مصرح" }, { status: 403 });

  try {
    const payload = (await request.json()) as { entity?: unknown; data?: Record<string, unknown> };
    if (!isEntity(payload.entity) || !canAccessPortalDepartment(access, payload.entity, true)) {
      return Response.json({ error: "لا تملك صلاحية الإضافة في هذا القسم" }, { status: 403 });
    }

    const data = payload.data ?? {};
    const now = new Date().toISOString();
    const db = getDb();

    if (payload.entity === "employees") {
      const employeeNumber = cleanText(data.employeeNumber, 30).toUpperCase();
      const fullName = cleanText(data.fullName, 120);
      const jobTitle = cleanText(data.jobTitle, 100);
      const department = cleanText(data.department, 100);
      const mobile = cleanText(data.mobile, 20);
      const hireDate = cleanDate(data.hireDate);
      const nationalId = cleanText(data.nationalId, 20) || null;
      const nationality = cleanText(data.nationality, 80) || null;
      const email = cleanText(data.email, 160).toLowerCase() || null;
      const iban = cleanText(data.iban, 40).replaceAll(" ", "").toUpperCase() || null;
      const baseSalaryHalalas = Math.round(Number(data.baseSalary || 0) * 100);
      if (!employeeNumber || fullName.length < 2 || !jobTitle || !department || !/^\+?[0-9\s()-]{8,20}$/.test(mobile) || !hireDate || (nationalId && !/^\d{10}$/.test(nationalId)) || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) || (iban && !/^SA\d{22}$/.test(iban)) || !Number.isSafeInteger(baseSalaryHalalas) || baseSalaryHalalas < 0) {
        return Response.json({ error: "بيانات الموظف غير مكتملة أو غير صحيحة" }, { status: 400 });
      }
      const [saved] = await db.insert(employees).values({ employeeNumber, fullName, jobTitle, department, mobile, hireDate, nationalId, nationality, email, bankName: cleanText(data.bankName, 120) || null, iban, baseSalaryHalalas, updatedAt: now }).returning();
      await recordActivity(access.user.email, "employee-created", "employee", saved.id, undefined, saved);
      return Response.json({ record: saved }, { status: 201 });
    }

    if (payload.entity === "finance") {
      const category = cleanText(data.category, 30);
      const description = cleanText(data.description, 240);
      const amount = typeof data.amount === "number" ? data.amount : Number(data.amount);
      const dueDate = cleanDate(data.dueDate);
      const workerId = Number(data.workerId || 0) || null;
      const contractId = Number(data.contractId || 0) || null;
      const periodMonth = cleanText(data.periodMonth, 7) || null;
      const subCategory = cleanText(data.subCategory, 80) || null;
      const paymentMethod = cleanText(data.paymentMethod, 30);
      const bankAccountId = Number(data.bankAccountId || 0) || null;
      const notes = cleanText(data.notes, 1000) || null;
      if (!financeCategories.has(category) || description.length < 3 || !Number.isFinite(amount) || amount <= 0 || amount > 1000000000 || !dueDate || !paymentMethods.has(paymentMethod)) {
        return Response.json({ error: "بيانات السجل المالي غير مكتملة أو غير صحيحة" }, { status: 400 });
      }
      if (workerFinanceCategories.has(category) && (!workerId || !Number.isInteger(workerId))) {
        return Response.json({ error: "يجب اختيار العامل لهذه الحركة المالية" }, { status: 400 });
      }
      if (category === "worker_salary" && (!periodMonth || !/^\d{4}-\d{2}$/.test(periodMonth))) {
        return Response.json({ error: "حدد شهر الراتب" }, { status: 400 });
      }
      if (category === "worker_expense" && !subCategory) {
        return Response.json({ error: "حدد نوع مصروف العمالة" }, { status: 400 });
      }
      if (paymentMethod === "bank_transfer") {
        if (!bankAccountId || !Number.isInteger(bankAccountId)) return Response.json({ error: "يجب اختيار الحساب البنكي للتحويل" }, { status: 400 });
        const bank = await db.query.bankAccounts.findFirst({ where: eq(bankAccounts.id, bankAccountId) });
        if (!bank || bank.status !== "active") return Response.json({ error: "الحساب البنكي غير موجود أو غير نشط" }, { status: 400 });
      }
      if (workerId) {
        const worker = await db.query.workers.findFirst({ where: eq(workers.id, workerId) });
        if (!worker) return Response.json({ error: "العامل المحدد غير موجود" }, { status: 404 });
      }
      if (contractId) {
        const contract = await db.query.workforceContracts.findFirst({ where: eq(workforceContracts.id, contractId) });
        if (!contract) return Response.json({ error: "العقد المحدد غير موجود" }, { status: 404 });
      }
      const [saved] = await db.insert(financialRecords).values({
        referenceCode: code("FIN"),
        category,
        description,
        amountHalalas: Math.round(amount * 100),
        dueDate,
        workerId,
        contractId,
        bankAccountId,
        periodMonth,
        subCategory,
        paymentMethod: paymentMethod || null,
        notes,
        updatedAt: now,
      }).returning();
      await recordActivity(access.user.email, "financial-record-created", "financial-record", saved.id, undefined, saved);
      return Response.json({ record: saved }, { status: 201 });
    }

    if (payload.entity === "legal") {
      const category = cleanText(data.category, 30);
      const title = cleanText(data.title, 180);
      const counterparty = cleanText(data.counterparty, 160);
      const expiryDate = cleanDate(data.expiryDate, true);
      if (!legalCategories.has(category) || title.length < 3 || counterparty.length < 2 || expiryDate === "") {
        return Response.json({ error: "بيانات السجل القانوني غير مكتملة أو غير صحيحة" }, { status: 400 });
      }
      const [saved] = await db.insert(legalRecords).values({
        referenceCode: code("LEG"),
        category,
        title,
        counterparty,
        expiryDate,
        updatedAt: now,
      }).returning();
      await recordActivity(access.user.email, "legal-record-created", "legal-record", saved.id, undefined, saved);
      return Response.json({ record: saved }, { status: 201 });
    }

    return Response.json({ error: "استخدم نموذج ملف العامل المتكامل لإدخال رقم الإقامة والصورة والشهادات المطلوبة" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.toLowerCase().includes("unique")) {
      return Response.json({ error: "الرقم المدخل مستخدم في سجل آخر" }, { status: 409 });
    }
    return Response.json({ error: "تعذّر حفظ السجل حالياً" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  if (rejectCrossSiteRequest(request)) return Response.json({ error: "مصدر الطلب غير مسموح" }, { status: 403 });
  const access = await requirePortalApiRole(["admin", "manager", "employee"]);
  if (!access) return Response.json({ error: "غير مصرح" }, { status: 403 });

  try {
    const payload = (await request.json()) as { entity?: unknown; id?: unknown; status?: unknown };
    const id = typeof payload.id === "number" ? payload.id : Number(payload.id);
    const status = cleanText(payload.status, 30);
    if (!isEntity(payload.entity) || !canAccessPortalDepartment(access, payload.entity, true)) {
      return Response.json({ error: "لا تملك صلاحية التعديل في هذا القسم" }, { status: 403 });
    }
    if (!Number.isInteger(id) || id < 1 || !entityStatuses[payload.entity].has(status)) {
      return Response.json({ error: "بيانات التحديث غير صحيحة" }, { status: 400 });
    }

    const db = getDb();
    const updatedAt = new Date().toISOString();
    const existing = payload.entity === "employees"
      ? await db.query.employees.findFirst({ where: eq(employees.id, id) })
      : payload.entity === "finance"
        ? await db.query.financialRecords.findFirst({ where: eq(financialRecords.id, id) })
        : payload.entity === "legal"
          ? await db.query.legalRecords.findFirst({ where: eq(legalRecords.id, id) })
          : await db.query.workers.findFirst({ where: eq(workers.id, id) });
    if (!existing) return Response.json({ error: "السجل غير موجود" }, { status: 404 });
    let updated: unknown;
    if (payload.entity === "employees") {
      [updated] = await db.update(employees).set({ status, updatedAt }).where(eq(employees.id, id)).returning();
    } else if (payload.entity === "finance") {
      [updated] = await db.update(financialRecords).set({ status, updatedAt }).where(eq(financialRecords.id, id)).returning();
    } else if (payload.entity === "legal") {
      [updated] = await db.update(legalRecords).set({ status, updatedAt }).where(eq(legalRecords.id, id)).returning();
    } else {
      [updated] = await db.update(workers).set({ status, updatedAt }).where(eq(workers.id, id)).returning();
    }
    if (!updated) return Response.json({ error: "السجل غير موجود" }, { status: 404 });

    await recordActivity(access.user.email, `${payload.entity}-status-updated`, payload.entity, id, existing, updated);
    return Response.json({ record: updated });
  } catch {
    return Response.json({ error: "تعذّر تحديث السجل" }, { status: 500 });
  }
}
