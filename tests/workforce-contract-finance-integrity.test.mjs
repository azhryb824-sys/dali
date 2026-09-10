import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  absenceRangesOverlap,
  countChargeableAbsenceDays,
  isValidIsoDate,
  workerMonthlySalaryHalalas,
} from "../lib/workforce-finance-integrity.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("valid ISO calendar dates are accepted", () => assert.equal(isValidIsoDate("2028-02-29"), true));
test("impossible ISO calendar dates are rejected", () => assert.equal(isValidIsoDate("2027-02-29"), false));
test("non-ISO date text is rejected", () => assert.equal(isValidIsoDate("29/02/2028"), false));
test("one chargeable weekday counts as one day", () => assert.equal(countChargeableAbsenceDays("2026-09-06", "2026-09-06"), 1));
test("Friday is excluded from absence deductions", () => assert.equal(countChargeableAbsenceDays("2026-09-04", "2026-09-04"), 0));
test("a range crossing Friday excludes Friday only", () => assert.equal(countChargeableAbsenceDays("2026-09-03", "2026-09-05"), 2));
test("an inverted absence range produces no chargeable days", () => assert.equal(countChargeableAbsenceDays("2026-09-05", "2026-09-03"), 0));
test("overlapping single-day absence ranges are detected", () => assert.equal(absenceRangesOverlap("2026-09-03", null, "2026-09-03", null), true));
test("touching inclusive absence ranges overlap", () => assert.equal(absenceRangesOverlap("2026-09-01", "2026-09-03", "2026-09-03", "2026-09-05"), true));
test("separate absence ranges do not overlap", () => assert.equal(absenceRangesOverlap("2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04"), false));
test("worker profile salary overrides profession fallback", () => assert.equal(workerMonthlySalaryHalalas(225000, 200000), 225000));
test("profession salary is only a fallback", () => assert.equal(workerMonthlySalaryHalalas(0, 200000), 200000));

test("assignment API requires contract and workforce write permissions", () => {
  const route = read("app/api/portal/contracts/[id]/workers/route.ts");
  assert.match(route, /hasPortalPermission\(access, "contracts", "write"\)/);
  assert.match(route, /hasPortalPermission\(access, "workforce", "write"\)/);
});

test("assignment and release are atomic and row locked", () => {
  const route = read("app/api/portal/contracts/[id]/workers/route.ts");
  assert.match(route, /db\.transaction/);
  assert.match(route, /for update/);
  assert.match(route, /clientId: contract\.clientId/);
  assert.match(route, /clientId: null/);
  assert.match(route, /WORKER_COVERING_ABSENCE/);
});

test("completed assignment periods remain historical", () => {
  const schema = read("db/schema.ts");
  const migration = read("drizzle-pg/0067_worker_contract_finance_integrity.sql");
  assert.match(schema, /where\(sql`\$\{table\.status\} in \('planned','active'\)`\)/);
  assert.match(migration, /WHERE status IN \('planned','active'\)/);
  assert.match(migration, /PROFESSION_CONTRACT_MISMATCH/);
});

test("contract activation moves planned workers inside the status transaction", () => {
  const route = read("app/api/portal/contracts/[id]/status/route.ts");
  assert.match(route, /plannedAssignments\.length && !\(await hasPortalPermission\(access, "workforce", "write"\)\)/);
  assert.match(route, /status === "active" && plannedAssignments\.length/);
  assert.match(route, /activatedAssignment/);
  assert.match(route, /assignmentStartDate: now\.slice\(0, 10\)/);
});

test("ending lifecycle states release worker links", () => {
  const route = read("app/api/portal/contracts/[id]/status/route.ts");
  assert.match(route, /\["cancelled", "terminated", "expired", "superseded"\]\.includes\(status\)/);
  assert.match(route, /clientId: null/);
});

