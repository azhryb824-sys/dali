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
  assert.match(portal,/جهة الكفالة/);assert.match(portal,/على كفالة شركة دالي/);assert.match(portal,/على كفالة جهة أخرى/);assert.match(portal,/عقد العمل — إلزامي/);assert.match(portal,/حذف العامل من النظام/);
  assert.match(schema,/archivedAt/);assert.match(migration,/financial_records_worker_salary_period_unique/);
});

test("sponsorship and Ajir status remain consistent from worker to quote, contract, assignment and PDF",async()=>{
  const[workersRoute,operationsRoute,assignmentRoute,contractRoute,portal,operations,pdf,schema,migration]=await Promise.all([
    source("app/api/portal/workers/route.ts"),source("app/api/portal/operations/route.ts"),source("app/api/portal/contracts/[id]/workers/route.ts"),source("app/api/portal/documents/generate/route.ts"),source("app/portal/PortalDashboard.tsx"),source("app/portal/OperationsWorkspace.tsx"),source("lib/pdf-generator.ts"),source("db/schema.ts"),source("drizzle-pg/0032_sponsorship_and_ajir_consistency.sql")
  ]);
  for(const field of ["sponsorshipType","sponsorName","ajirContractStatus"]){
    for(const code of [workersRoute,operationsRoute,contractRoute,portal,operations,pdf,schema])assert.match(code,new RegExp(field));
  }
  assert.match(workersRoute,/اسم الكفيل وحالة عقد أجير/);assert.match(workersRoute,/worker-without-ajir/);
  assert.match(operationsRoute,/أكمل اسم الكفيل وحالة عقد أجير/);assert.match(contractRoute,/تطابق عرض السعر المقبول/);
  assert.match(assignmentRoute,/بيانات كفالة العامل وحالة عقد أجير لا تطابق/);assert.match(portal,/sponsorshipMatches/);
  for(const label of ["بعقد أجير","بدون عقد أجير"]){assert.match(portal,new RegExp(label));assert.match(operations,new RegExp(label));assert.match(pdf,new RegExp(label));}
  assert.match(portal,/اسم الكفيل/);assert.match(operations,/اسم الكفيل/);
  assert.match(migration,/workers_sponsorship_consistency_check/);assert.match(migration,/quote_items_sponsorship_consistency_check/);assert.match(migration,/contract_professions_sponsorship_consistency_check/);
});

test("public quotation requests use the same structured requirements as quotations and contracts",async()=>{
  const[form,home,api,crm,portal,schema,migration]=await Promise.all([source("app/components/QuoteRequestForm.tsx"),source("app/page.tsx"),source("app/api/workforce-requests/route.ts"),source("lib/crm.ts"),source("app/portal/PortalDashboard.tsx"),source("db/schema.ts"),source("drizzle-pg/0033_public_quotation_request_alignment.sql")]);
  for(const activity of ["workforce","construction","maintenance","seasonal"])assert.match(form,new RegExp(activity));
  for(const field of ["activityType","quantityMode","quotationItems","quotationTerms","clientCr","clientVat","clientAddress","representativeTitle"]){assert.match(form,new RegExp(field));assert.match(api,new RegExp(field));}
  for(const field of ["quotationItemsJson","quotationTermsJson"]){assert.match(api,new RegExp(field));assert.match(crm,new RegExp(field));assert.match(portal,new RegExp(field));assert.match(schema,new RegExp(field));}
  for(const label of ["جهة الكفالة","اسم الكفيل","حالة عقد أجير","شروط التشغيل والتعاقد","السجل التجاري","العنوان الوطني"]){assert.match(form,new RegExp(label));}
  assert.match(home,/QuoteRequestForm embedded/);assert.doesNotMatch(home,/name="requestedCount"/);
  assert.match(api,/quotationItems\.some/);assert.match(api,/requestedCount = quantityMode === "open"/);
  assert.match(migration,/workforce_requests_activity_type_check/);assert.match(migration,/workforce_requests_quantity_mode_check/);
});

test("owner referral, accounting invoice, payment recording and legal escalation are separated",async()=>{
  const[route,ui]=await Promise.all([source("app/api/portal/contract-payments/route.ts"),source("app/portal/ContractBillingWorkspace.tsx")]);
  assert.match(route,/إحالة الدفعة للمحاسبة من صلاحيات المالك فقط/);
  assert.match(route,/hasPortalPermission\(access,"finance","write"\)/);
  assert.match(route,/contract-payment-invoiced/);assert.match(route,/contract-payment-paid/);assert.match(route,/client-file-referred-legal/);
  assert.match(route,/subtotalHalalas:payment\.subtotalHalalas/);assert.match(route,/vatHalalas:payment\.vatHalalas/);
  assert.match(route,/payment\.dueDate>=now\.slice\(0,10\)/);
  assert.match(ui,/PDF عربي/);assert.match(ui,/PDF عربي\/English/);assert.match(ui,/مشاركة/);assert.match(ui,/تسجيل السداد/);assert.match(ui,/إحالة الملف للقانونية/);
});

