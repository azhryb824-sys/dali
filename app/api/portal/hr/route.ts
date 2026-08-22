import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { chartOfAccounts, employeeAttendance, employeeDocuments, employeeLeaveRequests, employeeMovements, employees, journalEntries, payrollItems, payrollRuns, portalUsers } from "@/db/schema";
import { createDraftJournal } from "@/lib/accounting";
import { auditPortalAction } from "@/lib/audit";
import { hasPortalPermission, requirePortalApiRole } from "@/lib/portal-access";
import { jsonNoStore, rejectCrossSiteRequest } from "@/lib/security";

function clean(value: unknown, length: number) {
  return typeof value === "string" ? value.trim().slice(0, length) : "";
}

function positiveId(value: unknown) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : 0;
}

function monthRange(month: string) {
  if (!/^\d{4}-\d{2}$/.test(month)) return null;
  const [year, monthNumber] = month.split("-").map(Number);
  if (monthNumber < 1 || monthNumber > 12) return null;
  const end = new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
  return { start: `${month}-01`, end };
}

export async function GET() {
  const access = await requirePortalApiRole(["admin", "manager", "employee"]);
  if (!access || !(await hasPortalPermission(access, "employees", "read"))) return jsonNoStore({ error: "غير مصرح" }, { status: 403 });
  const db = getDb();
  const [staff, movements, runs, items, documents, leaves, attendance, users] = await Promise.all([
    db.select().from(employees).orderBy(employees.fullName).limit(1000),
    db.select().from(employeeMovements).orderBy(desc(employeeMovements.effectiveDate), desc(employeeMovements.id)).limit(1000),
    db.select().from(payrollRuns).orderBy(desc(payrollRuns.periodMonth)).limit(120),
    db.select().from(payrollItems).orderBy(desc(payrollItems.id)).limit(5000),
    db.select().from(employeeDocuments).orderBy(desc(employeeDocuments.id)).limit(3000),
    db.select().from(employeeLeaveRequests).orderBy(desc(employeeLeaveRequests.id)).limit(3000),
    db.select().from(employeeAttendance).orderBy(desc(employeeAttendance.attendanceDate)).limit(5000),
    db.select({email:portalUsers.email,displayName:portalUsers.displayName,status:portalUsers.status}).from(portalUsers).limit(1000),
  ]);
  return jsonNoStore({ employees: staff, movements, runs, items, documents, leaves, attendance, users });
}

