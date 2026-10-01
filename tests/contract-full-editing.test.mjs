import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source=(path)=>readFile(new URL(`../${path}`,import.meta.url),"utf8");

test("contract edit dialog covers commercial, operational and profession data",async()=>{
  const [dialog,api,billing,portal]=await Promise.all([source("app/portal/ContractFullEditDialog.tsx"),source("app/api/portal/contracts/[id]/route.ts"),source("app/portal/ContractBillingWorkspace.tsx"),source("app/portal/PortalDashboard.tsx")]);
  for(const field of ["clientCr","clientVat","workSite","issueDate","vatRate","accommodationParty","transportParty","details","showPaymentSchedule"])assert.match(dialog+portal,new RegExp(field));
  assert.match(portal,/المهن والأعداد/);assert.match(dialog,/unitSalaryHalalas/);assert.match(dialog,/actualSalaryHalalas/);
  assert.match(api,/editedProfessions/);assert.match(api,/لا يمكن تعديل الأسعار أو المهن أو جدول الدفعات بعد بدء المعالجة المالية/);
  assert.match(billing,/ContractFullEditDialog/);assert.match(billing,/professions={data\.professions/);
});

test("sponsorship is contract-level while Ajir is an independent contract allocation",async()=>{
  const [dialog,portal,workersApi]=await Promise.all([source("app/portal/ContractFullEditDialog.tsx"),source("app/portal/PortalDashboard.tsx"),source("app/api/portal/contracts/[id]/workers/route.ts")]);
  assert.match(portal,/جهة الكفالة/);
  assert.match(portal,/حالة عقد أجير/);
  assert.match(portal,/ajirContractStatus/);
  assert.doesNotMatch(workersApi,/worker\.ajirContractStatus !== profession\.ajirContractStatus/);
  assert.doesNotMatch(portal,/worker\.sponsorName === requirement\.sponsorName && worker\.ajirContractStatus/);
});
