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

let pg, db, qa, directory, requestRow, opportunity, quote, document;
const actor = (root = false) => ({ role: root ? "admin" : "manager", department: "workforce", functionalRoles: [], functionalPermissions: ["contracts.write", "contracts.read", "contracts.approve", "workforce.write", "documents.read", "documents.share", "video.read", "video.manage", "conversations.write"], user: { email: root ? "owner@qa.test" : "staff@qa.test", displayName: "QA" } });
const request = (path, body, method = "POST") => new Request(`https://www.dally.info${path}`, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

before(async () => {
  await mkdir(resolve("node_modules/.cache"), { recursive: true });
  directory = await mkdtemp(resolve("node_modules/.cache/dali-commercial-"));
  const outfile = resolve(directory, "qa.mjs");
  await build({ stdin: { contents: `export * as schema from './db/schema.ts'; export * as quoteEdit from './app/api/portal/operations/quotes/[id]/route.ts'; export * as generate from './app/api/portal/documents/generate/route.ts'; export * as requests from './app/api/portal/requests/route.ts'; export * as operations from './app/api/portal/operations/route.ts'; export * as quoteShare from './app/api/portal/operations/quotes/[id]/share/route.ts'; export * as documentShare from './app/api/portal/documents/share/route.ts'; export * as download from './app/api/shared-documents/[token]/route.ts'; export * as conversations from './app/api/portal/conversations/route.ts'; export * as video from './lib/video-interviews.ts'; export * as videoPortal from './app/api/portal/video-interviews/route.ts'; export * as videoPublic from './app/api/video-interviews/route.ts'; export * as notifications from './lib/portal-notifications.ts'; export * as notificationRoute from './app/api/portal/notifications/route.ts'; export {resolveShareRecipient} from './lib/share-recipient.ts'; export {readCommercialTerms,commercialTermsFromRequest} from './lib/commercial-terms.ts'; export {setTestDb,setTestActor} from 'qa-control';`, resolveDir: process.cwd() }, outfile, bundle: true, platform: "node", format: "esm", packages: "external", logLevel: "silent", plugins: [{ name: "isolate-environment", setup(b) {
    b.onResolve({ filter: /^(qa-control|@\/db|@\/lib\/portal-access)$/ }, () => ({ path: "state", namespace: "state" }));
    b.onLoad({ filter: /.*/, namespace: "state" }, () => ({ contents: `let db,actor; export function getDb(){return db} export function getSqlClient(){throw new Error('Unexpected raw SQL dependency')} export function setTestDb(value){db=value} export function setTestActor(value){actor=value} export async function requirePortalApiRole(){return actor} export function canAdministerPortalUsers(a){return a.role==='admin'||a.functionalRoles.some(r=>['system_owner','system_admin'].includes(r))} export async function hasPortalPermission(a,r,v){return canAdministerPortalUsers(a)||a.functionalPermissions.includes(r+'.'+v)} export function canSharePortalDocuments(a){return a.role==='admin'||a.functionalPermissions.includes('documents.share')} export function canAccessPortalDocuments(a){return a.role==='admin'||a.functionalPermissions.includes('documents.read')} export function canAccessPortalConversations(a){return a.role==='admin'||a.functionalPermissions.includes('conversations.write')} export const canManagePortalConversations=canAccessPortalConversations;` }));
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

test("pending requests cannot convert, managers cannot approve, root approval uses a version check", async () => {
  assert.equal((await qa.operations.POST(request("/api/portal/operations", quoteInput()))).status, 400);
  assert.equal((await pg.query("select count(*)::int n from quote_versions")).rows[0].n, 0);
  assert.equal((await qa.requests.PATCH(request("/api/portal/requests", { id: requestRow.id, version: 1, action: "approve" }, "PATCH"))).status, 403);
  qa.setTestActor(actor(true));
  assert.equal((await qa.requests.PATCH(request("/api/portal/requests", { id: requestRow.id, version: 2, action: "approve" }, "PATCH"))).status, 409);
  const response = await qa.requests.PATCH(request("/api/portal/requests", { id: requestRow.id, version: 1, action: "approve" }, "PATCH"));
  assert.equal(response.status, 200); requestRow = (await response.json()).request;
  assert.equal(requestRow.approvalStatus, "approved"); assert.equal(requestRow.approvedBy, "owner@qa.test");
});

test("conversion preserves client contact and every populated commercial term", async () => {
  const response = await qa.operations.POST(request("/api/portal/operations", quoteInput()));
  const body = await response.json(); assert.equal(response.status, 201, body.error); quote = body.quote;
  const terms = qa.readCommercialTerms(quote.commercialTermsJson);
  for (const [field, expected] of Object.entries({ clientName: "QA Client", clientRepresentative: "QA Contact", clientMobile: "٠٥٦٦١١٠١٤٤", clientEmail: "client@qa.test", workSite: "Makkah", workingHours: "8 hours", weeklyOff: "Friday", paymentTerms: "Monthly", specialTerms: "QA special term", details: "QA service scope" })) assert.equal(terms[field], expected, field);
  assert.equal(quote.status, "draft"); assert.equal(quote.approvedBy, null);
});

test("both generic and quotation sharing require approval, a permission bit cannot bypass root approval", async () => {
  [document] = await db.insert(qa.schema.companyDocuments).values({ referenceCode: "QA-DOC", title: "QA quote", category: "contract", documentType: "quotation", fileName: "qa.pdf", storageKey: "qa.pdf", contentType: "application/pdf", sizeBytes: 7, metadataJson: JSON.stringify({ quoteVersionId: quote.id }), createdBy: "qa" }).returning();
  await pg.query("update quote_versions set document_id=$1 where id=$2", [document.id, quote.id]);
  qa.setTestActor(actor());
  assert.equal((await qa.quoteShare.POST(request("/api/portal/operations/quotes/1/share", { whatsappNumber: "0566110144" }), { params: Promise.resolve({ id: String(quote.id) }) })).status, 409);
  assert.equal((await qa.documentShare.POST(request("/api/portal/documents/share", { documentId: document.id, whatsappNumber: "0566110144" }))).status, 409);
  assert.notEqual((await qa.operations.PATCH(request("/api/portal/operations", { action: "transition-quote", id: quote.id, status: "approved", version: 1 }, "PATCH"))).status, 200);
  const [stamp] = await db.insert(qa.schema.documentStamps).values({ name: "QA", storageKey: "stamp.png", fileName: "stamp.png", contentType: "image/png", sizeBytes: 1, createdBy: "qa" }).returning();
  qa.setTestActor(actor(true));
  const response = await qa.operations.PATCH(request("/api/portal/operations", { action: "transition-quote", id: quote.id, status: "approved", version: 1, stampId: stamp.id }, "PATCH"));
  assert.equal(response.status, 200, JSON.stringify(await response.json()));
});

test("approved quotation converts into a complete contract, mismatches and missing client files are rejected", async () => {
  qa.setTestActor(actor(true));
  await db.insert(qa.schema.companyAssets).values(["stamp", "signature"].map(slot => ({ slot, fileName: `${slot}.png`, storageKey: `${slot}.png`, contentType: "image/png", sizeBytes: 1, uploadedBy: "qa" })));
  const terms = qa.readCommercialTerms(quote.commercialTermsJson);
  const payload = { ...terms, documentType: "workforce_contract", clientCr: "1010000000", clientVat: "300000000000003", issueDate: "2026-09-17", quoteVersionId: quote.id, sourceRequestId: requestRow.id, quantityMode: "fixed", seasonType: "regular", vatEnabled: "true", vatRate: 15, accommodationParty: "يوفره الطرف الثاني", transportParty: "توفره دالي", professions: JSON.stringify([{ profession: "عامل عام", requiredCount: 2, unitSalary: 1000, actualSalary: 800, sponsorshipType: "dali", ajirContractStatus: "not_applicable", workerIds: [] }]) };
  const submit = async (patch = {}, attach = true) => {
    const form = new FormData();
    for (const [name, value] of Object.entries({ ...payload, ...patch })) form.set(name, Array.isArray(value) ? JSON.stringify(value) : String(value));
    if (attach) for (const name of ["commercialRegistrationFile", "vatCertificateFile", "nationalAddressFile"]) form.set(name, new File(["%PDF-1.7\nQA attachment"], `${name}.pdf`, { type: "application/pdf" }));
    return qa.generate.POST(new Request("https://www.dally.info/api/portal/documents/generate", { method: "POST", body: form }));
  };
  assert.equal((await submit({}, false)).status, 400);
  assert.equal((await submit({ workingHours: "Different hours" })).status, 409);
  assert.equal((await submit({ transportParty: "يوفره الطرف الآخر" })).status, 409);
  const response = await submit(); const body = await response.json();
  assert.equal(response.status, 201, body.error);
  assert.equal(body.contract.quoteVersionId, quote.id); assert.equal(body.contract.sourceRequestId, requestRow.id);
  assert.equal(body.contract.amountHalalas, quote.totalHalalas);
  assert.equal(JSON.parse(body.document.metadataJson).specialTerms, terms.specialTerms);
  assert.equal(JSON.parse(body.document.metadataJson).clientMobile, terms.clientMobile);
  const payments = (await pg.query("select * from contract_payment_schedules where contract_id=$1 order by installment_number", [body.contract.id])).rows;
  assert.equal(payments.length, 12);
  assert.deepEqual(payments.map(p => p.due_date), JSON.parse(quote.paymentScheduleJson).map(p => p.dueDate));
  assert.equal(payments.reduce((total, p) => total + p.amount_halalas, 0), quote.totalHalalas);
  assert.equal((await pg.query("select count(*)::int n from contract_clauses where contract_id=$1", [body.contract.id])).rows[0].n, 20);
});

test("WhatsApp share returns the actual PDF and editable normalized recipient, revoked approval blocks old links", async () => {
  const resolved = await qa.resolveShareRecipient({ quoteId: quote.id }); assert.equal(resolved.mobile, "966566110144");
  const response = await qa.quoteShare.POST(request("/api/portal/operations/quotes/1/share", { whatsappNumber: "+٩٦٦ ٥٥ ١٢٣ ٤٥٦٧" }), { params: Promise.resolve({ id: String(quote.id) }) });
  const body = await response.json(); assert.equal(response.status, 200, body.error);
  assert.equal(body.mobile, "966551234567"); assert.equal(body.files[0].fileName, "qa.pdf"); assert.match(body.whatsappAppUrl, /^whatsapp:\/\/send\?phone=966551234567&/);
  const token = new URL(body.files[0].url).pathname.split("/").at(-1);
  let download = await qa.download.GET(new Request(body.files[0].url), { params: Promise.resolve({ token }) });
  assert.equal(download.status, 200); assert.equal(await download.text(), "%PDF-QA");
  await pg.query("update quote_versions set status='cancelled' where id=$1", [quote.id]);
  download = await qa.download.GET(new Request(body.files[0].url), { params: Promise.resolve({ token }) }); assert.equal(download.status, 410);
});

test("invoice recipient comes from linked contract metadata when no contact number exists", async () => {
  const [contractDoc] = await db.insert(qa.schema.companyDocuments).values({ referenceCode: "QA-CONTRACT", title: "QA", category: "contract", documentType: "workforce_contract", fileName: "contract.pdf", storageKey: "contract.pdf", contentType: "application/pdf", sizeBytes: 7, metadataJson: JSON.stringify({ clientMobile: "00966 50 123 4567" }), createdBy: "qa" }).returning();
  const [contract] = await db.insert(qa.schema.workforceContracts).values({ referenceCode: "QA-C", documentId: contractDoc.id, clientName: "Another client", title: "QA", workSite: "Makkah", issueDate: "2026-09-17", startDate: "2026-10-01", endDate: "2027-10-01", details: "QA", createdBy: "qa" }).returning();
  const [invoice] = await db.insert(qa.schema.companyDocuments).values({ referenceCode: "QA-INV", title: "QA invoice", category: "finance", documentType: "invoice", fileName: "invoice.pdf", storageKey: "invoice.pdf", contentType: "application/pdf", sizeBytes: 7, metadataJson: JSON.stringify({ contractId: contract.id }), createdBy: "qa" }).returning();
  assert.equal((await qa.resolveShareRecipient({ documentId: invoice.id })).mobile, "966501234567");
  const response = await qa.documentShare.POST(request("/api/portal/documents/share", { documentId: invoice.id, whatsappNumber: "0501234567" }));
  assert.equal(response.status, 200); assert.equal((await response.json()).files[0].fileName, "invoice.pdf");
});

test("working hours are writable by owner and system supervisor only, including a fully closed week", async () => {
  const update = () => request("/api/portal/conversations", { action: "settings", config: { workingDays: [], opensAt: "10:00", closesAt: "18:00", autoReply: "We will reply during working hours" } }, "PATCH");
  qa.setTestActor(actor()); assert.equal((await qa.conversations.PATCH(update())).status, 403);
  qa.setTestActor({ ...actor(), functionalRoles: ["system_admin"] }); assert.equal((await qa.conversations.PATCH(update())).status, 200);
  const saved = (await pg.query("select value_json from portal_settings where key='business-hours'")).rows[0];
  assert.deepEqual(JSON.parse(saved.value_json).workingDays, []);
});

test("background video polling preserves away and busy availability", async () => {
  await db.insert(qa.schema.portalUsers).values({ email: "staff@qa.test", displayName: "QA staff", role: "employee", department: "workforce" });
  await qa.video.touchInterviewPresence("staff@qa.test", "away");
  await qa.video.refreshInterviewPresence("staff@qa.test");
  assert.equal((await pg.query("select availability from portal_user_presence where user_email='staff@qa.test'")).rows[0].availability, "away");
  await qa.video.touchInterviewPresence("staff@qa.test", "busy", "qa-interview");
  await qa.video.refreshInterviewPresence("staff@qa.test");
  assert.equal((await pg.query("select availability from portal_user_presence where user_email='staff@qa.test'")).rows[0].availability, "busy");
});

test("request approval alerts reach owner and supervisor, deduplicate, retain read/hide and resolve", async () => {
  await pg.query("update workforce_requests set approval_status='pending',approved_by=null,approved_at=null where id=$1", [requestRow.id]);
  const supervisor = { ...actor(), functionalRoles: ["system_admin"] };
  qa.setTestActor(supervisor);
  await qa.notifications.refreshOperationalNotifications({ force: true });
  const key = `quote-request-approval:${requestRow.id}`;
  const notice = (await qa.notifications.listPortalNotifications(supervisor)).find(item => item.dedupeKey === key);
  assert.ok(notice); assert.equal(notice.readAt, null);
  assert.ok((await qa.notifications.listPortalNotifications(actor(true))).some(item => item.id === notice.id));
  assert.equal((await qa.notifications.listPortalNotifications(actor())).some(item => item.id === notice.id), false);
  const update = async action => qa.notificationRoute.PATCH(request("/api/portal/notifications", { action, ids: [notice.id] }, "PATCH"));
  assert.equal((await update("read")).status, 200);
  await qa.notifications.refreshOperationalNotifications({ force: true });
  const rows = await qa.notifications.listPortalNotifications(supervisor);
  assert.equal(rows.filter(item => item.dedupeKey === key).length, 1); assert.ok(rows.find(item => item.id === notice.id).readAt);
  assert.equal((await update("dismiss")).status, 200);
  assert.equal((await qa.notifications.listPortalNotifications(supervisor)).some(item => item.id === notice.id), false);
  await pg.query("update workforce_requests set approval_status='approved',approved_by='owner@qa.test',approved_at=$1 where id=$2", [new Date().toISOString(), requestRow.id]);
  await qa.notifications.refreshOperationalNotifications({ force: true });
  assert.equal((await pg.query("select status from portal_notifications where id=$1", [notice.id])).rows[0].status, "resolved");
});


test("requests without CRM records remain linked; editing the start date realigns all annual installments", async () => {
  qa.setTestActor(actor(true));
  await pg.query("update workforce_requests set opportunity_id=null where id=$1", [requestRow.id]);
  await pg.query("update sales_opportunities set source_request_id=null where source_request_id=$1", [requestRow.id]);
  const payload = quoteInput(); payload.items[0].unitPrice = 1000.01;
  const created = await qa.operations.POST(request("/api/portal/operations", payload));
  let body = await created.json(); assert.equal(created.status, 201, body.error);
  const draft = body.quote;
  assert.equal((await pg.query("select source_request_id from sales_opportunities where id=$1", [draft.opportunityId])).rows[0].source_request_id, requestRow.id);
  assert.equal(draft.totalHalalas, draft.subtotalHalalas + Math.round(draft.subtotalHalalas * 0.15));
  const response = await qa.quoteEdit.PATCH(request(`/api/portal/operations/quotes/${draft.id}`, { startDate: "2027-01-31" }, "PATCH"), { params: Promise.resolve({ id: String(draft.id) }) });
  body = await response.json(); assert.equal(response.status, 200, body.error);
  assert.equal(qa.readCommercialTerms(body.quote.commercialTermsJson).endDate, "2028-01-31");
  const payments = JSON.parse(body.quote.paymentScheduleJson);
  assert.equal(payments.length, 12); assert.equal(payments[0].dueDate, "2027-02-28"); assert.equal(payments[11].dueDate, "2028-01-31");
  assert.equal(payments.reduce((sum, p) => sum + p.percentageBps, 0), 10000);
  assert.equal(qa.readCommercialTerms(body.quote.commercialTermsJson).specialTerms, "QA special term");
});

test("invoice recipient is recovered from a client's chat even without a quote request or stored phone", async () => {
  const [client] = await db.insert(qa.schema.clients).values({ clientCode: "QA-CHAT-CLIENT", legalName: "Chat client", createdBy: "qa" }).returning();
  await db.insert(qa.schema.clientContacts).values({ clientId: client.id, fullName: "Chat Contact", email: "chat-only@qa.test" });
  await db.insert(qa.schema.visitorConversations).values({ id: "qa-chat", trackingCode: "QA-CHAT", publicTokenHash: "qa-chat-token", visitorName: "Chat Contact", visitorEmail: "chat-only@qa.test", visitorMobile: "٠٠٩٦٦ ٥٤ ١٢٣ ٤٥٦٧", subject: "QA", lastVisitorMessageAt: new Date().toISOString() });
  const [invoice] = await db.insert(qa.schema.companyDocuments).values({ referenceCode: "QA-CHAT-INV", title: "QA invoice", category: "finance", documentType: "invoice", fileName: "invoice.pdf", storageKey: "chat-invoice.pdf", contentType: "application/pdf", sizeBytes: 7, metadataJson: JSON.stringify({ clientId: client.id }), createdBy: "qa" }).returning();
  assert.equal((await qa.resolveShareRecipient({ documentId: invoice.id })).mobile, "966541234567");
});

async function resetVideoFixtures() {
  await db.delete(qa.schema.videoInterviews);
  await db.delete(qa.schema.portalUserPresence);
  await db.insert(qa.schema.portalUsers).values([
    { email: "owner@qa.test", displayName: "QA owner", role: "admin", department: "management", status: "active" },
    { email: "receiver@qa.test", displayName: "QA receiver", role: "admin", department: "management", status: "active" },
  ]).onConflictDoNothing();
  qa.setTestActor(actor(true));
  await qa.video.touchInterviewPresence("owner@qa.test", "away");
}

async function videoFixture(status = "active", assignedTo = "staff@qa.test", expired = false) {
  const id = crypto.randomUUID(), conversationId = crypto.randomUUID(), token = crypto.randomUUID(), now = new Date().toISOString();
  await db.insert(qa.schema.visitorConversations).values({ id: conversationId, trackingCode: `QA-${conversationId}`, publicTokenHash: createHash("sha256").update(token).digest("hex"), visitorName: "QA video", visitorMobile: "0500000000", subject: "QA", lastVisitorMessageAt: now });
  const [interview] = await db.insert(qa.schema.videoInterviews).values({ id, referenceCode: `VID-${id}`, conversationId, roomName: `qa-${id}`, status, assignedTo, requestedAt: now, expiresAt: new Date(Date.now() + (expired ? -60_000 : 600_000)).toISOString(), createdAt: now, updatedAt: now }).returning();
  return { ...interview, token };
}
const videoPresence = async (email) => (await pg.query("select * from portal_user_presence where user_email=$1", [email])).rows[0];
const videoAction = (action, interviewId, extra = {}) => qa.videoPortal.POST(request("/api/portal/video-interviews", { action, interviewId, ...extra }));

test("owner completion releases the actual employee without fabricating a heartbeat or changing owner availability", async () => {
  await resetVideoFixtures();
  const interview = await videoFixture();
  await qa.video.touchInterviewPresence("staff@qa.test", "busy", interview.id);
  const previousSeen = new Date(Date.now() - 300_000).toISOString();
  await pg.query("update portal_user_presence set last_seen_at=$1 where user_email='staff@qa.test'", [previousSeen]);
  const response = await videoAction("complete", interview.id);
  assert.equal(response.status, 200);
  const staff = await videoPresence("staff@qa.test");
  assert.equal(staff.availability, "online"); assert.equal(staff.current_interview_id, null); assert.equal(staff.last_seen_at, previousSeen);
  assert.equal((await videoPresence("owner@qa.test")).availability, "away");
  assert.equal((await videoAction("complete", interview.id)).status, 409);
  assert.equal((await pg.query("select count(*)::int n from portal_notifications where event_type='video-interview-completed' and entity_id=$1", [interview.id])).rows[0].n, 1);
});

test("owner transfer releases the original employee and records the correct transfer history", async () => {
  await resetVideoFixtures();
  const interview = await videoFixture();
  await qa.video.touchInterviewPresence("staff@qa.test", "busy", interview.id);
  await qa.video.touchInterviewPresence("receiver@qa.test");
  const response = await videoAction("transfer", interview.id, { toEmail: "receiver@qa.test", reason: "QA transfer reason" });
  assert.equal(response.status, 200, JSON.stringify(await response.json()));
  assert.equal((await videoPresence("staff@qa.test")).availability, "online");
  assert.equal((await videoPresence("owner@qa.test")).availability, "away");
  const transfer = (await pg.query("select * from video_interview_transfers where interview_id=$1", [interview.id])).rows[0];
  assert.equal(transfer.from_email, "staff@qa.test"); assert.equal(transfer.to_email, "receiver@qa.test");
  assert.equal(transfer.transferred_by, "owner@qa.test");
});

test("cancelling a ringing call preserves manually selected away status", async () => {
  await resetVideoFixtures();
  const interview = await videoFixture("ringing");
  await qa.video.touchInterviewPresence("staff@qa.test", "away");
  assert.equal((await videoAction("cancel", interview.id)).status, 200);
  assert.equal((await videoPresence("staff@qa.test")).availability, "away");
  assert.equal((await videoPresence("owner@qa.test")).availability, "away");
});

test("releasing an old call preserves a newer active call and its busy presence", async () => {
  await resetVideoFixtures();
  const oldCall = await videoFixture("completed");
  const current = await videoFixture();
  await qa.video.touchInterviewPresence("staff@qa.test", "busy", current.id);
  await qa.video.releaseInterviewPresence("staff@qa.test", oldCall.id);
  assert.equal((await videoPresence("staff@qa.test")).current_interview_id, current.id);
  await pg.query("update portal_user_presence set current_interview_id=$1 where user_email='staff@qa.test'", [oldCall.id]);
  await qa.video.releaseInterviewPresence("staff@qa.test", oldCall.id);
  const staff = await videoPresence("staff@qa.test");
  assert.equal(staff.availability, "busy"); assert.equal(staff.current_interview_id, current.id);
});

test("concurrent accepts cannot give one employee two active video calls", async () => {
  await resetVideoFixtures();
  const first = await videoFixture("ringing", "owner@qa.test"), second = await videoFixture("ringing", "owner@qa.test");
  const responses = await Promise.all([videoAction("accept", first.id), videoAction("accept", second.id)]);
  assert.deepEqual(responses.map(r => r.status).sort(), [200, 409]);
  const active = (await pg.query("select id from video_interviews where assigned_to='owner@qa.test' and status='active'")).rows;
  assert.equal(active.length, 1);
  assert.equal((await videoPresence("owner@qa.test")).current_interview_id, active[0].id);
});

test("visitor polling expires only its own call, removes stale join links and permits retry", async () => {
  await resetVideoFixtures();
  const own = await videoFixture("active", "staff@qa.test", true), other = await videoFixture("requested", null, true);
  await db.insert(qa.schema.portalUserPresence).values({ userEmail: "staff@qa.test", availability: "busy", currentInterviewId: own.id, lastSeenAt: new Date().toISOString() });
  const poll = () => qa.videoPublic.GET(new Request("https://www.dally.info/api/video-interviews", { headers: { cookie: `dali_live_chat=${own.conversationId}.${own.token}` } }));
  assert.equal((await (await poll()).json()).interview, null);
  assert.equal((await videoPresence("staff@qa.test")).availability, "online");
  assert.equal((await pg.query("select status from video_interviews where id=$1", [other.id])).rows[0].status, "requested");
  assert.equal((await (await poll()).json()).interview, null);
  const alerts = (await pg.query("select * from portal_notifications where event_type='video-interview-expired' and entity_id=$1", [own.conversationId])).rows;
  assert.equal(alerts.length, 1); assert.equal(alerts[0].target_email, "staff@qa.test");
  assert.equal(alerts[0].entity_type, "visitor-conversation"); assert.equal(alerts[0].action_view, "conversations");
  qa.setTestActor(actor());
  assert.ok((await qa.notifications.listPortalNotifications(actor())).some(item => item.id === alerts[0].id));
  const noticeAction = action => qa.notificationRoute.PATCH(request("/api/portal/notifications", { action, ids: [alerts[0].id] }, "PATCH"));
  assert.equal((await noticeAction("read")).status, 200);
  await poll();
  assert.ok((await qa.notifications.listPortalNotifications(actor())).find(item => item.id === alerts[0].id).readAt);
  assert.equal((await noticeAction("dismiss")).status, 200);
  assert.equal((await qa.notifications.listPortalNotifications(actor())).some(item => item.id === alerts[0].id), false);
});

test("old expired calls are processed even behind more than 300 recent requests", async () => {
  await resetVideoFixtures();
  const oldCall = await videoFixture("requested", null, true);
  await pg.query("update video_interviews set requested_at='2000-01-01T00:00:00.000Z' where id=$1", [oldCall.id]);
  const now = new Date().toISOString();
  await db.insert(qa.schema.videoInterviews).values(Array.from({ length: 301 }, () => { const id = crypto.randomUUID(); return { id, referenceCode: `VID-${id}`, conversationId: oldCall.conversationId, roomName: `qa-${id}`, status: "requested", requestedAt: now, expiresAt: new Date(Date.now() + 600_000).toISOString() }; }));
  assert.equal(await qa.video.expireOldVideoInterviews(), 1);
  assert.equal((await pg.query("select status from video_interviews where id=$1", [oldCall.id])).rows[0].status, "expired");
});
