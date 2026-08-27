import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("treasury and banks expose posted balances and balanced liquidity transfers", async () => {
  const [route, workspace] = await Promise.all([
    read("app/api/portal/accounting/route.ts"),
    read("app/portal/AccountingWorkspace.tsx"),
  ]);
  assert.match(route, /transfer-liquidity/);
  assert.match(route, /bank_to_cash/);
  assert.match(route, /cash_to_bank/);
  assert.match(route, /chartOfAccounts\.code, "1100"/);
  assert.match(route, /availableHalalas/);
  assert.match(workspace, /تحويل بين الخزينة والبنك/);
  assert.match(workspace, /رصيد الخزينة المرحل/);
  assert.match(workspace, /إجمالي أرصدة البنوك/);
});

test("bank-funded financial methods always require and post to a bank", async () => {
  const [records, posting] = await Promise.all([
    read("app/api/portal/records/route.ts"),
    read("app/api/portal/finance/posting/route.ts"),
  ]);
  for (const method of ["bank_transfer", "cheque", "payroll_file"]) {
    assert.match(records, new RegExp(method));
    assert.match(posting, new RegExp(method));
  }
  assert.match(records, /bankFunded/);
});
