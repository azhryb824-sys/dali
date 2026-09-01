import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("issued invoices can be downloaded as separate Arabic and English PDFs", async () => {
  const [route, generator, billing, dashboard] = await Promise.all([
    source("app/api/portal/documents/[id]/route.ts"),
    source("lib/pdf-generator.ts"),
    source("app/portal/ContractBillingWorkspace.tsx"),
    source("app/portal/PaymentManagementDashboard.tsx"),
  ]);
  assert.match(route, /requestedLanguage === "en" \? "en"/);
  assert.match(generator, /pdfLanguage\?: "ar" \| "en" \| "bilingual"/);
  assert.match(generator, /input\.pdfLanguage === "en"/);
  assert.match(generator, /row\("Due date", input\.expiryDate\)/);
  assert.match(generator, /drawEnglishHeader\(page, resources, input, pageNumber\)/);
  assert.match(generator, /if \(resources\.letterhead\) page\.drawImage\(resources\.letterhead/);
  assert.match(generator, /drawEnglishEndorsement\(page, resources, input\.referenceCode\)/);
  assert.match(billing, /invoiceDocumentId\}\?language=en/);
  assert.match(dashboard, /invoiceDocumentId\}\?language=en/);
});

test("manual, automatic and legacy invoices preserve the data needed by the English letterhead template", async () => {
  const [manual, automatic, regeneration] = await Promise.all([
    source("app/api/portal/contract-payments/route.ts"),
    source("lib/contract-payment-invoicing.ts"),
    source("lib/issued-document-regeneration.ts"),
  ]);
  for (const sourceText of [manual, automatic]) {
    assert.match(sourceText, /clientCr:contract\.clientCr\|\|null/);
    assert.match(sourceText, /clientVat:contract\.clientVat\|\|null/);
    assert.match(sourceText, /details:invoiceDetails/);
    assert.match(sourceText, /templateVersion:"letterhead-v4-english-invoice"/);
  }
  assert.match(regeneration, /CURRENT_ISSUED_PDF_TEMPLATE = "letterhead-v4-english-invoice"/);
  assert.match(regeneration, /contractPaymentSchedules/);
  assert.match(regeneration, /workforceContracts/);
  assert.match(regeneration, /legacyInvoiceDetails/);
  assert.match(regeneration, /approvalState: "approved"/);
});

test("contract cards expose Arabic and one combined bilingual PDF", async () => {
  const billing = await source("app/portal/ContractBillingWorkspace.tsx");
  assert.match(billing, /contract\.documentId\}\?language=ar/);
  assert.match(billing, /contract\.documentId\}\?language=bilingual/);
  assert.match(billing, /PDF عربي/);
  assert.match(billing, /PDF عربي\/English/);
});

test("bilingual contracts keep Arabic right, English left and signatures on a final letterhead page", async () => {
  const pdf = await source("lib/pdf-generator.ts");
  assert.match(pdf, /const bilingualSignaturePage = \(\) => \{/);
  assert.match(pdf, /addPage\(\);\s*section\("صفحة التوقيعات", "Signature Page"\)/);
  assert.match(pdf, /"الطرف الثاني \/ العميل",\s*input\.clientName,\s*"Second Party \/ Client",\s*input\.clientName/);
  assert.match(pdf, /drawHeader\(page, resources, bilingualHeader, pageNumber\)/);
  assert.match(pdf, /drawLeft\(page, "Parties' Acknowledgment and Signatures"/);
  assert.match(pdf, /arabicRight - 7/);
  assert.match(pdf, /input\.documentType === "workforce_contract"\) bilingualSignaturePage\(\)/);
  assert.doesNotMatch(pdf, /العمالة المسندة عند الإصدار/);
});
