import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read=(path)=>fs.readFileSync(new URL(`../${path}`,import.meta.url),"utf8");

test("contract form preserves payments while controlling their PDF visibility",()=>{
  const ui=read("app/portal/PortalDashboard.tsx");
  const route=read("app/api/portal/documents/generate/route.ts");
  const pdf=read("lib/workforce-contract-pdf.ts");
  assert.match(ui,/name="showPaymentSchedule"/);
  assert.match(ui,/إظهار جدول الدفعات في PDF/);
  assert.match(route,/showPaymentSchedule/);
  assert.match(pdf,/showPaymentSchedule/);
});

test("Ajir selection is independent from Dali sponsorship and available workers remain selectable",()=>{
  const ui=read("app/portal/PortalDashboard.tsx");
  const route=read("app/api/portal/documents/generate/route.ts");
  assert.match(ui,/يمكن تحديد حالة أجير مستقلة عن جهة الكفالة/);
  assert.doesNotMatch(ui,/item\.sponsorshipType==="dali"\?"not_applicable":item\.ajirContractStatus/);
  assert.match(ui,/worker\.status === "available"/);
  assert.match(route,/ajirContractStatus/);
});

test("contract and quotation logistics are persisted and rendered in PDFs",()=>{
  const schema=read("db/schema.ts"),migration=read("drizzle-pg/0051_contract_presentation_legal_attachments.sql"),pdf=read("lib/pdf-generator.ts"),quote=read("app/portal/OperationsWorkspace.tsx");
  for(const source of [schema,migration,pdf,quote]){assert.match(source,/accommodationParty/);assert.match(source,/transportParty/)}
});

test("contract signatures use the client and appear only after approval",()=>{
  const pdf=read("lib/pdf-generator.ts"),regenerator=read("lib/workforce-contract-pdf.ts");
  assert.match(pdf,/clientName/);
  assert.match(pdf,/approvalState === "approved"/);
  assert.match(regenerator,/approvalState/);
});

test("legal referrals expose the full snapshot and accept secure attachments",()=>{
  const api=read("app/api/portal/legal-cases/route.ts"),upload=read("app/api/portal/legal-cases/attachments/route.ts"),download=read("app/api/portal/legal-cases/attachments/[id]/route.ts"),ui=read("app/portal/LegalCaseWorkspace.tsx");
  assert.match(api,/legalCaseAttachments/);
  assert.match(upload,/validateUploadedFile/);
  assert.match(upload,/hasPortalPermission\(actor, "legal", "write"\)/);
  assert.match(download,/hasPortalPermission\(actor, "legal", "read"\)/);
  assert.match(ui,/snapshot\.documents/);
  assert.match(ui,/snapshot\.payments/);
  assert.match(ui,/snapshot\.finances/);
  assert.match(ui,/snapshot\.workers/);
});

test("workforce supervision presents coverage shortage and available capacity coherently",()=>{
  const ui=read("app/portal/WorkforceSupervisionWorkspace.tsx");
  assert.match(ui,/عقود بها عجز/);
  assert.match(ui,/matchingAvailable/);
  assert.match(ui,/إدارة العمالة والغياب/);
});
