import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read=(path)=>readFile(path,"utf8");

test("legal roles are separated without deleting legacy roles",async()=>{
  const [migration,policy]=await Promise.all([read("drizzle-pg/0054_legal_hierarchy_and_action_attribution.sql"),read("drizzle-pg/0057_legal_supervisor_separation_of_duties.sql")]);
  assert.match(migration,/legal_supervisor/);
  assert.match(migration,/legal_lawyer/);
  assert.match(policy,/permission <> 'legal\.approve'/);
  assert.doesNotMatch(migration+policy,/DELETE\s+FROM\s+public\.portal_roles|DROP\s+TABLE/i);
});

test("each legal case shows its assigned lawyer and immutable actor history",async()=>{
  const[schema,route,ui]=await Promise.all([read("db/schema.ts"),read("app/api/portal/legal-cases/route.ts"),read("app/portal/LegalCaseWorkspace.tsx")]);
  for(const field of ["assignedLawyerId","assignedLawyerEmail","assignedBy","assignedAt","legalLawyers","legalCaseActionLog"])assert.match(schema,new RegExp(field));
  assert.match(route,/actionRequest\s*===\s*"assign-case"/);
  assert.match(route,/إسناد القضية من صلاحيات المالك أو المشرف أو مستخدم المحامي/);
  assert.match(route,/actorEmail:\s*actor\.user\.email,\s*actorRole:\s*actorRole\(actor\)/);
  assert.match(route,/لا يمكن تحديث إجراء غير مسند إلى المستخدم/);
  assert.match(ui,/المحامي المستلم للقضية/);
  assert.match(ui,/تاريخ ووقت الإسناد/);
  assert.match(ui,/سجل منفذي الإجراءات/);
  assert.match(ui,/log\.actorEmail/);
});

test("legal judgment payment is owner-confirmed and posts only to legal judgment expense",async()=>{
  const[route,ui,migration]=await Promise.all([read("app/api/portal/legal-cases/route.ts"),read("app/portal/LegalCaseWorkspace.tsx"),read("drizzle-pg/0054_legal_hierarchy_and_action_attribution.sql")]);
  assert.match(route,/requestAction\s*===\s*"request-judgment-payment"/);
  assert.match(route,/actionRequest\s*===\s*"pay-judgment"/);
  assert.match(route,/if\s*\(!isOwner\(actor\)\)/);
  assert.match(route,/resolvePostingRule\("legal_judgment_payment"/);
  assert.match(route,/debitCode:\s*"5290"/);
  assert.match(route,/category:\s*"legal_judgment"/);
  assert.match(route,/sourceType:\s*"financial-record"/);
  assert.match(route,/bank\.ledgerAccountId/);
  assert.match(ui,/طلبات سداد المحكوم به/);
  assert.match(ui,/تم السداد وإنشاء القيد/);
  assert.match(migration,/5290','مصروفات وأحكام قانونية/);
});

test("government service payment remains isolated and uses its own bank journal",async()=>{
  const[route,ui,migration]=await Promise.all([read("app/api/portal/government/route.ts"),read("app/portal/GovernmentAffairsWorkspace.tsx"),read("drizzle-pg/0055_government_payment_bank_settlements.sql")]);
  assert.match(route,/category:"government_fee"/);
  assert.match(route,/subCategory:"government_services"/);
  assert.match(route,/eq\(chartOfAccounts\.code,"5280"\)/);
  assert.match(route,/سداد خدمة حكومية/);
  assert.match(route,/bankAccountId:bank\.id/);
  assert.match(ui,/تأكيد سداد خدمة حكومية/);
  assert.match(ui,/مدين رسوم وخدمات حكومية، ودائن البنك المختار/);
  assert.match(migration,/5280','رسوم وخدمات حكومية/);
  assert.doesNotMatch(route,/legal_judgment|workforce_supplier_payable/);
});

test("supplier, government and legal payments use distinct accounting sources",async()=>{
  const[supplier,government,legal]=await Promise.all([read("app/api/portal/contract-payments/route.ts"),read("app/api/portal/government/route.ts"),read("app/api/portal/legal-cases/route.ts")]);
  assert.match(supplier,/sourceType:"contract-payment-settlement"/);
  assert.match(supplier,/accountId:payable\.id/);
  assert.match(government,/eq\(chartOfAccounts\.code,"5280"\)/);
  assert.match(legal,/resolvePostingRule\("legal_judgment_payment"/);
});
