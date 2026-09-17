import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";

// Run the production transaction helpers against PostgreSQL, without production credentials.
let pg, db, qa, directory, contract, recoveredLegacy;
before(async () => {
  await mkdir(resolve("node_modules/.cache"), { recursive: true });
  directory = await mkdtemp(resolve("node_modules/.cache/dali-legal-"));
  const outfile = resolve(directory, "helpers.mjs");
  await build({ stdin: { contents: `export * as schema from './db/schema.ts'; export * as notifications from './lib/portal-notifications.ts'; export * as notificationRoute from './app/api/portal/notifications/route.ts'; export * as executiveRoute from './app/api/portal/executive-center/route.ts'; export * as referralRoute from './app/api/portal/legal-referrals/route.ts'; export {setTestActor,setTestDb} from 'qa-control'; export {registerLegalReferral} from './lib/legal-referrals.ts'; export {applyContractCancellation} from './lib/contract-cancellation.ts'; export {createDraftJournal} from './lib/accounting.ts'; export {isLegalContractDocumentShareable,loadLegalRecordContractDocuments} from './lib/contract-legal-documents.ts';`, resolveDir: process.cwd() }, outfile, bundle: true, platform: "node", format: "esm", packages: "external", logLevel: "silent", plugins: [{ name: "isolate-effects", setup(build) {
    build.onResolve({ filter: /^@\/lib\/audit$/ }, args => ({ path: args.path, namespace: "effects" }));
    build.onLoad({ filter: /.*/, namespace: "effects" }, () => ({ contents: "export async function auditPortalAction(){}; export async function emitPortalNotification(){};" }));
    build.onResolve({ filter: /^@\/lib\/contract-payment-invoicing$/ }, () => ({ path: "invoicing", namespace: "invoice-effect" }));
    build.onLoad({ filter: /.*/, namespace: "invoice-effect" }, () => ({ contents: "export async function issueDueContractInvoice(){return null}" }));
    build.onResolve({ filter: /^(qa-control|@\/db|@\/lib\/portal-access)$/ }, () => ({ path: "state", namespace: "isolated-state" }));
    build.onLoad({ filter: /.*/, namespace: "isolated-state" }, () => ({ contents: `let db,actor;export function getDb(){if(!db)throw new Error('test requires explicit transaction');return db} export function getSqlClient(){throw new Error('SQL client unavailable in isolated test')} export function setTestDb(value){db=value} export function setTestActor(value){actor=value} export async function requirePortalApiRole(){return actor} export async function hasPortalPermission(value,module,action){return value.role==='admin'||value.permissions?.includes(module+':'+action)||false}` }));
  } }] });
  qa = await import(pathToFileURL(outfile));
  pg = new PGlite();
  await pg.exec("CREATE ROLE dali_app; CREATE ROLE anon; CREATE ROLE authenticated;");
  const ddl = await generateMigration(generateDrizzleJson({}), generateDrizzleJson(qa.schema));
  await pg.exec(ddl.join("\n"));
  // Reconstruct the immediately preceding schema to exercise the actual upgrade SQL.
  await pg.exec(`DROP TABLE legal_referrals;
    ALTER TABLE workforce_contracts DROP COLUMN cancellation_effective_date, DROP COLUMN cancellation_summary_json;
    ALTER TABLE contract_payment_schedules DROP COLUMN cancellation_disposition, DROP COLUMN cancellation_original_amount_halalas;
    ALTER TABLE legal_judgment_payment_requests DROP COLUMN payment_kind;
    ALTER TABLE financial_records DROP COLUMN legal_record_id, DROP COLUMN employee_id;`);
  await pg.exec(`INSERT INTO legal_records(reference_code,category,title,counterparty,file_snapshot_json) VALUES ('LEGACY-BAD','case','legacy','test','not json');`);
  await pg.exec(`INSERT INTO company_documents(id,reference_code,title,category,document_type,file_name,storage_key,content_type,size_bytes,created_by) VALUES (10000,'LEGACY-DOC','Legacy','contracts','workforce_contract','qa.pdf','qa.pdf','application/pdf',1,'qa');
    INSERT INTO workforce_contracts(id,reference_code,document_id,client_name,title,work_site,issue_date,start_date,end_date,details,created_by) VALUES (10000,'LEGACY-CONTRACT',10000,'Legacy','Legacy','Makkah','2026-01-01','2026-01-01','2026-12-31','QA','qa');
    INSERT INTO contract_payment_schedules(id,contract_id,installment_number,title,due_date,percentage_bps,amount_halalas,created_by) VALUES (10000,10000,1,'Legacy one','2026-06-01',5000,10000,'qa'),(10001,10000,2,'Legacy two','2026-07-01',5000,10000,'qa');
    INSERT INTO legal_records(id,reference_code,category,title,counterparty,contract_id,file_snapshot_json) VALUES (10000,'LEGACY-CASE','case','Legacy','Legacy',10000,'{"referral":{"paymentId":10001}}');
    INSERT INTO portal_activity(actor_email,action,entity_type,entity_id,after_json,created_at) VALUES ('qa','client-file-referred-legal','legal-record','10000','{"paymentId":10000}','2026-08-01'),('qa','client-file-referred-legal','legal-record','10000','truncated json','2026-08-02');`);
  await pg.exec(await readFile("drizzle-pg/0071_legal_referral_lifecycle.sql", "utf8"));
  recoveredLegacy=(await pg.query("select source_id,status from legal_referrals where contract_id=10000 order by source_id")).rows;
  await pg.exec(`DELETE FROM legal_referrals WHERE contract_id=10000; DELETE FROM portal_activity WHERE entity_id='10000'; DELETE FROM legal_records WHERE id=10000; DELETE FROM contract_payment_schedules WHERE contract_id=10000; DELETE FROM workforce_contracts WHERE id=10000; DELETE FROM company_documents WHERE id=10000;`);
  db = drizzle(pg, { schema: qa.schema });
  const [document] = await db.insert(qa.schema.companyDocuments).values({ referenceCode: "TEST-CONTRACT-DOC", title: "test", category: "contracts", documentType: "workforce_contract", fileName: "test.pdf", storageKey: "test.pdf", contentType: "application/pdf", sizeBytes: 1, createdBy: "qa" }).returning();
  [contract] = await db.insert(qa.schema.workforceContracts).values({ referenceCode: "QA-CONTRACT", documentId: document.id, clientName: "QA Client", title: "QA", workSite: "Makkah", issueDate: "2026-08-01", startDate: "2026-08-01", endDate: "2027-08-01", details: "test", status: "active", approvedBy: "owner@qa.test", createdBy: "qa" }).returning();
  await db.insert(qa.schema.contractPaymentSchedules).values(["2026-08-01", "2026-09-01", "2026-11-01"].map((dueDate, i) => ({ contractId: contract.id, installmentNumber: i+1, title: `payment ${i+1}`, dueDate, percentageBps: 3333, amountHalalas: 115000, subtotalHalalas: 100000, vatHalalas: 15000, vatRateBps: 1500, billingBasis: "monthly_salary", servicePeriod: dueDate.slice(0,7), status: i===0?"due":"scheduled", createdBy: "qa" })));
});
after(async () => { if (directory) await rm(directory, { recursive: true, force: true }); await pg?.close(); });

