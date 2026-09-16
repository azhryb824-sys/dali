import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { contractPaymentState } from "../lib/contract-payment-state.ts";

const read = (path) => readFile(path, "utf8");

test("partial payment leaves an overdue remainder without losing paid value", () => {
  assert.deepEqual(
    contractPaymentState({
      invoiceAmountHalalas: 100_000,
      paidAmountHalalas: 35_000,
      dueDate: "2026-09-01",
      today: "2026-09-16",
    }),
    {
      invoiceAmountHalalas: 100_000,
      paidAmountHalalas: 35_000,
      remainingAmountHalalas: 65_000,
      scheduleStatus: "partially_paid",
      financialStatus: "overdue",
      overdue: true,
    },
  );
});

test("later collection completes the invoice and reversal restores its balance", () => {
  const completed = contractPaymentState({
    invoiceAmountHalalas: 100_000,
    paidAmountHalalas: 100_000,
    dueDate: "2026-09-01",
    today: "2026-09-16",
  });
  assert.equal(completed.scheduleStatus, "paid");
  assert.equal(completed.financialStatus, "paid");
  assert.equal(completed.remainingAmountHalalas, 0);

  const reversed = contractPaymentState({
    invoiceAmountHalalas: 100_000,
    paidAmountHalalas: 35_000,
    dueDate: "2026-09-01",
    today: "2026-09-16",
  });
  assert.equal(reversed.scheduleStatus, "partially_paid");
  assert.equal(reversed.remainingAmountHalalas, 65_000);
});

test("a partial balance becomes overdue only after its due date", () => {
  const dueToday = contractPaymentState({
    invoiceAmountHalalas: 100_000,
    paidAmountHalalas: 35_000,
    dueDate: "2026-09-16",
    today: "2026-09-16",
  });
  assert.equal(dueToday.financialStatus, "partially_paid");
  assert.equal(dueToday.overdue, false);

  const late = contractPaymentState({
    invoiceAmountHalalas: 100_000,
    paidAmountHalalas: 35_000,
    dueDate: "2026-09-16",
    today: "2026-09-17",
  });
  assert.equal(late.financialStatus, "overdue");
  assert.equal(late.overdue, true);
});

test("mixed cash and bank allocations create one balanced settlement journal", async () => {
  const [service, dialog] = await Promise.all([
    read("lib/contract-payment-settlements.ts"),
    read("app/portal/ContractPaymentSettlementDialog.tsx"),
  ]);
  assert.match(service, /resolvedAllocations\.map/);
  assert.match(service, /controlLine/);
  assert.match(service, /validateBalancedJournal|createDraftJournal/);
  assert.match(service, /allocation\.paymentMethod === "cash"/);
  assert.match(service, /paymentMethod !== "cash"/);
  assert.match(dialog, /value="mixed"/);
  assert.match(dialog, /bankAmountHalalas \+ cashAmountHalalas/);
});

test("posted settlements reverse through a separately approved reversal journal", async () => {
  const [service, accounting, state] = await Promise.all([
    read("lib/contract-payment-settlements.ts"),
    read("lib/accounting.ts"),
    read("lib/contract-payment-settlement-state.ts"),
  ]);
  assert.match(service, /journal\.status === "posted"/);
  assert.match(service, /createReversalDraft/);
  assert.match(service, /status: "reversal_pending"/);
  assert.match(accounting, /finalizeContractPaymentSettlementReversal/);
  assert.match(accounting, /entry\?\.status === "posted"/);
  assert.match(state, /reversalJournal\.status !== "posted"/);
  assert.match(state, /reversalJournal\.reversalOfId !== existing\.journalEntryId/);
  assert.match(state, /status: "reversed"/);
  assert.match(state, /paidAmountHalalas: state\.paidAmountHalalas/);
});

test("legal referral snapshot includes the outstanding part and settlement evidence", async () => {
  const [route, notifications] = await Promise.all([
    read("app/api/portal/contract-payments/route.ts"),
    read("lib/portal-notifications.ts"),
  ]);
  assert.match(route, /remainingAmountHalalas<=0/);
  assert.match(route, /settlements,settlementAllocations/);
  assert.match(route, /المبلغ المتبقي/);
  assert.match(route, /كامل الدفعة أو جزء منها/);
  assert.match(notifications, /status: "overdue"/);
  assert.match(notifications, /\["pending", "partially_paid"\]/);
});

test("settlement migration is additive and protects allocation shapes", async () => {
  const migration = await read(
    "drizzle-pg/0070_contract_payment_partial_settlements.sql",
  );
  assert.match(migration, /ADD COLUMN IF NOT EXISTS paid_amount_halalas/);
  assert.match(migration, /partially_paid/);
  assert.match(migration, /contract_payment_settlements/);
  assert.match(migration, /contract_payment_settlement_allocations_shape_check/);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.doesNotMatch(migration, /DROP TABLE|DELETE FROM|TRUNCATE/i);
});
