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
  assert.match(workspace, /"contracts"\s*\|\s*"quotes"\s*\|\s*"letters"/);
  assert.match(workspace, />\s*العقود\s*<\/button>/);
  assert.match(workspace, />\s*عروض الأسعار\s*<\/button>/);
  assert.match(workspace, />\s*الخطابات\s*<\/button>/);
  assert.match(workspace, /onCreateQuotation=\{onCreateQuotation\}/);
  assert.match(operations, /onClick=\{onCreateQuotation\}[\s\S]*?>\s*إنشاء عرض سعر\s*<\/button>/);
  assert.match(dashboard, /onCreateQuotation=\{\(\)\s*=>\s*openIssueDocument\("quotation"\)\}/);
  assert.match(dashboard, /issueReturnView === "contractual-documents"/);
  assert.match(operations, /quote-approve/);
  assert.match(operations, /اعتماد عرض السعر/);
  assert.match(operations, /tab === "contracts"[\s\S]*?<ContractBillingWorkspace\s*\/>/);
  const billing = await read("app/portal/ContractBillingWorkspace.tsx");
  assert.match(billing, /contract-card-approve/);
  assert.match(billing, /اعتماد العقد/);
  assert.match(workspace, /activeTab\s*===\s*"letters"/);
  assert.match(workspace, /letter\.status\s*===\s*"draft"/);
  assert.match(workspace, /اعتماد الخطاب/);
  assert.match(workspace, /letter-record-actions/);
  assert.match(workspace, /contracts\.map\(\(item\)\s*=>\s*item\.id\)\.join\(","\)/);
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
test("Dali-sponsored purchaser professions can retain an explicit Ajir status", async () => {
  const migration = await read("drizzle-pg/0052_contract_profession_ajir_consistency.sql");
  assert.match(migration, /DROP CONSTRAINT IF EXISTS contract_professions_sponsorship_consistency_check/);
  assert.match(migration, /sponsorship_type = 'dali'[\s\S]*ajir_contract_status IN \('not_applicable', 'with_ajir', 'without_ajir'\)/);
  assert.match(migration, /sponsorship_type = 'other'[\s\S]*length\(trim\(sponsor_name\)\) >= 2/);
  assert.doesNotMatch(migration, /DELETE FROM|DROP TABLE|DROP COLUMN/i);
});
