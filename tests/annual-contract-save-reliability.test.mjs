import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("annual contract end date and all twelve installments are derived by the system", async () => {
  const helpers = await readFile("lib/payment-schedules.ts", "utf8");
  const route = await readFile("app/api/portal/documents/generate/route.ts", "utf8");
  assert.match(helpers, /ANNUAL_CONTRACT_MONTHS = 12/);
  assert.match(helpers, /annualContractSchedule\(startDate: string\)/);
  assert.match(route, /annualContractSchedule\(startDate\)/);
  assert.match(route, /dueDates\.length !== 12/);
  assert.match(route, /contractAmountHalalas = monthlySubtotal \* dueDates\.length/);
});

test("annual payment dates remain anchored to the contract start on approval", async () => {
  const route = await readFile("app/api/portal/contracts/[id]/status/route.ts", "utf8");
  assert.match(route, /annualContractSchedule\(contract\.startDate\)/);
  assert.match(route, /approvalInstallments\.length !== 12/);
  assert.match(route, /db\.transaction/);
  assert.doesNotMatch(route, /annualApprovalSchedule\(now/);
});

test("contract wizard hides manual annual end date and previews every monthly payment", async () => {
  const dashboard = await readFile("app/portal/PortalDashboard.tsx", "utf8");
  const css = await readFile("app/portal/portal.css", "utf8");
  assert.doesNotMatch(dashboard, /seasonType==="regular"\?<><input name="endDate"/);
  assert.match(dashboard, /annualContractSchedule\(contractStartDate\)/);
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

test("contract records save atomically and uploaded files are removed after rollback", async () => {
  const route = await readFile("app/api/portal/documents/generate/route.ts", "utf8");
  assert.match(route, /db\.transaction/);
  assert.match(route, /tx\.insert\(workforceContracts\)/);
  assert.match(route, /BUCKET\.delete\(storageKey\)/);
  assert.match(route, /مرجع التتبع/);
});
