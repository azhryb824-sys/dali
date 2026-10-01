import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { mkdir, mkdtemp, rm, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
let qa, pg, directory;
const request = (body, method = "PUT", origin) => new Request("https://www.dally.info/api/portal/contracts/default-clauses?direction=dali_supplier", { method, headers: { "content-type": "application/json", ...(origin ? { origin } : {}) }, ...(method === "GET" ? {} : { body: JSON.stringify(body) }) });
before(async () => {
  await mkdir(resolve("node_modules/.cache"), { recursive: true }); directory = await mkdtemp(resolve("node_modules/.cache/clause-hierarchy-"));
  const outfile = resolve(directory, "qa.mjs");
  await build({ stdin: { contents: `export * from './lib/workforce-contract-clauses.ts'; export * as defaults from './app/api/portal/contracts/default-clauses/route.ts'; export * as schema from './db/schema.ts'; export { readCommercialTerms } from './lib/commercial-terms.ts'; export { setDb, setPermissions, effects } from 'qa-state';`, resolveDir: process.cwd() }, outfile, bundle: true, platform: "node", format: "esm", packages: "external", plugins: [{ name: "qa", setup(b) {
    b.onResolve({ filter: /^(qa-state|@\/db|@\/lib\/portal-access|@\/lib\/audit|@\/lib\/portal-notifications)$/ }, () => ({ path: "state", namespace: "qa" }));
    b.onLoad({ filter: /.*/, namespace: "qa" }, () => ({ contents: `let db,permissions=['contracts.read','contracts.write']; export const effects=[]; export function setDb(value){db=value} export function getDb(){return db} export function getSqlClient(){throw new Error('Unexpected raw SQL')} export function setPermissions(value){permissions=value} export async function requirePortalApiRole(){return {role:'employee',functionalRoles:[],user:{email:'qa@example.com'}}} export async function hasPortalPermission(a,r,v){return permissions.includes(r+'.'+v)} export async function auditPortalAction(input){effects.push({type:'audit',input})} export async function emitPortalNotification(input){effects.push({type:'notification',input})}` }));
  } }] });
  qa = await import(pathToFileURL(outfile)); pg = new PGlite();
  await pg.exec((await generateMigration(generateDrizzleJson({}), generateDrizzleJson({ portalSettings: qa.schema.portalSettings }))).join("\n"));
  // PGlite has one connection and no advisory locks; test the production transaction's version semantics.
  await pg.exec("CREATE FUNCTION pg_advisory_xact_lock(integer) RETURNS void LANGUAGE sql AS 'SELECT';");
  qa.setDb(drizzle(pg, { schema: qa.schema }));
});
after(async () => { await pg?.close(); if (directory) await rm(directory, { recursive: true, force: true }); });

test("preamble and articles keep bilingual subclauses through commercial conversion and storage parsing", () => {
  const clauses = qa.defaultWorkforceContractClauses("dali_supplier").slice(0, 3);
  clauses[1].subclauses = [{ body: "التزام فرعي أول", bodyEn: "First subclause" }, { body: "التزام فرعي ثان", bodyEn: "Second subclause" }];
  const terms = qa.readCommercialTerms(JSON.stringify({ contractDirection: "dali_supplier", contractClauses: clauses }));
  assert.deepEqual(terms.contractClauses, clauses);
  const stored = clauses.map(item => ({ ...item, subclauses: undefined, subclausesJson: JSON.stringify(item.subclauses) }));
  assert.deepEqual(qa.parseWorkforceContractClauses(stored, "dali_supplier", false), clauses);
  assert.equal(qa.contractClauseLabel(clauses, 0), "التمهيد"); assert.equal(qa.contractClauseLabel(clauses, 1), "البند الأول"); assert.equal(qa.contractClauseLabel(clauses, 2, "en"), "Article 2");
  assert.match(qa.contractClauseBody(clauses[1], "en"), /1\. First subclause\n2\. Second subclause/);
});
test("defaults are independent, versioned, and emit audit and notification after saving", async () => {
  const before = await (await qa.defaults.GET(request(null, "GET"))).json();
  assert.equal(before.revision, "builtin"); const clauses = before.clauses;
  clauses[1].subclauses = [{ body: "التزام فرعي محفوظ", bodyEn: "Saved subclause" }];
  const response = await qa.defaults.PUT(request({ direction: "dali_supplier", clauses, revision: before.revision }));
  assert.equal(response.status, 200); const saved = await response.json();
  assert.deepEqual((await (await qa.defaults.GET(request(null, "GET"))).json()).clauses, clauses);
  const buyer = await (await qa.defaults.GET(new Request("https://www.dally.info/api/portal/contracts/default-clauses?direction=dali_purchaser"))).json();
  assert.equal(buyer.revision, "builtin"); assert.notDeepEqual(buyer.clauses, clauses);
  assert.equal((await qa.defaults.PUT(request({ direction: "dali_supplier", clauses, revision: "builtin" }))).status, 409);
  assert.equal(qa.effects.filter(e => e.type === "audit").length, 1); assert.equal(qa.effects.filter(e => e.type === "notification").length, 1);
  assert.notEqual(saved.revision, before.revision);
});
test("rejects missing subclause translation, reordered preamble and unauthorized writes", async () => {
  const current = await (await qa.defaults.GET(request(null, "GET"))).json();
  const invalid = structuredClone(current.clauses); invalid[1].subclauses[0].bodyEn = "";
  assert.equal((await qa.defaults.PUT(request({ ...current, clauses: invalid, direction: "dali_supplier" }))).status, 400);
  const reordered = structuredClone(current.clauses); [reordered[0], reordered[1]] = [reordered[1], reordered[0]];
  assert.equal((await qa.defaults.PUT(request({ ...current, clauses: reordered, direction: "dali_supplier" }))).status, 400);
  assert.equal((await qa.defaults.PUT(request({ ...current, direction: "dali_supplier" }, "PUT", "https://untrusted.example"))).status, 403);
  qa.setPermissions(["contracts.read"]); assert.equal((await qa.defaults.PUT(request({ ...current, direction: "dali_supplier" }))).status, 403);
  assert.equal((await qa.defaults.GET(request(null, "GET"))).status, 200);
  qa.setPermissions([]); assert.equal((await qa.defaults.GET(request(null, "GET"))).status, 403);
});
test("migration preserves the legacy recital and adds independent hierarchy storage", async () => {
  const legacy = new PGlite();
  await legacy.exec("CREATE TABLE contract_clauses(id serial, clause_number integer, title text); INSERT INTO contract_clauses(clause_number,title) VALUES(1,'التمهيد والملاحق'),(2,'مدة العقد');");
  const migration = await readFile("drizzle-pg/0076_contract_clause_hierarchy.sql", "utf8"); await legacy.exec(migration); await legacy.exec(migration);
  const rows = (await legacy.query("SELECT * FROM contract_clauses ORDER BY clause_number")).rows;
  assert.equal(rows[0].is_preamble, true); assert.equal(rows[1].is_preamble, false); assert.equal(rows[0].subclauses_json, "[]"); await legacy.close();
});
