import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const source=(path)=>readFile(new URL(`../${path}`,import.meta.url),"utf8");

test("government affairs protects credentials and connects paid requests to finance",async()=>{
  const[api,vault,schema,migration,posting,ui]=await Promise.all([source("app/api/portal/government/route.ts"),source("lib/credential-vault.ts"),source("db/schema.ts"),source("drizzle-pg/0035_government_affairs_tasks_and_letters.sql"),source("app/api/portal/finance/posting/route.ts"),source("app/portal/GovernmentAffairsWorkspace.tsx")]);
  assert.match(vault,/aes-256-gcm/);assert.match(vault,/getAuthTag/);assert.doesNotMatch(schema,/passwordPlaintext|usernamePlaintext/);
  assert.match(api,/usernameEnvelope:undefined,passwordEnvelope:undefined/);assert.match(api,/government-credential-revealed/);assert.match(api,/عرض بيانات الدخول متاح للمالك أو مشرف النظام فقط/);
  assert.match(api,/db\.transaction/);assert.match(api,/category:"government_fee"/);assert.match(api,/financialRecordId:financial\.id/);assert.match(posting,/"government_fee"/);
  for(const field of ["serviceName","sadadNumber","billerNumber","amountHalalas","financialRecordId"])assert.match(schema,new RegExp(field));
  assert.match(migration,/ENABLE ROW LEVEL SECURITY/);assert.match(migration,/REVOKE ALL/);assert.match(ui,/إدارة العلاقات الحكومية والامتثال/);assert.match(ui,/تم السداد/);
});

test("government affairs compatibility migration restores copied production databases",async()=>{
  const[migration,api]=await Promise.all([source("drizzle-pg/0041_government_affairs_schema_repair.sql"),source("app/api/portal/government/route.ts")]);
  assert.match(migration,/CREATE TABLE IF NOT EXISTS "government_sites"/);
  assert.match(migration,/CREATE TABLE IF NOT EXISTS "government_payment_requests"/);
  for(const field of ["sponsorship_type","sponsor_name","iqama_expiry","work_permit_expiry","contract_end_date","archived_at"])assert.match(migration,new RegExp(`ADD COLUMN IF NOT EXISTS "${field}"`));
  assert.doesNotMatch(migration,/DROP TABLE|TRUNCATE|DELETE FROM/);
  assert.match(api,/government-affairs-load-failed/);
});

test("tasks enforce private visibility, owner assignment and global five-minute reminders",async()=>{
  const[api,ui,schema,migration,notifications]=await Promise.all([source("app/api/portal/tasks/route.ts"),source("app/portal/TaskCenter.tsx"),source("db/schema.ts"),source("drizzle-pg/0035_government_affairs_tasks_and_letters.sql"),source("lib/portal-notifications.ts")]);
  assert.match(api,/إسناد المهام للمستخدمين متاح للمالك أو مشرف النظام فقط/);assert.match(api,/visibility=requested\.length\?"assigned":"private"/);assert.match(api,/task\.createdBy!==email&&!assignment/);
  assert.match(api,/portal-task-completed/);assert.match(ui,/5\*60_000/);assert.match(ui,/30_000/);assert.match(ui,/global-task-reminder/);assert.match(ui,/المهمة الخاصة لا يراها سواك/);
  assert.match(schema,/portalTaskAssignees/);assert.match(migration,/portal_task_assignees_unique/);assert.match(notifications,/"tasks"/);
});

test("contractual records are separated and lifecycle actions preserve accounting history",async()=>{
  const[workspace,portal,letters,letterPdf,letterLinks,contracts,migration]=await Promise.all([source("app/portal/ContractualDocumentsWorkspace.tsx"),source("app/portal/PortalDashboard.tsx"),source("app/api/portal/letters/route.ts"),source("app/api/portal/letters/[id]/pdf/route.ts"),source("app/portal/LetterPdfLibrary.tsx"),source("app/api/portal/contracts/[id]/status/route.ts"),source("drizzle-pg/0035_government_affairs_tasks_and_letters.sql")]);
  assert.match(portal,/contractual-documents/);assert.match(portal,/documents\.filter/);assert.match(workspace,/العقود وعروض الأسعار والخطابات/);
  assert.match(letters,/يمكن تعديل مسودة الخطاب فقط/);assert.match(letters,/لا يُحذف إلا الخطاب المسودة/);assert.match(letters,/إلغاء الخطابات متاح للمالك أو مشرف النظام فقط/);
  assert.match(letterPdf,/documentType:"official_letter"/);assert.match(letterPdf,/language.*bilingual/);assert.match(letterLinks,/PDF عربي\/English/);
  assert.match(contracts,/reasonCode === "late_payment"/);assert.match(contracts,/إلغاء بسبب تأخر سداد الدفعة/);assert.match(contracts,/postingStatus: "not_applicable"/);assert.match(contracts,/contract-cancellation-accounting-review/);
  assert.match(migration,/official_letters_status_check/);
});

test("official letter compatibility migration preserves records and repairs governance columns",async()=>{
  const[migration,letters]=await Promise.all([source("drizzle-pg/0040_official_letters_schema_repair.sql"),source("app/api/portal/letters/route.ts")]);
  for(const field of ["stamp_id","cancellation_reason","document_id","cancelled_by","cancelled_at"])assert.match(migration,new RegExp(`ADD COLUMN IF NOT EXISTS "${field}"`));
  assert.doesNotMatch(migration,/DROP TABLE|TRUNCATE|DELETE FROM/);
  assert.match(letters,/official-letter-create-failed/);
  assert.match(letters,/official-letter-created/);
});

test("the full sidebar remains viewport-fitted and dashboards stay permission-aware",async()=>{
  const[css,portal]=await Promise.all([source("app/portal/management-enhancements.css"),source("app/portal/PortalDashboard.tsx")]);
  assert.match(css,/@media\(min-width:861px\)/);assert.match(css,/\.admin-sidebar nav\{padding-top:11px;gap:3px;overflow:visible\}/);assert.match(css,/@media\(max-height:760px\)/);
  assert.match(portal,/canAccess\("employees"\)/);assert.match(portal,/canAccess\("finance"\)/);assert.match(portal,/canAccess\("legal"\)/);assert.match(portal,/functionalPermissions/);
});
