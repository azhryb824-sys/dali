import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("every maintained bank selector uses the complete shared bank list", async () => {
  const [source, accounting, hr, employeeProfile, portal] = await Promise.all([
    read("lib/saudi-banks.ts"),
    read("app/portal/AccountingWorkspace.tsx"),
    read("app/portal/HrWorkspace.tsx"),
    read("app/portal/EmployeeProfileWorkspace.tsx"),
    read("app/portal/PortalDashboard.tsx"),
  ]);
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const bankModule = await import(
    `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
  );

  assert.ok(bankModule.saudiBanks.includes("مصرف الراجحي"));
  assert.ok(bankModule.saudiBanks.includes("أخرى"));
  assert.equal(bankModule.isSaudiBank("مصرف الراجحي"), true);
  assert.equal(bankModule.isSaudiBank("أخرى"), true);

  for (const ui of [accounting, hr, employeeProfile, portal]) {
    assert.match(ui, /saudiBanks\.map\(\(bank\) =>/);
  }
  for (const ui of [accounting, hr, employeeProfile]) {
    assert.doesNotMatch(ui, /<input name="bankName"/);
  }
});
