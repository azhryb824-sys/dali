import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("contract cancellation updates both contract lists without reloading the page", async () => {
  const [dashboard, billing, dialog] = await Promise.all([
    read("app/portal/PortalDashboard.tsx"),
    read("app/portal/ContractBillingWorkspace.tsx"),
    read("app/portal/ContractCancellationDialog.tsx"),
  ]);
  assert.match(dashboard, /dali-contract-updated/);
  assert.doesNotMatch(
    dashboard,
    /setContracts[\s\S]{0,300}router\.refresh\(\)/,
  );
  assert.match(billing, /addEventListener\("dali-contract-updated"/);
  assert.match(billing, /contracts\.map\(\(item\)\s*=>\s*item\.id\s*===\s*contract\.id/);
  assert.match(billing, /setCancellingContract\(contract\)/);
  assert.match(dashboard, /ContractCancellationDialog/);
  assert.match(dialog, /سبب .*إلغاء.* العقد/);
  assert.match(dialog, /late_payment/);
  assert.match(dialog, /minLength=\{10\}/);
  assert.match(dialog, /role="dialog"/);
  assert.doesNotMatch(billing, /window\.prompt\(\s*"اكتب سبب الإلغاء/);
});

test("cancellation is atomic and never automatically reverses unrelated historical finance", async () => {
  const [route, service] = await Promise.all([read("app/api/portal/contracts/[id]/status/route.ts"), read("lib/contract-cancellation.ts")]);
  assert.match(route, /applyContractCancellation\(tx/);
  assert.doesNotMatch(service, /delete\(financialRecords\)|update\(financialRecords\)|createReversalDraft/);
  assert.match(service, /cancellationPaymentDecision/);
  assert.match(service, /cancellationOriginalAmountHalalas/);
});
