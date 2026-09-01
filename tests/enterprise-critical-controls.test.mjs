import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("leave requests exclude Friday and holidays with independent policy and locked approval", () => {
  const route = read("app/api/portal/hr/route.ts");
  assert.match(route, /getUTCDay\(\) !== 5/);
  assert.match(route, /companyHolidays/);
  assert.match(route, /employeeLeavePolicies/);
  assert.match(route, /for update/);
  assert.match(route, /balanceDaysDeducted/);
  assert.match(route, /توجد إجازة معلقة أو معتمدة متداخلة/);
  assert.match(route, /رصيد الإجازة السنوية غير كافٍ/);
  assert.match(route, /cancel-leave/);
});

test("legal evidence, hearings, submissions and settlements have dedicated controlled workflows", () => {
  const attachment = read("app/api/portal/legal-cases/attachments/route.ts"),
    download = read("app/api/portal/legal-cases/attachments/[id]/route.ts"),
    workflows = read("app/api/portal/legal-cases/workflows/route.ts"),
    migration = read(
      "drizzle-pg/0061_enterprise_legal_hr_finance_controls.sql",
    );
  assert.match(attachment, /SHA-256/);
  assert.match(attachment, /legalEvidenceCustody/);
  assert.match(download, /فشل التحقق من سلامة الدليل/);
  assert.match(workflows, /legalHearings/);
  assert.match(workflows, /legalSubmissions/);
  assert.match(workflows, /superseded/);
  assert.match(workflows, /legalSettlements/);
  assert.match(workflows, /اعتماد التسوية من صلاحيات المالك/);
  assert.match(migration, /legal_evidence_custody/);
});

test("finance enterprise controls use posting rules and guard bank imports and period closure", () => {
  const finance = read("app/api/portal/finance/enterprise/route.ts"),
    accounting = read("lib/accounting.ts"),
    migration = read(
      "drizzle-pg/0061_enterprise_legal_hr_finance_controls.sql",
    );
  assert.match(accounting, /resolvePostingRule/);
  assert.match(finance, /import-bank-statement/);
  assert.match(finance, /fingerprint/);
  assert.match(finance, /match-statement/);
  assert.match(finance, /القيد المرحل لا يطابق البنك والاتجاه والمبلغ/);
  assert.match(finance, /لا يمكن إغلاق فترة تحتوي قيودًا غير مرحلة/);
  assert.match(finance, /asset_depreciation/);
  assert.match(finance, /tax-return/);
  assert.match(finance, /financialOperationIssues/);
  assert.match(migration, /bank_statement_lines/);
});

test("payroll uses an actual bank and confirms individual payment only after journal posting", () => {
  const route = read("app/api/portal/hr/route.ts"),
    schema = read("db/schema.ts");
  assert.match(route, /bankAccountId/);
  assert.match(route, /payroll-item-payment/);
  assert.match(route, /payment-item-result/);
  assert.match(route, /journal\?\.status !== "posted"/);
  assert.match(route, /pendingPaymentAmountHalalas/);
  assert.match(schema, /pending_payment_amount_halalas/);
  assert.match(route, /paymentStatus: "awaiting_post"/);
  assert.match(route, /"failed"/);
  assert.match(route, /"excluded"/);
});

test("lawyer users manage all cases while external counsel is assigned from the lawyer registry", () => {
  const route = read("app/api/portal/legal-cases/route.ts"),
    search = read("app/api/portal/search/route.ts"),
    attachment = read(
      "app/api/portal/legal-cases/attachments\/\[id\]\/route.ts",
    );
  assert.match(route, /function isCaseManager/);
  assert.match(route, /functionalRoles\.includes\("lawyer"\)/);
  assert.match(route, /assignedLawyerId/);
  assert.match(route, /legalLawyers\.status, "active"/);
  assert.doesNotMatch(route, /يجب إسناد القضية إلى حساب نشط/);
  assert.match(search, /legalCaseManager/);
  assert.match(search, /"legal_supervisor", "lawyer"/);
  assert.match(attachment, /"legal_supervisor", "lawyer"/);
  assert.match(attachment, /القضية غير مسندة إليك/);
});

test("legal case closure and judgment lifecycle are guarded", () => {
  const route = read("app/api/portal/legal-cases/route.ts"),
    migration = read(
      "drizzle-pg/0061_enterprise_legal_hr_finance_controls.sql",
    );
  assert.match(route, /update-case-status/);
  assert.match(route, /لا يُغلق الملف قبل اكتمال الإجراءات/);
  assert.match(route, /request-judgment-changes/);
  assert.match(route, /إجمالي طلبات السداد يتجاوز قيمة الحكم/);
  assert.match(migration, /changes_requested/);
});

test("employee documents require a stored file and termination is a separated approval workflow", () => {
  const upload = read("app/api/portal/employees/documents/route.ts"),
    ui = read("app/portal/EmployeeProfileWorkspace.tsx"),
    termination = read("app/api/portal/hr/terminations/route.ts");
  assert.match(upload, /file instanceof File/);
  assert.match(upload, /BUCKET\.put/);
  assert.match(ui, /multipart\/form-data/);
  assert.match(ui, /رفع الوثيقة وحفظها/);
  assert.match(termination, /pending_approval/);
  assert.match(termination, /requestedBy\s*===\s*access\.user\.email/);
  assert.match(termination, /complete-clearance/);
  assert.match(termination, /status\s*:\s*"suspended"/);
  assert.match(termination, /employee-termination/);
});

test("payroll exposes frozen payslips and a WPS export", () => {
  const payslip = read("app/api/portal/hr/payroll-items/[id]/payslip/route.ts"),
    wps = read("app/api/portal/hr/payroll-runs/[id]/wps/route.ts"),
    ui = read("app/portal/HrWorkspace.tsx");
  assert.match(payslip, /employeeNameSnapshot/);
  assert.match(payslip, /ibanSnapshot/);
  assert.match(payslip, /generateIssuedPdf/);
  assert.match(wps, /NET_AMOUNT_SAR/);
  assert.match(wps, /يوجد موظف دون آيبان مجمد/);
  assert.match(ui, /ملف حماية الأجور/);
});

test("performance reviews support employee acknowledgement, appeal, and separated resolution", () => {
  const route = read("app/api/portal/people-governance/route.ts"),
    ui = read("app/portal/EmployeeProfileWorkspace.tsx");
  assert.match(route, /acknowledge_performance_review/);
  assert.match(route, /appeal_performance_review/);
  assert.match(route, /resolve_performance_appeal/);
  assert.match(route, /صاحب التقييم فقط/);
  assert.match(route, /فصل المهام يمنع معتمد التقييم/);
  assert.match(ui, /إقرار بالاطلاع/);
  assert.match(ui, /تقديم تظلم/);
});

test("sensitive finance and organizational employee changes require an independent decision", () => {
  const route = read("app/api/portal/hr/route.ts"),
    migration = read("drizzle-pg/0061_enterprise_legal_hr_finance_controls.sql"),
    ui = read("app/portal/HrWorkspace.tsx");
  assert.match(route, /employee-finance-change-requested/);
  assert.match(route, /employee-finance-change-decision/);
  assert.match(route, /employee-organizational-change-decision/);
  assert.match(route, /فصل المهام يمنع مقدم الطلب/);
  assert.match(migration, /employees_manager_fk/);
  assert.match(ui, /ترقية أو تغيير تنظيمي بتاريخ نفاذ/);
  assert.match(ui, /اعتماد التغييرات الحساسة/);
});
