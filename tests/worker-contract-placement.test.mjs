import assert from "node:assert/strict";
import test from "node:test";
import { resolveWorkerContractPlacement } from "../lib/worker-contract-placement.ts";

const contracts = [
  { id: 10, referenceCode: "CTR-10", clientName: "عميل العقد", workSite: "مكة - العزيزية" },
  { id: 11, referenceCode: "CTR-11", clientName: "عميل آخر", workSite: "جدة - الشاطئ" },
];

test("active contract work site overrides stale worker site", () => {
  const result = resolveWorkerContractPlacement(
    7,
    [{ workerId: 7, contractId: 10, status: "active" }],
    contracts,
    "موقع قديم",
  );
  assert.equal(result.site, "مكة - العزيزية");
  assert.equal(result.contract?.referenceCode, "CTR-10");
  assert.equal(result.contract?.clientName, "عميل العقد");
});

test("non-active assignment does not override worker fallback site", () => {
  const result = resolveWorkerContractPlacement(
    7,
    [{ workerId: 7, contractId: 10, status: "released" }],
    contracts,
    "موقع العامل",
  );
  assert.equal(result.site, "موقع العامل");
  assert.equal(result.contract, null);
});

test("missing contract falls back safely to worker site", () => {
  const result = resolveWorkerContractPlacement(
    7,
    [{ workerId: 7, contractId: 999, status: "active" }],
    contracts,
    "الموقع المسجل",
  );
  assert.equal(result.site, "الموقع المسجل");
  assert.equal(result.contract, null);
});