test("workforce supervisor cannot create financial absence deductions", () => {
  const route = read("app/api/portal/contracts/[id]/attendance/route.ts");
  assert.match(route, /canRecordAbsence/);
  assert.doesNotMatch(route, /workforce_operations_manager/);
  assert.doesNotMatch(route, /functionalRoles\.some\([^\n]*workforce_supervisor/);
});

test("absence route rejects future and overlapping periods", () => {
  const route = read("app/api/portal/contracts/[id]/attendance/route.ts");
  assert.match(route, /لا يمكن تسجيل غياب بتاريخ مستقبلي/);
  assert.match(route, /OVERLAPPING_ABSENCE/);
  assert.match(route, /REPLACEMENT_OVERLAP/);
});

test("late absence entry uses the worker assignment interval, including released history", () => {
  const route = read("app/api/portal/contracts/[id]/attendance/route.ts");
  assert.match(route, /inArray\(contractWorkerAssignments\.status, \["active", "released"\]\)/);
  assert.match(route, /releasedAt[\s\S]*absenceEndDate/);
});

test("absence updates lock and optimistically guard the payment", () => {
  const route = read("app/api/portal/contracts/[id]/attendance/route.ts");
  assert.match(route, /contract_payment_schedules[\s\S]*for update/);
  assert.match(route, /eq\(contractPaymentSchedules\.absenceDeductionHalalas, payment\.absenceDeductionHalalas\)/);
  assert.match(route, /isNull\(contractPaymentSchedules\.invoiceDocumentId\)/);
});

test("replacement coverage removes only the client deduction", () => {
  const route = read("app/api/portal/contracts/[id]/attendance/route.ts");
  assert.match(route, /const deductionHalalas = dailyRateHalalas \* absentCount/);
  assert.match(route, /const clientDeductionHalalas = replacementWorkerId \? 0 : clientDailyRateHalalas \* absentCount/);
});

test("invoice records have a reverse payment schedule link", () => {
  for (const path of ["lib/contract-payment-invoicing.ts", "app/api/portal/contract-payments/route.ts"]) {
    assert.match(read(path), /contractPaymentScheduleId:payment\.id/);
  }
});

test("invoice issuance rejects a stale absence deduction snapshot", () => {
  for (const path of ["lib/contract-payment-invoicing.ts", "app/api/portal/contract-payments/route.ts"]) {
    const source = read(path);
    assert.match(source, /eq\(contractPaymentSchedules\.absenceDeductionHalalas,absenceDeductionHalalas\)/);
    assert.match(source, /isNull\(contractPaymentSchedules\.financialRecordId\)/);
  }
});

test("audit reconciles client deductions rather than worker deductions", () => {
  const audit = read("scripts/audit-workforce-absence-finance.mjs");
  assert.match(audit, /SUM\(a\.client_deduction_halalas\)/);
  assert.match(audit, /f\.contract_payment_schedule_id IS DISTINCT FROM p\.id/);
  assert.match(audit, /capacityOverruns/);
  assert.match(audit, /replacementAssignmentOverlaps/);
  assert.match(audit, /invalidReverseInvoiceLinks/);
  assert.match(audit, /unlinkedContractInvoices/);
});

test("contract invoices cannot bypass absence-aware payment invoicing", () => {
  const records = read("app/api/portal/records/route.ts");
  const documents = read("app/api/portal/documents/generate/route.ts");
  const dashboard = read("app/portal/PortalDashboard.tsx");
  assert.match(records, /تُصدر فاتورة العمالة من دفعة العقد/);
  assert.match(documents, /تُصدر فاتورة العقد من جدول دفعات العقد/);
  assert.doesNotMatch(dashboard, /<option value="workforce_invoice">/);
});

test("migration preserves legacy invoice deductions and protects replacement workers", () => {
  const migration = read("drizzle-pg/0067_worker_contract_finance_integrity.sql");
  assert.match(migration, /client_daily_rate_halalas = daily_rate_halalas/);
  assert.match(migration, /contract_worker_absences_replacement_worker_fk/);
  assert.match(migration, /WORKER_COVERING_ABSENCE/);
  assert.match(migration, /ABSENCE_REPLACEMENT_ASSIGNMENT_OVERLAP/);
});

test("generic record API cannot forge worker assignment state", () => {
  const route = read("app/api/portal/records/route.ts");
  assert.match(route, /payload\.entity === "workforce"/);
  assert.match(route, /لا يمكن تغييرها من مسار السجلات العام/);
});

test("worker status changes verify the actual active assignment", () => {
  const route = read("app/api/portal/workers/route.ts");
  assert.match(route, /const \[activeAssignment\]/);
  assert.match(route, /db\.transaction/);
  assert.match(route, /workers where id = \$\{id\} for update/);
  assert.match(route, /current\.status === "assigned" \|\| activeAssignment/);
  assert.match(route, /clientId: null/);
});

test("worker finance links can only target the worker active contract", () => {
  const route = read("app/api/portal/records/route.ts");
  assert.match(route, /لا يمكن ربط حركة العامل بعقد غير مسند إليه فعليًا/);
  assert.match(route, /workerMonthlySalaryHalalas/);
  assert.match(route, /workforce_contracts where id = \$\{contractId\} for update/);
  assert.match(route, /WORKER_FINANCE_OUTSIDE_ASSIGNMENT/);
});

test("financial approval and payment remain separately authorized", () => {
  const route = read("app/api/portal/records/route.ts");
  assert.match(route, /hasPortalPermission\(access, "finance", "approve"\)/);
  assert.match(route, /hasPortalPermission\(access, "finance", "pay"\)/);
});

test("dashboard only offers salary workers and contracts with active assignments", () => {
  const dashboard = read("app/portal/PortalDashboard.tsx");
  assert.match(dashboard, /salaryWorkerIds/);
  assert.match(dashboard, /assignedContractIds/);
  assert.match(dashboard, /monthlySalaryHalalas \/ 100/);
});

test("absence history supports two-step voiding without prompt dialogs", () => {
  const dashboard = read("app/portal/PortalDashboard.tsx");
  assert.match(dashboard, /pendingVoidAbsenceId/);
  assert.match(dashboard, /onVoidAbsence/);
  assert.doesNotMatch(dashboard, /prompt\([^\n]*غياب/);
});

test("absence finance values are redacted without finance permission", () => {
  const route = read("app/api/portal/contracts/[id]/attendance/route.ts");
  assert.match(route, /canViewFinancialImpact/);
  assert.match(route, /clientDeductionHalalas: null/);
});

test("worker salaries are not serialized to users without finance read permission", () => {
  const page = read("app/portal/page.tsx");
  assert.match(page, /hasPortalPermission\(access, "finance", "read"\)/);
  assert.match(page, /permissionFilteredWorkerRecords/);
  assert.match(page, /monthlySalaryHalalas: 0/);
});
