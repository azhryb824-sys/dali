import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("the system guide is trilingual, permission-aware, and reachable", () => {
  const guide = read("app/portal/SystemGuide.tsx");
  const guideCss = read("app/portal/system-guide.css");
  const dashboard = read("app/portal/PortalDashboard.tsx");
  const layout = read("app/portal/layout.tsx");

  assert.match(guide, /type Locale = "ar" \| "en" \| "bn"/);
  assert.match(guide, /const modules: ModuleGuide\[\]/);
  assert.match(guide, /module\.anyOf\.some|module\.anyOf\?\.some/);
  assert.match(guide, /module\.allOf\.every|module\.allOf\?\.every/);
  assert.match(guide, /data-no-translate/);
  assert.match(guide, /العربية · English · বাংলা/);
  assert.match(guide, /الملاحظة ليست اعتمادًا/);
  assert.match(guide, /A note is not an approval/);
  assert.match(guide, /নোট কোনো অনুমোদন নয়/);
  assert.match(guide, /لا تعتبر الحفظ اعتمادًا أو ترحيلًا أو دفعًا/);
  assert.match(guide, /saving is not the same as approval, posting, or payment/);
  assert.match(guide, /সংরক্ষণ অনুমোদন, পোস্টিং বা পরিশোধ নয়/);
  assert.match(guide, /instructionsTitle/);
  assert.match(guide, /guide-module-body/);
  assert.match(guide, /anyOf: \["representatives\.read", "operations\.read"\]/);
  assert.match(guideCss, /\.system-guide \.guide-hero h1\{[^}]*color:#f8fdff!important/);
  assert.match(guideCss, /\.guide-module-body li\{[^}]*font-size:14px/);
  assert.match(dashboard, /type View = [^;]*"guide"/);
  assert.match(dashboard, /changeView\("guide"\)/);
  assert.match(dashboard, /view === "guide" && <SystemGuide/);
  assert.match(layout, /system-guide\.css/);
});

test("dedicated page permissions stay separate across UI, APIs, and search", () => {
  const access = read("lib/portal-access.ts");
  const dashboard = read("app/portal/PortalDashboard.tsx");
  const search = read("app/api/portal/search/route.ts");
  const sharing = read("app/api/portal/documents/share/route.ts");
  const conversations = read("app/api/portal/conversations/route.ts");
  const integrations = read("app/api/portal/integrations/route.ts");

  assert.match(access, /export function canSharePortalDocuments/);
  assert.match(access, /functionalPermissions\.includes\("documents\.share"\)/);
  assert.doesNotMatch(access, /canManagePortalDocuments[\s\S]{0,350}finance\.write/);
  assert.match(access, /export function canAccessPortalConversations/);
  assert.doesNotMatch(access, /canManagePortalConversations[\s\S]{0,350}workforce\.write/);
  assert.match(sharing, /canSharePortalDocuments/);
  assert.match(conversations, /requireConversationReadAccess/);
  assert.match(conversations, /requireConversationWriteAccess/);
  assert.match(integrations, /hasPortalPermission\(access, "integrations", "administer"\)/);
  assert.match(dashboard, /const canAccessDocuments = hasPermission\("documents\.read"\)/);
  assert.match(dashboard, /const canWriteConversations = hasPermission\("conversations\.write"\)/);
  assert.match(search, /canSearchConversations = canAccessPortalConversations/);
  assert.match(search, /canSearchOperations \? db\.select\(\)\.from\(clients\)/);
  assert.match(search, /canSearchGovernment \? db\.select\(\)\.from\(governmentSites\)/);
  assert.doesNotMatch(search, /canAccessPortalDepartment/);
  assert.match(search, /key: "system-guide"[\s\S]{0,160}view: "guide"/);
});

test("sensitive construction decisions require approval permission", () => {
  const route = read("app/api/portal/construction/route.ts");
  const attachments = read("app/api/portal/construction/attachments/route.ts");
  const costs = read("app/api/portal/construction/cost-control/route.ts");
  const workspace = read("app/portal/ConstructionWorkspace.tsx");

  assert.match(route, /hasPortalPermission\(access, "construction", "approve"\)/);
  assert.match(route, /\["won", "lost", "declined"\]\.includes\(stage\) && !canApprove/);
  assert.match(route, /decisionStatuses\.includes\(status\) && !canApprove/);
  assert.match(attachments, /hasPortalPermission\(auth\.access, "construction", "approve"\)/);
  assert.match(costs, /\["approved_change", "payment_certificate"\][\s\S]{0,180}"construction", "approve"/);
  assert.match(workspace, /canApprove: boolean/);
  assert.match(workspace, /data\.canApprove&&item\.isCurrent/);
});

test("contracts, official letters, and stamps follow contractual permissions", () => {
  const operations = read("app/api/portal/operations/route.ts");
  const quote = read("app/api/portal/operations/quotes/[id]/route.ts");
  const quotePdf = read("app/api/portal/operations/quotes/[id]/pdf/route.ts");
  const generatedDocuments = read("app/api/portal/documents/generate/route.ts");
  const documentDownload = read("app/api/portal/documents/[id]/route.ts");
  const letters = read("app/api/portal/letters/route.ts");
  const letterPdf = read("app/api/portal/letters/[id]/pdf/route.ts");
  const stamps = read("app/api/portal/document-stamps/route.ts");
  const dashboard = read("app/portal/PortalDashboard.tsx");
  const workspace = read("app/portal/ContractualDocumentsWorkspace.tsx");

  assert.match(operations, /hasPortalPermission\(access, "contracts", "read"\)/);
  assert.match(operations, /\["contracts", "write"\] as const/);
  assert.match(quote, /hasPortalPermission\(access, "contracts", "write"\)/);
  assert.match(quotePdf, /hasPortalPermission\(access, "contracts", "read"\)/);
  assert.match(generatedDocuments, /\["workforce_contract", "quotation", "official_letter"\]\.includes\(documentType\)[\s\S]{0,80}\? "contracts"/);
  assert.match(generatedDocuments, /\["invoice", "receipt", "payment_voucher", "progress_claim"\]\.includes\(documentType\)[\s\S]{0,80}\? "finance"/);
  assert.match(documentDownload, /contractualTypes\.has\(document\.documentType \|\| ""\)/);
  assert.match(documentDownload, /contractPaymentSchedules\.invoiceDocumentId/);
  assert.match(letters, /hasPortalPermission\(current, "contracts", action\)/);
  assert.match(letters, /hasPortalPermission\(current, "contracts", "approve"\)/);
  assert.match(letterPdf, /hasPortalPermission\(access,"contracts","read"\)/);
  assert.match(stamps, /hasPortalPermission\(access, "contracts", "read"\)/);
  assert.match(dashboard, /canManage=\{hasPermission\("contracts\.write"\)\}/);
  assert.match(dashboard, /canApprove=\{hasPermission\("contracts\.approve"\)\}/);
  assert.match(workspace, /\{canApprove && \(/);
});

test("visible note labels require explicit English and Bengali translations", () => {
  const audit = read("scripts/audit-translations.mjs");
  const publicCatalog = read("lib/i18n-public-catalog.ts");
  const adminCatalog = read("lib/i18n-admin-catalog.ts");

  assert.match(audit, /review:\s*"notes"/);
  assert.match(audit, /!fields\?\.has\("en"\)\|\|!fields\?\.has\("bn"\)/);
  assert.match(publicCatalog, /"شاركنا ملاحظتك": \{ en: "Share your feedback", bn:/);
  assert.match(adminCatalog, /"ملاحظات التشغيل": \{ en: "Operational notes", bn:/);
  assert.match(adminCatalog, /"معتمد بملاحظات": \{ en: "Approved with comments", bn:/);
});
