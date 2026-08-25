import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const source=(path)=>readFile(new URL(`../${path}`,import.meta.url),"utf8");

test("directional workforce contracts use editable bilingual clauses and conditional jurisdiction",async()=>{
  const[clauses,pdf,api,ui,schema,migration]=await Promise.all([source("lib/workforce-contract-clauses.ts"),source("lib/pdf-generator.ts"),source("app/api/portal/documents/generate/route.ts"),source("app/portal/PortalDashboard.tsx"),source("db/schema.ts"),source("drizzle-pg/0036_contract_direction_and_editable_clauses.sql")]);
  assert.match(clauses,/dali_supplier/);assert.match(clauses,/dali_purchaser/);assert.match(clauses,/allWorkersWithAjir \|\| !saudiJurisdiction/);assert.match(clauses,/englishDefaults/);
  assert.match(api,/contractDirection/);assert.match(api,/parseWorkforceContractClauses/);assert.match(api,/tx\.insert\(contractClauses\)/);assert.match(api,/tx\.select\(\)\.from\(suppliers\)/);assert.match(api,/representativeRequestId/);
  assert.match(ui,/دالي مشتري العمالة/);assert.match(ui,/بنود العقد القابلة للتحرير/);assert.match(ui,/English clause text/);assert.match(ui,/\/api\/portal\/translate/);
  assert.match(pdf,/contractDirection === "dali_purchaser"/);assert.match(pdf,/contractClauses/);assert.match(pdf,/publicManpowerText/);
  assert.match(schema,/contractDirection/);assert.match(schema,/titleEn/);assert.match(migration,/contract_direction/);assert.match(migration,/body_en/);
});

test("purchaser contracts become supplier payables rather than sales revenue",async()=>{
  const[invoicing,payments,posting]=await Promise.all([source("lib/contract-payment-invoicing.ts"),source("app/api/portal/contract-payments/route.ts"),source("app/api/portal/finance/posting/route.ts")]);
  for(const code of [invoicing,payments]){assert.match(code,/workforce_supplier_payable/);assert.match(code,/payment_voucher/);assert.match(code,/contract\.contractDirection==="dali_purchaser"/)}
  assert.match(posting,/"workforce_supplier_payable"/);assert.match(payments,/عقد شراء العمالة لا يحال كملف عميل متأخر/);
});