export async function POST(request: Request) {
  if (rejectCrossSiteRequest(request)) return jsonNoStore({ error: "مصدر الطلب غير مسموح" }, { status: 403 });
  const access = await requirePortalApiRole(["admin", "manager", "employee"]);
  if (!access || !(await hasPortalPermission(access, "employees", "write"))) return jsonNoStore({ error: "غير مصرح" }, { status: 403 });
  try {
    const payload = await request.json() as Record<string, unknown>;
    const action = clean(payload.action, 40);
    const db = getDb();
    const now = new Date().toISOString();

    if (action === "employee-profile") {
      const employeeId=positiveId(payload.employeeId); const employee=await db.query.employees.findFirst({where:eq(employees.id,employeeId)});
      if(!employee)return jsonNoStore({error:"الموظف غير موجود"},{status:404});
      const portalUserEmail=clean(payload.portalUserEmail,160).toLowerCase()||null; if(portalUserEmail){const user=await db.query.portalUsers.findFirst({where:eq(portalUsers.email,portalUserEmail)});if(!user)return jsonNoStore({error:"حساب المستخدم غير موجود"},{status:404});}
      const managerId=positiveId(payload.managerId)||null;if(managerId===employeeId)return jsonNoStore({error:"لا يمكن أن يكون الموظف مديراً لنفسه"},{status:400});
      const [saved]=await db.update(employees).set({portalUserEmail,managerId,workLocation:clean(payload.workLocation,120)||null,employmentType:clean(payload.employmentType,30)||"full_time",contractType:clean(payload.contractType,30)||"fixed_term",gosiNumber:clean(payload.gosiNumber,40)||null,updatedAt:now}).where(eq(employees.id,employeeId)).returning();
      await auditPortalAction({actorEmail:access.user.email,action:"employee-profile-linked",entityType:"employee",entityId:employeeId,before:employee,after:saved});return jsonNoStore({employee:saved});
    }

    if(action==="document"){
      const employeeId=positiveId(payload.employeeId),documentType=clean(payload.documentType,60),expiryDate=clean(payload.expiryDate,10)||null;if(!employeeId||!documentType||(expiryDate&&!/^\d{4}-\d{2}-\d{2}$/.test(expiryDate)))return jsonNoStore({error:"بيانات الوثيقة غير صحيحة"},{status:400});
      const [document]=await db.insert(employeeDocuments).values({employeeId,documentType,documentNumber:clean(payload.documentNumber,80)||null,expiryDate,notes:clean(payload.notes,500)||null,createdBy:access.user.email,updatedAt:now}).returning();await auditPortalAction({actorEmail:access.user.email,action:"employee-document-created",entityType:"employee-document",entityId:document.id,after:document});return jsonNoStore({document},{status:201});
    }

    if(action==="leave-request"){
      const employeeId=positiveId(payload.employeeId),startDate=clean(payload.startDate,10),endDate=clean(payload.endDate,10);const start=new Date(`${startDate}T00:00:00Z`),end=new Date(`${endDate}T00:00:00Z`);const days=Math.floor((end.getTime()-start.getTime())/86400000)+1;if(!employeeId||!/^\d{4}-\d{2}-\d{2}$/.test(startDate)||!/^\d{4}-\d{2}-\d{2}$/.test(endDate)||days<1)return jsonNoStore({error:"فترة الإجازة غير صحيحة"},{status:400});
      const [leave]=await db.insert(employeeLeaveRequests).values({employeeId,leaveType:clean(payload.leaveType,40)||"annual",startDate,endDate,days,reason:clean(payload.reason,500)||null,requestedBy:access.user.email,updatedAt:now}).returning();await auditPortalAction({actorEmail:access.user.email,action:"employee-leave-requested",entityType:"employee-leave",entityId:leave.id,after:leave});return jsonNoStore({leave},{status:201});
    }

    if(action==="attendance"){
      const employeeId=positiveId(payload.employeeId),attendanceDate=clean(payload.attendanceDate,10),status=clean(payload.status,20);if(!employeeId||!/^\d{4}-\d{2}-\d{2}$/.test(attendanceDate)||!["present","absent","leave","sick","remote","holiday"].includes(status))return jsonNoStore({error:"بيانات الحضور غير صحيحة"},{status:400});
      const [row]=await db.insert(employeeAttendance).values({employeeId,attendanceDate,status,checkInAt:clean(payload.checkInAt,30)||null,checkOutAt:clean(payload.checkOutAt,30)||null,lateMinutes:Math.max(0,Number(payload.lateMinutes)||0),overtimeMinutes:Math.max(0,Number(payload.overtimeMinutes)||0),notes:clean(payload.notes,500)||null,createdBy:access.user.email,updatedAt:now}).onConflictDoUpdate({target:[employeeAttendance.employeeId,employeeAttendance.attendanceDate],set:{status,checkInAt:clean(payload.checkInAt,30)||null,checkOutAt:clean(payload.checkOutAt,30)||null,lateMinutes:Math.max(0,Number(payload.lateMinutes)||0),overtimeMinutes:Math.max(0,Number(payload.overtimeMinutes)||0),notes:clean(payload.notes,500)||null,updatedAt:now}}).returning();return jsonNoStore({attendance:row},{status:201});
    }

    if (action === "employee-finance") {
      const employeeId = positiveId(payload.employeeId);
      const employee = await db.query.employees.findFirst({ where: eq(employees.id, employeeId) });
      if (!employee) return jsonNoStore({ error: "الموظف غير موجود" }, { status: 404 });
      const toHalalas = (value: unknown) => Math.round(Number(value || 0) * 100);
      const baseSalaryHalalas = toHalalas(payload.baseSalary);
      const housingAllowanceHalalas = toHalalas(payload.housingAllowance);
      const transportAllowanceHalalas = toHalalas(payload.transportAllowance);
      const otherAllowanceHalalas = toHalalas(payload.otherAllowance);
      const iban = clean(payload.iban, 40).replaceAll(" ", "").toUpperCase() || null;
      if ([baseSalaryHalalas, housingAllowanceHalalas, transportAllowanceHalalas, otherAllowanceHalalas].some((amount) => !Number.isSafeInteger(amount) || amount < 0) || (iban && !/^SA\d{22}$/.test(iban))) {
        return jsonNoStore({ error: "بيانات الراتب أو الآيبان غير صحيحة" }, { status: 400 });
      }
      const [saved] = await db.update(employees).set({
        baseSalaryHalalas, housingAllowanceHalalas, transportAllowanceHalalas, otherAllowanceHalalas,
        bankName: clean(payload.bankName, 120) || null, iban, updatedAt: now,
      }).where(eq(employees.id, employeeId)).returning();
      await auditPortalAction({ actorEmail: access.user.email, action: "employee-finance-updated", entityType: "employee", entityId: employeeId, before: employee, after: saved });
      return jsonNoStore({ employee: saved });
    }

    if (action === "movement") {
      const employeeId = positiveId(payload.employeeId);
      const movementType = clean(payload.movementType, 40);
      const effectiveDate = clean(payload.effectiveDate, 10);
      const description = clean(payload.description, 500);
      const amountHalalas = Math.round(Number(payload.amount || 0) * 100);
      const allowed = new Set(["bonus", "advance", "deduction", "allowance", "salary_adjustment", "leave", "return_from_leave", "suspension", "termination", "note"]);
      if (!employeeId || !allowed.has(movementType) || !/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate) || description.length < 3 || !Number.isSafeInteger(amountHalalas) || amountHalalas < 0) return jsonNoStore({ error: "بيانات الحركة الوظيفية غير صحيحة" }, { status: 400 });
      const employee = await db.query.employees.findFirst({ where: eq(employees.id, employeeId) });
      if (!employee) return jsonNoStore({ error: "الموظف غير موجود" }, { status: 404 });
      const [movement] = await db.insert(employeeMovements).values({ employeeId, movementType, effectiveDate, description, amountHalalas, createdBy: access.user.email, updatedAt: now }).returning();
      await auditPortalAction({ actorEmail: access.user.email, action: "employee-movement-created", entityType: "employee-movement", entityId: movement.id, after: movement });
      return jsonNoStore({ movement }, { status: 201 });
    }

    if (action === "generate-payroll") {
      const periodMonth = clean(payload.periodMonth, 7);
      const paymentDate = clean(payload.paymentDate, 10);
      const range = monthRange(periodMonth);
      if (!range || !/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) return jsonNoStore({ error: "الفترة أو تاريخ الصرف غير صحيح" }, { status: 400 });
      const staff = await db.select().from(employees).where(eq(employees.status, "active")).orderBy(employees.id);
      if (!staff.length) return jsonNoStore({ error: "لا يوجد موظفون نشطون لإنشاء المسير" }, { status: 400 });
      const movements = await db.select().from(employeeMovements).where(and(gte(employeeMovements.effectiveDate, range.start), lte(employeeMovements.effectiveDate, range.end), eq(employeeMovements.status, "approved")));
      const values = staff.map((employee) => {
        const employeeRows = movements.filter((item) => item.employeeId === employee.id);
        const bonus = employeeRows.filter((item) => item.movementType === "bonus").reduce((sum, item) => sum + item.amountHalalas, 0);
        const requestedDeductions = employeeRows.filter((item) => ["deduction", "advance"].includes(item.movementType)).reduce((sum, item) => sum + item.amountHalalas, 0);
        const allowances = employee.housingAllowanceHalalas + employee.transportAllowanceHalalas + employee.otherAllowanceHalalas;
        const gross = employee.baseSalaryHalalas + allowances + bonus;
        const deductions = Math.min(gross, requestedDeductions);
        return { employeeId: employee.id, baseSalaryHalalas: employee.baseSalaryHalalas, allowancesHalalas: allowances, bonusHalalas: bonus, deductionsHalalas: deductions, netPayHalalas: gross - deductions };
      });
      const totalGrossHalalas = values.reduce((sum, item) => sum + item.baseSalaryHalalas + item.allowancesHalalas + item.bonusHalalas, 0);
      const totalDeductionsHalalas = values.reduce((sum, item) => sum + item.deductionsHalalas, 0);
      const totalNetHalalas = values.reduce((sum, item) => sum + item.netPayHalalas, 0);
      if (totalGrossHalalas <= 0) return jsonNoStore({ error: "يجب استكمال الرواتب الأساسية قبل إنشاء المسير" }, { status: 409 });
      const [run] = await db.insert(payrollRuns).values({ runNumber: `PAY-${periodMonth.replace("-", "")}`, periodMonth, paymentDate, totalGrossHalalas, totalDeductionsHalalas, totalNetHalalas, createdBy: access.user.email, updatedAt: now }).returning();
      try {
        await db.insert(payrollItems).values(values.map((item) => ({ ...item, payrollRunId: run.id })));
      } catch (error) {
        await db.delete(payrollRuns).where(eq(payrollRuns.id, run.id));
        throw error;
      }
      await auditPortalAction({ actorEmail: access.user.email, action: "payroll-generated", entityType: "payroll-run", entityId: run.id, after: run });
      return jsonNoStore({ run }, { status: 201 });
    }

    return jsonNoStore({ error: "العملية غير مدعومة" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "تعذّر تنفيذ العملية";
    return jsonNoStore({ error: message.toLowerCase().includes("unique") ? "تم إنشاء مسير لهذه الفترة مسبقًا" : message }, { status: message.toLowerCase().includes("unique") ? 409 : 400 });
  }
}

export async function PATCH(request: Request) {
  if (rejectCrossSiteRequest(request)) return jsonNoStore({ error: "مصدر الطلب غير مسموح" }, { status: 403 });
  const access = await requirePortalApiRole(["admin", "manager", "employee"]);
  if (!access || !(await hasPortalPermission(access, "employees", "approve"))) return jsonNoStore({ error: "غير مصرح" }, { status: 403 });
  try {
    const payload = await request.json() as Record<string, unknown>;
    const action = clean(payload.action, 40);
    const runId = positiveId(payload.runId);
    const db = getDb();
    if(action==="leave-decision"){
      const leaveId=positiveId(payload.leaveId),decision=clean(payload.decision,20);if(!["approved","rejected"].includes(decision))return jsonNoStore({error:"قرار الإجازة غير صحيح"},{status:400});
      const leave=await db.query.employeeLeaveRequests.findFirst({where:eq(employeeLeaveRequests.id,leaveId)});if(!leave||leave.status!=="pending")return jsonNoStore({error:"طلب الإجازة غير متاح للاعتماد"},{status:409});
      const [updated]=await db.update(employeeLeaveRequests).set({status:decision,decidedBy:access.user.email,decisionNote:clean(payload.note,500)||null,decidedAt:new Date().toISOString(),updatedAt:new Date().toISOString()}).where(eq(employeeLeaveRequests.id,leaveId)).returning();
      if(decision==="approved")await db.update(employees).set({leaveBalanceDays:sql`${employees.leaveBalanceDays} - ${leave.days}`,updatedAt:new Date().toISOString()}).where(eq(employees.id,leave.employeeId));
      await auditPortalAction({actorEmail:access.user.email,action:`employee-leave-${decision}`,entityType:"employee-leave",entityId:leaveId,before:leave,after:updated});return jsonNoStore({leave:updated});
    }
    const run = await db.query.payrollRuns.findFirst({ where: eq(payrollRuns.id, runId) });
    if (!run) return jsonNoStore({ error: "مسير الرواتب غير موجود" }, { status: 404 });
    const now = new Date().toISOString();

    if (action === "approve") {
      if (run.status !== "draft") return jsonNoStore({ error: "لا يمكن اعتماد المسير في حالته الحالية" }, { status: 409 });
      if (run.createdBy === access.user.email) return jsonNoStore({ error: "يجب أن يعتمد المسير مستخدم آخر غير منشئه" }, { status: 409 });
      const accounts = await db.select().from(chartOfAccounts).where(and(eq(chartOfAccounts.isPosting, true), eq(chartOfAccounts.status, "active")));
      const salaryExpense = accounts.find((item) => item.code === "5000");
      const payrollPayable = accounts.find((item) => item.code === "2200");
      const payrollDeductions = accounts.find((item) => item.code === "2210");
      if (!salaryExpense || !payrollPayable || (run.totalDeductionsHalalas > 0 && !payrollDeductions)) return jsonNoStore({ error: "يجب تهيئة دليل الحسابات قبل اعتماد الرواتب" }, { status: 409 });
      const lines = [
        { accountId: salaryExpense.id, debitHalalas: run.totalGrossHalalas, description: `إجمالي رواتب ${run.periodMonth}` },
        { accountId: payrollPayable.id, creditHalalas: run.totalNetHalalas, description: `صافي مستحقات رواتب ${run.periodMonth}` },
      ];
      if (run.totalDeductionsHalalas > 0 && payrollDeductions) lines.push({ accountId: payrollDeductions.id, creditHalalas: run.totalDeductionsHalalas, description: `استقطاعات رواتب ${run.periodMonth}` });
      const journal = await createDraftJournal({ entryDate: run.paymentDate, description: `استحقاق رواتب ${run.periodMonth}`, sourceType: "payroll-accrual", sourceId: String(run.id), actorEmail: access.user.email, lines });
      const [updated] = await db.update(payrollRuns).set({ status: "approved", approvedBy: access.user.email, approvedAt: now, journalEntryId: journal.entry.id, updatedAt: now }).where(eq(payrollRuns.id, run.id)).returning();
      await auditPortalAction({ actorEmail: access.user.email, action: "payroll-approved", entityType: "payroll-run", entityId: run.id, before: run, after: updated });
      return jsonNoStore({ run: updated });
    }

    if (action === "start-payment") {
      if (run.status !== "approved" || !run.journalEntryId) return jsonNoStore({ error: "اعتمد مسير الرواتب ورحّل قيد الاستحقاق أولًا" }, { status: 409 });
      const accrual = await db.query.journalEntries.findFirst({ where: eq(journalEntries.id, run.journalEntryId) });
      if (accrual?.status !== "posted") return jsonNoStore({ error: "يجب ترحيل قيد استحقاق الرواتب قبل بدء الصرف" }, { status: 409 });
      const accounts = await db.select().from(chartOfAccounts).where(and(eq(chartOfAccounts.isPosting, true), eq(chartOfAccounts.status, "active")));
      const payrollPayable = accounts.find((item) => item.code === "2200");
      const bank = accounts.find((item) => item.code === "1200");
      if (!payrollPayable || !bank) return jsonNoStore({ error: "حسابات الرواتب والبنك غير مهيأة" }, { status: 409 });
      const journal = await createDraftJournal({ entryDate: run.paymentDate, description: `صرف رواتب ${run.periodMonth}`, sourceType: "payroll-payment", sourceId: String(run.id), actorEmail: access.user.email, lines: [
        { accountId: payrollPayable.id, debitHalalas: run.totalNetHalalas, description: `تسوية مستحقات ${run.periodMonth}` },
        { accountId: bank.id, creditHalalas: run.totalNetHalalas, description: `صرف رواتب ${run.periodMonth}` },
      ] });
      const [updated] = await db.update(payrollRuns).set({ status: "processing", paymentJournalEntryId: journal.entry.id, updatedAt: now }).where(eq(payrollRuns.id, run.id)).returning();
      await auditPortalAction({ actorEmail: access.user.email, action: "payroll-payment-started", entityType: "payroll-run", entityId: run.id, before: run, after: updated });
      return jsonNoStore({ run: updated });
    }

    if (action === "mark-paid") {
      if (access.role !== "admin" || run.status !== "processing" || !run.paymentJournalEntryId) return jsonNoStore({ error: "لا يمكن إغلاق المسير كمدفوع" }, { status: 409 });
      const payment = await db.query.journalEntries.findFirst({ where: eq(journalEntries.id, run.paymentJournalEntryId) });
      if (payment?.status !== "posted") return jsonNoStore({ error: "يجب ترحيل قيد صرف الرواتب قبل الإغلاق" }, { status: 409 });
      const [updated] = await db.update(payrollRuns).set({ status: "paid", paidBy: access.user.email, paidAt: now, updatedAt: now }).where(eq(payrollRuns.id, run.id)).returning();
      await auditPortalAction({ actorEmail: access.user.email, action: "payroll-paid", entityType: "payroll-run", entityId: run.id, before: run, after: updated });
      return jsonNoStore({ run: updated });
    }
    return jsonNoStore({ error: "العملية غير مدعومة" }, { status: 400 });
  } catch (error) {
    return jsonNoStore({ error: error instanceof Error ? error.message : "تعذّر تحديث مسير الرواتب" }, { status: 400 });
  }
}
