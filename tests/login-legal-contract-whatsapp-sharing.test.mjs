import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("remember-login saves passwords only through secure platform credential stores", async () => {
  const [page, form, desktop, preload] = await Promise.all([
    read("app/login/page.tsx"),
    read("app/login/LoginCredentialsForm.tsx"),
    read("desktop/main.mjs"),
    read("desktop/preload.mjs"),
  ]);

  assert.match(page, /LoginCredentialsForm/);
  assert.match(form, /dali-remembered-login-identifier-v1/);
  assert.match(form, /localStorage\.setItem/);
  assert.match(form, /localStorage\.removeItem/);
  assert.match(form, /autoComplete="current-password"/);
  assert.match(form, /حفظ رقم الهوية وكلمة المرور على هذا الجهاز/);
  assert.match(form, /PasswordCredential/);
  assert.match(form, /finalUrl\.pathname\.startsWith\("\/portal"\)/);
  assert.match(form, /desktopBridge\.save\(\{ identifier, password \}\)/);
  assert.doesNotMatch(form, /setItem\([^)]*password/is);
  assert.match(desktop, /safeStorage\.isEncryptionAvailable\(\)/);
  assert.match(desktop, /dali:login-credentials:save/);
  assert.match(desktop, /loginCredentials = \{/);
  assert.match(preload, /isTrustedLoginPage\(\)/);
  assert.match(preload, /loginCredentials:/);
});

test("approved contracts require an entered WhatsApp number and role permissions before sharing", async () => {
  const [route, api, ui, runtime, files] = await Promise.all([
    read("app/api/portal/contracts/[id]/share/route.ts"),
    read("app/api/portal/contract-payments/route.ts"),
    read("app/portal/ContractBillingWorkspace.tsx"),
    read("lib/whatsapp-runtime.ts"),
    read("lib/file-share-runtime.ts"),
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
  assert.match(route, /createWhatsAppLaunchToken/);
  assert.match(route, /whatsappLaunchUrl/);
  assert.match(route, /whatsappAppUrl/);
  assert.match(route, /whatsappWebUrl/);
  assert.match(route, /shareMessage: message/);
  assert.match(route, /files: \[/);
  assert.match(api, /canShareApprovedContracts/);
  assert.match(ui, /name="whatsappNumber"/);
  assert.match(ui, /يجب كتابة الرقم عند كل مشاركة/);
  assert.match(ui, /مشاركة العقد عبر واتساب/);
  assert.match(ui, /shareApprovedContractFiles/);
  assert.match(ui, /مشاركة PDF الفعلي/);
  assert.match(ui, /فتح تطبيق واتساب/);
  assert.match(ui, /المتابعة إلى واتساب ويب/);
  assert.match(runtime, /window\.location\.assign\(appUrl\)/);
  assert.match(runtime, /daliDesktop\?\.whatsapp/);
  assert.match(files, /navigator\.share/);
  assert.match(files, /Share", "share"/);
  assert.match(files, /downloadDaliShareFiles/);
});

test("legal files expose current contract documents and share only with the assigned external lawyer", async () => {
  const [collector, cases, shares, ui, files] = await Promise.all([
    read("lib/contract-legal-documents.ts"),
    read("app/api/portal/legal-cases/route.ts"),
    read("app/api/portal/legal-cases/shares/route.ts"),
    read("app/portal/LegalCaseWorkspace.tsx"),
    read("lib/file-share-runtime.ts"),
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
  assert.match(shares, /createWhatsAppLaunchToken/);
  assert.match(shares, /whatsappLaunchUrl/);
  assert.match(shares, /whatsappAppUrl/);
  assert.match(shares, /whatsappWebUrl/);
  assert.match(shares, /bundleItems\.map/);
  assert.match(shares, /shareMessage: message/);
  assert.match(shares, /contentType: source\.contentType/);
  assert.match(ui, /assignedExternalLawyer/);
  assert.match(ui, /المحامي الخارجي المسندة إليه القضية/);
  assert.match(ui, /item\.legalDocumentRole === "disputed_invoice"/);
  assert.match(ui, /shareLegalFiles/);
  assert.match(ui, /مشاركة الملفات الفعلية/);
  assert.match(ui, /فتح تطبيق واتساب/);
  assert.match(ui, /المتابعة إلى واتساب ويب/);
  assert.match(files, /Filesystem", "downloadFile"/);
  assert.match(files, /files: fileUrls/);
  assert.doesNotMatch(ui, /externalLawyers\.map/);
});

test("WhatsApp launching is encrypted, short-lived, user-bound, and works from the installed desktop app", async () => {
  const [token, launchRoute, pendingPage, desktop, desktopNavigation] = await Promise.all([
    read("lib/whatsapp-launch.ts"),
    read("app/api/portal/whatsapp-launch/route.ts"),
    read("app/portal/whatsapp-launch/page.tsx"),
    read("desktop/main.mjs"),
    read("desktop/external-navigation.mjs"),
  ]);

  assert.match(token, /aes-256-gcm/);
  assert.match(token, /actorEmail/);
  assert.match(token, /WHATSAPP_LAUNCH_SECONDS = 10 \* 60/);
  assert.match(token, /payload\.actorEmail !== cleanActorEmail\(actorEmail\)/);
  assert.match(launchRoute, /requirePortalApiRole/);
  assert.match(launchRoute, /readWhatsAppLaunchToken\(token, access\.user\.email\)/);
  assert.match(launchRoute, /createWhatsAppUrl/);
  assert.match(launchRoute, /status: 302/);
  assert.match(launchRoute, /no-store/);
  assert.match(pendingPage, /جارٍ تجهيز واتساب/);
  assert.match(desktop, /shell\.openExternal\(whatsappAppUrl\)/);
  assert.match(desktop, /will-redirect/);
  assert.match(desktopNavigation, /whatsapp:\/\/send/);
});
