import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";

// Only session identity and external audit/notification transport are fixtures.
// The route, shared authorization policy, transactions and arithmetic are real.
let qa, db, pg, directory, sequence = 0;
const actor = (functionalRole, extra = {}) => ({ authorized: true, role: "employee", status: "active", department: "workforce", functionalRoles: functionalRole ? [functionalRole] : [], functionalPermissions: [], user: { email: `${functionalRole || "legacy"}@qa.test`, displayName: "QA" }, ...extra });
const ctx = id => ({ params: Promise.resolve({ id: String(id) }) });
const req = (id, body, method = "POST") => new Request(`https://www.dally.info/api/portal/contracts/${id}/attendance`, { method, headers: { "content-type": "application/json", origin: "https://www.dally.info" }, body: JSON.stringify(body) });
const check = async (response, status) => { const data = await response.json(); assert.equal(response.status, status, JSON.stringify(data)); return data; };
const get = f => qa.attendance.GET(new Request(`https://www.dally.info/api/portal/contracts/${f.contract.id}/attendance`), ctx(f.contract.id));
const post = (f, patch = {}) => qa.attendance.POST(req(f.contract.id, { contractProfessionId: f.profession.id, workerId: f.worker.id, absenceDate: "2026-08-06", absenceEndDate: "2026-08-08", absentCount: 1, notes: "QA absence", ...patch }), ctx(f.contract.id));
const voidAbsence = (f, id) => qa.attendance.DELETE(new Request(`https://www.dally.info/api/portal/contracts/${f.contract.id}/attendance?absenceId=${id}`, { method: "DELETE", headers: { origin: "https://www.dally.info" } }), ctx(f.contract.id));

before(async () => {
  await mkdir(resolve("node_modules/.cache"), { recursive: true });
  directory = await mkdtemp(resolve("node_modules/.cache/dali-attendance-access-"));
  const outfile = resolve(directory, "qa.mjs");
  await build({ stdin: { contents: `export * as schema from './db/schema.ts'; export * as attendance from './app/api/portal/contracts/[id]/attendance/route.ts'; export {canManageWorkerAttendance} from './lib/worker-attendance-access.ts'; export * from 'qa-attendance-state';`, resolveDir: process.cwd() }, outfile, bundle: true, platform: "node", format: "esm", packages: "external", logLevel: "silent", plugins: [{ name: "isolated-attendance-boundaries", setup(b) {
    b.onResolve({ filter: /^(qa-attendance-state|@\/db|@\/lib\/portal-access|@\/lib\/audit|@\/lib\/portal-notifications)$/ }, () => ({ path: "state", namespace: "attendance-state" }));
    b.onLoad({ filter: /.*/, namespace: "attendance-state" }, () => ({ contents: `let db, actor; export const audits=[], notifications=[]; export function getDb(){return db} export function setDb(v){db=v} export function setActor(v){actor=v;audits.length=0;notifications.length=0} export async function requirePortalApiRole(roles){return actor?.authorized && actor.status==='active' && roles.includes(actor.role) ? actor : null} export async function hasPortalPermission(a,r,v){return a.functionalPermissions.includes('*')||a.functionalPermissions.includes(r+'.'+v)} export async function auditPortalAction(v){audits.push(v)} export async function emitPortalNotification(v){notifications.push(v)} ` }));
  } }] });
  qa = await import(pathToFileURL(outfile)); pg = new PGlite();
  await pg.exec((await generateMigration(generateDrizzleJson({}), generateDrizzleJson(qa.schema))).join("\n"));
  db = drizzle(pg, { schema: qa.schema }); qa.setDb(db);
});
after(async () => { await pg?.close(); if (directory) await rm(directory, { recursive: true, force: true }); });

