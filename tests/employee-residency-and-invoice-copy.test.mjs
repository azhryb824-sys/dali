import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  contractInvoicePdfCopy,
  invoicePaymentTitleEnglish,
} from "../lib/invoice-pdf-copy.ts";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("employee creation selects one active, unlinked user and separates citizens from residents", async () => {
  const [api, portal, schema, migration] = await Promise.all([
    source("app/api/portal/employees/route.ts"),
    source("app/portal/PortalDashboard.tsx"),
    source("db/schema.ts"),
    source("drizzle-pg/0066_employee_residency_and_invoice_translations.sql"),
  ]);

  assert.match(schema, /residencyType: text\("residency_type", \{ enum: \["citizen", "resident"\] \}\)/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS "residency_type"/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS "title_en"/);
  assert.doesNotMatch(migration, /DROP TABLE|DROP COLUMN|TRUNCATE|DELETE FROM/i);
  assert.match(portal, /user\.status === "active" && !linkedEmployeeEmails\.has\(user\.email\)/);
  assert.match(portal, /اختر مواطنًا أو مقيمًا/);
  assert.match(portal, /employeeResidency === "resident" && \(/);
  assert.match(api, /user\.status !== "active"/);
  assert.match(api, /هذا المستخدم مرتبط بموظف آخر/);
  assert.match(api, /residencyType === "citizen" && !nationalId\.startsWith\("1"\)/);
  assert.match(api, /residencyType === "resident"[\s\S]*?!validDate\(iqamaExpiry\)[\s\S]*?!validDate\(workPermitExpiry\)/);
});

test("employee updates retain server permissions and route sensitive changes through independent approval", async () => {
  const [api, hrApi, portal] = await Promise.all([
    source("app/api/portal/employees/route.ts"),
    source("app/api/portal/hr/route.ts"),
    source("app/portal/PortalDashboard.tsx"),
  ]);

  assert.match(api, /canAccessPortalDepartment\(access, "employees", true\)/);
  assert.match(api, /employeeProfileChanges/);
  assert.match(api, /changeType: "organizational"/);
  assert.match(api, /changeType: "financial"/);
  assert.match(api, /requestedBy: access\.user\.email/);
  assert.match(api, /status: "pending"/);
  assert.match(api, /linked && linked\.id !== id/);
  assert.doesNotMatch(hrApi.slice(hrApi.indexOf('if (action === "employee-profile")'), hrApi.indexOf('if (action === "document")')), /managerId,/);
  assert.match(portal, /activeUsers = users\.filter\(\(user\) => user\.status === "active" && !linkedToOtherEmployee\.has\(user\.email\)\)/);
  assert.match(portal, /تُرسل تلقائيًا لاعتماد مستخدم آخر/);
});

test("the legacy HR link form filters users for its selected employee without affecting movement forms", async () => {
  const workspace = await source("app/portal/HrWorkspace.tsx");
  const movementForm = workspace.slice(
    workspace.indexOf("<form onSubmit={submitMovement}>"),
    workspace.indexOf("<summary>إنشاء مسير رواتب شهري</summary>"),
  );
  const profileForm = workspace.slice(
    workspace.indexOf('submitExtended(event, "employee-profile")'),
    workspace.indexOf("<summary>ترقية أو تغيير تنظيمي بتاريخ نفاذ</summary>"),
  );

  assert.doesNotMatch(movementForm, /profileEmployeeId|profileUserEmail/);
  assert.match(profileForm, /value=\{profileEmployeeId\}/);
  assert.match(profileForm, /setProfileUserEmail\(employee\?\.portalUserEmail \|\| ""\)/);
  assert.match(profileForm, /String\(employee\.id\) !== profileEmployeeId/);
});

test("resident-only expiries do not create false citizen compliance alerts", async () => {
  const [portal, notifications, government] = await Promise.all([
    source("app/portal/PortalDashboard.tsx"),
    source("lib/portal-notifications.ts"),
    source("app/api/portal/government/route.ts"),
  ]);

  assert.match(portal, /item\.residencyType === "resident" && daysUntil\(item\.iqamaExpiry\)/);
  assert.match(portal, /item\.residencyType === "resident" && daysUntil\(item\.workPermitExpiry\)/);
  assert.match(notifications, /employee\.residencyType === "resident"/);
  assert.match(government, /employee\.residencyType==="resident"/);
});

test("official letter PDFs always render the subject even without a client VAT number", async () => {
  const generator = await source("lib/pdf-generator.ts");
  assert.match(generator, /else composer\.field\(input\.documentType === "official_letter" \? "موضوع الخطاب" : "عنوان المستند", input\.title\)/);
  assert.match(generator, /input\.documentType === "official_letter" \? "Letter text" : input\.documentType === "invoice" \? "Description" : "Scope"/);
});

test("English invoice copy is explicit and Arabic fallback text uses an Arabic-capable font", async () => {
  const generator = await source("lib/pdf-generator.ts");
  const copy = contractInvoicePdfCopy({
    purchaser: false,
    paymentTitle: "الدفعة الثانية",
    installmentNumber: 2,
    contractReference: "CON-2026-009",
    absenceDeductionHalalas: 12550,
  });

  assert.equal(copy.titleEn, "Invoice - Second installment");
  assert.equal(copy.detailsEn, "Manpower absence deduction before VAT: 125.50 SAR.\nInvoice for installment No. 2 (Second installment) under contract CON-2026-009.");
  assert.doesNotMatch(copy.detailsEn, /[\u0600-\u06ff]/);
  assert.equal(invoicePaymentTitleEnglish("استحقاق رواتب شهر 2026-09", null, 4), "Salary installment for 2026-09");
  assert.equal(invoicePaymentTitleEnglish("دفعة مخصصة", null, 4), "Installment 4");
  assert.match(generator, /const hasArabic = \/\[\\u0600-\\u06ff\]\//);
  assert.match(generator, /const valueFont = hasArabic \? resources\.regular : resources\.latinRegular/);
  assert.match(generator, /input\.detailsEn \|\| englishText\(input\.details\)/);
  assert.match(generator, /input\.documentType === "invoice" \? "Invoice Details"/);
});

test("human-reviewed employee and invoice terminology overrides generated translations", async () => {
  const [i18n, catalog, templates] = await Promise.all([
    source("lib/i18n.ts"),
    source("lib/i18n-employee-finance-catalog.ts"),
    source("lib/i18n-generated-templates.ts"),
  ]);

  assert.match(i18n, /Object\.assign\(uiTranslations, employeeFinanceUiTranslations\)/);
  assert.match(catalog, /"فاتورة": \{ en: "Invoice", bn: "চালান" \}/);
  assert.match(catalog, /"مقيم غير سعودي": \{ en: "Non-Saudi resident"/);
  assert.match(templates, /"en": "Invoice for installment No\. \{\{0\}\}/);
});
