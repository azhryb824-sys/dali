import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(path, "utf8");

test("purchaser contract payments require an active bank and create a settlement journal", async () => {
  const [route, settlement] = await Promise.all([
    read("app/api/portal/contract-payments/route.ts"),
    read("lib/contract-payment-settlements.ts"),
  ]);
  assert.match(route, /action==="mark-paid"\|\|action==="record-settlement"/);
  assert.match(settlement, /eq\(bankAccounts\.status, "active"\)/);
  assert.match(settlement, /financial\.postingStatus !== "posted"/);
  assert.match(settlement, /contract\.contractDirection === "dali_purchaser"/);
  assert.match(settlement, /sourceType: "contract-payment-settlement"/);
  assert.match(settlement, /"2100" : "1300"/);
  assert.match(settlement, /direction === "supplier_payment"[\s\S]*debitHalalas/);
  assert.match(settlement, /allocation\.paymentMethod === "cash"/);
  assert.match(settlement, /"bank_transfer", "cash", "cheque"/);
});

test("purchaser settlement is exposed through a bank-selection system form", async () => {
  const [workspace, dialog] = await Promise.all([
    read("app/portal/ContractBillingWorkspace.tsx"),
    read("app/portal/ContractPaymentSettlementDialog.tsx"),
  ]);
  assert.match(workspace, /contractDirection:\s*"dali_supplier"\s*\|\s*"dali_purchaser"/);
  assert.match(workspace, /setSettlingPayment\(payment\)/);
  assert.match(dialog, /name="bankAccountId"/);
  assert.match(dialog, /banks\.map\(\(bank\)\s*=>/);
  assert.match(dialog, /تحويل بنكي \+ نقدي/);
  assert.match(dialog, /تسجيل السداد وإنشاء القيد/);
  assert.doesNotMatch(workspace, /patch\(payment,"mark-paid"\)/);
});

test("bank settlement reference is additive and migration-backed", async () => {
  const [schema, migration, partialMigration] = await Promise.all([
    read("db/schema.ts"),
    read("drizzle-pg/0053_supplier_contract_bank_settlements.sql"),
    read("drizzle-pg/0070_contract_payment_partial_settlements.sql"),
  ]);
  assert.match(schema, /paymentJournalEntryId:\s*integer\("payment_journal_entry_id"\)/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS payment_journal_entry_id integer/i);
  assert.match(migration, /REFERENCES\s+public\.journal_entries\(id\)\s+ON DELETE RESTRICT/i);
  assert.doesNotMatch(migration, /DROP TABLE|DELETE FROM|TRUNCATE/i);
  assert.match(schema, /contractPaymentSettlements/);
  assert.match(partialMigration, /contract_payment_settlement_allocations/);
  assert.doesNotMatch(partialMigration, /DROP TABLE|DELETE FROM|TRUNCATE/i);
});
