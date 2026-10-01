import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("approved workforce quotation converts to a fully prefilled contract", () => {
  const operations = read("app/portal/OperationsWorkspace.tsx");
  const portal = read("app/portal/PortalDashboard.tsx");
  assert.match(operations, /تحويل إلى عقد/);
  assert.match(operations, /onCreateContract\(quote\.id,\s*"as_is"\)/);
  assert.match(operations, /actualSalaryHalalas/);
  assert.match(operations, /الراتب الفعلي للعامل شهريًا \(اختياري\)/);
  assert.doesNotMatch(operations, />\s*اسم الكفيل\s*</);
  assert.match(
    portal,
    /actualSalary: \(item\.actualSalaryHalalas \|\| 0\) \/ 100/,
  );
  assert.match(portal, /setAccommodationParty\(quote\.accommodationParty\)/);
  assert.match(portal, /setTransportParty\(quote\.transportParty\)/);
});

test("quote salary is internal and schema migration is additive", () => {
  const schema = read("db/schema.ts");
  const migration = read("drizzle-pg/0060_quote_contract_compatibility.sql");
  const api = read("app/api/portal/operations/route.ts");
  assert.match(
    schema,
    /actualSalaryHalalas: integer\("actual_salary_halalas"\)/,
  );
  assert.match(migration, /ADD COLUMN IF NOT EXISTS actual_salary_halalas/);
  assert.match(api, /actualSalaryHalalas/);
});

test("contract editing uses the creation wizard with the saved snapshot and unrestricted step navigation", () => {
  const editor = read("app/portal/ContractFullEditDialog.tsx");
  const wizard = read("app/portal/PortalDashboard.tsx");
  assert.match(editor, /default: module.IssueDocumentModal/);
  assert.match(editor, /ContractWizard editSnapshot=\{snapshot\}/);
  assert.match(editor, /versionNumber:snapshot.contract.versionNumber/);
  assert.match(editor, /method:"PATCH"/);
  assert.match(wizard, /if \(editSnapshot\) \{ setStep\(target\); return; \}/);
  assert.match(wizard, /hydratedEditFields/);
  assert.match(wizard, /editing \? "حفظ جميع التعديلات"/);
});
