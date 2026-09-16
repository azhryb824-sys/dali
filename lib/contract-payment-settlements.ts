import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  bankAccounts,
  chartOfAccounts,
  contractPaymentSettlementAllocations,
  contractPaymentSettlements,
  contractPaymentSchedules,
  financialRecords,
  journalEntries,
  workforceContracts,
} from "@/db/schema";
import { createDraftJournal, createReversalDraft } from "@/lib/accounting";
import { auditPortalAction } from "@/lib/audit";
import { contractPaymentState } from "@/lib/contract-payment-state";
import { emitPortalNotification } from "@/lib/portal-notifications";
import { isValidIsoDate } from "@/lib/workforce-finance-integrity";

export type ContractPaymentAllocationInput = {
  paymentMethod: "bank_transfer" | "cash" | "cheque";
  amountHalalas: number;
  bankAccountId?: number | null;
  paymentAccountId?: number | null;
  paymentReference?: string | null;
};

function settlementReference() {
  return `SET-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

function money(value: number) {
  return new Intl.NumberFormat("ar-SA", {
    style: "currency",
    currency: "SAR",
  }).format(value / 100);
}

function allocationLabel(method: string) {
  return method === "bank_transfer"
    ? "تحويل بنكي"
    : method === "cheque"
      ? "شيك"
      : "نقدي";
}

function summarizeMethods(methods: string[]) {
  const unique = [...new Set(methods)];
  return unique.length === 1 ? unique[0] : "mixed";
}

export async function recordContractPaymentSettlement(input: {
  paymentId: number;
  paymentDate: string;
  allocations: ContractPaymentAllocationInput[];
  notes?: string | null;
  actorEmail: string;
  correlationId?: string | null;
}) {
  const today = new Date().toISOString().slice(0, 10);
  if (!isValidIsoDate(input.paymentDate) || input.paymentDate > today) {
    throw new Error("تاريخ السداد غير صحيح أو يقع في المستقبل");
  }
  if (!input.allocations.length || input.allocations.length > 10) {
    throw new Error("أضف مبلغًا نقديًا أو بنكيًا واحدًا على الأقل");
  }
  const allocations = input.allocations.map((allocation) => ({
    paymentMethod: allocation.paymentMethod,
    amountHalalas: Math.round(Number(allocation.amountHalalas)),
    bankAccountId: Number(allocation.bankAccountId) || null,
    paymentAccountId: Number(allocation.paymentAccountId) || null,
    paymentReference: allocation.paymentReference?.trim().slice(0, 180) || null,
  }));
  if (
    allocations.some(
      (allocation) =>
        !["bank_transfer", "cash", "cheque"].includes(
          allocation.paymentMethod,
        ) ||
        !Number.isSafeInteger(allocation.amountHalalas) ||
        allocation.amountHalalas <= 0,
    )
  ) {
    throw new Error("مبالغ أو طرق السداد غير صحيحة");
  }
  const totalAmountHalalas = allocations.reduce(
    (sum, allocation) => sum + allocation.amountHalalas,
    0,
  );
  if (!Number.isSafeInteger(totalAmountHalalas) || totalAmountHalalas <= 0) {
    throw new Error("إجمالي مبلغ السداد غير صحيح");
  }

  const db = getDb();
  const payment = await db.query.contractPaymentSchedules.findFirst({
    where: eq(contractPaymentSchedules.id, input.paymentId),
  });
  if (
    !payment ||
    !payment.financialRecordId ||
    !["invoiced", "partially_paid"].includes(payment.status)
  ) {
    throw new Error("لا يمكن تسجيل السداد قبل إصدار الفاتورة أو بعد اكتماله");
  }
  const [contract, financial, pendingReversal] = await Promise.all([
    db.query.workforceContracts.findFirst({
      where: eq(workforceContracts.id, payment.contractId),
    }),
    db.query.financialRecords.findFirst({
      where: eq(financialRecords.id, payment.financialRecordId),
    }),
    db.query.contractPaymentSettlements.findFirst({
      where: and(
        eq(contractPaymentSettlements.paymentScheduleId, payment.id),
        eq(contractPaymentSettlements.status, "reversal_pending"),
      ),
    }),
  ]);
  if (!contract || !financial) throw new Error("بيانات العقد المالية غير مكتملة");
  if (financial.postingStatus !== "posted") {
    throw new Error("يجب اعتماد وترحيل قيد الفاتورة أو الاستحقاق قبل تسجيل السداد");
  }
  if (pendingReversal) {
    throw new Error("يوجد عكس سداد بانتظار الاعتماد والترحيل؛ أكمله قبل إضافة سداد جديد");
  }
  const remainingBefore = financial.amountHalalas - payment.paidAmountHalalas;
  if (totalAmountHalalas > remainingBefore) {
    throw new Error(`مبلغ السداد يتجاوز المتبقي ${money(remainingBefore)}`);
  }

  const bankIds = [
    ...new Set(
      allocations
        .filter((allocation) => allocation.paymentMethod !== "cash")
        .map((allocation) => allocation.bankAccountId || 0),
    ),
  ];
  if (bankIds.some((id) => id < 1)) {
    throw new Error("اختر الحساب البنكي لكل مبلغ محوّل أو شيك");
  }
  const [banks, cashAccount, controlAccount] = await Promise.all([
    bankIds.length
      ? db
          .select()
          .from(bankAccounts)
          .where(
            and(
              inArray(bankAccounts.id, bankIds),
              eq(bankAccounts.status, "active"),
            ),
          )
      : Promise.resolve([]),
    allocations.some((allocation) => allocation.paymentMethod === "cash")
      ? db.query.chartOfAccounts.findFirst({
          where: and(
            eq(chartOfAccounts.code, "1100"),
            eq(chartOfAccounts.status, "active"),
            eq(chartOfAccounts.accountType, "asset"),
            eq(chartOfAccounts.isPosting, true),
          ),
        })
      : Promise.resolve(null),
    db.query.chartOfAccounts.findFirst({
      where: and(
        eq(
          chartOfAccounts.code,
          contract.contractDirection === "dali_purchaser" ? "2100" : "1300",
        ),
        eq(chartOfAccounts.status, "active"),
        eq(chartOfAccounts.isPosting, true),
      ),
    }),
  ]);
  if (banks.length !== bankIds.length) {
    throw new Error("أحد الحسابات البنكية غير موجود أو غير نشط");
  }
  if (
    allocations.some(
      (allocation) =>
        allocation.paymentMethod !== "cash" &&
        !allocation.paymentReference,
    )
  ) {
    throw new Error("أدخل مرجع التحويل أو الشيك لكل مبلغ بنكي");
  }
  if (
    allocations.some((allocation) => allocation.paymentMethod === "cash") &&
    !cashAccount
  ) {
    throw new Error("حساب النقدية في الخزينة 1100 غير مهيأ للترحيل");
  }
  if (!controlAccount) {
    throw new Error(
      contract.contractDirection === "dali_purchaser"
        ? "حساب ذمم الموردين 2100 غير مهيأ للترحيل"
        : "حساب ذمم العملاء 1300 غير مهيأ للترحيل",
    );
  }
  const bankById = new Map(banks.map((bank) => [bank.id, bank]));
  const resolvedAllocations = allocations.map((allocation) => {
    const bank = allocation.bankAccountId
      ? bankById.get(allocation.bankAccountId)
      : null;
    return {
      ...allocation,
      ledgerAccountId: bank?.ledgerAccountId || cashAccount?.id || 0,
      bankAccountId: bank?.id || null,
      bank,
    };
  });
  const direction =
    contract.contractDirection === "dali_purchaser"
      ? "supplier_payment"
      : "customer_receipt";
  const referenceCode = settlementReference();
  const description = `${direction === "supplier_payment" ? "سداد مورد" : "تحصيل عميل"} — ${contract.referenceCode} — ${payment.title}`;
  const allocationLines = resolvedAllocations.map((allocation) => ({
    accountId: allocation.ledgerAccountId,
    bankAccountId: allocation.bankAccountId,
    description: `${allocationLabel(allocation.paymentMethod)}${allocation.bank ? ` — ${allocation.bank.bankName} — ${allocation.bank.accountCode}` : " — الخزينة"}${allocation.paymentReference ? ` — ${allocation.paymentReference}` : ""}`,
    ...(direction === "supplier_payment"
      ? { creditHalalas: allocation.amountHalalas }
      : { debitHalalas: allocation.amountHalalas }),
    clientId: contract.clientId,
    contractId: contract.id,
  }));
  const controlLine = {
    accountId: controlAccount.id,
    description:
      direction === "supplier_payment"
        ? `تسوية ذمة المورد — ${contract.clientName}`
        : `تسوية ذمة العميل — ${contract.clientName}`,
    ...(direction === "supplier_payment"
      ? { debitHalalas: totalAmountHalalas }
      : { creditHalalas: totalAmountHalalas }),
    clientId: contract.clientId,
    contractId: contract.id,
  };
  const journal = await createDraftJournal({
    entryDate: input.paymentDate,
    description,
    sourceType: "contract-payment-settlement",
    sourceId: referenceCode,
    actorEmail: input.actorEmail,
    lines:
      direction === "supplier_payment"
        ? [controlLine, ...allocationLines]
        : [...allocationLines, controlLine],
  });

  try {
    const now = new Date().toISOString();
    const result = await db.transaction(async (tx) => {
      await tx.execute(
        sql`select id from contract_payment_schedules where id = ${payment.id} for update`,
      );
      const [currentPayment] = await tx
        .select()
        .from(contractPaymentSchedules)
        .where(eq(contractPaymentSchedules.id, payment.id))
        .limit(1);
      if (
        !currentPayment ||
        !currentPayment.financialRecordId ||
        !["invoiced", "partially_paid"].includes(currentPayment.status)
      ) {
        throw new Error("تغيرت حالة الدفعة قبل حفظ السداد");
      }
      const [currentFinancial] = await tx
        .select()
        .from(financialRecords)
        .where(eq(financialRecords.id, currentPayment.financialRecordId))
        .limit(1);
      if (!currentFinancial || currentFinancial.postingStatus !== "posted") {
        throw new Error("تغيرت حالة ترحيل الاستحقاق قبل حفظ السداد");
      }
      const activeSettlements = await tx
        .select({ amountHalalas: contractPaymentSettlements.amountHalalas })
        .from(contractPaymentSettlements)
        .where(
          and(
            eq(contractPaymentSettlements.paymentScheduleId, currentPayment.id),
            inArray(contractPaymentSettlements.status, [
              "active",
              "reversal_pending",
            ]),
          ),
        );
      const paidBefore = activeSettlements.reduce(
        (sum, item) => sum + item.amountHalalas,
        0,
      );
      if (totalAmountHalalas > currentFinancial.amountHalalas - paidBefore) {
        throw new Error("سُجل سداد آخر وتغير المبلغ المتبقي؛ حدّث الصفحة وحاول مجددًا");
      }
      const [settlement] = await tx
        .insert(contractPaymentSettlements)
        .values({
          paymentScheduleId: currentPayment.id,
          referenceCode,
          direction,
          amountHalalas: totalAmountHalalas,
          paymentDate: input.paymentDate,
          journalEntryId: journal.entry.id,
          notes: input.notes?.trim().slice(0, 1000) || null,
          recordedBy: input.actorEmail,
          updatedAt: now,
        })
        .returning();
      await tx.insert(contractPaymentSettlementAllocations).values(
        resolvedAllocations.map((allocation) => ({
          settlementId: settlement.id,
          paymentMethod: allocation.paymentMethod,
          amountHalalas: allocation.amountHalalas,
          ledgerAccountId: allocation.ledgerAccountId,
          bankAccountId: allocation.bankAccountId,
          paymentReference: allocation.paymentReference,
        })),
      );
      const state = contractPaymentState({
        invoiceAmountHalalas: currentFinancial.amountHalalas,
        paidAmountHalalas: paidBefore + totalAmountHalalas,
        dueDate: currentPayment.dueDate,
        currentStatus: currentPayment.status,
      });
      const methods = summarizeMethods(
        resolvedAllocations.map((allocation) => allocation.paymentMethod),
      );
      const soleBankId =
        methods !== "mixed" && methods !== "cash"
          ? resolvedAllocations[0]?.bankAccountId || null
          : null;
      const [updatedPayment] = await tx
        .update(contractPaymentSchedules)
        .set({
          status: state.scheduleStatus,
          paidAmountHalalas: state.paidAmountHalalas,
          paymentJournalEntryId:
            currentPayment.paymentJournalEntryId || journal.entry.id,
          paidAt: state.scheduleStatus === "paid" ? now : null,
          updatedAt: now,
        })
        .where(
          and(
            eq(contractPaymentSchedules.id, currentPayment.id),
            eq(
              contractPaymentSchedules.paidAmountHalalas,
              currentPayment.paidAmountHalalas,
            ),
          ),
        )
        .returning();
      if (!updatedPayment) throw new Error("تغير مبلغ الدفعة قبل الحفظ");
      await tx
        .update(financialRecords)
        .set({
          paidAmountHalalas: state.paidAmountHalalas,
          status: state.financialStatus,
          paymentMethod: methods,
          bankAccountId: soleBankId,
          updatedAt: now,
        })
        .where(eq(financialRecords.id, currentFinancial.id));
      return { settlement, payment: updatedPayment, state };
    });
    await auditPortalAction({
      actorEmail: input.actorEmail,
      action: "contract-payment-settlement-recorded",
      entityType: "contract-payment-settlement",
      entityId: result.settlement.id,
      before: payment,
      after: {
        ...result,
        allocations: resolvedAllocations.map((allocation) => ({
          paymentMethod: allocation.paymentMethod,
          amountHalalas: allocation.amountHalalas,
          bankAccountId: allocation.bankAccountId,
          paymentReference: allocation.paymentReference,
        })),
        journalEntryId: journal.entry.id,
      },
      correlationId: input.correlationId || undefined,
    });
    const methodText = resolvedAllocations
      .map(
        (allocation) =>
          `${allocationLabel(allocation.paymentMethod)} ${money(allocation.amountHalalas)}`,
      )
      .join(" + ");
    await emitPortalNotification({
      eventType: "contract-payment-settlement-recorded",
      title:
        direction === "supplier_payment"
          ? "سُجل سداد مستحق مورد"
          : "سُجل تحصيل فاتورة عميل",
      message: `${contract.referenceCode} — ${payment.title} — ${methodText} — المتبقي ${money(result.state.remainingAmountHalalas)}. القيد بانتظار الاعتماد والترحيل.`,
      severity: result.state.remainingAmountHalalas > 0 ? "warning" : "success",
      module: "finance",
      entityType: "contract-payment",
      entityId: payment.id,
      actionView: "finance",
      targetDepartment: "finance",
    }).catch(() => undefined);
    return { ...result, journal: journal.entry };
  } catch (error) {
    const now = new Date().toISOString();
    await db
      .update(journalEntries)
      .set({
        status: "void",
        voidReason: "تعذر ربط قيد السداد بدفعة العقد.",
        updatedAt: now,
      })
      .where(
        and(
          eq(journalEntries.id, journal.entry.id),
          eq(journalEntries.status, "draft"),
        ),
      )
      .catch(() => undefined);
    throw error;
  }
}

export async function reverseContractPaymentSettlement(input: {
  paymentId: number;
  settlementId: number;
  reason: string;
  actorEmail: string;
  correlationId?: string | null;
}) {
  const reason = input.reason.trim().slice(0, 1000);
  if (reason.length < 10) {
    throw new Error("اكتب سبب عكس واضحًا لا يقل عن 10 أحرف");
  }
  const db = getDb();
  const [settlement, payment] = await Promise.all([
    db.query.contractPaymentSettlements.findFirst({
      where: eq(contractPaymentSettlements.id, input.settlementId),
    }),
    db.query.contractPaymentSchedules.findFirst({
      where: eq(contractPaymentSchedules.id, input.paymentId),
    }),
  ]);
  if (
    !settlement ||
    !payment ||
    settlement.paymentScheduleId !== payment.id ||
    !payment.financialRecordId
  ) {
    throw new Error("سجل السداد غير موجود لهذه الفاتورة");
  }
  if (settlement.status === "reversal_pending") {
    throw new Error("عكس هذا السداد بانتظار اعتماد وترحيل القيد العكسي");
  }
  if (settlement.status !== "active") {
    throw new Error("هذا السداد معكوس أو ملغى مسبقًا");
  }
  const journal = await db.query.journalEntries.findFirst({
    where: eq(journalEntries.id, settlement.journalEntryId),
  });
  if (!journal) throw new Error("قيد السداد المرتبط غير موجود");
  const now = new Date().toISOString();
  if (journal.status === "posted") {
    const reversal = await createReversalDraft(
      journal.id,
      input.actorEmail,
      reason,
    );
    const [updated] = await db
      .update(contractPaymentSettlements)
      .set({
        status: "reversal_pending",
        reversalJournalEntryId: reversal.entry.id,
        reversedBy: input.actorEmail,
        reversalReason: reason,
        updatedAt: now,
      })
      .where(
        and(
          eq(contractPaymentSettlements.id, settlement.id),
          eq(contractPaymentSettlements.status, "active"),
        ),
      )
      .returning();
    if (!updated) throw new Error("تغير سجل السداد قبل إنشاء العكس");
    await auditPortalAction({
      actorEmail: input.actorEmail,
      action: "contract-payment-settlement-reversal-requested",
      entityType: "contract-payment-settlement",
      entityId: settlement.id,
      before: settlement,
      after: updated,
      reason,
      correlationId: input.correlationId || undefined,
    });
    await emitPortalNotification({
      eventType: "contract-payment-settlement-reversal-requested",
      title: "قيد عكس سداد بانتظار الاعتماد",
      message: `${settlement.referenceCode} — ${money(settlement.amountHalalas)} — ${reason}`,
      severity: "critical",
      module: "finance",
      entityType: "journal-entry",
      entityId: reversal.entry.id,
      actionView: "finance",
      targetDepartment: "finance",
    }).catch(() => undefined);
    return {
      settlement: updated,
      payment,
      reversalJournal: reversal.entry,
      pending: true,
    };
  }
  if (!["draft", "approved", "void", "reversed"].includes(journal.status)) {
    throw new Error("حالة قيد السداد لا تسمح بالعكس");
  }
  const result = await db.transaction(async (tx) => {
    await tx.execute(
      sql`select id from contract_payment_settlements where id = ${settlement.id} for update`,
    );
    await tx.execute(
      sql`select id from contract_payment_schedules where id = ${payment.id} for update`,
    );
    await tx.execute(
      sql`select id from journal_entries where id = ${journal.id} for update`,
    );
    const [currentSettlement] = await tx
      .select()
      .from(contractPaymentSettlements)
      .where(eq(contractPaymentSettlements.id, settlement.id))
      .limit(1);
    const [currentPayment] = await tx
      .select()
      .from(contractPaymentSchedules)
      .where(eq(contractPaymentSchedules.id, payment.id))
      .limit(1);
    const [currentJournal] = await tx
      .select()
      .from(journalEntries)
      .where(eq(journalEntries.id, journal.id))
      .limit(1);
    if (
      !currentSettlement ||
      currentSettlement.status !== "active" ||
      !currentPayment ||
      !currentPayment.financialRecordId ||
      !currentJournal ||
      !["draft", "approved", "void", "reversed"].includes(
        currentJournal.status,
      )
    ) {
      throw new Error("تغيرت حالة السداد قبل تنفيذ العكس");
    }
    if (["draft", "approved"].includes(currentJournal.status)) {
      await tx
        .update(journalEntries)
        .set({ status: "void", voidReason: reason, updatedAt: now })
        .where(eq(journalEntries.id, currentJournal.id));
    }
    const settlementStatus = currentJournal.status === "reversed"
      ? "reversed"
      : "void";
    const [updatedSettlement] = await tx
      .update(contractPaymentSettlements)
      .set({
        status: settlementStatus,
        reversedBy: input.actorEmail,
        reversedAt: now,
        reversalReason: reason,
        updatedAt: now,
      })
      .where(eq(contractPaymentSettlements.id, currentSettlement.id))
      .returning();
    const active = await tx
      .select({
        id: contractPaymentSettlements.id,
        journalEntryId: contractPaymentSettlements.journalEntryId,
        amountHalalas: contractPaymentSettlements.amountHalalas,
      })
      .from(contractPaymentSettlements)
      .where(
        and(
          eq(contractPaymentSettlements.paymentScheduleId, currentPayment.id),
          inArray(contractPaymentSettlements.status, ["active", "reversal_pending"]),
        ),
      )
      .orderBy(asc(contractPaymentSettlements.id));
    const paidAmountHalalas = active.reduce(
      (sum, item) => sum + item.amountHalalas,
      0,
    );
    const [financial] = await tx
      .select()
      .from(financialRecords)
      .where(eq(financialRecords.id, currentPayment.financialRecordId))
      .limit(1);
    if (!financial) throw new Error("السجل المالي المرتبط غير موجود");
    const state = contractPaymentState({
      invoiceAmountHalalas: financial.amountHalalas,
      paidAmountHalalas,
      dueDate: currentPayment.dueDate,
      currentStatus: currentPayment.status,
    });
    const activeIds = active.map((item) => item.id);
    const remainingAllocations = activeIds.length
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
      ...new Set(remainingAllocations.map((item) => item.paymentMethod)),
    ];
    const bankIds = [
      ...new Set(
        remainingAllocations
          .map((item) => item.bankAccountId)
          .filter((id): id is number => id !== null),
      ),
    ];
    const paymentMethod =
      methods.length === 1 ? methods[0] : methods.length ? "mixed" : null;
    const bankAccountId =
      methods.length === 1 && methods[0] !== "cash" && bankIds.length === 1
        ? bankIds[0]
        : null;
    const [updatedPayment] = await tx
      .update(contractPaymentSchedules)
      .set({
        status: state.scheduleStatus,
        paidAmountHalalas: state.paidAmountHalalas,
        paymentJournalEntryId: active[0]?.journalEntryId || null,
        paidAt: state.scheduleStatus === "paid" ? currentPayment.paidAt || now : null,
        updatedAt: now,
      })
      .where(eq(contractPaymentSchedules.id, currentPayment.id))
      .returning();
    await tx
      .update(financialRecords)
      .set({
        paidAmountHalalas: state.paidAmountHalalas,
        status: state.financialStatus,
        paymentMethod,
        bankAccountId,
        updatedAt: now,
      })
      .where(eq(financialRecords.id, financial.id));
    return {
      settlement: updatedSettlement,
      payment: updatedPayment,
      state,
      journal: currentJournal,
    };
  });
  await auditPortalAction({
    actorEmail: input.actorEmail,
    action: "contract-payment-settlement-voided",
    entityType: "contract-payment-settlement",
    entityId: settlement.id,
    before: settlement,
    after: result,
    reason,
    correlationId: input.correlationId || undefined,
  });
  await emitPortalNotification({
    eventType: "contract-payment-settlement-voided",
    title: "أُلغي سداد غير مرحّل",
    message: `${settlement.referenceCode} — ${money(settlement.amountHalalas)} — المتبقي ${money(result.state.remainingAmountHalalas)}.`,
    severity: "warning",
    module: "finance",
    entityType: "contract-payment",
    entityId: payment.id,
    actionView: "finance",
    targetDepartment: "finance",
  }).catch(() => undefined);
  return { ...result, pending: false };
}
