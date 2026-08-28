import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const read=(path)=>readFileSync(new URL(`../${path}`,import.meta.url),"utf8");

test("contract profession separates client price from actual worker salary",()=>{
  const schema=read("db/schema.ts"),route=read("app/api/portal/documents/generate/route.ts"),ui=read("app/portal/PortalDashboard.tsx");
  assert.match(schema,/actualSalaryHalalas/);
  assert.match(route,/actualSalaryHalalas/);
  assert.match(ui,/الراتب الفعلي للعامل شهريًا/);
});

test("worker salary requires active assignment and a paid contract installment",()=>{
  const route=read("app/api/portal/records/route.ts");
  assert.match(route,/العامل غير مسند فعليًا إلى العقد المحدد/);
  assert.match(route,/payment\.status !== "paid"/);
  assert.match(route,/contractPaymentScheduleId: linkedPaymentScheduleId/);
  assert.match(route,/worker_violation/);
});

test("absence ranges exclude Friday and use actual salary",()=>{
  const route=read("app/api/portal/contracts/[id]/attendance/route.ts");
  assert.match(route,/getUTCDay\(\)!==5/);
  assert.match(route,/profession\.actualSalaryHalalas/);
  assert.match(route,/absenceEndDate/);
});
