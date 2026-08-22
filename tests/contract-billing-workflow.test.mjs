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
  assert.match(ui,/type="hidden" name="seasonType" value=\{seasonType\}/);assert.match(ui,/type="hidden" name="firstPaymentDueDate"/);
  assert.match(route,/if \(paymentSchedule\.length\) await db\.insert\(contractPaymentSchedules\)/);
  assert.match(migration,/ENABLE ROW LEVEL SECURITY/);assert.match(migration,/contract_payment_schedules_invoice_unique/);
});

test("contract professions include hospitality and trades with enforced custom profession",async()=>{
  const[requirements,route,ui]=await Promise.all([source("lib/workforce-requirements.ts"),source("app/api/portal/documents/generate/route.ts"),source("app/portal/PortalDashboard.tsx")]);
  for(const profession of ["سباك","كهربائي","ويتر","لحام","عامل تنظيف فندقي","أخرى"])assert.match(requirements,new RegExp(profession));
  assert.match(route,/item\.profession === "أخرى"/);assert.match(route,/اسم المهنة الفعلي/);
  assert.match(requirements,/label: "حداد"/);assert.match(requirements,/label: "لحام"/);assert.doesNotMatch(requirements,/حداد \/ لحام/);
  assert.match(route,/unitSalaryHalalas/);assert.match(route,/monthlyDueDates/);assert.match(route,/monthly_salary/);assert.match(route,/seasonal_percentage/);
  assert.match(ui,/اكتب المهنة يدوياً/);assert.match(ui,/راتب العامل الشهري/);assert.match(ui,/العدد المطلوب/);
  assert.match(ui,/commercialRegistrationFile/);assert.match(ui,/vatCertificateFile/);assert.match(ui,/nationalAddressFile/);
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

test("worker files enforce Saudi IBAN essentials and support expiring unlimited attachments",async()=>{
  const[route,attachments,portal,banks,schema,migration]=await Promise.all([source("app/api/portal/workers/route.ts"),source("app/api/portal/workers/attachments/route.ts"),source("app/portal/PortalDashboard.tsx"),source("lib/saudi-banks.ts"),source("db/schema.ts"),source("drizzle-pg/0021_worker_iban_insurance_and_attachment_expiry.sql")]);
  assert.match(route,/\^SA\\d\{22\}\$/);assert.match(route,/ibanCertificate/);assert.match(route,/medicalInsuranceExpiry/);assert.match(route,/isSaudiBank/);
  assert.match(portal,/شهادة الآيبان — إلزامية/);assert.match(portal,/صورة العامل — إلزامية/);assert.match(portal,/صورة الإقامة — إلزامية/);assert.match(portal,/مرفقات إضافية اختيارية/);
  assert.match(portal,/تاريخ انتهاء المرفق/);assert.match(attachments,/expiryDate/);assert.match(schema,/medicalInsuranceExpiry/);assert.match(migration,/workers_iban_unique/);
  for(const bank of ["البنك الأهلي السعودي","مصرف الراجحي","بنك الرياض","مصرف الإنماء","بنك البلاد","بنك الجزيرة"])assert.match(banks,new RegExp(bank));
});

test("worker sponsorship, work contracts, salary accounting and safe deletion stay integrated",async()=>{
  const[workersRoute,financeRoute,portal,schema,migration]=await Promise.all([source("app/api/portal/workers/route.ts"),source("app/api/portal/records/route.ts"),source("app/portal/PortalDashboard.tsx"),source("db/schema.ts"),source("drizzle-pg/0022_worker_sponsorship_salary_and_archiving.sql")]);
  assert.match(workersRoute,/isCompanySponsored/);assert.match(workersRoute,/workContract/);assert.match(workersRoute,/عقد العمل إلزامي/);
  assert.match(workersRoute,/export async function DELETE/);assert.match(workersRoute,/activeAssignment/);assert.match(workersRoute,/preservedFinancialRecords/);assert.doesNotMatch(workersRoute,/db\.delete\(workerAttachments\)/);
  assert.match(financeRoute,/العامل غير مسند فعليًا إلى العقد/);assert.match(financeRoute,/monthlySalaryHalalas/);assert.match(financeRoute,/يجب ربط راتب العامل بالعقد المستفيد/);
  assert.match(portal,/هل العامل على كفالة الشركة/);assert.match(portal,/عقد العمل — إلزامي/);assert.match(portal,/حذف العامل من النظام/);
  assert.match(schema,/archivedAt/);assert.match(migration,/financial_records_worker_salary_period_unique/);
});

test("owner referral, accounting invoice, payment recording and legal escalation are separated",async()=>{
  const[route,ui]=await Promise.all([source("app/api/portal/contract-payments/route.ts"),source("app/portal/ContractBillingWorkspace.tsx")]);
  assert.match(route,/إحالة الدفعة للمحاسبة من صلاحيات المالك فقط/);
  assert.match(route,/hasPortalPermission\(access,"finance","write"\)/);
  assert.match(route,/contract-payment-invoiced/);assert.match(route,/contract-payment-paid/);assert.match(route,/client-file-referred-legal/);
  assert.match(route,/subtotalHalalas:payment\.subtotalHalalas/);assert.match(route,/vatHalalas:payment\.vatHalalas/);
  assert.match(route,/payment\.dueDate>=now\.slice\(0,10\)/);
  assert.match(ui,/تنزيل PDF/);assert.match(ui,/مشاركة/);assert.match(ui,/تسجيل السداد/);assert.match(ui,/إحالة الملف للقانونية/);
});