const referralInput = (id) => ({ sourceType: "payment", sourceId: id, contractId: contract.id, reason: "Overdue installment test", actorEmail: "owner@qa.test", title: "QA referral", counterparty: "QA Client", now: "2026-09-17T10:00:00Z" });

test("migration tolerates historical invalid snapshots and enables protected referral storage", async () => {
  const { rows } = await pg.query("select relrowsecurity from pg_class where relname = 'legal_referrals'");
  assert.equal(rows[0].relrowsecurity, true);
  assert.equal((await pg.query("select has_table_privilege('dali_app','legal_referrals','SELECT,INSERT,UPDATE,DELETE') allowed")).rows[0].allowed,true);
  assert.equal((await pg.query("select has_table_privilege('anon','legal_referrals','SELECT') allowed")).rows[0].allowed,false);
  assert.deepEqual(recoveredLegacy,[{source_id:10000,status:"active"},{source_id:10001,status:"active"}]);
});

test("a duplicate referral rolls back its case, returning enables a new case, another installment is independent", async () => {
  const first = await db.transaction(tx => qa.registerLegalReferral(tx, referralInput(1)));
  await assert.rejects(db.transaction(tx => qa.registerLegalReferral(tx, referralInput(1))), /سبق إحالة/);
  assert.equal((await pg.query("select count(*)::int n from legal_referrals")).rows[0].n, 1);
  await pg.query("update legal_referrals set status='returned',returned_by='lawyer',returned_at='2026-09-17',return_reason='Return for more information' where id=$1", [first.referral.id]);
  const again = await db.transaction(tx => qa.registerLegalReferral(tx, referralInput(1)));
  assert.notEqual(again.matter.id, first.matter.id);
  await db.transaction(tx => qa.registerLegalReferral(tx, referralInput(2)));
  assert.equal((await pg.query("select count(*)::int n from legal_referrals")).rows[0].n, 3);
});

