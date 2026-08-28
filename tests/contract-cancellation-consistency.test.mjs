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
  assert.match(billing, /contracts\.map\(item=>item\.id===contract\.id/);
  assert.match(billing, /setCancellingContract\(contract\)/);
  assert.match(dashboard, /ContractCancellationDialog/);
  assert.match(dialog, /سبب .*إلغاء.* العقد/);
  assert.match(dialog, /late_payment/);
  assert.match(dialog, /minLength=\{10\}/);
  assert.match(dialog, /role="dialog"/);
  assert.doesNotMatch(billing, /window\.prompt\(\s*"اكتب سبب الإلغاء/);
});

test("cancellation voids unposted journals and creates auditable reversals for posted entries", async () => {
  const [statusRoute, accounting] = await Promise.all([
    read("app/api/portal/contracts/[id]/status/route.ts"),
    read("lib/accounting.ts"),
  ]);
  assert.match(
    statusRoute,
    /status === "cancelled" && reasonCode !== "late_payment"/,
  );
  assert.match(
    statusRoute,
    /inArray\(journalEntries\.status, \["draft", "approved"\]\)/,
  );
  assert.match(statusRoute, /createReversalDraft\(journal\.id/);
  assert.match(statusRoute, /reversalDraftIds/);
  assert.match(accounting, /reversalOfId: entryId/);
  assert.match(accounting, /debitHalalas: line\.creditHalalas/);
  assert.match(accounting, /creditHalalas: line\.debitHalalas/);
  assert.match(accounting, /posted\.reversalOfId/);
  assert.match(accounting, /postingStatus: "reversed"/);
});

test("late-payment cancellation preserves the receivable and paid schedules remain historical", async () => {
  const statusRoute = await read(
    "app/api/portal/contracts/[id]/status/route.ts",
  );
  assert.match(statusRoute, /reasonCode !== "late_payment"/);
  assert.doesNotMatch(
    statusRoute,
    /inArray\(contractPaymentSchedules\.status, \[[^\]]*"paid"/,
  );
});
