import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(path, "utf8");

test("purchaser contract payments require an active bank and create a settlement journal", async () => {
  const route = await read("app/api/portal/contract-payments/route.ts");
  assert.match(route, /db\.select\(\)\.from\(bankAccounts\).*status,"active"/s);
  assert.match(route, /contract\.contractDirection!=="dali_purchaser"/);
  assert.match(route, /financial\.postingStatus!=="posted"/);
  assert.match(route, /bankAccountId=positiveId\(body\.bankAccountId\)/);
  assert.match(route, /sourceType:"contract-payment-settlement"/);
  assert.match(route, /accountId:payable\.id,debitHalalas:financial\.amountHalalas/);
  assert.match(route, /accountId:creditAccountId,bankAccountId:bank\?\.id\|\|null,creditHalalas:financial\.amountHalalas/);
  assert.match(route, /\["bank_transfer","cash","cheque"\]\.includes\(paymentMethod\)/);
  assert.match(route, /paymentMethod,bankAccountId:bank\?\.id\|\|null/);
});

test("purchaser settlement is exposed through a bank-selection system form", async () => {
  const workspace = await read("app/portal/ContractBillingWorkspace.tsx");
  assert.match(workspace, /contractDirection:"dali_supplier"\|"dali_purchaser"/);
  assert.match(workspace, /setSettlingPayment\(payment\)/);
  assert.match(workspace, /name="bankAccountId"/);
  assert.match(workspace, /data\.banks\.map\(bank=>/);
  assert.match(workspace, /تسجيل السداد وإنشاء القيد/);
  assert.doesNotMatch(workspace, /patch\(payment,"mark-paid"\)/);
});

test("bank settlement reference is additive and migration-backed", async () => {
  const [schema, migration] = await Promise.all([
    read("db/schema.ts"),
    read("drizzle-pg/0053_supplier_contract_bank_settlements.sql"),
  ]);
  assert.match(schema, /paymentJournalEntryId:\s*integer\("payment_journal_entry_id"\)/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS payment_journal_entry_id integer/i);
  assert.match(migration, /REFERENCES\s+public\.journal_entries\(id\)\s+ON DELETE RESTRICT/i);
  assert.doesNotMatch(migration, /DROP TABLE|DELETE FROM|TRUNCATE/i);
});
