import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("contract approval uses an in-page stamp dialog instead of prompt", async () => {
  const [billing, dashboard, dialog] = await Promise.all([
    read("app/portal/ContractBillingWorkspace.tsx"),
    read("app/portal/PortalDashboard.tsx"),
    read("app/portal/ContractApprovalStampDialog.tsx"),
  ]);
  const dashboardApproval = dashboard.slice(
    dashboard.indexOf("async function updateContractStatus"),
    dashboard.indexOf("async function recordContractAbsence"),
  );

  assert.doesNotMatch(billing, /window\.prompt\s*\(/);
  assert.doesNotMatch(dashboardApproval, /window\.prompt\s*\(/);
  assert.match(billing, /<ContractApprovalStampDialog/);
  assert.match(dashboard, /<ContractApprovalStampDialog/);
  assert.match(dialog, /role="dialog"/);
  assert.match(dialog, /document-stamps\?id=\$\{stamp\.id\}/);
});

test("contract approval remains server-authorized and requires an active stamp", async () => {
  const [statusRoute, listingRoute, dashboard] = await Promise.all([
    read("app/api/portal/contracts/[id]/status/route.ts"),
    read("app/api/portal/contract-payments/route.ts"),
    read("app/portal/PortalDashboard.tsx"),
  ]);

  assert.match(statusRoute, /status === "approved" && !canApprove/);
  assert.match(statusRoute, /role === "system_owner" \|\| role === "system_admin"/);
  assert.match(statusRoute, /eq\(documentStamps\.active, true\)/);
  assert.match(listingRoute, /canApproveContracts:owner\(access\)/);
  assert.match(dashboard, /canApprove=\{isRoot\}/);
});

test("clipboard restrictions cannot report a completed approval as failed", async () => {
  const [billing, dashboard] = await Promise.all([
    read("app/portal/ContractBillingWorkspace.tsx"),
    read("app/portal/PortalDashboard.tsx"),
  ]);

  assert.match(billing, /let copied = false;[\s\S]*?catch \{[\s\S]*?تم اعتماد العقد/);
  assert.match(dashboard, /let copied = false;[\s\S]*?catch \{[\s\S]*?تم اعتماد العقد/);
});
