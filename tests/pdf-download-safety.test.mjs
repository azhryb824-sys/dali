import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) { return readFile(new URL(`../${path}`, import.meta.url), "utf8"); }

test("every generated PDF download uses hardened attachment headers", async () => {
  const [headers, brand, reports, construction, portalDocuments, clientDocuments, quotation] = await Promise.all([
    source("lib/company-documents.ts"),
    source("app/api/portal/brand-identity/[id]/route.ts"),
    source("app/api/portal/reports/pdf/route.ts"),
    source("app/api/portal/construction/pdf/route.ts"),
    source("app/api/portal/documents/[id]/route.ts"),
    source("app/api/client/documents/[id]/route.ts"),
    source("app/api/portal/operations/quotes/[id]/pdf/route.ts"),
  ]);
  assert.match(headers, /filename\*=UTF-8''/);
  assert.match(headers, /x-content-type-options/);
  assert.match(headers, /no-store/);
  for (const route of [brand, reports, construction, portalDocuments, clientDocuments, quotation]) {
    assert.match(route, /attachmentHeaders/);
    assert.match(route, /application\/pdf/);
  }
});

test("authorized users can preview uploaded documents, stamp and signature inline", async () => {
  const [documents, assets, ui, generator] = await Promise.all([
    source("app/api/portal/documents/[id]/route.ts"), source("app/api/portal/company-assets/route.ts"), source("app/portal/PortalDashboard.tsx"), source("lib/pdf-generator.ts"),
  ]);
  assert.match(documents, /inline \? "inline" : "attachment"/);
  assert.match(assets, /canAccessPortalDocuments/);assert.match(assets, /"inline"/);
  assert.match(ui, /معاينة/);assert.match(ui, /\?inline=1/);
  assert.doesNotMatch(ui, /عنوان المستند<input name="title"/);
  assert.doesNotMatch(generator, /composer\.field\("الموضوع", input\.title\)/);
});

test("activity-aware quotations include itemized branded PDF output", async () => {
  const [generator, route, ui, operations] = await Promise.all([
    source("lib/pdf-generator.ts"),
    source("app/api/portal/operations/quotes/[id]/pdf/route.ts"),
    source("app/portal/OperationsWorkspace.tsx"),
    source("app/api/portal/operations/route.ts"),
  ]);
  assert.match(generator, /quotationTable/);
  assert.match(generator, /جدول الخدمات والأسعار/);
  assert.match(route, /generateIssuedPdf/);
  assert.match(route, /discountHalalas/);
  assert.match(ui, /إنشاء عرض سعر حسب نوع الطلب/);
  assert.match(ui, /توريد العمالة/);
  assert.match(ui, /راتب العامل/);
  assert.match(generator, /workforcePricing/);
  assert.match(ui, /PDF عربي/);
  assert.match(ui, /PDF عربي\/English/);
  assert.match(operations, /vatHalalas/);
  assert.match(operations, /activityLabel/);
});

test("every quotation uses the single documents-page quotation template", async () => {
  const [generator, documentsRoute, documentsUi] = await Promise.all([
    source("lib/pdf-generator.ts"),
    source("app/api/portal/documents/generate/route.ts"),
    source("app/portal/PortalDashboard.tsx"),
  ]);
  assert.match(generator, /input\.documentType === "quotation"\)/);
  assert.doesNotMatch(generator, /input\.documentType === "quotation" && input\.quotationItems\?\.length/);
  assert.match(generator, /const quotationItems = input\.quotationItems\?\.length/);
  assert.match(generator, /composer\.quotationTable\(quotationItems/);
  assert.match(documentsRoute, /صلاحية العرض وقيمة الخدمة من متطلبات نموذج عرض السعر/);
  assert.match(documentsUi, /required=\{documentType === "quotation"\}/);
});

test("quotation approval is a visible owner and system-admin action", async () => {
  const [workspace, dashboard, operations] = await Promise.all([
    source("app/portal/OperationsWorkspace.tsx"),
    source("app/portal/PortalDashboard.tsx"),
    source("app/api/portal/operations/route.ts"),
  ]);
  assert.match(workspace, /اعتماد عرض السعر/);
  assert.match(workspace, /\["draft","pending_approval"\]\.includes\(quote\.status\)/);
  assert.match(workspace, /transition\("transition-quote", quote, "approved"\)/);
  assert.match(dashboard, /role === "system_owner" \|\| role === "system_admin"/);
  assert.match(operations, /اعتماد عرض السعر متاح للمالك أو مشرف النظام فقط/);
  assert.match(operations, /draft: canApprove \? \["pending_approval", "approved", "cancelled"\]/);
});

test("legacy generated PDFs are rebuilt with the current template when accessed", async () => {
  const [download, regeneration, generation] = await Promise.all([
    source("app/api/portal/documents/[id]/route.ts"),
    source("lib/issued-document-regeneration.ts"),
    source("app/api/portal/documents/generate/route.ts"),
  ]);
  assert.match(download, /regenerateIssuedDocumentPdf/);
  assert.match(download, /issued-pdf-regenerated-and-downloaded/);
  assert.match(regeneration, /CURRENT_ISSUED_PDF_TEMPLATE/);
  assert.match(regeneration, /document\.source !== "generated"/);
  assert.match(regeneration, /BUCKET\.put\(document\.storageKey/);
  assert.match(generation, /templateVersion: "letterhead-v3-unified-quotation"/);
});

test("documents center uses the complete canonical quotation form instead of the generic issuer", async () => {
  const [dashboard, workspace, styles] = await Promise.all([source("app/portal/PortalDashboard.tsx"),source("app/portal/OperationsWorkspace.tsx"),source("app/portal/portal.css")]);
  assert.match(dashboard, /onIssueQuotation/);assert.match(dashboard, /QuotationIssueModal/);assert.doesNotMatch(dashboard, /<option value="quotation">عرض سعر<\/option>/);
  assert.match(workspace, /نموذج المستندات المعتمد/);assert.match(workspace, /حفظ مسودة عرض السعر للاعتماد/);
  for (const requirement of ["نوع طلب العميل","نطاق العدد","موقع تقديم الخدمة","الخصم بالريال","ضريبة القيمة المضافة","شروط الدفع","الافتراضات والاستثناءات"]) assert.match(workspace,new RegExp(requirement));
  assert.match(styles,/\.admin-shell h2\{font-size:18px\}/);assert.match(styles,/\.contract-billing>header h2/);
});

test("all supported issued document types remain connected to the PDF generator", async () => {
  const [generator, route, identity] = await Promise.all([
    source("lib/pdf-generator.ts"), source("app/api/portal/documents/generate/route.ts"), source("lib/brand-identity-pdf.ts"),
  ]);
  for (const type of ["workforce_contract", "quotation", "progress_claim", "invoice", "receipt", "payment_voucher", "construction_record"]) {
    assert.match(generator, new RegExp(type));
  }
  assert.match(route, /generateIssuedPdf/);
  assert.match(route, /contentType: "application\/pdf"/);
  assert.match(identity, /pdf\.save\(\)/);
});
