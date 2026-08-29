import { and, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  bankAccounts,
  chartOfAccounts,
  companyHolidays,
  employeeAttendance,
  employeeDocuments,
  employeeLeavePolicies,
  employeeLeaveRequests,
  employeeMovements,
  employeeProfileChanges,
  employees,
  journalEntries,
  payrollItems,
  payrollRuns,
  portalUsers,
} from "@/db/schema";
import { createDraftJournal, resolvePostingRule } from "@/lib/accounting";
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
  const end = new Date(Date.UTC(year, monthNumber, 0))
    .toISOString()
    .slice(0, 10);
  return { start: `${month}-01`, end };
}

function workingLeaveDays(
  startDate: string,
  endDate: string,
  holidays: Set<string>,
) {
  const cursor = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  let days = 0;
  while (cursor <= end) {
    const date = cursor.toISOString().slice(0, 10);
    if (cursor.getUTCDay() !== 5 && !holidays.has(date)) days += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

export async function GET() {
  const access = await requirePortalApiRole(["admin", "manager", "employee"]);
  if (!access || !(await hasPortalPermission(access, "employees", "read")))
    return jsonNoStore({ error: "غير مصرح" }, { status: 403 });
  const db = getDb();
  const [
    staff,
    movements,
    runs,
    items,
    documents,
    leaves,
    attendance,
    users,
    banks,
    leavePolicies,
    holidays,
    profileChanges,
  ] = await Promise.all([
    db
      .select()
      .from(employees)
      .where(isNull(employees.archivedAt))
      .orderBy(employees.fullName)
      .limit(1000),
    db
      .select()
      .from(employeeMovements)
      .orderBy(
        desc(employeeMovements.effectiveDate),
        desc(employeeMovements.id),
      )
      .limit(1000),
    db
      .select()
      .from(payrollRuns)
      .orderBy(desc(payrollRuns.periodMonth))
      .limit(120),
    db.select().from(payrollItems).orderBy(desc(payrollItems.id)).limit(5000),
    db
      .select()
      .from(employeeDocuments)
      .orderBy(desc(employeeDocuments.id))
      .limit(3000),
    db
      .select()
      .from(employeeLeaveRequests)
      .orderBy(desc(employeeLeaveRequests.id))
      .limit(3000),
    db
      .select()
      .from(employeeAttendance)
      .orderBy(desc(employeeAttendance.attendanceDate))
      .limit(5000),
    db
      .select({
        email: portalUsers.email,
        displayName: portalUsers.displayName,
        status: portalUsers.status,
      })
      .from(portalUsers)
      .limit(1000),
    db
      .select()
      .from(bankAccounts)
      .where(eq(bankAccounts.status, "active"))
      .orderBy(bankAccounts.bankName),
    db
      .select()
      .from(employeeLeavePolicies)
      .orderBy(employeeLeavePolicies.leaveType),
    db
      .select()
      .from(companyHolidays)
      .orderBy(desc(companyHolidays.holidayDate))
      .limit(500),
    db
      .select()
      .from(employeeProfileChanges)
      .orderBy(desc(employeeProfileChanges.id))
      .limit(1000),
  ]);
  return jsonNoStore({
    employees: staff,
    movements,
    runs,
    items,
    documents,
    leaves,
    attendance,
    users,
    banks,
    leavePolicies,
    holidays,
    profileChanges,
  });
}

export async function POST(request: Request) {
  if (rejectCrossSiteRequest(request))
    return jsonNoStore({ error: "مصدر الطلب غير مسموح" }, { status: 403 });
  const access = await requirePortalApiRole(["admin", "manager", "employee"]);
  if (!access || !(await hasPortalPermission(access, "employees", "write")))
    return jsonNoStore({ error: "غير مصرح" }, { status: 403 });
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const action = clean(payload.action, 40);
    const db = getDb();
    const now = new Date().toISOString();

    if (action === "employee-profile") {
      const employeeId = positiveId(payload.employeeId);
      const employee = await db.query.employees.findFirst({
        where: eq(employees.id, employeeId),
      });
      if (!employee)
        return jsonNoStore({ error: "الموظف غير موجود" }, { status: 404 });
      const portalUserEmail =
        clean(payload.portalUserEmail, 160).toLowerCase() || null;
      if (portalUserEmail) {
        const user = await db.query.portalUsers.findFirst({
          where: eq(portalUsers.email, portalUserEmail),
        });
        if (!user)
          return jsonNoStore(
            { error: "حساب المستخدم غير موجود" },
            { status: 404 },
          );
      }
      const managerId = positiveId(payload.managerId) || null;
      if (managerId === employeeId)
        return jsonNoStore(
          { error: "لا يمكن أن يكون الموظف مديراً لنفسه" },
          { status: 400 },
        );
      const [saved] = await db
        .update(employees)
        .set({
          portalUserEmail,
          managerId,
          workLocation: clean(payload.workLocation, 120) || null,
          employmentType: clean(payload.employmentType, 30) || "full_time",
          contractType: clean(payload.contractType, 30) || "fixed_term",
          gosiNumber: clean(payload.gosiNumber, 40) || null,
          updatedAt: now,
        })
        .where(eq(employees.id, employeeId))
        .returning();
      await auditPortalAction({
        actorEmail: access.user.email,
        action: "employee-profile-linked",
        entityType: "employee",
        entityId: employeeId,
        before: employee,
        after: saved,
      });
      return jsonNoStore({ employee: saved });
    }

    if (action === "document") {
      const employeeId = positiveId(payload.employeeId),
        documentType = clean(payload.documentType, 60),
        expiryDate = clean(payload.expiryDate, 10) || null;
      if (
        !employeeId ||
        !documentType ||
        (expiryDate && !/^\d{4}-\d{2}-\d{2}$/.test(expiryDate))
      )
        return jsonNoStore(
          { error: "بيانات الوثيقة غير صحيحة" },
          { status: 400 },
        );
      const [document] = await db
        .insert(employeeDocuments)
        .values({
          employeeId,
          documentType,
          documentNumber: clean(payload.documentNumber, 80) || null,
          expiryDate,
          notes: clean(payload.notes, 500) || null,
          createdBy: access.user.email,
          updatedAt: now,
        })
        .returning();
      await auditPortalAction({
        actorEmail: access.user.email,
        action: "employee-document-created",
        entityType: "employee-document",
        entityId: document.id,
        after: document,
      });
      return jsonNoStore({ document }, { status: 201 });
    }

    if (action === "leave-request") {
      const employeeId = positiveId(payload.employeeId),
        leaveType = clean(payload.leaveType, 40) || "annual",
        startDate = clean(payload.startDate, 10),
        endDate = clean(payload.endDate, 10);
      if (
        !employeeId ||
        !/^\d{4}-\d{2}-\d{2}$/.test(startDate) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(endDate) ||
        endDate < startDate
      )
        return jsonNoStore(
          { error: "فترة الإجازة غير صحيحة" },
          { status: 400 },
        );
      const [employee, policy, holidayRows, overlap] = await Promise.all([
        db.query.employees.findFirst({ where: eq(employees.id, employeeId) }),
        db.query.employeeLeavePolicies.findFirst({
          where: eq(employeeLeavePolicies.leaveType, leaveType),
        }),
        db
          .select({ date: companyHolidays.holidayDate })
          .from(companyHolidays)
          .where(
            and(
              gte(companyHolidays.holidayDate, startDate),
              lte(companyHolidays.holidayDate, endDate),
            ),
          ),
        db.query.employeeLeaveRequests.findFirst({
          where: and(
            eq(employeeLeaveRequests.employeeId, employeeId),
            sql`${employeeLeaveRequests.status} in ('pending','approved')`,
            lte(employeeLeaveRequests.startDate, endDate),
            gte(employeeLeaveRequests.endDate, startDate),
          ),
        }),
      ]);
      if (!employee || !policy)
        return jsonNoStore(
          { error: "الموظف أو سياسة الإجازة غير موجودة" },
          { status: 404 },
        );
      if (overlap)
        return jsonNoStore(
          { error: "توجد إجازة معلقة أو معتمدة متداخلة مع هذه الفترة" },
          { status: 409 },
        );
      const days = workingLeaveDays(
        startDate,
        endDate,
        new Set(holidayRows.map((item) => item.date)),
      );
      if (
        days < 1 ||
        (policy.maxDaysPerRequest && days > policy.maxDaysPerRequest)
      )
        return jsonNoStore(
          { error: "لا تحتوي الفترة على أيام عمل صالحة أو تتجاوز حد السياسة" },
          { status: 400 },
        );
      const [leave] = await db
        .insert(employeeLeaveRequests)
        .values({
          employeeId,
          leaveType,
          startDate,
          endDate,
          days,
          paidPercentageBps: policy.paidPercentageBps,
          reason: clean(payload.reason, 500) || null,
          requestedBy: access.user.email,
          updatedAt: now,
        })
        .returning();
      await auditPortalAction({
        actorEmail: access.user.email,
        action: "employee-leave-requested",
        entityType: "employee-leave",
        entityId: leave.id,
        after: leave,
      });
      return jsonNoStore({ leave }, { status: 201 });
    }

    if (action === "attendance") {
      const employeeId = positiveId(payload.employeeId),
        attendanceDate = clean(payload.attendanceDate, 10),
        status = clean(payload.status, 20),
        checkIn = clean(payload.checkInAt, 30),
        checkOut = clean(payload.checkOutAt, 30);
      if (
        !employeeId ||
        !/^\d{4}-\d{2}-\d{2}$/.test(attendanceDate) ||
        !["present", "absent", "leave", "sick", "remote", "holiday"].includes(
          status,
        ) ||
        (checkIn && checkOut && checkOut <= checkIn)
      )
        return jsonNoStore(
          { error: "بيانات الحضور أو ترتيب وقت الدخول والخروج غير صحيح" },
          { status: 400 },
        );
      const [row] = await db
        .insert(employeeAttendance)
        .values({
          employeeId,
          attendanceDate,
          status,
          checkInAt: clean(payload.checkInAt, 30) || null,
          checkOutAt: clean(payload.checkOutAt, 30) || null,
          lateMinutes: Math.max(0, Number(payload.lateMinutes) || 0),
          overtimeMinutes: Math.max(0, Number(payload.overtimeMinutes) || 0),
          notes: clean(payload.notes, 500) || null,
          createdBy: access.user.email,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [
            employeeAttendance.employeeId,
            employeeAttendance.attendanceDate,
          ],
          set: {
            status,
            checkInAt: clean(payload.checkInAt, 30) || null,
            checkOutAt: clean(payload.checkOutAt, 30) || null,
            lateMinutes: Math.max(0, Number(payload.lateMinutes) || 0),
            overtimeMinutes: Math.max(0, Number(payload.overtimeMinutes) || 0),
            notes: clean(payload.notes, 500) || null,
            updatedAt: now,
          },
        })
        .returning();
      return jsonNoStore({ attendance: row }, { status: 201 });
    }

    if (action === "employee-finance") {
      const employeeId = positiveId(payload.employeeId);
      const employee = await db.query.employees.findFirst({
        where: eq(employees.id, employeeId),
      });
      if (!employee)
        return jsonNoStore({ error: "الموظف غير موجود" }, { status: 404 });
      const toHalalas = (value: unknown) =>
        Math.round(Number(value || 0) * 100);
      const baseSalaryHalalas = toHalalas(payload.baseSalary);
      const housingAllowanceHalalas = toHalalas(payload.housingAllowance);
      const transportAllowanceHalalas = toHalalas(payload.transportAllowance);
      const otherAllowanceHalalas = toHalalas(payload.otherAllowance);
      const iban =
        clean(payload.iban, 40).replaceAll(" ", "").toUpperCase() || null;
      if (
        [
          baseSalaryHalalas,
          housingAllowanceHalalas,
          transportAllowanceHalalas,
          otherAllowanceHalalas,
        ].some((amount) => !Number.isSafeInteger(amount) || amount < 0) ||
        (iban && !/^SA\d{22}$/.test(iban))
      ) {
        return jsonNoStore(
          { error: "بيانات الراتب أو الآيبان غير صحيحة" },
          { status: 400 },
        );
      }
      const requested = {
        baseSalaryHalalas,
        housingAllowanceHalalas,
        transportAllowanceHalalas,
        otherAllowanceHalalas,
        bankName: clean(payload.bankName, 120) || null,
        iban,
      };
      const reason = clean(payload.reason, 500);
      const effectiveDate = clean(payload.effectiveDate, 10);
      if (reason.length < 10 || !/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate))
        return jsonNoStore(
          { error: "حدد تاريخ النفاذ واكتب سبباً واضحاً لا يقل عن 10 أحرف" },
          { status: 400 },
        );
      const pending = await db.query.employeeProfileChanges.findFirst({
        where: and(
          eq(employeeProfileChanges.employeeId, employeeId),
          eq(employeeProfileChanges.changeType, "financial"),
          eq(employeeProfileChanges.status, "pending"),
        ),
      });
      if (pending)
        return jsonNoStore(
          { error: "يوجد طلب تعديل مالي معلق لهذا الموظف" },
          { status: 409 },
        );
      const [saved] = await db
        .insert(employeeProfileChanges)
        .values({
          employeeId,
          changeType: "financial",
          effectiveDate,
          beforeJson: JSON.stringify({
            baseSalaryHalalas: employee.baseSalaryHalalas,
            housingAllowanceHalalas: employee.housingAllowanceHalalas,
            transportAllowanceHalalas: employee.transportAllowanceHalalas,
            otherAllowanceHalalas: employee.otherAllowanceHalalas,
            bankName: employee.bankName,
            iban: employee.iban,
          }),
          afterJson: JSON.stringify(requested),
          reason,
          status: "pending",
          requestedBy: access.user.email,
          createdAt: now,
        })
        .returning();
      await auditPortalAction({
        actorEmail: access.user.email,
        action: "employee-finance-change-requested",
        entityType: "employee-profile-change",
        entityId: saved.id,
        before: employee,
        after: saved,
      });
      return jsonNoStore({ profileChange: saved }, { status: 201 });
    }

    if (action === "employee-finance-change-decision") {
      if (!(await hasPortalPermission(access, "employees", "approve")))
        return jsonNoStore(
          { error: "غير مصرح باعتماد التعديل المالي" },
          { status: 403 },
        );
      const changeId = positiveId(payload.changeId),
        decision = clean(payload.decision, 20),
        decisionReason = clean(payload.decisionReason, 500);
      const change = await db.query.employeeProfileChanges.findFirst({
        where: eq(employeeProfileChanges.id, changeId),
      });
      if (
        !change ||
        change.changeType !== "financial" ||
        change.status !== "pending"
      )
        return jsonNoStore(
          { error: "طلب التعديل المالي غير متاح" },
          { status: 404 },
        );
      if (change.requestedBy === access.user.email)
        return jsonNoStore(
          { error: "فصل المهام يمنع مقدم الطلب من اعتماده" },
          { status: 409 },
        );
      if (
        !new Set(["approved", "rejected"]).has(decision) ||
        decisionReason.length < 10
      )
        return jsonNoStore(
          { error: "حدد القرار واكتب سببه بوضوح" },
          { status: 400 },
        );
      const { saved, updatedEmployee } = await db.transaction(async (tx) => {
        let updatedEmployee = null;
        if (decision === "approved") {
          const after = JSON.parse(change.afterJson) as Partial<
            typeof employees.$inferInsert
          >;
          [updatedEmployee] = await tx
            .update(employees)
            .set({ ...after, updatedAt: now })
            .where(eq(employees.id, change.employeeId))
            .returning();
        }
        const [saved] = await tx
          .update(employeeProfileChanges)
          .set({
            status: decision,
            approvedBy: access.user.email,
            approvedAt: now,
          })
          .where(
            and(
              eq(employeeProfileChanges.id, change.id),
              eq(employeeProfileChanges.status, "pending"),
            ),
          )
          .returning();
        if (!saved)
          throw new Error("تمت معالجة طلب التعديل المالي بواسطة مستخدم آخر");
        return { saved, updatedEmployee };
      });
      await auditPortalAction({
        actorEmail: access.user.email,
        action: `employee-finance-change-${decision}`,
        entityType: "employee-profile-change",
        entityId: change.id,
        before: change,
        after: { change: saved, employee: updatedEmployee, decisionReason },
        reason: decisionReason,
      });
      return jsonNoStore({ profileChange: saved, employee: updatedEmployee });
    }

    if (action === "employee-organizational-change") {
      const employeeId = positiveId(payload.employeeId),
        managerId = positiveId(payload.managerId) || null;
      const employee = await db.query.employees.findFirst({
        where: eq(employees.id, employeeId),
      });
      if (!employee)
        return jsonNoStore({ error: "الموظف غير موجود" }, { status: 404 });
      if (managerId === employeeId)
        return jsonNoStore(
          { error: "لا يمكن أن يكون الموظف مديراً لنفسه" },
          { status: 400 },
        );
      if (
        managerId &&
        !(await db.query.employees.findFirst({
          where: eq(employees.id, managerId),
        }))
      )
        return jsonNoStore(
          { error: "المدير المحدد غير موجود" },
          { status: 404 },
        );
      const after = {
        jobTitle: clean(payload.jobTitle, 120),
        department: clean(payload.department, 120),
        managerId,
      };
      const effectiveDate = clean(payload.effectiveDate, 10),
        reason = clean(payload.reason, 500);
      if (
        !after.jobTitle ||
        !after.department ||
        !/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate) ||
        reason.length < 10
      )
        return jsonNoStore(
          { error: "أكمل المسمى والقسم وتاريخ النفاذ وسبب التغيير" },
          { status: 400 },
        );
      const pending = await db.query.employeeProfileChanges.findFirst({
        where: and(
          eq(employeeProfileChanges.employeeId, employeeId),
          eq(employeeProfileChanges.changeType, "organizational"),
          eq(employeeProfileChanges.status, "pending"),
        ),
      });
      if (pending)
        return jsonNoStore(
          { error: "يوجد تغيير وظيفي معلق لهذا الموظف" },
          { status: 409 },
        );
      const [saved] = await db
        .insert(employeeProfileChanges)
        .values({
          employeeId,
          changeType: "organizational",
          effectiveDate,
          beforeJson: JSON.stringify({
            jobTitle: employee.jobTitle,
            department: employee.department,
            managerId: employee.managerId,
          }),
          afterJson: JSON.stringify(after),
          reason,
          status: "pending",
          requestedBy: access.user.email,
          createdAt: now,
        })
        .returning();
      await auditPortalAction({
        actorEmail: access.user.email,
        action: "employee-organizational-change-requested",
        entityType: "employee-profile-change",
        entityId: saved.id,
        before: employee,
        after: saved,
        reason,
      });
      return jsonNoStore({ profileChange: saved }, { status: 201 });
    }

    if (action === "employee-organizational-change-decision") {
      if (!(await hasPortalPermission(access, "employees", "approve")))
        return jsonNoStore(
          { error: "غير مصرح باعتماد التغيير الوظيفي" },
          { status: 403 },
        );
      const changeId = positiveId(payload.changeId),
        decision = clean(payload.decision, 20),
        decisionReason = clean(payload.decisionReason, 500);
      const change = await db.query.employeeProfileChanges.findFirst({
        where: eq(employeeProfileChanges.id, changeId),
      });
      if (
        !change ||
        change.changeType !== "organizational" ||
        change.status !== "pending"
      )
        return jsonNoStore(
          { error: "طلب التغيير الوظيفي غير متاح" },
          { status: 404 },
        );
      if (change.requestedBy === access.user.email)
        return jsonNoStore(
          { error: "فصل المهام يمنع مقدم الطلب من اعتماده" },
          { status: 409 },
        );
      if (
        !new Set(["approved", "rejected"]).has(decision) ||
        decisionReason.length < 10
      )
        return jsonNoStore(
          { error: "حدد القرار واكتب سببه بوضوح" },
          { status: 400 },
        );
      const { saved, updatedEmployee } = await db.transaction(async (tx) => {
        let updatedEmployee = null;
        if (decision === "approved") {
          const after = JSON.parse(change.afterJson) as Partial<
            typeof employees.$inferInsert
          >;
          [updatedEmployee] = await tx
            .update(employees)
            .set({ ...after, updatedAt: now })
            .where(eq(employees.id, change.employeeId))
            .returning();
        }
        const [saved] = await tx
          .update(employeeProfileChanges)
          .set({
            status: decision,
            approvedBy: access.user.email,
            approvedAt: now,
          })
          .where(
            and(
              eq(employeeProfileChanges.id, change.id),
              eq(employeeProfileChanges.status, "pending"),
            ),
          )
          .returning();
        if (!saved)
          throw new Error("تمت معالجة طلب التغيير الوظيفي بواسطة مستخدم آخر");
        await tx.insert(employeeMovements).values({
          employeeId: change.employeeId,
          movementType: "note",
          effectiveDate: change.effectiveDate,
          amountHalalas: 0,
          description: `تغيير تنظيمي ${decision === "approved" ? "معتمد" : "مرفوض"}: ${change.reason} — ${decisionReason}`,
          status: decision === "approved" ? "approved" : "cancelled",
          createdBy: access.user.email,
          createdAt: now,
          updatedAt: now,
        });
        return { saved, updatedEmployee };
      });
      await auditPortalAction({
        actorEmail: access.user.email,
        action: `employee-organizational-change-${decision}`,
        entityType: "employee-profile-change",
        entityId: change.id,
        before: change,
        after: { change: saved, employee: updatedEmployee },
        reason: decisionReason,
      });
      return jsonNoStore({ profileChange: saved, employee: updatedEmployee });
    }

    if (action === "movement") {
      const employeeId = positiveId(payload.employeeId);
      const movementType = clean(payload.movementType, 40);
      const effectiveDate = clean(payload.effectiveDate, 10);
      const description = clean(payload.description, 500);
      const amountHalalas = Math.round(Number(payload.amount || 0) * 100);
      const allowed = new Set([
        "bonus",
        "advance",
        "deduction",
        "allowance",
        "salary_adjustment",
        "leave",
        "return_from_leave",
        "suspension",
        "termination",
        "note",
      ]);
      if (
        !employeeId ||
        !allowed.has(movementType) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate) ||
        description.length < 3 ||
        !Number.isSafeInteger(amountHalalas) ||
        amountHalalas < 0
      )
        return jsonNoStore(
          { error: "بيانات الحركة الوظيفية غير صحيحة" },
          { status: 400 },
        );
      const employee = await db.query.employees.findFirst({
        where: eq(employees.id, employeeId),
      });
      if (!employee)
        return jsonNoStore({ error: "الموظف غير موجود" }, { status: 404 });
      const [movement] = await db
        .insert(employeeMovements)
        .values({
          employeeId,
          movementType,
          effectiveDate,
          description,
          amountHalalas,
          createdBy: access.user.email,
          updatedAt: now,
        })
        .returning();
      await auditPortalAction({
        actorEmail: access.user.email,
        action: "employee-movement-created",
        entityType: "employee-movement",
        entityId: movement.id,
        after: movement,
      });
      return jsonNoStore({ movement }, { status: 201 });
    }

    if (action === "generate-payroll") {
      const periodMonth = clean(payload.periodMonth, 7);
      const paymentDate = clean(payload.paymentDate, 10);
      const bankAccountId = positiveId(payload.bankAccountId);
      const payrollType = clean(payload.payrollType, 30) || "monthly";
      const gosiEmployeeBps = Math.max(
        0,
        Math.min(10000, Number(payload.gosiEmployeeBps) || 0),
      );
      const gosiEmployerBps = Math.max(
        0,
        Math.min(10000, Number(payload.gosiEmployerBps) || 0),
      );
      const range = monthRange(periodMonth);
      if (!range || !/^\d{4}-\d{2}-\d{2}$/.test(paymentDate) || !bankAccountId)
        return jsonNoStore(
          { error: "الفترة أو تاريخ الصرف أو الحساب البنكي غير صحيح" },
          { status: 400 },
        );
      const bank = await db.query.bankAccounts.findFirst({
        where: and(
          eq(bankAccounts.id, bankAccountId),
          eq(bankAccounts.status, "active"),
        ),
      });
      if (!bank)
        return jsonNoStore(
          { error: "الحساب البنكي غير موجود أو غير نشط" },
          { status: 404 },
        );
      const staffRows = await db
        .select()
        .from(employees)
        .where(isNull(employees.archivedAt))
        .orderBy(employees.id);
      const staff = staffRows.filter(
        (employee) =>
          employee.hireDate <= range.end &&
          (!employee.terminationDate ||
            employee.terminationDate >= range.start) &&
          employee.status !== "suspended",
      );
      if (!staff.length)
        return jsonNoStore(
          { error: "لا يوجد موظفون نشطون لإنشاء المسير" },
          { status: 400 },
        );
      const [movements, unpaidLeaves, payrollHolidays] = await Promise.all([
        db
          .select()
          .from(employeeMovements)
          .where(
            and(
              gte(employeeMovements.effectiveDate, range.start),
              lte(employeeMovements.effectiveDate, range.end),
              eq(employeeMovements.status, "approved"),
            ),
          ),
        db
          .select()
          .from(employeeLeaveRequests)
          .where(
            and(
              eq(employeeLeaveRequests.leaveType, "unpaid"),
              eq(employeeLeaveRequests.status, "approved"),
              lte(employeeLeaveRequests.startDate, range.end),
              gte(employeeLeaveRequests.endDate, range.start),
            ),
          ),
        db
          .select({ date: companyHolidays.holidayDate })
          .from(companyHolidays)
          .where(
            and(
              gte(companyHolidays.holidayDate, range.start),
              lte(companyHolidays.holidayDate, range.end),
            ),
          ),
      ]);
      const payrollHolidayDates = new Set(
        payrollHolidays.map((item) => item.date),
      );
      const monthDays = Number(range.end.slice(-2));
      const values = staff.map((employee) => {
        const employeeRows = movements.filter(
          (item) => item.employeeId === employee.id,
        );
        const bonus = employeeRows
          .filter((item) => item.movementType === "bonus")
          .reduce((sum, item) => sum + item.amountHalalas, 0);
        const requestedDeductions = employeeRows
          .filter((item) =>
            ["deduction", "advance"].includes(item.movementType),
          )
          .reduce((sum, item) => sum + item.amountHalalas, 0);
        const activeStart =
            employee.hireDate > range.start ? employee.hireDate : range.start,
          activeEnd =
            employee.terminationDate && employee.terminationDate < range.end
              ? employee.terminationDate
              : range.end;
        const proratedDays = Math.max(
          0,
          Math.floor(
            (new Date(`${activeEnd}T00:00:00Z`).getTime() -
              new Date(`${activeStart}T00:00:00Z`).getTime()) /
              86400000,
          ) + 1,
        );
        const baseSalaryHalalas = Math.round(
          (employee.baseSalaryHalalas * proratedDays) / monthDays,
        );
        const allowances = Math.round(
          ((employee.housingAllowanceHalalas +
            employee.transportAllowanceHalalas +
            employee.otherAllowanceHalalas) *
            proratedDays) /
            monthDays,
        );
        const unpaidDays = unpaidLeaves
          .filter((item) => item.employeeId === employee.id)
          .reduce((sum, item) => {
            const overlapStart =
              item.startDate > activeStart ? item.startDate : activeStart;
            const overlapEnd =
              item.endDate < activeEnd ? item.endDate : activeEnd;
            return overlapEnd < overlapStart
              ? sum
              : sum +
                  workingLeaveDays(
                    overlapStart,
                    overlapEnd,
                    payrollHolidayDates,
                  );
          }, 0);
        const unpaidLeaveDeductionHalalas = Math.min(
          baseSalaryHalalas + allowances,
          Math.round(
            ((employee.baseSalaryHalalas +
              employee.housingAllowanceHalalas +
              employee.transportAllowanceHalalas +
              employee.otherAllowanceHalalas) *
              unpaidDays) /
              monthDays,
          ),
        );
        const gosiBase =
          baseSalaryHalalas +
          Math.round(
            (employee.housingAllowanceHalalas * proratedDays) / monthDays,
          );
        const gosiEmployeeHalalas = employee.gosiNumber
          ? Math.round((gosiBase * gosiEmployeeBps) / 10000)
          : 0;
        const gosiEmployerHalalas = employee.gosiNumber
          ? Math.round((gosiBase * gosiEmployerBps) / 10000)
          : 0;
        const gross = baseSalaryHalalas + allowances + bonus;
        const deductions = Math.min(
          gross,
          requestedDeductions +
            unpaidLeaveDeductionHalalas +
            gosiEmployeeHalalas,
        );
        return {
          employeeId: employee.id,
          baseSalaryHalalas,
          allowancesHalalas: allowances,
          bonusHalalas: bonus,
          deductionsHalalas: deductions,
          netPayHalalas: gross - deductions,
          employeeNumberSnapshot: employee.employeeNumber,
          employeeNameSnapshot: employee.fullName,
          bankNameSnapshot: employee.bankName,
          ibanSnapshot: employee.iban,
          gosiEmployeeHalalas,
          gosiEmployerHalalas,
          unpaidLeaveDeductionHalalas,
          proratedDays,
        };
      });
      const totalGrossHalalas = values.reduce(
        (sum, item) =>
          sum +
          item.baseSalaryHalalas +
          item.allowancesHalalas +
          item.bonusHalalas,
        0,
      );
      const totalDeductionsHalalas = values.reduce(
        (sum, item) => sum + item.deductionsHalalas,
        0,
      );
      const totalNetHalalas = values.reduce(
        (sum, item) => sum + item.netPayHalalas,
        0,
      );
      if (totalGrossHalalas <= 0)
        return jsonNoStore(
          { error: "يجب استكمال الرواتب الأساسية قبل إنشاء المسير" },
          { status: 409 },
        );
      const snapshotJson = JSON.stringify({
        bankAccountId,
        bankName: bank.bankName,
        iban: bank.iban,
        payrollType,
        gosiEmployeeBps,
        gosiEmployerBps,
        generatedAt: now,
      });
      const [run] = await db
        .insert(payrollRuns)
        .values({
          runNumber: `PAY-${periodMonth.replace("-", "")}-${payrollType.slice(0, 3).toUpperCase()}`,
          periodMonth,
          paymentDate,
          bankAccountId,
          payrollType,
          snapshotJson,
          totalGrossHalalas,
          totalDeductionsHalalas,
          totalNetHalalas,
          createdBy: access.user.email,
          updatedAt: now,
        })
        .returning();
      try {
        await db
          .insert(payrollItems)
          .values(values.map((item) => ({ ...item, payrollRunId: run.id })));
      } catch (error) {
        await db.delete(payrollRuns).where(eq(payrollRuns.id, run.id));
        throw error;
      }
      await auditPortalAction({
        actorEmail: access.user.email,
        action: "payroll-generated",
        entityType: "payroll-run",
        entityId: run.id,
        after: run,
      });
      return jsonNoStore({ run }, { status: 201 });
    }

    return jsonNoStore({ error: "العملية غير مدعومة" }, { status: 400 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "تعذّر تنفيذ العملية";
    return jsonNoStore(
      {
        error: message.toLowerCase().includes("unique")
          ? "تم إنشاء مسير لهذه الفترة مسبقًا"
          : message,
      },
      { status: message.toLowerCase().includes("unique") ? 409 : 400 },
    );
  }
}

