import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read=(path)=>fs.readFileSync(new URL(`../${path}`,import.meta.url),"utf8");

test("contract approval creates a single-use expiring signature upload link",()=>{
  const status=read("app/api/portal/contracts/[id]/status/route.ts");
  const migration=read("drizzle-pg/0050_contract_signature_uploads.sql");
  assert.match(status,/contractSignatureRequests/);
  assert.match(status,/hashShareToken\(signatureToken\)/);
  assert.match(status,/14 \* 86400000/);
  assert.match(status,/status: "revoked"/);
  assert.match(status,/contracts\/signature\/\$\{signatureToken\}/);
  assert.match(migration,/one_pending_idx/);
  assert.match(migration,/ON DELETE CASCADE/);
  assert.doesNotMatch(migration,/token\s+text/i);
});

test("public upload accepts only validated PDF and uses an atomic single-use claim",()=>{
  const route=read("app/api/contracts/signature/[token]/route.ts");
  assert.match(route,/application\/pdf/);
  assert.match(route,/25 \* 1024 \* 1024/);
  assert.match(route,/%PDF-/);
  assert.match(route,/validateUploadedFile/);
  assert.match(route,/eq\(contractSignatureRequests\.status, "pending"\)/);
  assert.match(route,/source: "signed-upload"/);
  assert.match(route,/originalApprovedStorageKey/);
  assert.match(route,/status: "signed"/);
  assert.match(route,/BUCKET\.delete\(signedStorageKey\)/);
});

test("signed upload replaces current PDF but keeps original approved storage reference",()=>{
  const route=read("app/api/contracts/signature/[token]/route.ts");
  const download=read("app/api/portal/documents/[id]/route.ts");
  assert.match(route,/originalStorageKey: signatureRequest\.originalStorageKey/);
  assert.match(route,/storageKey: signedStorageKey/);
  assert.match(download,/document\.source === "generated"/);
  assert.match(download,/BUCKET\.get\(document\.storageKey\)/);
});

test("client upload page is mobile friendly and approval UI exposes the generated link",()=>{
  const page=read("app/contracts/signature/[token]/SignatureUploadClient.tsx");
  const css=read("app/contracts/signature/[token]/signature.module.css");
  const dashboard=read("app/portal/PortalDashboard.tsx");
  const billing=read("app/portal/ContractBillingWorkspace.tsx");
  assert.match(page,/accept="application\/pdf,\.pdf"/);
  assert.match(page,/يمكن استخدام الرابط مرة واحدة فقط/);
  assert.match(css,/@media\(max-width:560px\)/);
  assert.match(dashboard,/signatureUploadUrl/);
  assert.match(billing,/signatureUploadUrl/);
  assert.match(dashboard,/clipboard\.writeText/);
  assert.match(billing,/clipboard\.writeText/);
});

test("contract list offers an internal signed PDF replacement form",()=>{
  const billing=read("app/portal/ContractBillingWorkspace.tsx");
  const route=read("app/api/portal/contracts/[id]/signed-document/route.ts");
  assert.match(billing,/رفع العقد الموقع/);
  assert.match(billing,/setSignedUploadContract\(contract\)/);
  assert.match(billing,/accept="application\/pdf,\.pdf"/);
  assert.match(billing,/signed-document/);
  assert.match(route,/hasPortalPermission\(access,"contracts","write"\)/);
  assert.match(route,/source:"signed-upload"/);
  assert.match(route,/previousContractStorageKey/);
  assert.match(route,/status:"signed"/);
  assert.match(route,/BUCKET\.delete\(storageKey\)/);
});
