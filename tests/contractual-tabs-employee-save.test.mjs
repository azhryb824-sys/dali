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
  assert.match(operations, /onCreateQuotation\?\(\)/);
  assert.match(dashboard, /onCreateQuotation=\{\(\)=>openIssueDocument\("quotation"\)\}/);
  assert.match(dashboard, /issueReturnView === "contractual-documents"/);
  assert.match(operations, />اعتماد عرض السعر<\\/button>/);
  assert.match(operations, /tab === "contracts".*<ContractBillingWorkspace\\/>/s);
  const billing = await read("app/portal/ContractBillingWorkspace.tsx");
  assert.match(billing, />اعتماد العقد<\\/button>/);
  assert.match(workspace, /activeTab==="letters".*letter\.status==="draft".*>اعتماد<\\/button>/s);
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