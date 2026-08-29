import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  employeeTerminationRequests,
  employees,
  journalEntries,
  portalUsers,
} from "@/db/schema";
import { createDraftJournal, resolvePostingRule } from "@/lib/accounting";
import { auditPortalAction } from "@/lib/audit";
import { hasPortalPermission, requirePortalApiRole } from "@/lib/portal-access";
import { jsonNoStore, rejectCrossSiteRequest } from "@/lib/security";

const clean = (value: unknown, max = 1000) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";
const id = (value: unknown) => {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : 0;
};
const amount = (value: unknown) => Math.round(Number(value || 0) * 100);
async function actor(approve = false) {
  const access = await requirePortalApiRole(["admin", "manager", "employee"]);
  return access &&
    (await hasPortalPermission(
      access,
      "employees",
      approve ? "approve" : "write",
    ))
    ? access
    : null;
}

export async function GET() {
  const access = await requirePortalApiRole(["admin", "manager", "employee"]);
  if (!access || !(await hasPortalPermission(access, "employees", "read")))
    return jsonNoStore({ error: "غير مصرح" }, { status: 403 });
  return jsonNoStore({
    terminations: await getDb()
      .select()
      .from(employeeTerminationRequests)
      .orderBy(desc(employeeTerminationRequests.id))
      .limit(1000),
  });
}

export async function POST(request: Request) {
  if (rejectCrossSiteRequest(request))
    return jsonNoStore({ error: "مصدر الطلب غير مسموح" }, { status: 403 });
  const access = await actor();
  if (!access) return jsonNoStore({ error: "غير مصرح" }, { status: 403 });
  try {
    const body = (await request.json()) as Record<string, unknown>,
      employeeId = id(body.employeeId),
      requestedLastDay = clean(body.requestedLastDay, 10),
      reason = clean(body.reason),
      parts = [
        amount(body.serviceAward),
        amount(body.leaveCompensation),
        amount(body.salaryDue),
        amount(body.deductions),
      ];
    if (
      !employeeId ||
      !/^\d{4}-\d{2}-\d{2}$/.test(requestedLastDay) ||
      reason.length < 5 ||
      parts.some((value) => !Number.isSafeInteger(value) || value < 0)
    )
      return jsonNoStore(
        { error: "بيانات طلب إنهاء الخدمة غير صحيحة" },
        { status: 400 },
      );
    const employee = await getDb().query.employees.findFirst({
      where: eq(employees.id, employeeId),
    });
    if (!employee || employee.status === "ended")
      return jsonNoStore(
        { error: "الموظف غير متاح لإنهاء الخدمة" },
        { status: 409 },
      );
    const existing = await getDb().query.employeeTerminationRequests.findFirst({
      where: and(
        eq(employeeTerminationRequests.employeeId, employeeId),
        eq(employeeTerminationRequests.status, "pending_approval"),
      ),
    });
    if (existing)
      return jsonNoStore(
        { error: "يوجد طلب إنهاء خدمة قائم لهذا الموظف" },
        { status: 409 },
      );
    const net = Math.max(0, parts[0] + parts[1] + parts[2] - parts[3]),
      now = new Date().toISOString();
    const [row] = await getDb()
      .insert(employeeTerminationRequests)
      .values({
        employeeId,
        requestedLastDay,
        reason,
        status: "pending_approval",
        serviceAwardHalalas: parts[0],
        leaveCompensationHalalas: parts[1],
        salaryDueHalalas: parts[2],
        deductionsHalalas: parts[3],
        netSettlementHalalas: net,
        clearanceJson: JSON.stringify({
          assets: false,
          finance: false,
          documents: false,
          systems: false,
        }),
        requestedBy: access.user.email,
        updatedAt: now,
      })
      .returning();
    await auditPortalAction({
      actorEmail: access.user.email,
      action: "employee-termination-requested",
      entityType: "employee-termination",
      entityId: row.id,
      after: row,
    });
    return jsonNoStore({ termination: row }, { status: 201 });
  } catch (error) {
    return jsonNoStore(
      { error: error instanceof Error ? error.message : "تعذر إنشاء الطلب" },
      { status: 400 },
    );
  }
}

