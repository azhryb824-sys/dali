import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("contract and quotation creation cannot close from backdrop click", async () => {
  const dashboard = await readFile("app/portal/PortalDashboard.tsx", "utf8");
  const operations = await readFile("app/portal/OperationsWorkspace.tsx", "utf8");

  assert.match(
    dashboard,
    /<div className="drawer-backdrop static-modal-backdrop" aria-hidden="true" \/>/,
  );
  assert.doesNotMatch(
    dashboard,
    /aria-label="إغلاق نافذة إصدار المستند"[^>]*onClick=\{onClose\}/,
  );

  assert.match(
    operations,
    /className="drawer-backdrop static-modal-backdrop"[\s\S]*?aria-hidden="true"/,
  );
  assert.doesNotMatch(
    operations,
    /aria-label="إغلاق نموذج عرض السعر"[\s\S]*?onClick=\{onClose\}/,
  );

  assert.match(dashboard, /<button onClick=\{onClose\} aria-label="إغلاق">/);
  assert.match(operations, /<button onClick=\{onClose\} aria-label="إغلاق">/);
});
