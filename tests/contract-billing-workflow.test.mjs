import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const source=(path)=>readFile(new URL(`../${path}`,import.meta.url),"utf8");

test("contracts require a balanced payment schedule and preserve client attachments",async()=>{
  const[route,pdf,ui,migration]=await Promise.all([source("app/api/portal/documents/generate/route.ts"),source("lib/pdf-generator.ts"),source("app/portal/PortalDashboard.tsx"),source("drizzle-pg/0014_contract_payment_invoicing.sql")]);
  assert.match(route,/reduce\(\(sum, item\) => sum \+ item\.percentageBps, 0\) !== 10000/);
  assert.match(route,/commercialRegistrationFile/);assert.match(route,/vatCertificateFile/);assert.match(route,/client-documents/);
  assert.match(pdf,/جدول الدفعات/);assert.match(ui,/paymentSchedule/);assert.match(ui,/مجموع النسب 100%/);
  assert.match(migration,/ENABLE ROW LEVEL SECURITY/);assert.match(migration,/contract_payment_schedules_invoice_unique/);
});

test("owner referral, accounting invoice, payment recording and legal escalation are separated",async()=>{
  const[route,ui]=await Promise.all([source("app/api/portal/contract-payments/route.ts"),source("app/portal/ContractBillingWorkspace.tsx")]);
  assert.match(route,/إحالة الدفعة للمحاسبة من صلاحيات المالك فقط/);
  assert.match(route,/hasPortalPermission\(access,"finance","write"\)/);
  assert.match(route,/contract-payment-invoiced/);assert.match(route,/contract-payment-paid/);assert.match(route,/client-file-referred-legal/);
  assert.match(route,/payment\.dueDate>=now\.slice\(0,10\)/);
  assert.match(ui,/تنزيل PDF/);assert.match(ui,/مشاركة/);assert.match(ui,/تسجيل السداد/);assert.match(ui,/إحالة الملف للقانونية/);
});