export async function PATCH(request: Request) {
  if (rejectCrossSiteRequest(request))
    return jsonNoStore({ error: "مصدر الطلب غير مسموح" }, { status: 403 });
  const access = await actor(true);
  if (!access) return jsonNoStore({ error: "غير مصرح" }, { status: 403 });
  try {
    const body = (await request.json()) as Record<string, unknown>,
      terminationId = id(body.terminationId),
      action = clean(body.action, 30),
      db = getDb(),
      before = await db.query.employeeTerminationRequests.findFirst({
        where: eq(employeeTerminationRequests.id, terminationId),
      });
    if (!before)
      return jsonNoStore(
        { error: "طلب إنهاء الخدمة غير موجود" },
        { status: 404 },
      );
    const now = new Date().toISOString();
    if (action === "approve") {
      if (
        before.status !== "pending_approval" ||
        before.requestedBy === access.user.email
      )
        return jsonNoStore(
          { error: "يلزم اعتماد الطلب بواسطة مستخدم آخر" },
          { status: 409 },
        );
      const postingRule = await resolvePostingRule("employee_termination", {
        debitCode: "5000",
        creditCode: "2200",
      });
      const journal =
        before.netSettlementHalalas > 0
          ? await createDraftJournal({
              entryDate: before.requestedLastDay,
              description: `تسوية نهاية خدمة موظف #${before.employeeId}`,
              sourceType: "employee-termination",
              sourceId: String(before.id),
              actorEmail: access.user.email,
              lines: [
                {
                  accountId: postingRule.debitAccountId,
                  debitHalalas: before.netSettlementHalalas,
                  employeeId: before.employeeId,
                  description: "مستحقات نهاية الخدمة",
                },
                {
                  accountId: postingRule.creditAccountId,
                  creditHalalas: before.netSettlementHalalas,
                  employeeId: before.employeeId,
                  description: "مستحقات موظف واجبة السداد",
                },
              ],
            })
          : null;
      const [row] = await db
        .update(employeeTerminationRequests)
        .set({
          status: "clearance",
          journalEntryId: journal?.entry.id || null,
          approvedBy: access.user.email,
          approvedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(employeeTerminationRequests.id, before.id),
            eq(employeeTerminationRequests.status, "pending_approval"),
          ),
        )
        .returning();
      await auditPortalAction({
        actorEmail: access.user.email,
        action: "employee-termination-approved",
        entityType: "employee-termination",
        entityId: before.id,
        before,
        after: row,
      });
      return jsonNoStore({ termination: row, journal: journal?.entry || null });
    }
    if (action === "complete-clearance") {
      if (before.status !== "clearance")
        return jsonNoStore(
          { error: "الطلب ليس في مرحلة إخلاء الطرف" },
          { status: 409 },
        );
      const clearance = {
        assets: Boolean(body.assets),
        finance: Boolean(body.finance),
        documents: Boolean(body.documents),
        systems: Boolean(body.systems),
      };
      if (Object.values(clearance).some((value) => !value))
        return jsonNoStore(
          { error: "يجب إكمال جميع بنود إخلاء الطرف" },
          { status: 409 },
        );
      if (before.journalEntryId) {
        const journal = await db.query.journalEntries.findFirst({
          where: eq(journalEntries.id, before.journalEntryId),
        });
        if (journal?.status !== "posted")
          return jsonNoStore(
            { error: "يجب اعتماد وترحيل قيد التسوية قبل إكمال إنهاء الخدمة" },
            { status: 409 },
          );
      }
      const employee = await db.query.employees.findFirst({
        where: eq(employees.id, before.employeeId),
      });
      await db.transaction(async (tx) => {
        await tx
          .update(employeeTerminationRequests)
          .set({
            status: "completed",
            clearanceJson: JSON.stringify(clearance),
            completedBy: access.user.email,
            completedAt: now,
            updatedAt: now,
          })
          .where(
            and(
              eq(employeeTerminationRequests.id, before.id),
              eq(employeeTerminationRequests.status, "clearance"),
            ),
          );
        await tx
          .update(employees)
          .set({
            status: "ended",
            terminationDate: before.requestedLastDay,
            terminationReason: before.reason,
            updatedAt: now,
          })
          .where(eq(employees.id, before.employeeId));
        if (employee?.portalUserEmail)
          await tx
            .update(portalUsers)
            .set({ status: "suspended", suspendedAt: now, updatedAt: now })
            .where(eq(portalUsers.email, employee.portalUserEmail));
      });
      await auditPortalAction({
        actorEmail: access.user.email,
        action: "employee-termination-completed",
        entityType: "employee-termination",
        entityId: before.id,
        before,
        after: { status: "completed", clearance },
      });
      return jsonNoStore({ completed: true });
    }
    return jsonNoStore({ error: "العملية غير مدعومة" }, { status: 400 });
  } catch (error) {
    return jsonNoStore(
      { error: error instanceof Error ? error.message : "تعذر معالجة الطلب" },
      { status: 400 },
    );
  }
}
