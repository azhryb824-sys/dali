import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("contractual documents use dedicated tabs and the canonical quotation modal", async () => {
  const [workspace, dashboard, operations] = await Promise.all([
    read("app/portal/ContractualDocumentsWorkspace.tsx"),
    read("app/portal/PortalDashboard.tsx"),
    read("app/portal/OperationsWorkspace.tsx"),
  ]);
  assert.match(workspace, /"contracts"\|"quotes"\|"letters"/);
  assert.match(workspace, />العقود<\/button>/);
  assert.match(workspace, />عروض الأسعار<\/button>/);
  assert.match(workspace, />الخطابات<\/button>/);
  assert.match(workspace, /onCreateQuotation=\{onCreateQuotation\}/);
  assert.match(operations, /onClick=\{onCreateQuotation\}>إنشاء عرض سعر/);
  assert.match(dashboard, /onCreateQuotation=\{\(\)\s*=>\s*openIssueDocument\("quotation"\)\}/);
  assert.match(dashboard, /issueReturnView === "contractual-documents"/);
  assert.match(operations, /quote-approve/);
  assert.match(operations, /اعتماد عرض السعر/);
  assert.match(operations, /tab === "contracts".*<ContractBillingWorkspace\/>/s);
  const billing = await read("app/portal/ContractBillingWorkspace.tsx");
  assert.match(billing, /contract-card-approve/);
  assert.match(billing, /اعتماد العقد/);
  assert.match(workspace, /activeTab==="letters"/);
  assert.match(workspace, /letter\.status==="draft"/);
  assert.match(workspace, /اعتماد/);
});

test("employee creation filters linked accounts and saves employee documents atomically", async () => {
  const [dashboard, route] = await Promise.all([
    read("app/portal/PortalDashboard.tsx"),
    read("app/api/portal/employees/route.ts"),
  ]);
  assert.match(dashboard, /linkedEmployeeEmails=\{new Set\(employees\.map/);
  assert.match(dashboard, /!linkedEmployeeEmails\.has\(user\.email\)/);
  assert.match(route, /latinDigits/);
  assert.match(route, /db\.transaction\(async \(tx\)/);
  assert.match(route, /tx\.insert\(employees\)/);
  assert.match(route, /tx\.insert\(employeeDocuments\)/);
});

test("worker creation no longer requests or requires a work contract", async () => {
  const [dashboard, route] = await Promise.all([
    read("app/portal/PortalDashboard.tsx"),
    read("app/api/portal/workers/route.ts"),
  ]);
  assert.doesNotMatch(dashboard, /workContract:/);
  assert.doesNotMatch(route, /form\.get\("workContract"\)/);
  assert.doesNotMatch(route, /عقد العمل إلزامي للعامل/);
});
test("contract wizard validates only the active step before purchaser payment tab", async () => {
  const dashboard = await read("app/portal/PortalDashboard.tsx");
  assert.match(dashboard, /field\.closest\("\.issue-form-step"\)/);
  assert.match(dashboard, /!wizardStep\.classList\.contains\("visible"\)/);
  assert.match(dashboard, /field\.closest\("\.contract-profession-pricing"\) && step !== 2/);
  assert.doesNotMatch(dashboard, /field\.offsetParent !== null/);
  assert.match(dashboard, /دالي مشتري العمالة — عقد تكلفة مع مورّد/);
  assert.match(dashboard, /اختيار الأسماء اختياري/);
});