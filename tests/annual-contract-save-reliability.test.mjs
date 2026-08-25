import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("annual contract end date and all twelve installments are derived by the system", async () => {
  const helpers = await readFile("lib/payment-schedules.ts", "utf8");
  const route = await readFile("app/api/portal/documents/generate/route.ts", "utf8");
  assert.match(helpers, /ANNUAL_CONTRACT_MONTHS = 12/);
  assert.match(helpers, /annualContractEndDate\(startDate: string\)/);
  assert.match(route, /endDate = annualContractEndDate\(startDate\)/);
  assert.match(route, /Array\.from\(\{ length: ANNUAL_CONTRACT_MONTHS \}/);
  assert.match(route, /الدفعة الشهرية \$\{index \+ 1\} من \$\{dueDates\.length\}/);
  assert.match(route, /contractAmountHalalas = monthlySubtotal \* ANNUAL_CONTRACT_MONTHS/);
});

test("annual payment dates, titles and percentages are refreshed together on approval", async () => {
  const route = await readFile("app/api/portal/contracts/[id]/status/route.ts", "utf8");
  assert.match(route, /annualInstallmentPercentages\(editable\.length\)/);
  assert.match(route, /title: `الدفعة الشهرية \$\{index \+ 1\} من \$\{editable\.length\}/);
  assert.match(route, /percentageBps: percentages\[index\]/);
});

test("contract wizard hides manual annual end date and previews every monthly payment", async () => {
  const dashboard = await readFile("app/portal/PortalDashboard.tsx", "utf8");
  const css = await readFile("app/portal/portal.css", "utf8");
  assert.match(dashboard, /seasonType==="regular"\?<><input name="endDate" type="hidden" value=\{annualEndDate\}/);
  assert.match(dashboard, /annualContractEndDate\(contractStartDate\)/);
  assert.match(dashboard, /annualInstallments\.map/);
  assert.match(dashboard, /validateAndSetStep/);
  assert.match(css, /annual-contract-payment-plan-v1/);
  assert.match(css, /annual-payment-installments/);
});

test("save operations handle empty or malformed server responses without raw JSON parser failures", async () => {
  const helper = await readFile("lib/client-api.ts", "utf8");
  const dashboard = await readFile("app/portal/PortalDashboard.tsx", "utf8");
  assert.match(helper, /if \(!body\.trim\(\)\)/);
  assert.match(helper, /استجابة الخادم غير مكتملة أو غير صالحة/);
  assert.match(dashboard, /readApiJson\(response\)/);
  assert.doesNotMatch(dashboard, /await response\.json\(\)/);
});

test("failed contract saves clean dependent contract data and temporary related records", async () => {
  const route = await readFile("app/api/portal/documents/generate/route.ts", "utf8");
  assert.match(route, /delete\(contractClauses\)/);
  assert.match(route, /createdSupplierId/);
  assert.match(route, /convertedRepresentativeRequestId/);
  assert.match(route, /لم يعتمد النظام عملية جزئية/);
});
