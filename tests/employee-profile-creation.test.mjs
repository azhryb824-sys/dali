import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("employee creation is one integrated multipart workflow", () => {
  const api = read("app/api/portal/employees/route.ts");
  const portal = read("app/portal/PortalDashboard.tsx");
  for (const token of ["portalUserEmail", "iqamaExpiry", "iqamaDocument", "employmentContract", "employment_contract", "housingAllowanceHalalas", "transportAllowanceHalalas", "otherAllowanceHalalas", "employeeDocuments", "employee-profile-created"]) assert.match(api, new RegExp(token));
  assert.match(api, /هذا المستخدم مرتبط بموظف آخر/);
  assert.match(api, /BUCKET\.delete/);
  assert.match(portal, /fetch\("\/api\/portal\/employees"/);
  assert.match(portal, /صورة شخصية — اختيارية/);
  assert.match(portal, /صورة الإقامة — إلزامية/);
  assert.match(portal, /عقد العمل — إلزامي ويُحفظ في ملف الموظف/);
  assert.match(portal, /اسم البنك — تلقائي/);
});

test("Saudi IBAN remains formatted, validated with MOD-97 and resolves the bank", async () => {
  const source = read("lib/saudi-banks.ts");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
  const iban = "SA0380000000608010167519";
  assert.equal(module.isValidSaudiIban(iban), true);
  assert.equal(module.bankNameFromSaudiIban(iban), "مصرف الراجحي");
  assert.equal(module.formatSaudiIban(iban), "SA03 8000 0000 6080 1016 7519");
  assert.equal(module.formatSaudiIban(""), "SA");
  assert.equal(module.isValidSaudiIban("SA00 0000 0000 0000 0000 0000"), false);
});

test("employee payroll incorporates all persisted allowances", () => {
  const hr = read("app/api/portal/hr/route.ts");
  assert.match(hr, /employee\.housingAllowanceHalalas \+ employee\.transportAllowanceHalalas \+ employee\.otherAllowanceHalalas/);
  assert.match(hr, /baseSalaryHalalas: employee\.baseSalaryHalalas, allowancesHalalas: allowances/);
  assert.match(hr, /createDraftJournal/);
});

test("notification popover closes outside and with Escape while preserving inside clicks", () => {
  const portal = read("app/portal/PortalDashboard.tsx");
  assert.match(portal, /notificationShellRef = useRef<HTMLDivElement>/);
  assert.match(portal, /!notificationShellRef\.current\?\.contains\(target\)/);
  assert.match(portal, /document\.addEventListener\("pointerdown", closeOnOutsidePointer\)/);
  assert.match(portal, /event\.key === "Escape"/);
  assert.match(portal, /className="notification-shell" ref=\{notificationShellRef\}/);
});

test("employee sponsorship and government renewals stay integrated and auditable", () => {
  const schema = read("db/schema.ts");
  const migration = read("drizzle-pg/0038_employee_sponsorship_government_compliance.sql");
  const api = read("app/api/portal/employees/route.ts");
  const governmentApi = read("app/api/portal/government/route.ts");
  const governmentUi = read("app/portal/GovernmentAffairsWorkspace.tsx");
  const notifications = read("lib/portal-notifications.ts");
  const portal = read("app/portal/PortalDashboard.tsx");
  for (const token of ["sponsorshipType", "sponsorName", "iqamaExpiry", "workPermitExpiry", "contractEndDate", "archivedAt"]) assert.match(schema, new RegExp(token));
  assert.match(migration, /employees_sponsor_consistency_check/);
  assert.match(api, /employee-compliance-updated/);
  assert.match(api, /حذف آمن مع حفظ التاريخ المالي والوظيفي/);
  assert.match(governmentApi, /renewalItems/);
  assert.match(governmentApi, /https:\/\/muqeem\.sa\//);
  assert.match(governmentApi, /https:\/\/www\.qiwa\.sa\//);
  assert.match(governmentUi, /أقل من 29 يومًا/);
  assert.match(notifications, /days >= 29/);
  assert.match(notifications, /employee-\$\{expiry\.kind\}-expiry/);
  assert.match(portal, /employeeComplianceAlerts/);
  assert.match(portal, /employee-compliance-editor/);
});