test("SQL itself rejects duplicate open referrals and mismatched source identities", async () => {
  const row = (await pg.query("select * from legal_referrals where status='active' limit 1")).rows[0];
  await assert.rejects(pg.query("insert into legal_referrals(legal_record_id,source_type,source_id,contract_id,payment_schedule_id,reason,referred_by) values($1,'payment',$2,$3,$2,'duplicate','qa')", [row.legal_record_id,row.source_id,contract.id]));
  await assert.rejects(pg.query("insert into legal_referrals(legal_record_id,source_type,source_id,contract_id,payment_schedule_id,reason,referred_by) values($1,'payment',999,$2,3,'mismatch','qa')", [row.legal_record_id,contract.id]));
  await assert.rejects(pg.query("insert into legal_referrals(legal_record_id,source_type,source_id,contract_id,reason,referred_by) values($1,'payment',3,$2,'missing payment identity','qa')", [row.legal_record_id,contract.id]));
  await assert.rejects(pg.query("update legal_referrals set status='returned',returned_by='qa',returned_at='2026-09-17',return_reason=null where id=$1", [row.id]));
});

test("cancellation preserves accrued debt, holds partial service, cancels future schedules and captures linked evidence", async () => {
  const result = await db.transaction(tx => qa.applyContractCancellation(tx, { contract, status: "terminated", reason: "Service terminated on customer request", actorEmail: "owner@qa.test", now: "2026-09-17T12:00:00Z" }));
  const rows = (await pg.query("select status,cancellation_disposition from contract_payment_schedules order by id")).rows;
  assert.deepEqual(rows.map(row => [row.status,row.cancellation_disposition]), [["due","preserve"],["scheduled","review_accrual"],["cancelled","cancel_future"]]);
  assert.equal(result.summary.cancelledFutureHalalas,115000);
  const snapshot=JSON.parse((await pg.query("select file_snapshot_json from legal_records where id=$1",[result.legalRecordId])).rows[0].file_snapshot_json);
  for (const key of ["documents","payments","finances","professions","assignments","workers"]) assert.ok(Array.isArray(snapshot[key]));
  assert.equal(snapshot.documents[0].id,contract.documentId);
});

test("a downstream legal insert failure rolls back cancellation schedule changes", async () => {
  await pg.exec("update contract_payment_schedules set status='scheduled',cancellation_disposition=null where id=3");
  await assert.rejects(db.transaction(tx => qa.applyContractCancellation(tx, { contract, status: "terminated", reason: "Rollback test", actorEmail: null, now: "2026-09-17T12:00:00Z" })));
  assert.equal((await pg.query("select status from contract_payment_schedules where id=3")).rows[0].status,"scheduled");
});

test("live contract approval gates both bundle collection and an existing bundle download", async () => {
  const document = await db.query.companyDocuments.findFirst();
  assert.equal(await qa.isLegalContractDocumentShareable(db,document), true);
  await pg.query("update workforce_contracts set approved_by=null where id=$1",[contract.id]);
  assert.equal(await qa.isLegalContractDocumentShareable(db,document), false);
  assert.equal((await qa.loadLegalRecordContractDocuments(db,{contractId:contract.id,fileSnapshotJson:null})).length,0);
  await pg.query("update workforce_contracts set approved_by='owner',status='active' where id=$1",[contract.id]);
  assert.equal((await qa.loadLegalRecordContractDocuments(db,{contractId:contract.id,fileSnapshotJson:null})).length,1);
});

test("journal creation participates in the caller transaction and rolls back on downstream failure", async () => {
  await db.insert(qa.schema.fiscalPeriods).values({ periodCode: "QA-2026", nameAr: "QA", startDate: "2026-01-01", endDate: "2026-12-31", status: "open" });
  const accounts=await db.insert(qa.schema.chartOfAccounts).values([{code:"5290",nameAr:"Legal",accountType:"expense",normalBalance:"debit",isPosting:true},{code:"1110",nameAr:"Bank",accountType:"asset",normalBalance:"debit",isPosting:true}]).returning();
  const input={entryDate:"2026-09-17",description:"QA payment",sourceType:"financial-record",sourceId:"1",actorEmail:"owner",lines:[{accountId:accounts[0].id,debitHalalas:20000},{accountId:accounts[1].id,creditHalalas:20000}]};
  await assert.rejects(db.transaction(async tx=>{await qa.createDraftJournal(input,tx);throw new Error("downstream failure");}),/downstream failure/);
  assert.equal((await pg.query("select count(*)::int n from journal_entries")).rows[0].n,0);
  await db.transaction(tx=>qa.createDraftJournal(input,tx));
  const totals=(await pg.query("select sum(debit_halalas)::int debit,sum(credit_halalas)::int credit from journal_lines")).rows[0];
  assert.equal(totals.debit,20000);assert.equal(totals.debit,totals.credit);
});