async function fixture() {
  const key = `ATT-${++sequence}`;
  const [document] = await db.insert(qa.schema.companyDocuments).values({ referenceCode: key, title: key, category: "contract", documentType: "workforce_contract", fileName: `${key}.pdf`, storageKey: `${key}.pdf`, contentType: "application/pdf", sizeBytes: 10, createdBy: "qa" }).returning();
  const [contract] = await db.insert(qa.schema.workforceContracts).values({ referenceCode: key, documentId: document.id, clientName: "QA Client", title: key, workSite: "Makkah", issueDate: "2026-01-01", startDate: "2026-01-01", endDate: "2026-12-31", details: "QA", status: "active", createdBy: "qa" }).returning();
  const [profession] = await db.insert(qa.schema.contractProfessions).values({ contractId: contract.id, profession: "عامل عام", requiredCount: 2, sponsorshipType: "dali", actualSalaryHalalas: 300000, unitSalaryHalalas: 450000 }).returning();
  const [worker, otherWorker, replacement] = await db.insert(qa.schema.workers).values(["absent", "other", "replacement"].map((name, i) => ({ workerNumber: `${key}-${name}`, fullName: name, nationality: "سوداني", profession: "عامل عام", clientSite: "Makkah", status: i === 2 ? "available" : "assigned", sponsorshipType: "dali", monthlySalaryHalalas: 990000 }))).returning();
  await db.insert(qa.schema.contractWorkerAssignments).values([worker, otherWorker].map(w => ({ contractId: contract.id, contractProfessionId: profession.id, workerId: w.id, status: "active", assignedBy: "qa", assignedAt: "2026-01-01T00:00:00Z" })));
  const [payment] = await db.insert(qa.schema.contractPaymentSchedules).values({ contractId: contract.id, installmentNumber: 1, title: "August", dueDate: "2026-09-01", percentageBps: 10000, amountHalalas: 1035000, subtotalHalalas: 900000, vatHalalas: 135000, vatRateBps: 1500, billingBasis: "monthly_salary", servicePeriod: "2026-08", createdBy: "qa" }).returning();
  return { contract, profession, worker, otherWorker, replacement, payment, document };
}
async function balance(f) { return (await pg.query("select absence_deduction_halalas as amount from contract_payment_schedules where id=$1", [f.payment.id])).rows[0].amount; }

for (const [name, identity] of [["owner", actor("system_owner")], ["system admin", actor("system_admin")], ["legacy admin", actor(null, { role: "admin" })]]) {
  test(`${name} can read, record, replace and void worker absence without extra role permissions`, async () => {
    const f = await fixture(); qa.setActor(identity);
    assert.equal(qa.canManageWorkerAttendance(identity), true);
    const view = await check(await get(f), 200); assert.equal(view.canRecord, true); assert.equal(view.canViewFinancialImpact, true);
    const { absence } = await check(await post(f), 201);
    assert.equal(absence.chargeableDays, 2); assert.equal(absence.deductionHalalas, 20000); assert.equal(absence.clientDeductionHalalas, 30000); assert.equal(absence.recordedBy, identity.user.email); assert.equal(await balance(f), 30000);
    assert.deepEqual((await pg.query("select deduction_date,amount_halalas from worker_payroll_deductions where absence_id=$1 order by deduction_date", [absence.id])).rows, [{ deduction_date: "2026-08-06", amount_halalas: 10000 }, { deduction_date: "2026-08-08", amount_halalas: 10000 }]);
    await check(await post(f), 409); assert.equal(await balance(f), 30000);
    const voided = await check(await voidAbsence(f, absence.id), 200); assert.equal(voided.absence.status, "void"); assert.equal(voided.absence.voidedBy, identity.user.email); assert.equal(await balance(f), 0);
    await check(await voidAbsence(f, absence.id), 404); assert.equal(await balance(f), 0);
    assert.equal((await pg.query("select count(*)::int n from worker_payroll_deductions where absence_id=$1 and voided_at is null", [absence.id])).rows[0].n, 0);
    const covered = await check(await post(f, { absenceDate: "2026-08-10", absenceEndDate: "2026-08-10", replacementWorkerId: f.replacement.id }), 201);
    assert.equal(covered.absence.replacementWorkerId, f.replacement.id); assert.equal(covered.absence.clientDeductionHalalas, 0); assert.equal(covered.absence.deductionHalalas, 10000); assert.equal(await balance(f), 0);
    await check(await post(f, { workerId: f.otherWorker.id, absenceDate: "2026-08-10", absenceEndDate: "2026-08-10", replacementWorkerId: f.replacement.id }), 409);
    assert.deepEqual(qa.audits.map(a => a.action), ["contract-worker-absence-recorded", "contract-worker-absence-voided", "contract-worker-absence-recorded"]);
    assert.deepEqual(qa.notifications.map(n => n.eventType), qa.audits.map(a => a.action));
    assert.ok(qa.audits.every(a => a.actorEmail === identity.user.email));
  });
}

