import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { contractPaymentSchedules, contractProfessions, contractWorkerAbsences, contractWorkerAssignments, workers, workforceContracts } from "@/db/schema";
import { auditPortalAction } from "@/lib/audit";
import { hasPortalPermission, requirePortalApiRole } from "@/lib/portal-access";
import { emitPortalNotification } from "@/lib/portal-notifications";
import { jsonNoStore, readLimitedJson, rejectCrossSiteRequest, requestCorrelationId } from "@/lib/security";
import { countChargeableAbsenceDays, isValidIsoDate, workerMonthlySalaryHalalas } from "@/lib/workforce-finance-integrity";

const positiveId = (value: unknown) => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0;
};
const clean = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";
const todayInSaudiArabia = () => new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);

function canRecordAbsence(access: NonNullable<Awaited<ReturnType<typeof requirePortalApiRole>>>) {
  return access.role === "admin" || access.functionalRoles.some((role) => role === "system_owner" || role === "system_admin");
}

function editablePayment(payment: typeof contractPaymentSchedules.$inferSelect) {
  return !payment.invoiceDocumentId
    && !payment.financialRecordId
    && ["scheduled", "due", "referred"].includes(payment.status);
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await requirePortalApiRole(["admin", "manager", "employee"]);
  if (!access || !(await hasPortalPermission(access, "contracts", "read"))) return jsonNoStore({ error: "غير مصرح" }, { status: 403 });
  const contractId = positiveId((await params).id);
  if (!contractId) return jsonNoStore({ error: "العقد غير صحيح" }, { status: 400 });
  const db = getDb();
  const contract = await db.query.workforceContracts.findFirst({ where: eq(workforceContracts.id, contractId) });
  if (!contract) return jsonNoStore({ error: "العقد غير موجود" }, { status: 404 });
  const absences = await db.select().from(contractWorkerAbsences)
    .where(eq(contractWorkerAbsences.contractId, contractId))
    .orderBy(desc(contractWorkerAbsences.absenceDate), desc(contractWorkerAbsences.id));
  const canViewFinancialImpact = canRecordAbsence(access) || await hasPortalPermission(access, "finance", "read");
  return jsonNoStore({
    absences: canViewFinancialImpact ? absences : absences.map((absence) => ({
      ...absence,
      dailyRateHalalas: null,
      deductionHalalas: null,
      clientDailyRateHalalas: null,
      clientDeductionHalalas: null,
    })),
    canRecord: canRecordAbsence(access),
    canViewFinancialImpact,
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (rejectCrossSiteRequest(request)) return jsonNoStore({ error: "مصدر الطلب غير مسموح" }, { status: 403 });
  const access = await requirePortalApiRole(["admin", "manager", "employee"]);
  if (!access || !canRecordAbsence(access)) return jsonNoStore({ error: "تسجيل غياب العمالة والخصم المالي من صلاحيات المالك أو مشرف النظام فقط" }, { status: 403 });
  const parsed = await readLimitedJson(request, 4000);
  if (!parsed.ok) return parsed.response;

  const body = parsed.value as Record<string, unknown>;
  const contractId = positiveId((await params).id);
  const workerId = positiveId(body.workerId) || null;
  const replacementWorkerId = positiveId(body.replacementWorkerId) || null;
  const contractProfessionId = positiveId(body.contractProfessionId);
  const absenceDate = clean(body.absenceDate, 10);
  const absenceEndDate = clean(body.absenceEndDate, 10) || absenceDate;
  const notes = clean(body.notes, 1000);
  const requestedCount = positiveId(body.absentCount) || 1;
  if (!contractId
    || !contractProfessionId
    || !isValidIsoDate(absenceDate)
    || !isValidIsoDate(absenceEndDate)
    || absenceEndDate < absenceDate
    || absenceEndDate.slice(0, 7) !== absenceDate.slice(0, 7)) {
    return jsonNoStore({ error: "فترة الغياب غير صحيحة أو تمتد بين شهرين" }, { status: 400 });
  }
  if (absenceEndDate > todayInSaudiArabia()) return jsonNoStore({ error: "لا يمكن تسجيل غياب بتاريخ مستقبلي" }, { status: 400 });

  const db = getDb();
  try {
    const now = new Date().toISOString();
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`select id from workforce_contracts where id = ${contractId} for update`);
      await tx.execute(sql`select id from contract_professions where id = ${contractProfessionId} for update`);
      const [[contract], [profession]] = await Promise.all([
        tx.select().from(workforceContracts).where(eq(workforceContracts.id, contractId)).limit(1),
        tx.select().from(contractProfessions).where(eq(contractProfessions.id, contractProfessionId)).limit(1),
      ]);
      if (!contract || contract.status !== "active") throw new Error("CONTRACT_NOT_ACTIVE");
      if (!profession || profession.contractId !== contractId) throw new Error("PROFESSION_CONTRACT_MISMATCH");
      if (absenceDate < contract.startDate || absenceEndDate > contract.endDate) throw new Error("ABSENCE_OUTSIDE_CONTRACT");

      const periodMonth = absenceDate.slice(0, 7);
      await tx.execute(sql`
        select id from contract_payment_schedules
        where contract_id = ${contractId} and service_period = ${periodMonth}
        for update
      `);
      const payments = await tx.select().from(contractPaymentSchedules).where(and(
        eq(contractPaymentSchedules.contractId, contractId),
        eq(contractPaymentSchedules.servicePeriod, periodMonth),
      ));
      if (payments.length !== 1 || payments[0].billingBasis !== "monthly_salary") throw new Error("MONTHLY_PAYMENT_NOT_FOUND");
      const payment = payments[0];
      if (!editablePayment(payment)) throw new Error("PAYMENT_ALREADY_PROCESSED");

      const workerIdsToLock = [...new Set([workerId, replacementWorkerId].filter((id): id is number => Boolean(id)))].sort((a, b) => a - b);
      for (const id of workerIdsToLock) await tx.execute(sql`select id from workers where id = ${id} for update`);

      const workDays = countChargeableAbsenceDays(absenceDate, absenceEndDate);
      if (workDays < 1) throw new Error("FRIDAY_ONLY");

      let selectedWorker: typeof workers.$inferSelect | null = null;
      let absentCount = requestedCount * workDays;
      if (workerId) {
        const [assignment] = await tx.select().from(contractWorkerAssignments).where(and(
          eq(contractWorkerAssignments.contractId, contractId),
          eq(contractWorkerAssignments.contractProfessionId, contractProfessionId),
          eq(contractWorkerAssignments.workerId, workerId),
          inArray(contractWorkerAssignments.status, ["active", "released"]),
          sql`substring(${contractWorkerAssignments.assignedAt} from 1 for 10) <= ${absenceDate}`,
          sql`(${contractWorkerAssignments.releasedAt} is null or substring(${contractWorkerAssignments.releasedAt} from 1 for 10) >= ${absenceEndDate})`,
        )).limit(1);
        if (!assignment) throw new Error("WORKER_NOT_ASSIGNED_FOR_PERIOD");
        [selectedWorker] = await tx.select().from(workers).where(eq(workers.id, workerId)).limit(1);
        if (!selectedWorker || (selectedWorker.archivedAt && selectedWorker.archivedAt.slice(0, 10) <= absenceEndDate)) throw new Error("WORKER_NOT_ASSIGNED_FOR_PERIOD");
        absentCount = workDays;
      } else {
        const activeAssignments = await tx.select().from(contractWorkerAssignments).where(and(
          eq(contractWorkerAssignments.contractId, contractId),
          eq(contractWorkerAssignments.contractProfessionId, contractProfessionId),
          inArray(contractWorkerAssignments.status, ["active", "released"]),
        ));
        const assignedForPeriod = activeAssignments.filter((assignment) => assignment.assignedAt.slice(0, 10) <= absenceDate
          && (!assignment.releasedAt || assignment.releasedAt.slice(0, 10) >= absenceEndDate));
        if (requestedCount > assignedForPeriod.length) throw new Error("ABSENT_COUNT_EXCEEDS_ASSIGNMENTS");
      }

      const overlappingAbsences = await tx.select({ id: contractWorkerAbsences.id })
        .from(contractWorkerAbsences)
        .where(and(
          eq(contractWorkerAbsences.contractId, contractId),
          eq(contractWorkerAbsences.contractProfessionId, contractProfessionId),
          eq(contractWorkerAbsences.status, "active"),
          sql`${contractWorkerAbsences.absenceDate} <= ${absenceEndDate}`,
          sql`coalesce(${contractWorkerAbsences.absenceEndDate}, ${contractWorkerAbsences.absenceDate}) >= ${absenceDate}`,
          workerId
            ? or(eq(contractWorkerAbsences.workerId, workerId), isNull(contractWorkerAbsences.workerId))
            : sql`true`,
        ));
      if (overlappingAbsences.length) throw new Error("OVERLAPPING_ABSENCE");

      if (replacementWorkerId) {
        if (!workerId || replacementWorkerId === workerId) throw new Error("INVALID_REPLACEMENT");
        const [replacement] = await tx.select().from(workers).where(eq(workers.id, replacementWorkerId)).limit(1);
        if (!replacement
          || (replacement.archivedAt && replacement.archivedAt.slice(0, 10) <= absenceEndDate)
          || !["available", "assigned"].includes(replacement.status)
          || replacement.profession !== profession.profession
          || replacement.sponsorshipType !== profession.sponsorshipType
          || (profession.sponsorshipType === "other" && replacement.sponsorName !== profession.sponsorName)) {
          throw new Error("REPLACEMENT_NOT_AVAILABLE");
        }
        const replacementAssignments = await tx.select({ id: contractWorkerAssignments.id })
          .from(contractWorkerAssignments)
          .where(and(
            eq(contractWorkerAssignments.workerId, replacementWorkerId),
            sql`substring(${contractWorkerAssignments.assignedAt} from 1 for 10) <= ${absenceEndDate}`,
            sql`(${contractWorkerAssignments.releasedAt} is null or substring(${contractWorkerAssignments.releasedAt} from 1 for 10) >= ${absenceDate})`,
          ));
        if (replacementAssignments.length) throw new Error("REPLACEMENT_NOT_AVAILABLE");
        const replacementOverlap = await tx.select({ id: contractWorkerAbsences.id })
          .from(contractWorkerAbsences)
          .where(and(
            eq(contractWorkerAbsences.replacementWorkerId, replacementWorkerId),
            eq(contractWorkerAbsences.status, "active"),
            sql`${contractWorkerAbsences.absenceDate} <= ${absenceEndDate}`,
            sql`coalesce(${contractWorkerAbsences.absenceEndDate}, ${contractWorkerAbsences.absenceDate}) >= ${absenceDate}`,
          ));
        if (replacementOverlap.length) throw new Error("REPLACEMENT_OVERLAP");
      }

      const monthlyRate = workerId
        ? workerMonthlySalaryHalalas(selectedWorker?.monthlySalaryHalalas || 0, profession.actualSalaryHalalas)
        : profession.actualSalaryHalalas;
      const dailyRateHalalas = Math.round(monthlyRate / 30);
      const clientDailyRateHalalas = Math.round(profession.unitSalaryHalalas / 30);
      if (dailyRateHalalas < 1 || clientDailyRateHalalas < 1) throw new Error("MISSING_RATES");

      const deductionHalalas = dailyRateHalalas * absentCount;
      const clientDeductionHalalas = replacementWorkerId ? 0 : clientDailyRateHalalas * absentCount;
      const dedupeKey = workerId
        ? `${contractId}:${absenceDate}:${absenceEndDate}:worker:${workerId}`
        : `${contractId}:${absenceDate}:${absenceEndDate}:profession:${contractProfessionId}`;
      const [absence] = await tx.insert(contractWorkerAbsences).values({
        contractId,
        paymentScheduleId: payment.id,
        workerId,
        replacementWorkerId,
        contractProfessionId,
        profession: profession.profession,
        absenceDate,
        absenceEndDate,
        chargeableDays: workDays,
        absentCount,
        dailyRateHalalas,
        deductionHalalas,
        clientDailyRateHalalas,
        clientDeductionHalalas,
        notes: notes || null,
        dedupeKey,
        recordedBy: access.user.email,
        updatedAt: now,
      }).returning();

      const [updatedPayment] = await tx.update(contractPaymentSchedules).set({
        absenceDeductionHalalas: sql`${contractPaymentSchedules.absenceDeductionHalalas} + ${clientDeductionHalalas}`,
        updatedAt: now,
      }).where(and(
        eq(contractPaymentSchedules.id, payment.id),
        eq(contractPaymentSchedules.absenceDeductionHalalas, payment.absenceDeductionHalalas),
        inArray(contractPaymentSchedules.status, ["scheduled", "due", "referred"]),
        isNull(contractPaymentSchedules.invoiceDocumentId),
        isNull(contractPaymentSchedules.financialRecordId),
        sql`${contractPaymentSchedules.absenceDeductionHalalas} + ${clientDeductionHalalas} <= ${contractPaymentSchedules.subtotalHalalas}`,
      )).returning();
      if (!updatedPayment) throw new Error("PAYMENT_CHANGED_OR_DEDUCTION_EXCEEDS");
      return { absence, payment: updatedPayment, contract, profession, workDays, deductionHalalas, clientDeductionHalalas };
    });

    await auditPortalAction({
      actorEmail: access.user.email,
      action: "contract-worker-absence-recorded",
      entityType: "contract-worker-absence",
      entityId: result.absence.id,
      after: result.absence,
      correlationId: requestCorrelationId(request),
    });
    await emitPortalNotification({
      eventType: "contract-worker-absence-recorded",
      title: replacementWorkerId ? "سُجل غياب مع عامل بديل" : "سُجل غياب وخصم على دفعة عقد",
      message: `${result.contract.referenceCode} — ${result.profession.profession} — ${result.workDays} يوم مستحق دون الجمعة — خصم العامل ${(result.deductionHalalas / 100).toFixed(2)} ر.س — خصم العميل ${(result.clientDeductionHalalas / 100).toFixed(2)} ر.س.`,
      severity: "warning",
      module: "finance",
      entityType: "contract-payment",
      entityId: result.payment.id,
      actionView: "finance",
      targetDepartment: "finance",
    }).catch(() => undefined);
    return jsonNoStore({ absence: result.absence, payment: result.payment }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "CONTRACT_NOT_ACTIVE") return jsonNoStore({ error: "لا يمكن تسجيل الغياب إلا على عقد نشط" }, { status: 409 });
    if (message === "PROFESSION_CONTRACT_MISMATCH") return jsonNoStore({ error: "المهنة ليست ضمن هذا العقد" }, { status: 400 });
    if (message === "ABSENCE_OUTSIDE_CONTRACT") return jsonNoStore({ error: "فترة الغياب خارج مدة العقد" }, { status: 400 });
    if (message === "MONTHLY_PAYMENT_NOT_FOUND") return jsonNoStore({ error: "لا توجد دفعة شهرية واحدة مرتبطة بشهر الغياب" }, { status: 409 });
    if (message === "PAYMENT_ALREADY_PROCESSED") return jsonNoStore({ error: "لا يمكن تعديل خصم الغياب بعد إصدار الفاتورة أو معالجة الدفعة" }, { status: 409 });
    if (message === "FRIDAY_ONLY") return jsonNoStore({ error: "فترة الغياب تحتوي يوم الجمعة فقط ولا يترتب عليها خصم" }, { status: 400 });
    if (message === "WORKER_NOT_ASSIGNED_FOR_PERIOD") return jsonNoStore({ error: "العامل غير مسند لهذه المهنة طوال فترة الغياب المحددة" }, { status: 409 });
    if (message === "ABSENT_COUNT_EXCEEDS_ASSIGNMENTS") return jsonNoStore({ error: "عدد المتغيبين أكبر من عدد العمالة المسندة للمهنة في ذلك التاريخ" }, { status: 409 });
    if (message === "OVERLAPPING_ABSENCE") return jsonNoStore({ error: "توجد فترة غياب متداخلة؛ ألغِ القيد السابق أو سجّل فترة غير متداخلة" }, { status: 409 });
    if (message === "INVALID_REPLACEMENT") return jsonNoStore({ error: "حدد العامل المتغيب وعاملًا بديلًا مختلفًا" }, { status: 400 });
    if (message === "REPLACEMENT_NOT_AVAILABLE") return jsonNoStore({ error: "العامل البديل غير متاح أو لا يطابق المهنة والكفالة" }, { status: 409 });
    if (message === "REPLACEMENT_OVERLAP") return jsonNoStore({ error: "العامل البديل مستخدم في تغطية غياب آخر خلال الفترة نفسها" }, { status: 409 });
    if (message === "MISSING_RATES") return jsonNoStore({ error: "راتب العامل الفعلي أو سعر العميل غير مسجل ولا يمكن حساب اليومية" }, { status: 409 });
    if (message === "PAYMENT_CHANGED_OR_DEDUCTION_EXCEEDS") return jsonNoStore({ error: "تغيرت الدفعة أو تجاوزت الخصومات قيمتها قبل الضريبة" }, { status: 409 });
    if (message.toLowerCase().includes("unique")) return jsonNoStore({ error: "تم تسجيل غياب العامل أو المهنة لهذه الفترة مسبقًا" }, { status: 409 });
    console.error("contract-worker-absence-failed", error);
    return jsonNoStore({ error: "تعذر تسجيل الغياب والخصم" }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (rejectCrossSiteRequest(request)) return jsonNoStore({ error: "مصدر الطلب غير مسموح" }, { status: 403 });
  const access = await requirePortalApiRole(["admin", "manager", "employee"]);
  if (!access || !canRecordAbsence(access)) return jsonNoStore({ error: "إلغاء قيد الغياب من صلاحيات المالك أو مشرف النظام فقط" }, { status: 403 });
  const contractId = positiveId((await params).id);
  const absenceId = positiveId(new URL(request.url).searchParams.get("absenceId"));
  if (!contractId || !absenceId) return jsonNoStore({ error: "البيانات غير صحيحة" }, { status: 400 });

  const db = getDb();
  const initialAbsence = await db.query.contractWorkerAbsences.findFirst({ where: eq(contractWorkerAbsences.id, absenceId) });
  if (!initialAbsence || initialAbsence.contractId !== contractId || initialAbsence.status !== "active") return jsonNoStore({ error: "قيد الغياب غير موجود أو ملغى" }, { status: 404 });

  try {
    const now = new Date().toISOString();
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`select id from contract_payment_schedules where id = ${initialAbsence.paymentScheduleId} for update`);
      await tx.execute(sql`select id from contract_worker_absences where id = ${absenceId} for update`);
      const [[absence], [payment]] = await Promise.all([
        tx.select().from(contractWorkerAbsences).where(eq(contractWorkerAbsences.id, absenceId)).limit(1),
        tx.select().from(contractPaymentSchedules).where(eq(contractPaymentSchedules.id, initialAbsence.paymentScheduleId)).limit(1),
      ]);
      if (!absence || absence.contractId !== contractId || absence.status !== "active") throw new Error("ABSENCE_CHANGED");
      if (!payment || payment.id !== absence.paymentScheduleId || payment.contractId !== contractId || !editablePayment(payment)) throw new Error("PAYMENT_ALREADY_PROCESSED");

      const [updatedPayment] = await tx.update(contractPaymentSchedules).set({
        absenceDeductionHalalas: sql`${contractPaymentSchedules.absenceDeductionHalalas} - ${absence.clientDeductionHalalas}`,
        updatedAt: now,
      }).where(and(
        eq(contractPaymentSchedules.id, payment.id),
        eq(contractPaymentSchedules.absenceDeductionHalalas, payment.absenceDeductionHalalas),
        inArray(contractPaymentSchedules.status, ["scheduled", "due", "referred"]),
        isNull(contractPaymentSchedules.invoiceDocumentId),
        isNull(contractPaymentSchedules.financialRecordId),
        sql`${contractPaymentSchedules.absenceDeductionHalalas} >= ${absence.clientDeductionHalalas}`,
      )).returning();
      if (!updatedPayment) throw new Error("PAYMENT_CHANGED");

      const [voided] = await tx.update(contractWorkerAbsences).set({
        status: "void",
        voidedBy: access.user.email,
        voidedAt: now,
        updatedAt: now,
      }).where(and(
        eq(contractWorkerAbsences.id, absenceId),
        eq(contractWorkerAbsences.status, "active"),
      )).returning();
      if (!voided) throw new Error("ABSENCE_CHANGED");
      return { absence: voided, payment: updatedPayment };
    });

    await auditPortalAction({
      actorEmail: access.user.email,
      action: "contract-worker-absence-voided",
      entityType: "contract-worker-absence",
      entityId: absenceId,
      before: initialAbsence,
      after: result.absence,
      correlationId: requestCorrelationId(request),
    });
    await emitPortalNotification({
      eventType: "contract-worker-absence-voided",
      title: "أُلغي قيد غياب عامل",
      message: `العقد رقم ${contractId} — أعيد مبلغ ${(initialAbsence.clientDeductionHalalas / 100).toFixed(2)} ر.س إلى دفعة العميل قبل الضريبة.`,
      severity: "info",
      module: "finance",
      entityType: "contract-payment",
      entityId: initialAbsence.paymentScheduleId,
      actionView: "finance",
      targetDepartment: "finance",
    }).catch(() => undefined);
    return jsonNoStore(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "ABSENCE_CHANGED") return jsonNoStore({ error: "تغير قيد الغياب قبل تنفيذ الإلغاء" }, { status: 409 });
    if (message === "PAYMENT_ALREADY_PROCESSED") return jsonNoStore({ error: "لا يمكن إلغاء الخصم بعد إصدار الفاتورة أو معالجة الدفعة" }, { status: 409 });
    if (message === "PAYMENT_CHANGED") return jsonNoStore({ error: "تغيرت قيمة الدفعة قبل تنفيذ الإلغاء" }, { status: 409 });
    console.error("contract-worker-absence-void-failed", error);
    return jsonNoStore({ error: "تعذر إلغاء قيد الغياب" }, { status: 500 });
  }
}