test("executive API rejects a department manager and admits only a root actor", async () => {
  qa.setTestDb(db);
  qa.setTestActor({role:"manager",functionalRoles:["finance_manager"],user:{email:"manager@qa.test"}});
  assert.equal((await qa.executiveRoute.GET()).status,403);
  qa.setTestActor({role:"admin",functionalRoles:[],user:{email:"owner@qa.test"}});
  const response=await qa.executiveRoute.GET();
  assert.equal(response.status,200);
  assert.equal(typeof (await response.json()).pendingContracts,"number");
});

test("employee referral API enforces department permission, rejects closed returns and exposes the return reason", async () => {
  const employee=(await db.insert(qa.schema.employees).values({employeeNumber:"QA-EMP",fullName:"Test employee",jobTitle:"Test",department:"operations",mobile:"0500000000",hireDate:"2026-01-01"}).returning())[0];
  const request=()=>new Request("https://qa.test/api/portal/legal-referrals",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({sourceType:"employee",sourceId:employee.id,reason:"Review employee documents"})});
  qa.setTestActor({role:"employee",functionalRoles:[],permissions:[],user:{email:"hr@qa.test"}});
  assert.equal((await qa.referralRoute.POST(request())).status,403);
  qa.setTestActor({role:"employee",functionalRoles:[],permissions:["employees:write","employees:read"],user:{email:"hr@qa.test"}});
  const created=await qa.referralRoute.POST(request());assert.equal(created.status,201);
  const {matter,referral}=await created.json();
  qa.setTestActor({role:"manager",functionalRoles:["legal_supervisor"],permissions:["legal:write"],user:{email:"lawyer@qa.test"}});
  const returnRequest=()=>new Request("https://qa.test/api/portal/legal-referrals",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({id:referral.id,reason:"Please attach the signed employment contract"})});
  await pg.query("update legal_records set status='closed' where id=$1",[matter.id]);
  assert.equal((await qa.referralRoute.PATCH(returnRequest())).status,409);
  await pg.query("update legal_records set status='reviewing' where id=$1",[matter.id]);
  assert.equal((await qa.referralRoute.PATCH(returnRequest())).status,200);
  qa.setTestActor({role:"employee",functionalRoles:[],permissions:["employees:read"],user:{email:"hr@qa.test"}});
  const list=await qa.referralRoute.GET(new Request("https://qa.test/api/portal/legal-referrals?sourceType=employee"));
  const data=await list.json();assert.equal(data.referrals[0].returnReason,"Please attach the signed employment contract");assert.equal(data.canRefer,false);
});


test("returned-file notifications deduplicate, enforce visibility, persist read/hide and resolve after re-referral", async () => {
  const hr={role:"employee",department:"employees",functionalRoles:[],permissions:["employees:read","employees:write"],user:{email:"hr@qa.test"}};
  const finance={role:"employee",department:"finance",functionalRoles:[],user:{email:"finance@qa.test"}};
  const owner={role:"admin",department:"general",functionalRoles:[],user:{email:"owner@qa.test"}};
  qa.setTestActor(hr);
  await qa.notifications.refreshOperationalNotifications({force:true});
  let items=await qa.notifications.listPortalNotifications(hr);
  const notice=items.find(item=>item.dedupeKey?.startsWith("legal-source-returned:"));assert.ok(notice);assert.equal(notice.readAt,null);
  assert.equal((await qa.notifications.listPortalNotifications(finance)).some(item=>item.id===notice.id),false);
  assert.equal((await qa.notifications.listPortalNotifications(owner)).some(item=>item.id===notice.id),true);
  const action=async(action,ids)=>qa.notificationRoute.PATCH(new Request("https://qa.test/api/portal/notifications",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({action,ids})}));
  const read=await action("read",[notice.id]);assert.equal(read.status,200);assert.ok((await read.json()).notifications.find(item=>item.id===notice.id).readAt);
  await qa.notifications.refreshOperationalNotifications({force:true});
  items=await qa.notifications.listPortalNotifications(hr);assert.equal(items.filter(item=>item.dedupeKey===notice.dedupeKey).length,1);assert.ok(items.find(item=>item.id===notice.id).readAt);
  const hidden=await action("dismiss",[notice.id]);assert.equal(hidden.status,200);assert.equal((await hidden.json()).notifications.some(item=>item.id===notice.id),false);
  qa.setTestActor(finance);assert.equal((await action("read",[notice.id])).status,400);
  const referral=(await pg.query("select * from legal_referrals where source_type='employee' and status='returned' limit 1")).rows[0];
  await db.transaction(tx=>qa.registerLegalReferral(tx,{sourceType:"employee",sourceId:referral.source_id,reason:"Referred with requested documents",actorEmail:"hr@qa.test",title:"Referred employee case",counterparty:"Employee",now:new Date().toISOString()}));
  await qa.notifications.refreshOperationalNotifications({force:true});
  assert.equal((await pg.query("select status from portal_notifications where id=$1",[notice.id])).rows[0].status,"resolved");
});
