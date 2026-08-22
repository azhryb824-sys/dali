import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const source=(path)=>readFile(new URL(`../${path}`,import.meta.url),"utf8");

test("contracts require a balanced payment schedule and preserve mandatory client attachments",async()=>{
  const[route,pdf,ui,operations,migration]=await Promise.all([source("app/api/portal/documents/generate/route.ts"),source("lib/pdf-generator.ts"),source("app/portal/PortalDashboard.tsx"),source("app/portal/OperationsWorkspace.tsx"),source("drizzle-pg/0014_contract_payment_invoicing.sql")]);
  assert.match(route,/reduce\(\(sum, item\) => sum \+ item\.percentageBps, 0\) !== 10000/);
  assert.match(route,/commercialRegistrationFile/);assert.match(route,/vatCertificateFile/);assert.match(route,/nationalAddressFile/);assert.match(route,/client-documents/);
  assert.match(route,/db\.insert\(clients\)/);assert.match(route,/clientId: client!\.id/);assert.match(route,/status: "active"/);
  assert.match(ui,/nationalAddressFile/);assert.match(ui,/العنوان الوطني للعميل/);assert.match(ui,/required name="commercialRegistrationFile"/);
  assert.match(operations,/إنشاء عقد/);assert.match(operations,/onCreateContract/);
  assert.match(pdf,/جدول الدفعات/);assert.match(ui,/paymentSchedule/);assert.match(ui,/مجموع النسب 100%/);
  assert.match(migration,/ENABLE ROW LEVEL SECURITY/);assert.match(migration,/contract_payment_schedules_invoice_unique/);
});

test("site-origin contracts, representatives, bulk workers and activity-aware quotes stay connected",async()=>{
  const[contractRoute,schema,migration,repsApi,portal,workers,operations,dates]=await Promise.all([source("app/api/portal/documents/generate/route.ts"),source("db/schema.ts"),source("drizzle-pg/0016_sales_representatives_and_origin_links.sql"),source("app/api/portal/sales-representatives/route.ts"),source("app/portal/PortalDashboard.tsx"),source("app/api/portal/workers/route.ts"),source("app/portal/OperationsWorkspace.tsx"),source("app/components/TodayDateDefaults.tsx")]);
  assert.match(contractRoute,/sourceRequestId/);assert.match(contractRoute,/salesRepresentativeId/);assert.match(contractRoute,/workforceRequests/);
  assert.match(schema,/salesRepresentatives/);assert.match(migration,/ENABLE ROW LEVEL SECURITY/);assert.match(migration,/REVOKE ALL.*PUBLIC, anon, authenticated/);
  assert.match(repsApi,/contractValueHalalas/);assert.match(portal,/إدارة المناديب/);
  assert.match(workers,/صورة الإقامة إلزامية/);assert.match(portal,/workerCount/);assert.match(portal,/iqamaDocument/);
  assert.match(operations,/quote-line-builder/);assert.match(operations,/quote-activity-tabs/);assert.match(operations,/workforceNationalities/);assert.match(operations,/المقاولات/);assert.doesNotMatch(operations,/name="itemLines"/);
  assert.match(dates,/Asia\/Riyadh/);assert.match(dates,/input\[type="date"\]/);
});

test("owner referral, accounting invoice, payment recording and legal escalation are separated",async()=>{
  const[route,ui]=await Promise.all([source("app/api/portal/contract-payments/route.ts"),source("app/portal/ContractBillingWorkspace.tsx")]);
  assert.match(route,/إحالة الدفعة للمحاسبة من صلاحيات المالك فقط/);
  assert.match(route,/hasPortalPermission\(access,"finance","write"\)/);
  assert.match(route,/contract-payment-invoiced/);assert.match(route,/contract-payment-paid/);assert.match(route,/client-file-referred-legal/);
  assert.match(route,/payment\.dueDate>=now\.slice\(0,10\)/);
  assert.match(ui,/تنزيل PDF/);assert.match(ui,/مشاركة/);assert.match(ui,/تسجيل السداد/);assert.match(ui,/إحالة الملف للقانونية/);
});