export async function PATCH(request: Request) {
  if (rejectCrossSiteRequest(request))
    return jsonNoStore({ error: "مصدر الطلب غير مسموح" }, { status: 403 });
  const access = await requirePortalApiRole(["admin", "manager", "employee"]);
  if (!access || !(await hasPortalPermission(access, "employees", "approve")))
    return jsonNoStore({ error: "غير مصرح" }, { status: 403 });
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const action = clean(payload.action, 40);
    const runId = positiveId(payload.runId);
    const db = getDb();
    if (action === "leave-decision") {
      const leaveId = positiveId(payload.leaveId),
        decision = clean(payload.decision, 20);
      if (!["approved", "rejected"].includes(decision))
        return jsonNoStore({ error: "قرار الإجازة غير صحيح" }, { status: 400 });
      const leave = await db.query.employeeLeaveRequests.findFirst({
        where: eq(employeeLeaveRequests.id, leaveId),
      });
      if (!leave || leave.status !== "pending")
        return jsonNoStore(
          { error: "طلب الإجازة غير متاح للاعتماد" },
          { status: 409 },
        );
      const policy = await db.query.employeeLeavePolicies.findFirst({
        where: eq(employeeLeavePolicies.leaveType, leave.leaveType),
      });
      if (!policy)
        return jsonNoStore(
          { error: "سياسة نوع الإجازة غير مهيأة" },
          { status: 409 },
        );
      const updated = await db.transaction(async (tx) => {
        await tx.execute(
          sql`select id from employee_leave_requests where id=${leaveId} for update`,
        );
        const employee = await tx.query.employees.findFirst({
          where: eq(employees.id, leave.employeeId),
        });
        if (!employee) throw new Error("الموظف غير موجود");
        const deducted =
          decision === "approved" && policy.deductsAnnualBalance
            ? leave.days
            : 0;
        if (deducted > employee.leaveBalanceDays)
          throw new Error("رصيد الإجازة السنوية غير كافٍ");
        const [row] = await tx
          .update(employeeLeaveRequests)
          .set({
            status: decision,
            balanceDaysDeducted: deducted,
            paidPercentageBps: policy.paidPercentageBps,
            decidedBy: access.user.email,
            decisionNote: clean(payload.note, 500) || null,
            decidedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          })
          .where(
            and(
              eq(employeeLeaveRequests.id, leaveId),
              eq(employeeLeaveRequests.status, "pending"),
            ),
          )
          .returning();
        if (!row) throw new Error("تمت معالجة الطلب من مستخدم آخر");
        if (deducted)
          await tx
            .update(employees)
            .set({
              leaveBalanceDays: sql`${employees.leaveBalanceDays} - ${deducted}`,
              updatedAt: new Date().toISOString(),
            })
            .where(
              and(
                eq(employees.id, leave.employeeId),
                sql`${employees.leaveBalanceDays} >= ${deducted}`,
              ),
            );
        return row;
      });
      await auditPortalAction({
        actorEmail: access.user.email,
        action: `employee-leave-${decision}`,
        entityType: "employee-leave",
        entityId: leaveId,
        before: leave,
        after: updated,
      });
      return jsonNoStore({ leave: updated });
    }
    if (action === "cancel-leave") {
      const leaveId = positiveId(payload.leaveId),
        reason = clean(payload.reason, 500);
      if (!leaveId || reason.length < 5)
        return jsonNoStore({ error: "اكتب سبب إلغاء واضح" }, { status: 400 });
      const leave = await db.query.employeeLeaveRequests.findFirst({
        where: eq(employeeLeaveRequests.id, leaveId),
      });
      if (!leave || !["pending", "approved"].includes(leave.status))
        return jsonNoStore(
          { error: "الإجازة غير قابلة للإلغاء" },
          { status: 409 },
        );
      const updated = await db.transaction(async (tx) => {
        await tx.execute(
          sql`select id from employee_leave_requests where id=${leaveId} for update`,
        );
        const [row] = await tx
          .update(employeeLeaveRequests)
          .set({
            status: "cancelled",
            cancelledBy: access.user.email,
            cancelledAt: new Date().toISOString(),
            cancellationReason: reason,
            updatedAt: new Date().toISOString(),
          })
          .where(
            and(
              eq(employeeLeaveRequests.id, leaveId),
              eq(employeeLeaveRequests.status, leave.status),
            ),
          )
          .returning();
        if (!row) throw new Error("تمت معالجة الإجازة من مستخدم آخر");
        if (leave.status === "approved" && leave.balanceDaysDeducted > 0)
          await tx
            .update(employees)
            .set({
              leaveBalanceDays: sql`${employees.leaveBalanceDays} + ${leave.balanceDaysDeducted}`,
              updatedAt: new Date().toISOString(),
            })
            .where(eq(employees.id, leave.employeeId));
        return row;
      });
      await auditPortalAction({
        actorEmail: access.user.email,
        action: "employee-leave-cancelled",
        entityType: "employee-leave",
        entityId: leaveId,
        before: leave,
        after: updated,
        reason,
      });
      return jsonNoStore({ leave: updated });
    }
    const run = await db.query.payrollRuns.findFirst({
      where: eq(payrollRuns.id, runId),
    });
    if (!run)
      return jsonNoStore({ error: "مسير الرواتب غير موجود" }, { status: 404 });
    const now = new Date().toISOString();

    if (action === "approve") {
      if (run.status !== "draft")
        return jsonNoStore(
          { error: "لا يمكن اعتماد المسير في حالته الحالية" },
          { status: 409 },
        );
      if (run.createdBy === access.user.email)
        return jsonNoStore(
          { error: "يجب أن يعتمد المسير مستخدم آخر غير منشئه" },
          { status: 409 },
        );
      const postingRule = await resolvePostingRule("payroll_accrual", {
        debitCode: "5000",
        creditCode: "2200",
        taxCode: "2210",
      });
      if (run.totalDeductionsHalalas > 0 && !postingRule.taxAccountId)
        return jsonNoStore(
          { error: "يجب تهيئة دليل الحسابات قبل اعتماد الرواتب" },
          { status: 409 },
        );
      const lines = [
        {
          accountId: postingRule.debitAccountId,
          debitHalalas: run.totalGrossHalalas,
          description: `إجمالي رواتب ${run.periodMonth}`,
        },
        {
          accountId: postingRule.creditAccountId,
          creditHalalas: run.totalNetHalalas,
          description: `صافي مستحقات رواتب ${run.periodMonth}`,
        },
      ];
      if (run.totalDeductionsHalalas > 0 && postingRule.taxAccountId)
        lines.push({
          accountId: postingRule.taxAccountId,
          creditHalalas: run.totalDeductionsHalalas,
          description: `استقطاعات رواتب ${run.periodMonth}`,
        });
      const journal = await createDraftJournal({
        entryDate: run.paymentDate,
        description: `استحقاق رواتب ${run.periodMonth}`,
        sourceType: "payroll-accrual",
        sourceId: String(run.id),
        actorEmail: access.user.email,
        lines,
      });
      const [updated] = await db
        .update(payrollRuns)
        .set({
          status: "approved",
          approvedBy: access.user.email,
          approvedAt: now,
          journalEntryId: journal.entry.id,
          updatedAt: now,
        })
        .where(eq(payrollRuns.id, run.id))
        .returning();
      await auditPortalAction({
        actorEmail: access.user.email,
        action: "payroll-approved",
        entityType: "payroll-run",
        entityId: run.id,
        before: run,
        after: updated,
      });
      return jsonNoStore({ run: updated });
    }

    if (action === "start-payment") {
      if (run.status !== "approved" || !run.journalEntryId)
        return jsonNoStore(
          { error: "اعتمد مسير الرواتب ورحّل قيد الاستحقاق أولًا" },
          { status: 409 },
        );
      const accrual = await db.query.journalEntries.findFirst({
        where: eq(journalEntries.id, run.journalEntryId),
      });
      if (accrual?.status !== "posted")
        return jsonNoStore(
          { error: "يجب ترحيل قيد استحقاق الرواتب قبل بدء الصرف" },
          { status: 409 },
        );
      if (!run.bankAccountId)
        return jsonNoStore(
          { error: "لم يُحدد الحساب البنكي الفعلي للمسير" },
          { status: 409 },
        );
      const bank = await db.query.bankAccounts.findFirst({
        where: and(
          eq(bankAccounts.id, run.bankAccountId),
          eq(bankAccounts.status, "active"),
        ),
      });
      if (!bank)
        return jsonNoStore(
          { error: "الحساب البنكي المرتبط بالمسير غير نشط" },
          { status: 409 },
        );
      const [updated] = await db
        .update(payrollRuns)
        .set({ status: "processing", updatedAt: now })
        .where(eq(payrollRuns.id, run.id))
        .returning();
      await auditPortalAction({
        actorEmail: access.user.email,
        action: "payroll-payment-started",
        entityType: "payroll-run",
        entityId: run.id,
        before: run,
        after: updated,
      });
      return jsonNoStore({ run: updated });
    }

    if (["pay-item", "retry-item"].includes(action)) {
      if (run.status !== "processing" || !run.bankAccountId)
        return jsonNoStore(
          { error: "المسير غير جاهز للصرف الفردي" },
          { status: 409 },
        );
      const itemId = positiveId(payload.itemId),
        amountHalalas = Math.round(Number(payload.amount || 0) * 100),
        reference = clean(payload.reference, 180);
      const item = await db.query.payrollItems.findFirst({
        where: and(
          eq(payrollItems.id, itemId),
          eq(payrollItems.payrollRunId, run.id),
        ),
      });
      if (
        !item ||
        !["pending", "failed", "partial"].includes(item.paymentStatus) ||
        item.pendingPaymentAmountHalalas > 0
      )
        return jsonNoStore(
          { error: "بند الراتب غير متاح للصرف" },
          { status: 409 },
        );
      const remaining = item.netPayHalalas - item.paidAmountHalalas;
      const payAmount = amountHalalas > 0 ? amountHalalas : remaining;
      if (payAmount < 1 || payAmount > remaining)
        return jsonNoStore(
          { error: "مبلغ الصرف يتجاوز المتبقي أو غير صحيح" },
          { status: 400 },
        );
      const [payable, bank] = await Promise.all([
        db.query.chartOfAccounts.findFirst({
          where: and(
            eq(chartOfAccounts.code, "2200"),
            eq(chartOfAccounts.status, "active"),
          ),
        }),
        db.query.bankAccounts.findFirst({
          where: and(
            eq(bankAccounts.id, run.bankAccountId),
            eq(bankAccounts.status, "active"),
          ),
        }),
      ]);
      if (!payable || !bank)
        return jsonNoStore(
          { error: "حساب مستحقات الرواتب أو البنك غير مهيأ" },
          { status: 409 },
        );
      const journal = await createDraftJournal({
        entryDate: run.paymentDate,
        description: `صرف راتب ${item.employeeNameSnapshot || item.employeeId} — ${run.periodMonth}`,
        sourceType: "payroll-item-payment",
        sourceId: String(item.id),
        actorEmail: access.user.email,
        lines: [
          {
            accountId: payable.id,
            debitHalalas: payAmount,
            employeeId: item.employeeId,
            description: `تسوية راتب ${run.periodMonth}`,
          },
          {
            accountId: bank.ledgerAccountId,
            bankAccountId: bank.id,
            creditHalalas: payAmount,
            employeeId: item.employeeId,
            description: `تحويل راتب${reference ? ` — ${reference}` : ""}`,
          },
        ],
      });
      const [saved] = await db
        .update(payrollItems)
        .set({
          paymentStatus: "awaiting_post",
          pendingPaymentAmountHalalas: payAmount,
          paymentReference: reference || item.paymentReference,
          paymentJournalId: journal.entry.id,
          paymentFailureReason: null,
          paymentAttempts: item.paymentAttempts + 1,
        })
        .where(
          and(
            eq(payrollItems.id, item.id),
            eq(payrollItems.paymentStatus, item.paymentStatus),
          ),
        )
        .returning();
      if (!saved)
        return jsonNoStore(
          { error: "تغير بند الراتب قبل الحفظ" },
          { status: 409 },
        );
      return jsonNoStore({ item: saved, journal: journal.entry });
    }
    if (action === "payment-item-result") {
      const itemId = positiveId(payload.itemId),
        result = clean(payload.result, 20),
        reason = clean(payload.reason, 500);
      const item = await db.query.payrollItems.findFirst({
        where: and(
          eq(payrollItems.id, itemId),
          eq(payrollItems.payrollRunId, run.id),
        ),
      });
      if (!item)
        return jsonNoStore({ error: "بند الراتب غير موجود" }, { status: 404 });
      if (result === "failed") {
        if (item.paymentJournalId) {
          const journal = await db.query.journalEntries.findFirst({
            where: eq(journalEntries.id, item.paymentJournalId),
          });
          if (journal?.status === "posted")
            return jsonNoStore(
              {
                error:
                  "لا يمكن تسجيل فشل بعد ترحيل القيد؛ يلزم عكس القيد أولًا",
              },
              { status: 409 },
            );
          if (journal)
            await db
              .delete(journalEntries)
              .where(eq(journalEntries.id, journal.id));
        }
        const [saved] = await db
          .update(payrollItems)
          .set({
            paymentStatus: "failed",
            paymentFailureReason: reason || "تعذر التحويل",
            paymentJournalId: null,
            pendingPaymentAmountHalalas: 0,
          })
          .where(eq(payrollItems.id, item.id))
          .returning();
        return jsonNoStore({ item: saved });
      }
      if (result === "paid") {
        if (!item.paymentJournalId)
          return jsonNoStore(
            { error: "لا يوجد قيد صرف مرتبط" },
            { status: 409 },
          );
        const journal = await db.query.journalEntries.findFirst({
          where: eq(journalEntries.id, item.paymentJournalId),
        });
        if (journal?.status !== "posted")
          return jsonNoStore(
            { error: "يجب اعتماد وترحيل قيد التحويل قبل تأكيد السداد" },
            { status: 409 },
          );
        const [saved] = await db
          .update(payrollItems)
          .set({
            paymentStatus:
              item.paidAmountHalalas + item.pendingPaymentAmountHalalas >=
              item.netPayHalalas
                ? "paid"
                : "partial",
            paidAmountHalalas:
              item.paidAmountHalalas + item.pendingPaymentAmountHalalas,
            pendingPaymentAmountHalalas: 0,
            paidAt: now,
          })
          .where(eq(payrollItems.id, item.id))
          .returning();
        return jsonNoStore({ item: saved });
      }
      return jsonNoStore({ error: "نتيجة التحويل غير صحيحة" }, { status: 400 });
    }
    if (action === "exclude-item") {
      const itemId = positiveId(payload.itemId),
        reason = clean(payload.reason, 500);
      if (reason.length < 5)
        return jsonNoStore({ error: "اكتب سبب الاستثناء" }, { status: 400 });
      const [saved] = await db
        .update(payrollItems)
        .set({
          paymentStatus: "excluded",
          paymentFailureReason: reason,
          excludedAt: now,
          excludedBy: access.user.email,
        })
        .where(
          and(
            eq(payrollItems.id, itemId),
            eq(payrollItems.payrollRunId, run.id),
            inArray(payrollItems.paymentStatus, ["pending", "failed"]),
          ),
        )
        .returning();
      if (!saved)
        return jsonNoStore(
          { error: "البند غير قابل للاستثناء" },
          { status: 409 },
        );
      return jsonNoStore({ item: saved });
    }

    if (action === "mark-paid") {
      if (access.role !== "admin" || run.status !== "processing")
        return jsonNoStore(
          { error: "لا يمكن إغلاق المسير كمدفوع" },
          { status: 409 },
        );
      const unresolved = await db.query.payrollItems.findFirst({
        where: and(
          eq(payrollItems.payrollRunId, run.id),
          sql`${payrollItems.paymentStatus} not in ('paid','excluded')`,
        ),
      });
      if (unresolved)
        return jsonNoStore(
          { error: "لا يمكن إغلاق المسير قبل معالجة كل تحويلات الموظفين" },
          { status: 409 },
        );
      const [updated] = await db
        .update(payrollRuns)
        .set({
          status: "paid",
          paidBy: access.user.email,
          paidAt: now,
          updatedAt: now,
        })
        .where(eq(payrollRuns.id, run.id))
        .returning();
      await auditPortalAction({
        actorEmail: access.user.email,
        action: "payroll-paid",
        entityType: "payroll-run",
        entityId: run.id,
        before: run,
        after: updated,
      });
      return jsonNoStore({ run: updated });
    }
    return jsonNoStore({ error: "العملية غير مدعومة" }, { status: 400 });
  } catch (error) {
    return jsonNoStore(
      {
        error:
          error instanceof Error ? error.message : "تعذّر تحديث مسير الرواتب",
      },
      { status: 400 },
    );
  }
}
