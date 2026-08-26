import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("company file visibility and download authorization use the same policy", () => {
  const access = read("lib/portal-access.ts");
  const page = read("app/portal/page.tsx");
  const dashboard = read("app/portal/PortalDashboard.tsx");
  const documents = read("app/api/portal/documents/[id]/route.ts");
  const assets = read("app/api/portal/company-assets/route.ts");

  assert.match(access, /export function canAccessCompanyFiles/);
  assert.match(access, /canAccessPortalDocuments\(access\) \|\| canManageCompanyAssets\(access\)/);
  assert.match(page, /const canSeeDocuments = canAccessCompanyFiles\(access\)/);
  assert.match(dashboard, /hasPermission\("documents\.read"\) \|\| hasPermission\("assets\.administer"\)/);
  assert.match(documents, /canAccessCompanyFiles\(access\)/);
  assert.match(assets, /canAccessCompanyFiles\(access\)/);
});

test("draft contracts can be previewed and downloaded without changing approval state", () => {
  const route = read("app/api/portal/documents/[id]/route.ts");
  const dashboard = read("app/portal/PortalDashboard.tsx");

  assert.doesNotMatch(route, /لا يمكن تنزيل العقد قبل اعتماده/);
  assert.doesNotMatch(route, /contract\?\.approvedBy/);
  assert.match(route, /regenerateIssuedDocumentPdf\(id, pdfLanguage\)/);
  assert.match(dashboard, /نسخة مسودة غير معتمدة/);
  assert.match(dashboard, /contract\.documentId\}\?language=ar/);
  assert.match(dashboard, /contract\.documentId\}\?language=bilingual/);
});

test("official letters support create save edit delete and PDF preview", () => {
  const route = read("app/api/portal/letters/route.ts");
  const pdf = read("app/api/portal/letters/[id]/pdf/route.ts");
  const ui = read("app/portal/ContractualDocumentsWorkspace.tsx");

  assert.match(route, /export async function POST/);
  assert.match(route, /insert\(officialLetters\)/);
  assert.match(route, /action==="edit"/);
  assert.match(route, /update\(officialLetters\)/);
  assert.match(route, /export async function DELETE/);
  assert.match(route, /delete\(officialLetters\)/);
  assert.match(ui, />تعديل<\/button>/);
  assert.match(ui, />حذف<\/button>/);
  assert.match(ui, /\/api\/portal\/letters\/\$\{letter\.id\}\/pdf\?language=ar/);
  assert.match(pdf, /generateIssuedPdf/);
});

test("quotation drafts support create save edit delete with dependent cleanup", () => {
  const operations = read("app/api/portal/operations/route.ts");
  const quoteRoute = read("app/api/portal/operations/quotes/[id]/route.ts");
  const ui = read("app/portal/OperationsWorkspace.tsx");

  assert.match(operations, /action === "create-quote"/);
  assert.match(operations, /insert\(quoteVersions\)/);
  assert.match(operations, /insert\(quoteItems\)/);
  assert.match(quoteRoute, /export async function PATCH/);
  assert.match(quoteRoute, /update\(quoteVersions\)/);
  assert.match(quoteRoute, /export async function DELETE/);
  assert.match(quoteRoute, /db\.transaction/);
  assert.match(quoteRoute, /delete\(workflowApprovals\)/);
  assert.match(quoteRoute, /delete\(quoteItems\)/);
  assert.match(quoteRoute, /delete\(quoteVersions\)/);
  assert.match(ui, /editQuote\(quote\)/);
  assert.match(ui, /void deleteQuote\(quote\)/);
});

test("document drafts can be created updated and deleted by their owner", () => {
  const route = read("app/api/portal/document-drafts/route.ts");
  assert.match(route, /export async function POST/);
  assert.match(route, /update\(documentDrafts\)/);
  assert.match(route, /insert\(documentDrafts\)/);
  assert.match(route, /eq\(documentDrafts\.ownerEmail, access\.user\.email\.toLowerCase\(\)\)/);
  assert.match(route, /export async function DELETE/);
  assert.match(route, /delete\(documentDrafts\)/);
});
