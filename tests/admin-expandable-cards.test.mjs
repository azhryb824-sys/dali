import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const billing = readFileSync("app/portal/ContractBillingWorkspace.tsx", "utf8");
const dashboard = readFileSync("app/portal/PortalDashboard.tsx", "utf8");
const referral = readFileSync("app/portal/LegalPaymentReferralDialog.tsx", "utf8");

test("legal payment referral asks whether the contract should be cancelled", () => {
  assert.match(referral, /هل تريد إلغاء العقد أيضًا؟/);
  assert.match(referral, /إحالة الدفعة فقط/);
  assert.match(referral, /إلغاء أو إنهاء العقد/);
  assert.match(referral, /تبقى المطالبة المالية قائمة دون حذف أو عكس/);
  assert.match(billing, /setLegalReferralPayment\(payment\)/);
  assert.match(billing, /referPaymentToLegal/);
});

test("contract, employee and legal records expose expandable cards", () => {
  assert.match(billing, /فتح واستعراض/);
  assert.match(billing, /expandedContracts\.has\(contract\.id\)/);
  assert.match(dashboard, /employee-profile-card/);
  assert.match(dashboard, /فتح واستعراض الملف/);
  assert.match(dashboard, /legal-record-card/);
});
