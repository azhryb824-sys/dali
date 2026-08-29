import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dashboard = await readFile(new URL("../app/portal/PortalDashboard.tsx", import.meta.url), "utf8");
const visualCss = await readFile(new URL("../app/portal/visual-accessibility.css", import.meta.url), "utf8");

test("contract form uses explicit multi-step validation", () => {
  assert.match(dashboard, /onSubmit=\{submit\} noValidate/);
  assert.match(dashboard, /showContractValidationError\(2,/);
  assert.match(dashboard, /showContractValidationError\(4,/);
  assert.match(dashboard, /await onSubmit\(form\)/);
});

test("contract save errors are visible and accessible", () => {
  assert.match(dashboard, /className="contract-save-error span-two" role="alert"/);
  assert.match(dashboard, /تعذّر حفظ العقد/);
  assert.match(visualCss, /\.contract-save-error\{/);
});

test("Ajir status is always rendered per profession", () => {
  assert.match(dashboard, /حالة عقد أجير\s*<select/);
  assert.match(dashboard, /<option value="with_ajir">بعقد أجير<\/option>/);
  assert.match(dashboard, /<option value="without_ajir">بدون عقد أجير<\/option>/);
  assert.match(dashboard, /<option value="not_applicable">لا ينطبق<\/option>/);
  assert.match(dashboard, /يمكن تحديد حالة أجير مستقلة عن جهة الكفالة/);
});
