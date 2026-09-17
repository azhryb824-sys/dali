import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";

let pg, db, qa, directory;
let rep, source, quote, worker, contract, assignment, incident, salary;
const actor = (root = false) => ({ role: root ? "admin" : "manager", department: "workforce", functionalRoles: [], functionalPermissions: ["contracts.write", "contracts.read", "contracts.approve", "workforce.write", "documents.read", "documents.share", "video.read", "video.manage", "conversations.write"], user: { email: root ? "owner@qa.test" : "staff@qa.test", displayName: "QA" } });
const request = (path, body, method = "POST") => new Request(`https://www.dally.info${path}`, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

before(async () => {
  await mkdir(resolve("node_modules/.cache"), { recursive: true });
  directory = await mkdtemp(resolve("node_modules/.cache/dali-commercial-"));
  const outfile = resolve(directory, "qa.mjs");
  await build({ stdin: { contents: `export * as schema from './db/schema.ts'; export * as internalRequests from './app/api/portal/quote-requests/route.ts'; export * as representatives from './app/api/portal/sales-representatives/route.ts'; export * as repRequests from './app/api/portal/representative-requests/route.ts'; export * as conversions from './app/api/portal/quote-conversions/route.ts'; export * as incidents from './app/api/portal/worker-incidents/route.ts'; export * as records from './app/api/portal/records/route.ts'; export * as stamps from './app/api/portal/document-stamps/route.ts'; export * as assignmentRoute from './app/api/portal/contracts/[id]/workers/route.ts'; export * as payroll from './lib/worker-payroll.ts'; export * as hr from './app/api/portal/hr/route.ts'; export * as posting from './app/api/portal/finance/posting/route.ts'; export * as accounting from './lib/accounting.ts'; export * as quoteEdit from './app/api/portal/operations/quotes/[id]/route.ts'; export * as generate from './app/api/portal/documents/generate/route.ts'; export * as requests from './app/api/portal/requests/route.ts'; export * as operations from './app/api/portal/operations/route.ts'; export * as quoteShare from './app/api/portal/operations/quotes/[id]/share/route.ts'; export * as documentShare from './app/api/portal/documents/share/route.ts'; export * as download from './app/api/shared-documents/[token]/route.ts'; export * as conversations from './app/api/portal/conversations/route.ts'; export * as video from './lib/video-interviews.ts'; export * as notifications from './lib/portal-notifications.ts'; export * as notificationRoute from './app/api/portal/notifications/route.ts'; export {resolveShareRecipient} from './lib/share-recipient.ts'; export {readCommercialTerms,commercialTermsFromRequest} from './lib/commercial-terms.ts'; export {setTestDb,setTestActor} from 'qa-control';`, resolveDir: process.cwd() }, outfile, bundle: true, platform: "node", format: "esm", packages: "external", logLevel: "silent", plugins: [{ name: "isolate-environment", setup(b) {
    b.onResolve({ filter: /^(qa-control|@\/db|@\/lib\/portal-access)$/ }, () => ({ path: "state", namespace: "state" }));
    b.onLoad({ filter: /.*/, namespace: "state" }, () => ({ contents: `let db,actor; export function getDb(){return db} export function getSqlClient(){throw new Error('Unexpected raw SQL dependency')} export function setTestDb(value){db=value} export function setTestActor(value){actor=value} export async function requirePortalApiRole(){return actor} export function canAdministerPortalUsers(a){return a.role==='admin'||a.functionalRoles.some(r=>['system_owner','system_admin'].includes(r))} export async function hasPortalPermission(a,r,v){return canAdministerPortalUsers(a)||a.functionalPermissions.includes(r+'.'+v)} export function canSharePortalDocuments(a){return a.role==='admin'||a.functionalPermissions.includes('documents.share')} export function canAccessPortalDocuments(a){return a.role==='admin'||a.functionalPermissions.includes('documents.read')} export function canAccessPortalConversations(a){return a.role==='admin'||a.functionalPermissions.includes('conversations.write')} export const canManagePortalConversations=canAccessPortalConversations; export const canManageCompanyAssets=canAdministerPortalUsers; export function canAccessCompanyFiles(){return true} export function canAccessPortalDepartment(a,d,w){return canAdministerPortalUsers(a)||a.functionalPermissions.includes(d+'.'+(w?'write':'read'))} export const canManageLegalCases=canAdministerPortalUsers;` }));
    b.onResolve({ filter: /^@\/lib\/pdf-generator$/ }, () => ({ path: "pdf", namespace: "pdf" }));
    b.onLoad({ filter: /.*/, namespace: "pdf" }, () => ({ contents: "export const issuedDocumentLabels={workforce_contract:'عقد',quotation:'عرض سعر',invoice:'فاتورة'}; export async function generateIssuedPdf(){return new TextEncoder().encode('%PDF-QA')}" }));
    b.onResolve({ filter: /^@\/lib\/audit$/ }, () => ({ path: "audit", namespace: "effects" }));
    b.onLoad({ filter: /.*/, namespace: "effects" }, () => ({ contents: "export async function auditPortalAction(){} export async function recordStatusChange(){return 'qa'} export async function enqueueOutbox(){}" }));
    b.onResolve({ filter: /^@\/lib\/runtime-env$/ }, () => ({ path: "runtime", namespace: "runtime" }));
    b.onLoad({ filter: /.*/, namespace: "runtime" }, () => ({ contents: "const objects=new Map(); export function getRuntimeEnv(){return {BUCKET:{async put(key,bytes){objects.set(key,new Uint8Array(bytes))},async get(key){const bytes=objects.get(key)||new TextEncoder().encode('%PDF-QA'); return {body:bytes,httpEtag:'qa',async arrayBuffer(){return bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)}}},async delete(key){objects.delete(key)}}}}" }));
    b.onResolve({ filter: /^@\/lib\/portal-auth-config$/ }, () => ({ path: "auth", namespace: "auth" }));
    b.onLoad({ filter: /.*/, namespace: "auth" }, () => ({ contents: "export function getConfiguredAuthSecret(){return 'qa-only-not-a-production-secret-12345678'}" }));
    b.onResolve({ filter: /^@\/lib\/contract-payment-invoicing$/ }, () => ({ path: "invoice", namespace: "invoice" }));
    b.onLoad({ filter: /.*/, namespace: "invoice" }, () => ({ contents: "export async function issueDueContractInvoice(){return null}" }));
  } }] });
  qa = await import(pathToFileURL(outfile));
  pg = new PGlite();
  await pg.exec((await generateMigration(generateDrizzleJson({}), generateDrizzleJson(qa.schema))).join("\n"));
  await pg.exec("DROP TABLE worker_salary_allocations,worker_payroll_deductions,worker_incidents,quote_conversion_requests; ALTER TABLE workforce_requests DROP COLUMN origin_email,DROP COLUMN origin_conversation_id; ALTER TABLE representative_requests DROP COLUMN workforce_request_id; ALTER TABLE financial_records DROP COLUMN gross_amount_halalas,DROP COLUMN deduction_amount_halalas;");
  await pg.exec(await readFile("drizzle-pg/0073_representative_quotes_worker_incidents.sql","utf8"));
  db = drizzle(pg, { schema: qa.schema }); qa.setTestDb(db); qa.setTestActor(actor(true));
  [rep]=await db.insert(qa.schema.salesRepresentatives).values({representativeCode:"REP-QA",fullName:"QA rep",mobile:"0566110144",email:"rep@qa.test",region:"Makkah",representativeType:"sales",createdBy:"qa"}).returning();

});
after(async () => { if (directory) await rm(directory, { recursive: true, force: true }); await pg?.close(); });


const repActor=()=>({...actor(),functionalRoles:["sales_representative"],functionalPermissions:["representatives.read","representatives.write"],user:{email:"rep@qa.test"}});
const supervisor=()=>({...actor(),functionalRoles:["workforce_supervisor"],functionalPermissions:["workforce.read","workforce.write","contracts.read"],user:{email:"supervisor@qa.test"}});
const input=()=>({representativeId:rep.id,fullName:"مسؤول العميل",companyName:"عميل الاختبار",mobile:"٠٥٦٦١١٠١٤٤",email:"client@qa.test",workSite:"مكة المكرمة",requiredStartDate:"2026-01-01",duration:"من 6 إلى 12 شهراً",clientAddress:"عنوان المنشأة المسجل",representativeTitle:"المدير",activityType:"workforce",quantityMode:"fixed",preferredContact:"phone",details:"تفاصيل توريد العمالة إلى موقع العميل",quotationItems:[{description:"عامل عام",quantity:1,durationMonths:12,sponsorshipType:"dali"}],quotationTerms:{workingHours:"8 ساعات",weeklyOff:"الجمعة",paymentTerms:"شهري",specialTerms:"شروط محفوظة"},idempotencyKey:crypto.randomUUID()});
async function body(response,expected){const result=await response.json();assert.equal(response.status,expected,JSON.stringify(result));return result}

test("representatives submit the full canonical form; identity, validation and idempotency are enforced",async()=>{
 qa.setTestActor(repActor());const data=input();source=(await body(await qa.internalRequests.POST(request('/api/portal/quote-requests',data)),201)).request;
 assert.equal(source.approvalStatus,'pending');assert.equal(source.mobile,'966566110144');assert.equal(source.originEmail,'rep@qa.test');
 const duplicate=(await body(await qa.internalRequests.POST(request('/api/portal/quote-requests',data)),201)).request;assert.equal(duplicate.id,source.id);
 await body(await qa.internalRequests.POST(request('/api/portal/quote-requests',{...input(),quotationItems:[]})),400);
 qa.setTestActor({...repActor(),user:{email:'another@qa.test'}});await body(await qa.internalRequests.POST(request('/api/portal/quote-requests',input())),403);
 qa.setTestActor(repActor());assert.equal((await qa.requests.PATCH(request('/api/portal/requests',{id:source.id,version:source.version,action:'approve'},'PATCH'))).status,403);
});
test("owner requests changes, origin resubmits populated data, and the owner approves using a version guard",async()=>{
 qa.setTestActor(actor(true));source=(await body(await qa.requests.PATCH(request('/api/portal/requests',{id:source.id,version:source.version,action:'request-changes',reason:'تعديل موقع العمل حسب العميل'},'PATCH')),200)).request;
 assert.equal(source.approvalStatus,'changes_requested');qa.setTestActor(repActor());
 await body(await qa.internalRequests.POST(request('/api/portal/quote-requests',{...input(),requestId:source.id,version:1})),409);
 source=(await body(await qa.internalRequests.POST(request('/api/portal/quote-requests',{...input(),requestId:source.id,version:source.version,workSite:'جدة'})),200)).request;assert.equal(source.approvalStatus,'pending');assert.equal(source.workSite,'جدة');
 qa.setTestActor(actor(true));source=(await body(await qa.requests.PATCH(request('/api/portal/requests',{id:source.id,version:source.version,action:'approve'},'PATCH')),200)).request;
 assert.equal(source.approvedBy,'owner@qa.test');
});
test("final rejection has no mandatory amendment and cannot be resubmitted",async()=>{
 qa.setTestActor(repActor());const row=(await body(await qa.internalRequests.POST(request('/api/portal/quote-requests',input())),201)).request;
 qa.setTestActor(actor(true));await body(await qa.requests.PATCH(request('/api/portal/requests',{id:row.id,version:row.version,action:'reject'},'PATCH')),200);
 qa.setTestActor(repActor());await body(await qa.internalRequests.POST(request('/api/portal/quote-requests',{...input(),requestId:row.id,version:2})),409);
});
test("approved representative request converts via standard quote flow; only its representative can share or request conversion after approval",async()=>{
 qa.setTestActor(actor(true));
 quote=(await body(await qa.operations.POST(request('/api/portal/operations',{action:'create-quote',idempotencyKey:crypto.randomUUID(),sourceRequestId:source.id,issueDate:'2026-01-01',validUntil:'2026-12-31',activityLabel:'توريد العمالة',workSite:'جدة',accommodationParty:'counterparty',transportParty:'dali',vatRate:15,terms:'شهري',items:[{profession:'عامل عام',quantity:1,durationMonths:12,unitPrice:4000,actualSalary:3000,sponsorshipType:'dali',ajirContractStatus:'not_applicable'}]})),201)).quote;
 assert.equal(qa.readCommercialTerms(quote.commercialTermsJson).specialTerms,'شروط محفوظة');
 qa.setTestActor(repActor());await body(await qa.conversions.POST(request('/api/portal/quote-conversions',{quoteId:quote.id})),409);
 const reps=await body(await qa.representatives.GET(),200);assert.equal(reps.requests.find(r=>r.workforceRequestId===source.id).quote.id,quote.id);
 const [stamp]=await db.insert(qa.schema.documentStamps).values({name:'ختم اختبار',fileName:'stamp.png',storageKey:'stamp.png',contentType:'image/png',sizeBytes:5,createdBy:'qa'}).returning();
 qa.setTestActor(actor(true));await body(await qa.operations.PATCH(request('/api/portal/operations',{action:'transition-quote',id:quote.id,status:'approved',version:quote.recordVersion,stampId:stamp.id},'PATCH')),200);
 const [doc]=await db.insert(qa.schema.companyDocuments).values({referenceCode:'QA-REP-PDF',title:'عرض معتمد',category:'contract',documentType:'quotation',fileName:'quote.pdf',storageKey:'quote.pdf',contentType:'application/pdf',sizeBytes:7,createdBy:'qa'}).returning();await pg.query('update quote_versions set document_id=$1 where id=$2',[doc.id,quote.id]);
 qa.setTestActor(repActor());const share=await body(await qa.quoteShare.POST(request('/api/portal/operations/quotes/'+quote.id+'/share',{whatsappNumber:'0566110144'}),{params:Promise.resolve({id:String(quote.id)})}),200);assert.equal(share.files.length,1);
 const conversion=await body(await qa.conversions.POST(request('/api/portal/quote-conversions',{quoteId:quote.id})),201);assert.equal(conversion.conversion.status,'pending');assert.equal((await body(await qa.conversions.POST(request('/api/portal/quote-conversions',{quoteId:quote.id})),201)).conversion.id,conversion.conversion.id);
 qa.setTestActor({...repActor(),user:{email:'other@qa.test'}});await body(await qa.conversions.POST(request('/api/portal/quote-conversions',{quoteId:quote.id})),403);await body(await qa.quoteShare.POST(request('/api/portal/operations/quotes/'+quote.id+'/share',{}),{params:Promise.resolve({id:String(quote.id)})}),403);
});

test("edited conversion preserves approved quote and contract clauses, creates a draft contract and completes its conversion request",async()=>{
 qa.setTestActor(actor(true));
 await db.insert(qa.schema.companyAssets).values(['stamp','signature'].map(slot=>({slot,fileName:`${slot}.png`,storageKey:`${slot}.png`,contentType:'image/png',sizeBytes:1,uploadedBy:'qa'})));
 const terms=qa.readCommercialTerms(quote.commercialTermsJson);
 const submit=async(mode)=>{const form=new FormData();const payload={...terms,documentType:'workforce_contract',quoteVersionId:quote.id,sourceRequestId:source.id,conversionMode:mode,clientCr:'1010000000',clientVat:'300000000000003',issueDate:'2026-01-01',workingHours:'9 ساعات',quantityMode:'fixed',seasonType:'regular',vatEnabled:'true',vatRate:15,accommodationParty:'يوفره الطرف الثاني',transportParty:'توفره دالي',professions:JSON.stringify([{profession:'عامل عام',requiredCount:1,unitSalary:4000,actualSalary:3000,sponsorshipType:'dali',ajirContractStatus:'not_applicable',workerIds:[]}])};for(const [k,v]of Object.entries(payload))form.set(k,Array.isArray(v)?JSON.stringify(v):String(v));for(const name of ['commercialRegistrationFile','vatCertificateFile','nationalAddressFile'])form.set(name,new File(['%PDF-1.7\nQA'],`${name}.pdf`,{type:'application/pdf'}));return qa.generate.POST(new Request('https://www.dally.info/api/portal/documents/generate',{method:'POST',body:form}))};
 await body(await submit('as_is'),409);const result=await body(await submit('modified'),201);contract=result.contract;assert.ok(contract.id);assert.equal(contract.status,'draft');assert.equal(contract.quoteVersionId,quote.id);
 assert.equal((await pg.query('select status from quote_conversion_requests where quote_version_id=$1',[quote.id])).rows[0].status,'converted');
 assert.equal(qa.readCommercialTerms((await pg.query('select commercial_terms_json from quote_versions where id=$1',[quote.id])).rows[0].commercial_terms_json).workingHours,'8 ساعات');
 assert.ok((await pg.query('select count(*)::int n from contract_clauses where contract_id=$1',[contract.id])).rows[0].n>0);
});
test("owner can add multiple named stamps and disabling one preserves other stamps and history",async()=>{
 qa.setTestActor(actor(true));const ids=[];
 for(const name of ['ختم الفرع الأول','ختم الفرع الثاني']){const form=new FormData();form.set('name',name);form.set('file',new File([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64')],'stamp.png',{type:'image/png'}));const r=await body(await qa.stamps.POST(new Request('https://www.dally.info/api/portal/document-stamps',{method:'POST',body:form})),201);ids.push(r.stamp.id)}
 assert.notEqual(ids[0],ids[1]);const list=await body(await qa.stamps.GET(new Request('https://www.dally.info/api/portal/document-stamps')),200);assert.ok(ids.every(id=>list.stamps.some(s=>s.id===id)));
 await body(await qa.stamps.DELETE(new Request('https://www.dally.info/api/portal/document-stamps?id='+ids[0],{method:'DELETE'})),200);assert.equal((await pg.query('select count(*)::int n from document_stamps where id=any($1)',[ids])).rows[0].n,2);
 qa.setTestActor(repActor());assert.equal((await qa.stamps.POST(new Request('https://www.dally.info/api/portal/document-stamps',{method:'POST'}))).status,403);
});
async function submitIncident(patch={},file=false){const fd=new FormData();for(const[k,v]of Object.entries({workerId:worker.id,assignmentId:assignment.id,incidentType:'absence',reasonCode:'personal',reason:'ظرف شخصي مقدم للمراجعة',startDate:'2026-08-06',endDate:'2026-08-08',...patch}))fd.set(k,String(v));if(file)fd.set('file',new File(['%PDF-1.7\nMedical document'], 'report.pdf',{type:'application/pdf'}));return qa.incidents.POST(new Request('https://www.dally.info/api/portal/worker-incidents',{method:'POST',body:fd}))}
const decideIncident=(row,patch={})=>qa.incidents.PATCH(request('/api/portal/worker-incidents',{id:row.id,version:row.version,status:'rejected',reason:'لم يقبل السبب بعد المراجعة',warning:true,deduct:true,...patch},'PATCH'));
test("worker incidents use historical assignment and contract salary; medical evidence and reporting roles are enforced",async()=>{
 await pg.query("update workforce_contracts set status='active',approved_by='owner@qa.test' where id=$1",[contract.id]);
 [worker]=await db.insert(qa.schema.workers).values({workerNumber:'W-QA-INC',fullName:'عامل الاختبار',nationality:'بنغلاديشي',profession:'عامل عام',clientSite:'جدة',monthlySalaryHalalas:990000,status:'assigned'}).returning();
 const profession=(await pg.query('select id from contract_professions where contract_id=$1',[contract.id])).rows[0];
 [assignment]=await db.insert(qa.schema.contractWorkerAssignments).values({workerId:worker.id,contractId:contract.id,contractProfessionId:profession.id,status:'active',assignedBy:'qa',assignedAt:'2026-01-01T00:00:00Z'}).returning();
 qa.setTestActor(repActor());await body(await submitIncident(),403);
 qa.setTestActor(supervisor());await body(await submitIncident({incidentType:'work_injury'}),400);await body(await submitIncident({incidentType:'sick_leave'}),400);
 const medical=(await body(await submitIncident({incidentType:'work_injury',startDate:'2026-08-10',endDate:'2026-08-10'},true),201)).incident;assert.ok(medical.fileName);
 await body(await submitIncident({startDate:'2025-12-31',endDate:'2026-01-01'}),409);
 incident=(await body(await submitIncident(),201)).incident;assert.equal(incident.monthlySalaryHalalas,300000);assert.equal(incident.chargeableDays,2);
 assert.equal((await pg.query('select count(*)::int n from worker_payroll_deductions')).rows[0].n,0);
 await body(await decideIncident(incident),403);
 qa.setTestActor(actor(true));await body(await decideIncident(medical,{status:'accepted',deduct:false,warning:false}),200);
});
test("rejecting an excuse can combine warning and deduction, excludes Friday, and cannot apply twice",async()=>{
 qa.setTestActor(actor(true));incident=(await body(await decideIncident(incident),200)).incident;assert.equal(incident.warning,true);assert.equal(incident.deductionHalalas,20000);
 assert.deepEqual((await pg.query('select deduction_date,amount_halalas from worker_payroll_deductions order by deduction_date')).rows,[{deduction_date:'2026-08-06',amount_halalas:10000},{deduction_date:'2026-08-08',amount_halalas:10000}]);
 await body(await decideIncident({...incident,version:1}),409);
 const overlap=(await body(await submitIncident({startDate:'2026-08-08',endDate:'2026-08-09',reason:'سبب مختلف للفترة المتداخلة'}),201)).incident;await body(await decideIncident(overlap),409);
 const friday=(await body(await submitIncident({startDate:'2026-08-07',endDate:'2026-08-07'}),201)).incident;await body(await decideIncident(friday),400);
 const view=await body(await qa.incidents.GET(new Request('https://www.dally.info/api/portal/worker-incidents?workerId='+worker.id)),200);assert.ok(view.incidents.some(i=>i.id===incident.id&&i.warning));assert.ok(!('storageKey' in view.incidents[0]));
});
const salaryInput=(amount)=>({entity:'finance',data:{category:'worker_salary',description:'راتب شهر أغسطس بعد مراجعة الخصومات',amount,workerId:worker.id,contractId:contract.id,periodMonth:'2026-08',dueDate:'2026-08-31',paymentMethod:'cash'}});
test("salary net uses the contract rate and approved deductions; unpaid contract installments, stale amounts and duplicate salaries are blocked",async()=>{
 qa.setTestActor(actor(true));const preview=await qa.payroll.calculateWorkerSalary(db,worker.id,contract.id,'2026-08');assert.equal(preview.grossAmountHalalas,300000);assert.equal(preview.deductionAmountHalalas,20000);assert.equal(preview.amountHalalas,280000);
 await body(await qa.records.POST(request('/api/portal/records',salaryInput(2800))),409);
 await pg.query("update contract_payment_schedules set status='paid' where contract_id=$1 and service_period='2026-08'",[contract.id]);
 await body(await qa.records.POST(request('/api/portal/records',salaryInput(3000))),409);
 salary=(await body(await qa.records.POST(request('/api/portal/records',salaryInput(2800))),201)).record;assert.equal(salary.grossAmountHalalas,300000);assert.equal(salary.deductionAmountHalalas,20000);assert.equal(salary.amountHalalas,280000);
 await body(await qa.records.POST(request('/api/portal/records',salaryInput(3000))),409);
 assert.equal((await pg.query('select sum(settled_halalas)::int n from worker_payroll_deductions')).rows[0].n,20000);
 await body(await qa.records.PATCH(request('/api/portal/records',{entity:'finance',id:salary.id,status:'paid'},'PATCH')),409);
});
test("cancelling an unposted salary releases deduction allocations once and forces approval before payment",async()=>{
 qa.setTestActor(actor(true));await body(await qa.records.PATCH(request('/api/portal/records',{entity:'finance',id:salary.id,status:'cancelled'},'PATCH')),200);
 assert.equal((await pg.query('select sum(settled_halalas)::int n from worker_payroll_deductions')).rows[0].n,0);
 await body(await qa.records.PATCH(request('/api/portal/records',{entity:'finance',id:salary.id,status:'cancelled'},'PATCH')),409);
 salary=(await body(await qa.records.POST(request('/api/portal/records',salaryInput(2800))),201)).record;
 await body(await qa.records.PATCH(request('/api/portal/records',{entity:'finance',id:salary.id,status:'approved'},'PATCH')),200);
 await body(await qa.records.PATCH(request('/api/portal/records',{entity:'finance',id:salary.id,status:'paid'},'PATCH')),409);
 await db.insert(qa.schema.chartOfAccounts).values([{code:'1100',nameAr:'نقدية',accountType:'asset',normalBalance:'debit'},{code:'5100',nameAr:'مصروف العمالة',accountType:'expense',normalBalance:'debit'}]);
 await db.insert(qa.schema.fiscalPeriods).values({periodCode:'FY-2026',nameAr:'2026',startDate:'2026-01-01',endDate:'2026-12-31',status:'open'});
 const posting=await body(await qa.posting.POST(request('/api/portal/finance/posting',{recordId:salary.id})),201);
 await body(await qa.posting.POST(request('/api/portal/finance/posting',{recordId:salary.id})),409);
 await qa.accounting.approveJournal(posting.journal.id,'independent-approver@qa.test');await qa.accounting.postJournal(posting.journal.id,'ledger@qa.test');
 const balance=(await pg.query('select sum(debit_halalas)::int d,sum(credit_halalas)::int c from journal_lines where journal_entry_id=$1',[posting.journal.id])).rows[0];assert.deepEqual(balance,{d:280000,c:280000});
 await body(await qa.records.PATCH(request('/api/portal/records',{entity:'finance',id:salary.id,status:'paid'},'PATCH')),200);
 await body(await qa.records.PATCH(request('/api/portal/records',{entity:'finance',id:salary.id,status:'cancelled'},'PATCH')),409);
});
test("archive and release preserve worker history and financial records",async()=>{
 qa.setTestActor(supervisor());const row=(await body(await submitIncident({incidentType:'abandonment',startDate:'2026-08-15',endDate:'2026-08-15'}),201)).incident;
 qa.setTestActor(actor(true));await body(await decideIncident(row,{deduct:false,warning:true,archiveWorker:true}),200);
 const savedWorker=(await pg.query('select archived_at,status from workers where id=$1',[worker.id])).rows[0];assert.ok(savedWorker.archived_at);assert.equal(savedWorker.status,'suspended');assert.equal((await pg.query('select status from contract_worker_assignments where id=$1',[assignment.id])).rows[0].status,'released');
 assert.equal((await pg.query('select status from financial_records where id=$1',[salary.id])).rows[0].status,'paid');
});
test("worker assignment refuses a contract whose active status outlived its term",async()=>{
 qa.setTestActor(actor(true));await pg.query("update workforce_contracts set end_date='2026-08-31' where id=$1",[contract.id]);await pg.query("update workers set archived_at=null,status='available' where id=$1",[worker.id]);
 const response=await qa.assignmentRoute.POST(request(`/api/portal/contracts/${contract.id}/workers`,{workerId:worker.id,contractProfessionId:assignment.contractProfessionId}),{params:Promise.resolve({id:String(contract.id)})});assert.equal(response.status,409);
});

test("deductions cannot make net salary negative; a remainder carries to the next month",async()=>{
 qa.setTestActor(actor(true));await pg.query("update workforce_contracts set end_date='2026-12-31' where id=$1",[contract.id]);
 [worker]=await db.insert(qa.schema.workers).values({workerNumber:'W-CARRY',fullName:'عامل الرصيد',nationality:'مصري',profession:'عامل عام',clientSite:'جدة',status:'available'}).returning();
 [assignment]=await db.insert(qa.schema.contractWorkerAssignments).values({workerId:worker.id,contractId:contract.id,contractProfessionId:assignment.contractProfessionId,status:'released',assignedBy:'qa',assignedAt:'2026-08-31T00:00:00Z',releasedAt:'2026-08-31T23:59:00Z'}).returning();
 const row=(await body(await submitIncident({startDate:'2026-08-31',endDate:'2026-08-31'}),201)).incident;await body(await decideIncident(row,{warning:false}),200);
 const preview=await qa.payroll.calculateWorkerSalary(db,worker.id,contract.id,'2026-08');assert.equal(preview.grossAmountHalalas,9677);assert.equal(preview.amountHalalas,0);assert.equal(preview.deductionAmountHalalas,9677);assert.equal(preview.carryForwardHalalas,323);
 await body(await qa.records.POST(request('/api/portal/records',salaryInput(0))),201);
 await db.insert(qa.schema.contractWorkerAssignments).values({workerId:worker.id,contractId:contract.id,contractProfessionId:assignment.contractProfessionId,status:'active',assignedBy:'qa',assignedAt:'2026-09-01T00:00:00Z'});
 const next=await qa.payroll.calculateWorkerSalary(db,worker.id,contract.id,'2026-09');assert.equal(next.grossAmountHalalas,300000);assert.equal(next.deductionAmountHalalas,323);assert.equal(next.amountHalalas,299677);
});
test("employee payroll prorates salary, excludes Friday from unpaid leave and consumes bonuses only once",async()=>{
 qa.setTestActor(actor(true));const account=(await pg.query("select id from chart_of_accounts where code='1100'")).rows[0];
 const [bank]=await db.insert(qa.schema.bankAccounts).values({accountCode:'HR-QA',bankName:'QA',accountName:'QA',iban:'SA0000000000000000000000',ledgerAccountId:account.id}).returning();
 const [employee]=await db.insert(qa.schema.employees).values({employeeNumber:'E-QA',fullName:'موظف اختبار',jobTitle:'موظف',department:'general',mobile:'0566110144',hireDate:'2026-01-01',baseSalaryHalalas:310000}).returning();
 await db.insert(qa.schema.employeeLeaveRequests).values({employeeId:employee.id,leaveType:'unpaid',startDate:'2026-08-06',endDate:'2026-08-08',days:2,status:'approved',requestedBy:'qa'});
 await db.insert(qa.schema.employeeMovements).values({employeeId:employee.id,movementType:'bonus',effectiveDate:'2026-08-15',description:'مكافأة معتمدة',amountHalalas:20000,createdBy:'qa'});
 const payload={action:'generate-payroll',periodMonth:'2026-08',paymentDate:'2026-08-31',bankAccountId:bank.id};
 const bonus=await body(await qa.hr.POST(request('/api/portal/hr',{...payload,payrollType:'bonus'})),201);assert.equal(bonus.run.totalGrossHalalas,20000);
 const monthly=await body(await qa.hr.POST(request('/api/portal/hr',{...payload,payrollType:'monthly'})),201);assert.equal(monthly.run.totalGrossHalalas,310000);assert.equal(monthly.run.totalDeductionsHalalas,20000);assert.equal(monthly.run.totalNetHalalas,290000);
 await body(await qa.hr.POST(request('/api/portal/hr',{...payload,payrollType:'monthly'})),409);
 await body(await qa.hr.POST(request('/api/portal/hr',{...payload,periodMonth:'2026-09',paymentDate:'2026-09-99'})),400);
 qa.setTestActor(supervisor());await body(await qa.hr.POST(request('/api/portal/hr',{...payload,periodMonth:'2026-09'})),403);
});
test("incident and conversion alerts deduplicate and resolve after review without restoring hidden alerts",async()=>{
 qa.setTestActor(actor(true));await qa.notifications.refreshOperationalNotifications({force:true});
 let alerts=await qa.notifications.listPortalNotifications(actor(true));const alert=alerts.find(a=>a.eventType==='worker-incident-awaiting-review');assert.ok(alert);assert.equal(alert.actionView,'workforce-supervision');
 const total=alerts.filter(a=>a.dedupeKey===alert.dedupeKey).length;assert.equal(total,1);
 await qa.notificationRoute.PATCH(request('/api/portal/notifications',{action:'dismiss',ids:[alert.id]},'PATCH'));
 await qa.notifications.refreshOperationalNotifications({force:true});alerts=await qa.notifications.listPortalNotifications(actor(true));assert.ok(!alerts.some(a=>a.id===alert.id));
 await pg.query("update worker_incidents set status='accepted' where id=$1",[Number(alert.entityId)]);await qa.notifications.refreshOperationalNotifications({force:true});
 assert.equal((await pg.query('select status from portal_notifications where id=$1',[alert.id])).rows[0].status,'resolved');
});

test("legacy attendance for a salary already recorded cannot be charged again through an incident",async()=>{
 qa.setTestActor(actor(true));const oldWorker=(await pg.query("select id from workers where worker_number='W-QA-INC'")).rows[0];
 const oldAssignment=(await pg.query('select id,contract_profession_id from contract_worker_assignments where worker_id=$1 order by id limit 1',[oldWorker.id])).rows[0];
 const payment=(await pg.query("select id from contract_payment_schedules where contract_id=$1 and service_period='2026-08'",[contract.id])).rows[0];
 await db.insert(qa.schema.contractWorkerAbsences).values({contractId:contract.id,contractProfessionId:oldAssignment.contract_profession_id,paymentScheduleId:payment.id,workerId:oldWorker.id,profession:'عامل عام',absenceDate:'2026-08-20',absenceEndDate:'2026-08-20',chargeableDays:1,absentCount:1,dailyRateHalalas:10000,deductionHalalas:10000,clientDailyRateHalalas:0,clientDeductionHalalas:0,dedupeKey:'legacy-paid-absence',recordedBy:'qa'});
 const row=(await body(await submitIncident({workerId:oldWorker.id,assignmentId:oldAssignment.id,startDate:'2026-08-20',endDate:'2026-08-20'}),201)).incident;
 await body(await decideIncident(row),409);
});
