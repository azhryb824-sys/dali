import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (file) => readFile(new URL(`../${file}`, import.meta.url), "utf8");

test("commercial repair covers sales, quotations, contracts, billing, and stamps", async () => {
  const migration = await source("drizzle-pg/0043_commercial_cycle_schema_repair.sql");
  for (const expected of [
    '"sales_representatives"',
    '"sales_representative_id"',
    '"quantity_mode"',
    '"payment_schedule_json"',
    '"sponsorship_type"',
    '"contract_direction"',
    '"billing_mode"',
    '"subtotal_halalas"',
    '"document_stamps"',
    '"document_drafts"',
    '"representative_requests"',
  ]) assert.match(migration, new RegExp(expected.replaceAll("\"", "\\\"")));
  assert.doesNotMatch(migration, /^\s*(?:DELETE|TRUNCATE)\b/im);
});

test("operations failures expose a correlation id without leaking database details", async () => {
  const route = await source("app/api/portal/operations/route.ts");
  assert.match(route, /const correlationId = requestCorrelationId\(request\)/);
  assert.match(route, /operations-list-failed.*correlationId/s);
  assert.match(route, /تعذّر تحميل بيانات المبيعات والتشغيل", correlationId/);
});
