import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { before, after, test } from "node:test";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";

let pg, db, qa, directory, requestRow, opportunity, quote, contract;
const actor = (root = false) => ({ role: root ? "admin" : "manager", department: "workforce", functionalRoles: [], functionalPermissions: ["contracts.write", "contracts.read", "contracts.approve", "workforce.write", "documents.read", "documents.share", "video.read", "video.manage", "conversations.write"], user: { email: root ? "owner@qa.test" : "staff@qa.test", displayName: "QA" } });
const request = (path, body, method = "POST") => new Request(`https://www.dally.info${path}`, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

before(async () => {
  await mkdir(resolve("node_modules/.cache"), { recursive: true });
  directory = await mkdtemp(resolve("node_modules/.cache/dali-contract-parity-"));
  const outfile = resolve(directory, "qa.mjs");
  await build({ stdin: { contents: `export * as contractEdit from './app/api/portal/contracts/[id]/route.ts'; export * as attachmentRoute from './app/api/portal/commercial-attachments/route.ts'; export * from './lib/commercial-attachment-storage.ts'; export * from './lib/commercial-attachments.ts'; export * from './lib/contract-workforce-coverage.ts'; export * as schema from './db/schema.ts'; export * as quoteEdit from './app/api/portal/operations/quotes/[id]/route.ts'; export * as generate from './app/api/portal/documents/generate/route.ts'; export * as requests from './app/api/portal/requests/route.ts'; export * as operations from './app/api/portal/operations/route.ts'; export * as quoteShare from './app/api/portal/operations/quotes/[id]/share/route.ts'; export * as documentShare from './app/api/portal/documents/share/route.ts'; export * as download from './app/api/shared-documents/[token]/route.ts'; export * as conversations from './app/api/portal/conversations/route.ts'; export * as video from './lib/video-interviews.ts'; export * as videoPortal from './app/api/portal/video-interviews/route.ts'; export * as videoPublic from './app/api/video-interviews/route.ts'; export * as notifications from './lib/portal-notifications.ts'; export * as notificationRoute from './app/api/portal/notifications/route.ts'; export {resolveShareRecipient} from './lib/share-recipient.ts'; export {readCommercialTerms,commercialTermsFromRequest} from './lib/commercial-terms.ts'; export {setTestDb,setTestActor} from 'qa-control';`, resolveDir: process.cwd() }, outfile, bundle: true, platform: "node", format: "esm", packages: "external", logLevel: "silent", plugins: [{ name: "isolate-environment", setup(b) {
    b.onResolve({ filter: /^(qa-control|@\/db|@\/lib\/portal-access)$/ }, () => ({ path: "state", namespace: "state" }));
    b.onLoad({ filter: /.*/, namespace: "state" }, () => ({ contents: `let db,actor; export function getDb(){return db} export function getSqlClient(){throw new Error('Unexpected raw SQL dependency')} export function setTestDb(value){db=value} export function setTestActor(value){actor=value} export async function requirePortalApiRole(){return actor} export function canAdministerPortalUsers(a){return a.role==='admin'||a.functionalRoles.some(r=>['system_owner','system_admin'].includes(r))} export async function hasPortalPermission(a,r,v){if(a.denyCommercial&&r==='contracts'&&['read','write'].includes(v))return false; return canAdministerPortalUsers(a)||a.functionalPermissions.includes(r+'.'+v)} export function canSharePortalDocuments(a){return a.role==='admin'||a.functionalPermissions.includes('documents.share')} export function canAccessPortalDocuments(a){return a.role==='admin'||a.functionalPermissions.includes('documents.read')} export function canAccessPortalConversations(a){return a.role==='admin'||a.functionalPermissions.includes('conversations.write')} export const canManagePortalConversations=canAccessPortalConversations;` }));
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
  await pg.exec("ALTER TABLE workforce_requests DROP COLUMN approval_status, DROP COLUMN approved_by, DROP COLUMN approved_at, DROP COLUMN approval_reason; ALTER TABLE quote_versions DROP COLUMN commercial_terms_json;");
  await pg.exec(await readFile("drizzle-pg/0072_commercial_approval_and_terms.sql", "utf8"));
  db = drizzle(pg, { schema: qa.schema }); qa.setTestDb(db); qa.setTestActor(actor());
  [requestRow] = await db.insert(qa.schema.workforceRequests).values({ trackingCode: "DAL-QA-APPROVAL", fullName: "QA Contact", companyName: "QA Client", mobile: "٠٥٦٦١١٠١٤٤", email: "client@qa.test", specialization: "توريد العمالة", details: "QA service scope", requestType: "quotation", activityType: "workforce", workSite: "Makkah", requiredStartDate: "2026-10-01", clientAddress: "QA address", representativeTitle: "Manager", quotationItemsJson: JSON.stringify([{ description: "عامل عام", quantity: 2, durationMonths: 12 }]), quotationTermsJson: JSON.stringify({ workingHours: "8 hours", weeklyOff: "Friday", paymentTerms: "Monthly", specialTerms: "QA special term" }) }).returning();
  const [client] = await db.insert(qa.schema.clients).values({ clientCode: "QA-CLIENT", legalName: "QA Client", sourceRequestId: requestRow.id, createdBy: "qa" }).returning();
  [opportunity] = await db.insert(qa.schema.salesOpportunities).values({ opportunityCode: "QA-OPP", clientId: client.id, sourceRequestId: requestRow.id, title: "QA", ownerEmail: "qa", createdBy: "qa" }).returning();
  await pg.query("update workforce_requests set client_id=$1,opportunity_id=$2 where id=$3", [client.id, opportunity.id, requestRow.id]);
});
after(async () => { if (directory) await rm(directory, { recursive: true, force: true }); await pg?.close(); });

const quoteInput = () => ({ action: "create-quote", idempotencyKey: crypto.randomUUID(), sourceRequestId: requestRow.id, opportunityId: opportunity.id, issueDate: "2026-09-17", validUntil: "2026-10-17", activityLabel: "توريد العمالة", workSite: "Makkah", accommodationParty: "counterparty", transportParty: "dali", vatRate: 15, terms: "Monthly", items: [{ profession: "عامل عام", quantity: 2, durationMonths: 12, unitPrice: 1000, actualSalary: 800, sponsorshipType: "dali", ajirContractStatus: "not_applicable" }] });


const ctx = id => ({params: Promise.resolve({id: String(id)})});
const pdfFile = name => new File(["%PDF-1.7\nParity attachment"], name, {type: "application/pdf"});
const commercial = {title: "عقد تشغيل متكامل", titleEn: "Full operation contract", clientCr: "1010000000", clientVat: "300000000000003", clientAddress: "Makkah address 2026", clientRepresentative: "First Representative", clientRepresentativeTitle: "Director", clientMobile: "0501234567", clientEmail: "director@qa.test", workingHours: "Eight hours", weeklyOff: "Friday", paymentTerms: "Monthly transfer", specialTerms: "Full scope terms", details: "Complete commercial service scope", detailsEn: "English scope for conversion", startDate: "2026-10-01", contractDirection: "dali_supplier", showPaymentSchedule: false};

test("request attachment migration is additive and repeatable; labelled files are stored before approval", async () => {
  for (let i=0;i<2;i++) await pg.exec(await readFile("drizzle-pg/0074_commercial_attachment_snapshots.sql", "utf8"));
  for (const field of qa.commercialAttachmentFields) await qa.saveCommercialAttachment({requestId: requestRow.id}, pdfFile(field.name+".pdf"), field.kind, "client@qa.test");
  const row = (await pg.query("select * from workforce_requests where id=$1", [requestRow.id])).rows[0];
  assert.equal(qa.commercialAttachmentRefs(row.quotation_terms_json).length,3);
  await pg.query("update workforce_requests set approval_status='approved',approved_by='owner@qa.test',approved_at=$1 where id=$2", [new Date().toISOString(), requestRow.id]);
  await assert.rejects(qa.saveCommercialAttachment({requestId:requestRow.id},pdfFile("replace.pdf"),"commercial-registration","client@qa.test"), e=>e.status===409);
});

test("full quote editing persists rows, costs, custom VAT, all text and trusted source files atomically", async () => {
  qa.setTestActor(actor(true));
  const response = await qa.operations.POST(request("/api/portal/operations", {...quoteInput(), ...commercial}));
  let body = await response.json(); assert.equal(response.status,201,body.error); quote=body.quote;
  assert.equal(qa.commercialAttachmentRefs(quote.commercialTermsJson).length,3);
  const edit = {...commercial, recordVersion:quote.recordVersion, activityLabel:"توريد العمالة", vatRate:7.25, accommodationParty:"not_applicable", transportParty:"counterparty", items:[{profession:"عامل عام",quantity:3,durationMonths:12,unitPrice:1234.57,actualSalary:987.65,sponsorshipType:"dali",ajirContractStatus:"with_ajir",notes:"kept note"}], commercialAttachments:[{id:999999,kind:"national-address",fileName:"forged.pdf"}]};
  const saved = await qa.quoteEdit.PATCH(request("/api/quote", edit,"PATCH"),ctx(quote.id)); body=await saved.json(); assert.equal(saved.status,200,body.error); quote=body.quote;
  const terms=qa.readCommercialTerms(quote.commercialTermsJson);
  for(const [key,value] of Object.entries(commercial)) assert.equal(terms[key],value,key);
  assert.equal(quote.vatRateBps,725); assert.equal(quote.accommodationParty,"not_applicable");
  const items=(await pg.query("select * from quote_items where quote_version_id=$1",[quote.id])).rows;
  assert.equal(items[0].quantity,3); assert.equal(items[0].unit_price_halalas,123457); assert.equal(items[0].actual_salary_halalas,98765); assert.equal(items[0].ajir_contract_status,"with_ajir");
  assert.equal(qa.commercialAttachmentRefs(quote.commercialTermsJson).length,3); assert.equal(qa.commercialAttachmentRefs(quote.commercialTermsJson).some(f=>f.id===999999),false);
  const stale=await qa.quoteEdit.PATCH(request("/api/quote",edit,"PATCH"),ctx(quote.id)); assert.equal(stale.status,409);
  const invalid=await qa.quoteEdit.PATCH(request("/api/quote",{recordVersion:quote.recordVersion,items:[{profession:"عامل عام",quantity:-1,unitPrice:1234.57}]},"PATCH"),ctx(quote.id)); assert.equal(invalid.status,400);
  assert.equal((await pg.query("select record_version from quote_versions where id=$1",[quote.id])).rows[0].record_version,quote.recordVersion);
});

test("quote file access is permission checked and restricted to its immutable source lineage", async () => {
  const ref=qa.commercialAttachmentRefs(quote.commercialTermsJson)[0];
  assert.equal((await qa.storedQuoteAttachment(quote,ref.id)).requestId,requestRow.id);
  assert.equal(await qa.storedQuoteAttachment({...quote,opportunityId:-1},ref.id),null);
  qa.setTestActor({...actor(),functionalPermissions:[]});
  assert.equal((await qa.attachmentRoute.GET(new Request(`https://www.dally.info/api/portal/commercial-attachments?quoteId=${quote.id}&fileId=${ref.id}`))).status,403);
  qa.setTestActor(actor(true));
  const fetched=await qa.attachmentRoute.GET(new Request(`https://www.dally.info/api/portal/commercial-attachments?quoteId=${quote.id}&fileId=${ref.id}`)); assert.equal(fetched.status,200); assert.match(await fetched.text(),/^%PDF-1.7/);
});

test("approved quote converts without reuploading any of its three client files", async () => {
  qa.setTestActor(actor(true));
  await pg.query("update quote_versions set status='approved',approved_by='owner@qa.test',approved_at=$1 where id=$2",[new Date().toISOString(),quote.id]);
  await db.insert(qa.schema.companyAssets).values(["stamp","signature"].map(slot=>({slot,fileName:slot+".png",storageKey:slot+".png",contentType:"image/png",sizeBytes:1,uploadedBy:"qa"})));
  const form=new FormData();
  const payload={...qa.readCommercialTerms(quote.commercialTermsJson),documentType:"workforce_contract",issueDate:quote.issueDate,quoteVersionId:quote.id,sourceRequestId:requestRow.id,quantityMode:"fixed",seasonType:"regular",vatEnabled:"true",vatRate:7.25,accommodationParty:"لا ينطبق",transportParty:"يوفره الطرف الآخر",professions:[{profession:"عامل عام",requiredCount:3,unitSalary:1234.57,actualSalary:987.65,sponsorshipType:"dali",ajirContractStatus:"with_ajir",workerIds:[]}]};
  for(const [key,value] of Object.entries(payload)) form.set(key,Array.isArray(value)?JSON.stringify(value):String(value));
  const response=await qa.generate.POST(new Request("https://www.dally.info/api/portal/documents/generate",{method:"POST",body:form})); const body=await response.json(); assert.equal(response.status,201,body.error); contract=body.contract;
  assert.equal(contract.amountHalalas,quote.totalHalalas);
  const metadata=JSON.parse(body.document.metadataJson);
  for(const key of ["titleEn","detailsEn","workingHours","weeklyOff","clientRepresentative","clientMobile","paymentTerms","specialTerms"]) assert.equal(metadata[key],commercial[key],key);
  await assert.rejects(qa.saveCommercialAttachment({quoteId:quote.id},pdfFile("replace.pdf"),"commercial-registration","qa"),e=>e.status===409);
});

test("full contract edit saves metadata and financial rows; stale changes and malformed bodies do not mutate", async () => {
  const fetched=await qa.contractEdit.GET(new Request("https://www.dally.info/api/contract"),ctx(contract.id)); let body=await fetched.json(); assert.equal(fetched.status,200,body.error);
  const version=body.contract.versionNumber;
  const changes={...commercial,title:"العقد بعد التعديل",clientName:"Updated Client",clientRepresentative:"Updated Representative",workingHours:"Six hours",detailsEn:"Revised English scope",versionNumber:version,startDate:"2027-01-31",issueDate:"2027-01-01",quantityMode:"fixed",seasonType:"regular",vatRateBps:1500,accommodationParty:"يوفره الطرف الثاني",transportParty:"لا ينطبق",professions:[{profession:"كهربائي",requiredCount:2,unitSalaryHalalas:100001,actualSalaryHalalas:80001,sponsorshipType:"dali",ajirContractStatus:"with_ajir"}]};
  const saved=await qa.contractEdit.PATCH(request("/api/contract",changes,"PATCH"),ctx(contract.id)); body=await saved.json(); assert.equal(saved.status,200,body.error); contract=body.contract;
  assert.equal(contract.clientName,"Updated Client"); assert.equal(contract.title,changes.title); assert.equal(contract.status,"draft"); assert.equal(contract.approvedBy,null); assert.equal(contract.versionNumber,version+1); assert.equal(contract.endDate,"2028-01-31");
  assert.equal(body.professions[0].profession,"كهربائي"); assert.equal(body.professions[0].actualSalaryHalalas,80001);
  const doc=(await pg.query("select metadata_json from company_documents where id=$1",[contract.documentId])).rows[0]; const metadata=JSON.parse(doc.metadata_json);
  assert.equal(metadata.clientRepresentative,"Updated Representative"); assert.equal(metadata.detailsEn,"Revised English scope"); assert.equal(metadata.workingHours,"Six hours");
  const payments=(await pg.query("select * from contract_payment_schedules where contract_id=$1 order by installment_number",[contract.id])).rows;
  assert.equal(payments.length,12); assert.equal(payments[0].due_date,"2027-02-28"); assert.equal(payments.reduce((n,r)=>n+r.amount_halalas,0),contract.amountHalalas); assert.equal(payments.reduce((n,r)=>n+r.vat_halalas,0),metadata.vatHalalas);
  assert.equal((await qa.contractEdit.PATCH(request("/api/contract",changes,"PATCH"),ctx(contract.id))).status,409);
  assert.equal((await qa.contractEdit.PATCH(request("/api/contract",[],"PATCH"),ctx(contract.id))).status,400);
  assert.equal((await pg.query("select version_number from workforce_contracts where id=$1",[contract.id])).rows[0].version_number,version+1);
});

test("open quantity contract editing keeps agreed unit rates but no fictitious invoice commitments", async () => {
  const response=await qa.contractEdit.PATCH(request("/api/contract",{versionNumber:contract.versionNumber,quantityMode:"open",professions:[{profession:"كهربائي",requiredCount:0,unitSalaryHalalas:100001,actualSalaryHalalas:80001,sponsorshipType:"dali",ajirContractStatus:"with_ajir"}]},"PATCH"),ctx(contract.id)); const body=await response.json(); assert.equal(response.status,200,body.error); contract=body.contract;
  assert.equal(contract.quantityMode,"open"); assert.equal(contract.amountHalalas,0); assert.equal(body.professions[0].requiredCount,0); assert.equal(body.professions[0].unitSalaryHalalas,100001);
  assert.equal((await pg.query("select count(*)::int n from contract_payment_schedules where contract_id=$1",[contract.id])).rows[0].n,0);
  await pg.query("update workforce_contracts set status='active' where id=$1",[contract.id]);
  assert.equal((await qa.contractEdit.PATCH(request("/api/contract",{title:"Must not change"},"PATCH"),ctx(contract.id))).status,409);
});

test("coverage counts each profession independently and open contracts remain unbounded", () => {
  const professions=[{id:1,requiredCount:1},{id:2,requiredCount:2}];
  const assignments=[{contractProfessionId:1,workerId:1,status:"active"},{contractProfessionId:1,workerId:2,status:"active"},{contractProfessionId:2,workerId:3,status:"planned"}];
  const coverage=qa.contractWorkforceCoverage(professions,assignments); assert.equal(coverage.shortage,2); assert.equal(coverage.percent,33); assert.equal(coverage.rows[1].remaining,1);
  const open=qa.contractWorkforceCoverage(professions,assignments,true); assert.equal(open.percent,null); assert.equal(open.shortage,0); assert.equal(open.rows[0].remaining,null);
  const profession={profession:"كهربائي",sponsorshipType:"dali"}; const worker={id:8,profession:"كهربائي",sponsorshipType:"dali",status:"available"};
  assert.equal(qa.eligibleContractWorker(worker,profession,assignments),true);
  assert.equal(qa.eligibleContractWorker({...worker,archivedAt:"2026-01-01"},profession,assignments),false);
  assert.equal(qa.eligibleContractWorker({...worker,id:3},profession,assignments),false);
});

test("database assignment guard permits open capacity while retaining duplicate and fixed-capacity protection",async()=>{
  await pg.exec(await readFile("drizzle-pg/0075_open_contract_assignment_capacity.sql","utf8"));
  await pg.exec("CREATE TRIGGER parity_assignment_guard BEFORE INSERT OR UPDATE ON contract_worker_assignments FOR EACH ROW EXECUTE FUNCTION public.contract_assignment_active_guard()");
  const [profession]=await db.select().from(qa.schema.contractProfessions);
  const workerValues=n=>({workerNumber:`W-OPEN-${n}`,fullName:`عامل ${n}`,nationality:"اختبار",profession:profession.profession,sponsorshipType:"dali",status:"assigned",clientSite:contract.workSite,beneficiaryName:contract.clientName,clientId:contract.clientId});
  const [one,two]=await db.insert(qa.schema.workers).values([workerValues(1),workerValues(2)]).returning();
  const assign=workerId=>db.insert(qa.schema.contractWorkerAssignments).values({contractId:contract.id,contractProfessionId:profession.id,workerId,status:"active",assignedBy:"qa"});
  await assign(one.id);await assign(two.id);
  assert.equal((await pg.query("select count(*)::int n from contract_worker_assignments where contract_id=$1",[contract.id])).rows[0].n,2);
  await assert.rejects(assign(one.id));
  await pg.query("update workforce_contracts set quantity_mode='fixed' where id=$1",[contract.id]);
  await pg.query("update contract_professions set required_count=2 where id=$1",[profession.id]);
  const [three]=await db.insert(qa.schema.workers).values(workerValues(3)).returning();
  await assert.rejects(assign(three.id));
});
