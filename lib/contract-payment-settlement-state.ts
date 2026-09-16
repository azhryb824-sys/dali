import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  contractPaymentSettlementAllocations,
  contractPaymentSettlements,
  contractPaymentSchedules,
  financialRecords,
  journalEntries,
} from "@/db/schema";
import { auditPortalAction } from "@/lib/audit";
import { contractPaymentState } from "@/lib/contract-payment-state";
import { emitPortalNotification } from "@/lib/portal-notifications";

export async function finalizeContractPaymentSettlementReversal(
  reversalJournalEntryId: number,
  actorEmail: string,
) {
  const db = getDb();
  const [existing, reversalJournal] = await Promise.all([
    db.query.contractPaymentSettlements.findFirst({
      where: eq(
        contractPaymentSettlements.reversalJournalEntryId,
        reversalJournalEntryId,
      ),
    }),
    db.query.journalEntries.findFirst({
      where: eq(journalEntries.id, reversalJournalEntryId),
    }),
  ]);
  if (
    !existing ||
    existing.status !== "reversal_pending" ||
    !reversalJournal ||
    reversalJournal.status !== "posted" ||
    reversalJournal.reversalOfId !== existing.journalEntryId
  )
    return null;
  const now = new Date().toISOString();
  const result = await db.transaction(async (tx) => {
    await tx.execute(
      sql`select id from contract_payment_settlements where id = ${existing.id} for update`,
    );
    await tx.execute(
      sql`select id from contract_payment_schedules where id = ${existing.paymentScheduleId} for update`,
    );
    const [settlement] = await tx
      .select()
      .from(contractPaymentSettlements)
      .where(eq(contractPaymentSettlements.id, existing.id))
      .limit(1);
    const [payment] = await tx
      .select()
      .from(contractPaymentSchedules)
      .where(eq(contractPaymentSchedules.id, existing.paymentScheduleId))
      .limit(1);
    if (
      !settlement ||
      settlement.status !== "reversal_pending" ||
      settlement.reversalJournalEntryId !== reversalJournalEntryId ||
      !payment ||
      !payment.financialRecordId
    ) {
      return null;
    }
    const [reversed] = await tx
      .update(contractPaymentSettlements)
      .set({ status: "reversed", reversedAt: now, updatedAt: now })
      .where(
        and(
          eq(contractPaymentSettlements.id, settlement.id),
          eq(contractPaymentSettlements.status, "reversal_pending"),
          eq(
            contractPaymentSettlements.reversalJournalEntryId,
            reversalJournalEntryId,
          ),
        ),
      )
      .returning();
    if (!reversed) return null;
    const [financial] = await tx
      .select()
      .from(financialRecords)
      .where(eq(financialRecords.id, payment.financialRecordId))
      .limit(1);
    if (!financial) throw new Error("السجل المالي المرتبط بالدفعة غير موجود");
    const active = await tx
      .select({
        id: contractPaymentSettlements.id,
        journalEntryId: contractPaymentSettlements.journalEntryId,
        amountHalalas: contractPaymentSettlements.amountHalalas,
      })
      .from(contractPaymentSettlements)
      .where(
        and(
          eq(contractPaymentSettlements.paymentScheduleId, payment.id),
          inArray(contractPaymentSettlements.status, ["active", "reversal_pending"]),
        ),
      )
      .orderBy(asc(contractPaymentSettlements.id));
    const paidAmountHalalas = active.reduce(
      (sum, item) => sum + item.amountHalalas,
      0,
    );
    const activeIds = active.map((item) => item.id);
    const allocations = activeIds.length
      ? await tx
          .select({
            paymentMethod:
              contractPaymentSettlementAllocations.paymentMethod,
            bankAccountId:
              contractPaymentSettlementAllocations.bankAccountId,
          })
          .from(contractPaymentSettlementAllocations)
          .where(
            inArray(
              contractPaymentSettlementAllocations.settlementId,
              activeIds,
            ),
          )
      : [];
    const methods = [
      ...new Set(allocations.map((item) => item.paymentMethod)),
    ];
    const banks = [
      ...new Set(
        allocations
          .map((item) => item.bankAccountId)
          .filter((id): id is number => id !== null),
      ),
    ];
    const summary = {
      active,
      paidAmountHalalas,
      paymentMethod:
        methods.length === 1 ? methods[0] : methods.length ? "mixed" : null,
      bankAccountId:
        methods.length === 1 && methods[0] !== "cash" && banks.length === 1
          ? banks[0]
          : null,
    };
    const state = contractPaymentState({
      invoiceAmountHalalas: financial.amountHalalas,
      paidAmountHalalas: summary.paidAmountHalalas,
      dueDate: payment.dueDate,
      currentStatus: payment.status,
    });
    const [updatedPayment] = await tx
      .update(contractPaymentSchedules)
      .set({
        paidAmountHalalas: state.paidAmountHalalas,
        status: state.scheduleStatus,
        paymentJournalEntryId: summary.active[0]?.journalEntryId || null,
        paidAt: state.scheduleStatus === "paid" ? payment.paidAt || now : null,
        updatedAt: now,
      })
      .where(eq(contractPaymentSchedules.id, payment.id))
      .returning();
    await tx
      .update(financialRecords)
      .set({
        paidAmountHalalas: state.paidAmountHalalas,
        status: state.financialStatus,
        paymentMethod: summary.paymentMethod,
        bankAccountId: summary.bankAccountId,
        updatedAt: now,
      })
      .where(eq(financialRecords.id, financial.id));
    return { settlement: reversed, payment: updatedPayment, state };
  });
  if (!result) return null;
  await auditPortalAction({
    actorEmail,
    action: "contract-payment-settlement-reversed",
    entityType: "contract-payment-settlement",
    entityId: result.settlement.id,
    before: existing,
    after: result,
    reason: existing.reversalReason || undefined,
  });
  await emitPortalNotification({
    eventType: "contract-payment-settlement-reversed",
    title: "اكتمل عكس تحصيل دفعة عقد",
    message: `${result.settlement.referenceCode} — المتبقي ${(result.state.remainingAmountHalalas / 100).toFixed(2)} ر.س.`,
    severity: "warning",
    module: "finance",
    entityType: "contract-payment",
    entityId: result.payment.id,
    actionView: "finance",
    targetDepartment: "finance",
  }).catch(() => undefined);
  return result;
}
