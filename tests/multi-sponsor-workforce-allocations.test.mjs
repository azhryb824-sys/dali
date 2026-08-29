import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("contract database permits distinct sponsor allocations for one profession", () => {
  const migration = read("drizzle-pg/0058_multi_sponsor_workforce_allocations.sql");
  assert.match(migration, /DROP INDEX IF EXISTS public\.contract_professions_contract_profession_unique/);
  assert.match(migration, /contract_professions_contract_sponsor_allocation_unique/);
  assert.match(migration, /COALESCE\(sponsor_name, ''\)/);
});

test("contract creation validates allocation identity and worker sponsor", () => {
  const route = read("app/api/portal/documents/generate/route.ts");
  assert.match(route, /allocationKeys/);
  assert.match(route, /professionInputs\.length !== sourceQuoteItems\.length/);
  assert.match(route, /worker\.sponsorName !== item\.sponsorName/);
});

test("contract derives sponsor names from workers while quotations retain sponsor details", () => {
  const contracts = read("app/portal/PortalDashboard.tsx");
  const quotes = read("app/portal/OperationsWorkspace.tsx");
  assert.match(contracts, /توزيع كفيل آخر/);
  assert.doesNotMatch(contracts, /value=\{item\.sponsorName\}/);
  assert.match(contracts, /تُؤخذ أسماء\s+كفلائهم تلقائياً من ملفاتهم/);
  assert.match(quotes, /sponsorshipType:\"dali\"\|\"other\"/);
  assert.match(quotes, /اسم الكفيل/);
});