test("movement, finance, approval and wildcard permissions do not confer owner attendance authority", async () => {
  const f = await fixture();
  qa.setActor(actor("system_owner")); await check(await post(f), 201);
  for (const role of ["workforce_supervisor", "workforce_operations_manager", "accountant", "contracts_manager", "administrative_assistant"]) {
    const identity = actor(role, { functionalPermissions: ["contracts.read", "contracts.write", "contracts.approve", "workforce.write"] }); qa.setActor(identity);
    assert.equal(qa.canManageWorkerAttendance(identity), false);
    const result = await check(await get(f), 200); assert.equal(result.canRecord, false); assert.equal(result.canViewFinancialImpact, false); assert.equal(result.absences[0].deductionHalalas, null);
    await check(await post(f), 403); await check(await voidAbsence(f, result.absences[0].id), 403); assert.equal(qa.audits.length, 0); assert.equal(qa.notifications.length, 0);
  }
  qa.setActor(actor("accountant", { functionalPermissions: ["*"] })); await check(await post(f), 403);
  assert.equal(await balance(f), 30000);
});

test("unauthenticated and suspended actors cannot manage or inspect attendance", async () => {
  const f = await fixture();
  for (const identity of [null, actor("system_owner", { status: "suspended" }), actor("system_admin", { authorized: false })]) {
    qa.setActor(identity); await check(await get(f), 403); await check(await post(f), 403); await check(await voidAbsence(f, 1), 403); assert.equal(qa.audits.length, 0);
  }
});

test("owner and admin retain processed-payment and settled-payroll protections", async () => {
  for (const role of ["system_owner", "system_admin"]) {
    const f = await fixture(); qa.setActor(actor(role)); const { absence } = await check(await post(f), 201);
    await pg.query("update contract_payment_schedules set status='invoiced',invoice_document_id=$1 where id=$2", [f.document.id, f.payment.id]);
    await check(await voidAbsence(f, absence.id), 409); await check(await post(f, { absenceDate: "2026-08-11", absenceEndDate: "2026-08-11" }), 409); assert.equal(await balance(f), 30000);
    await pg.query("update contract_payment_schedules set status='scheduled',invoice_document_id=null where id=$1", [f.payment.id]);
    await pg.query("update worker_payroll_deductions set settled_halalas=amount_halalas where absence_id=$1", [absence.id]);
    await check(await voidAbsence(f, absence.id), 409); assert.equal(await balance(f), 30000);
    assert.equal((await pg.query("select status from contract_worker_absences where id=$1", [absence.id])).rows[0].status, "active");
    assert.equal(qa.audits.length, 1); assert.equal(qa.notifications.length, 1);
  }
});

test("Friday, date limits, replacement identity and historical assignment remain enforced", async () => {
  const f = await fixture(); qa.setActor(actor("system_admin"));
  await check(await post(f, { absenceDate: "2026-08-07", absenceEndDate: "2026-08-07" }), 400);
  await check(await post(f, { absenceDate: "2099-08-01", absenceEndDate: "2099-08-01" }), 400);
  await check(await post(f, { replacementWorkerId: f.worker.id }), 400);
  await pg.query("update workers set sponsorship_type='other',sponsor_name='Other' where id=$1", [f.replacement.id]);
  await check(await post(f, { replacementWorkerId: f.replacement.id }), 409);
  await pg.query("update contract_worker_assignments set status='released',released_at='2026-08-09T23:59:59Z' where worker_id=$1", [f.worker.id]);
  const { absence } = await check(await post(f), 201); assert.equal(absence.workerId, f.worker.id);
  await check(await post(f, { absenceDate: "2026-08-10", absenceEndDate: "2026-08-10" }), 409);
});

test("dashboard wires the same role policy without using contract ownership as an attendance gate", async () => {
  const ui = await readFile("app/portal/PortalDashboard.tsx", "utf8");
  assert.match(ui, /canManageAttendance=\{canManageWorkerAttendance\(currentUser\)\}/);
  assert.doesNotMatch(ui, /isOwner && canRecordAbsence/);
  assert.match(ui, /setCanRecordAbsence\(canManageAttendance && result.canRecord === true\)/);
  assert.match(ui, /fieldset className="drawer-section contract-absence-panel" disabled=/);
  assert.match(ui, /controller\.abort\(\)/);
});
