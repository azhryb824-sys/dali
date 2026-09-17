import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("remember-login keeps only the identifier and leaves passwords to the browser manager", async () => {
  const [page, form] = await Promise.all([
    read("app/login/page.tsx"),
    read("app/login/LoginCredentialsForm.tsx"),
  ]);

  assert.match(page, /LoginCredentialsForm/);
  assert.match(form, /dali-remembered-login-identifier-v1/);
  assert.match(form, /localStorage\.setItem/);
  assert.match(form, /localStorage\.removeItem/);
  assert.match(form, /autoComplete="current-password"/);
  assert.match(form, /حفظ معلومات الدخول على هذا الجهاز/);
  assert.doesNotMatch(form, /setItem\([^)]*password/is);
});

test("approved contracts require an entered WhatsApp number and role permissions before sharing", async () => {
  const [route, api, ui] = await Promise.all([
    read("app/api/portal/contracts/[id]/share/route.ts"),
    read("app/api/portal/contract-payments/route.ts"),
    read("app/portal/ContractBillingWorkspace.tsx"),
  ]);

  for (const role of [
    "system_owner",
    "system_admin",
    "administrative_assistant",
  ])
    assert.match(route, new RegExp(role));
  assert.match(route, /hasPortalPermission\(access, "contracts", "read"\)/);
  assert.match(route, /canSharePortalDocuments\(access\)/);
  assert.match(route, /!contract\.approvedBy/);
  assert.match(route, /documentShareLinks/);
  assert.match(route, /normalizeSaudiWhatsAppNumber/);
  assert.match(route, /approved-contract-whatsapp-share-created/);
  assert.match(api, /canShareApprovedContracts/);
  assert.match(ui, /name="whatsappNumber"/);
  assert.match(ui, /يجب كتابة الرقم عند كل مشاركة/);
  assert.match(ui, /مشاركة العقد عبر واتساب/);
});

test("legal files expose current contract documents and share only with the assigned external lawyer", async () => {
  const [collector, cases, shares, ui] = await Promise.all([
    read("lib/contract-legal-documents.ts"),
    read("app/api/portal/legal-cases/route.ts"),
    read("app/api/portal/legal-cases/shares/route.ts"),
    read("app/portal/LegalCaseWorkspace.tsx"),
  ]);

  assert.match(collector, /loadLegalRecordContractDocuments/);
  assert.match(collector, /snapshot\.referral\?\.paymentId/);
  assert.match(collector, /disputed_invoice/);
  assert.match(collector, /approved_contract/);
  assert.match(cases, /contractDocuments/);
  assert.match(shares, /matter\.assignedLawyerId/);
  assert.match(shares, /requestedLawyerId !== matter\.assignedLawyerId/);
  assert.match(shares, /loadLegalRecordContractDocuments\(db, matter\)/);
  assert.match(shares, /الفاتورة محل الإشكال/);
  assert.match(ui, /assignedExternalLawyer/);
  assert.match(ui, /المحامي الخارجي المسندة إليه القضية/);
  assert.match(ui, /item\.legalDocumentRole === "disputed_invoice"/);
  assert.doesNotMatch(ui, /externalLawyers\.map/);
});