test("seasonal and annual payment schedules flow through quotes contracts finance and bilingual PDFs",async()=>{
  const[helper,quoteApi,contractApi,statusApi,paymentsApi,quotePdf,documentPdf,generator,quoteUi,contractUi,schema,migration]=await Promise.all([
    source("lib/payment-schedules.ts"),source("app/api/portal/operations/route.ts"),source("app/api/portal/documents/generate/route.ts"),source("app/api/portal/contracts/[id]/status/route.ts"),source("app/api/portal/contract-payments/route.ts"),source("app/api/portal/operations/quotes/[id]/pdf/route.ts"),source("app/api/portal/documents/[id]/route.ts"),source("lib/pdf-generator.ts"),source("app/portal/OperationsWorkspace.tsx"),source("app/portal/ContractBillingWorkspace.tsx"),source("db/schema.ts"),source("drizzle-pg/0034_payment_schedules_and_bilingual_pdfs.sql")
  ]);
  assert.match(helper,/validateSeasonalSchedule/);assert.match(helper,/annualApprovalSchedule/);
  assert.match(quoteApi,/seasonType/);assert.match(quoteApi,/paymentScheduleJson/);assert.match(quoteApi,/مجموع نسب 100%/);
  assert.match(contractApi,/sourceQuote\.paymentScheduleJson/);assert.match(contractApi,/seasonal_installments/);
  assert.match(statusApi,/annualApprovalSchedule\(now/);assert.match(statusApi,/annual-contract-payments-scheduled/);
  assert.match(paymentsApi,/action==="reschedule"/);assert.match(paymentsApi,/invoiceDocumentId\|\|payment\.financialRecordId/);assert.match(paymentsApi,/contract-payment-rescheduled/);
  for(const sourceCode of [quotePdf,documentPdf]){assert.match(sourceCode,/language/);assert.match(sourceCode,/bilingual/);}
  assert.match(generator,/createBilingualIssuedPdf/);assert.match(generator,/PAGE\.width \* 2/);assert.match(generator,/x: PAGE\.width/);assert.match(generator,/Payment Schedule/);
  assert.match(quoteUi,/موسم رمضان/);assert.match(quoteUi,/موسم الحج/);assert.match(quoteUi,/مجموع النسب/);assert.match(quoteUi,/PDF عربي\/English/);
  assert.match(contractUi,/تعديل موعد الدفعة/);assert.match(contractUi,/PDF عربي\/English/);
  assert.match(schema,/paymentScheduleJson/);assert.match(schema,/seasonType/);assert.match(migration,/quote_versions_season_type_check/);
});

test("contract and quotation edit delete and cancellation actions preserve financial and legal history",async()=>{
  const[contractsUi,contractsApi,statusApi,quotesUi,quotesApi,operations,schema,migration]=await Promise.all([source("app/portal/ContractBillingWorkspace.tsx"),source("app/api/portal/contracts/[id]/route.ts"),source("app/api/portal/contracts/[id]/status/route.ts"),source("app/portal/OperationsWorkspace.tsx"),source("app/api/portal/operations/quotes/[id]/route.ts"),source("app/api/portal/operations/route.ts"),source("db/schema.ts"),source("drizzle-pg/0023_quote_cancellation.sql")]);
  for(const label of ["تعديل","حذف","إلغاء العقد"])assert.match(contractsUi,new RegExp(label));
  for(const label of ["تعديل","حذف","إلغاء عرض السعر"])assert.match(quotesUi,new RegExp(label));
  assert.match(contractsApi,/لا يمكن حذف عقد ساري ومعتمد/);assert.match(contractsApi,/workforce-contract-deleted/);
  assert.match(quotesApi,/QUOTE_DELETE_BLOCKED/);assert.match(operations,/إلغاء عرض السعر متاح للمالك أو مشرف النظام فقط/);
  assert.match(statusApi,/contract-cancellation-referred-legal/);assert.match(statusApi,/category: "case"/);
  assert.match(statusApi,/inArray\(contractPaymentSchedules\.status, \["scheduled", "due", "referred"\]\)/);
  assert.doesNotMatch(statusApi,/inArray\(contractPaymentSchedules\.status, \["invoiced", "paid"\]\)/);
  assert.match(schema,/superseded', 'cancelled'/);assert.match(migration,/quote_versions_status_check/);
});

test("contract cancellation transfers a complete immutable client case snapshot to legal",async()=>{
  const[status,schema,migration,portal]=await Promise.all([source("app/api/portal/contracts/[id]/status/route.ts"),source("db/schema.ts"),source("drizzle-pg/0024_legal_client_case_file.sql"),source("app/portal/PortalDashboard.tsx")]);
  for(const section of ["documents","payments","finances","professions","assignments","workers"])assert.match(status,new RegExp(section));
  assert.match(status,/fileSnapshotJson: JSON\.stringify\(caseSnapshot\)/);assert.match(status,/ملف عميل كامل محال للشؤون القانونية/);
  assert.match(schema,/referralReason/);assert.match(schema,/referredBy/);assert.match(schema,/fileSnapshotJson/);
  assert.match(migration,/legal_records_contract_id_idx/);assert.match(portal,/فتح الملف الكامل/);assert.match(portal,/سبب الإحالة/);
});

test("due installments auto invoice once, support secure WhatsApp sharing, and feed finance and legal command centers",async()=>{
  const[invoicing,paymentsApi,paymentsUi,dashboard,legalApi,legalUi,notifications,schema,migration]=await Promise.all([source("lib/contract-payment-invoicing.ts"),source("app/api/portal/contract-payments/route.ts"),source("app/portal/PaymentManagementDashboard.tsx"),source("app/portal/ContractBillingWorkspace.tsx"),source("app/api/portal/legal-cases/route.ts"),source("app/portal/LegalCaseWorkspace.tsx"),source("lib/portal-notifications.ts"),source("db/schema.ts"),source("drizzle-pg/0025_legal_case_management.sql")]);
  assert.match(invoicing,/isNull\(contractPaymentSchedules\.invoiceDocumentId\)/);assert.match(invoicing,/contract-payment-auto-invoiced/);
  assert.match(paymentsApi,/issueDueContractInvoice/);assert.match(paymentsApi,/clientMobiles/);assert.match(dashboard,/https:\/\/wa\.me\//);assert.match(dashboard,/رابط PDF الآمن/);
  assert.match(paymentsUi,/مركز إدارة الدفعات والتحصيل/);assert.match(paymentsUi,/نسبة التحصيل/);assert.match(paymentsUi,/متأخر/);
  assert.match(legalApi,/legal-case-activity-created/);assert.match(legalUi,/لوحة القضايا والإجراءات والمواعيد/);assert.match(schema,/legalCaseActivities/);assert.match(migration,/ENABLE ROW LEVEL SECURITY/);
  assert.match(notifications,/contract-payment-overdue/);assert.match(notifications,/legal-activity-overdue/);assert.match(notifications,/issueDueContractInvoice/);
});

test("sales and purchasing representatives follow owner-controlled request workflows",async()=>{
  const[schema,migration,api,workspace,operations,share,contractRoute]=await Promise.all([source("db/schema.ts"),source("drizzle-pg/0026_representative_workflows.sql"),source("app/api/portal/representative-requests/route.ts"),source("app/portal/SalesRepresentativesWorkspace.tsx"),source("app/portal/OperationsWorkspace.tsx"),source("app/api/portal/operations/quotes/[id]/share/route.ts"),source("app/api/portal/documents/generate/route.ts")]);
  assert.match(schema,/representativeType/);assert.match(schema,/representativeRequests/);assert.match(migration,/ENABLE ROW LEVEL SECURITY/);
  assert.match(api,/قرار الطلب متاح للمالك أو مشرف النظام فقط/);assert.match(api,/changes_requested/);assert.match(api,/status:"draft"/);assert.match(api,/requestType!=="sales"/);
  for(const label of ["اعتماد","طلب تعديل","رفض نهائي","إنشاء عرض سعر"])assert.match(workspace,new RegExp(label));
  assert.match(operations,/اعتماد عرض السعر/);assert.match(operations,/مشاركة واتساب/);assert.match(operations,/تحويل إلى عقد/);
  assert.match(share,/documentShareLinks/);assert.match(share,/shareUrl/);assert.match(contractRoute,/\["approved", "sent", "accepted"\]/);
});

test("quotation approval works for owner and system admin accounts",async()=>{
  const[api,workspace]=await Promise.all([source("app/api/portal/operations/route.ts"),source("app/portal/OperationsWorkspace.tsx")]);
  assert.match(api,/access\.role === "admin" \|\| access\.functionalRoles\.some/);
  assert.match(workspace,/const canApproveQuotes = isOwner \|\| isAdmin/);
  assert.match(workspace,/canApproveQuotes && \["draft","pending_approval"\]/);
});
