import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(path, "utf8");

test("legal and contracts use an audited two-way correspondence workflow", async () => {
  const [migration, schema, route, component, legalUi, billingUi, documentDownload] = await Promise.all([
    read("drizzle-pg/0069_legal_contract_correspondence.sql"),
    read("db/schema.ts"),
    read("app/api/portal/legal-contract-correspondence/route.ts"),
    read("app/portal/LegalContractCorrespondence.tsx"),
    read("app/portal/LegalCaseWorkspace.tsx"),
    read("app/portal/ContractBillingWorkspace.tsx"),
    read("app/api/portal/documents/[id]/route.ts"),
  ]);

  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.legal_contract_correspondence/);
  assert.match(migration, /legal_contract_correspondence_parent_fk/);
  assert.match(migration, /missing_attachment/);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.doesNotMatch(migration, /DROP\s+(?:TABLE|COLUMN)|TRUNCATE|DELETE\s+FROM/i);
  assert.match(schema, /export const legalContractCorrespondence/);
  assert.match(route, /\["system_owner", "system_admin", "legal_supervisor", "lawyer"\]/);
  assert.match(route, /hasPortalPermission\(actor, "contracts", "write"\)/);
  assert.match(route, /requiredAttachmentName\.length < 2/);
  assert.match(route, /legal_requested_attachment/);
  assert.match(route, /returned_to_contracts/);
  assert.match(route, /contracts_replied/);
  assert.match(route, /targetDepartment: "workforce"/);
  assert.match(component, /إرسال ملاحظة إلى شؤون العمالة/);
  assert.match(component, /إعادة العقد إلى قسم العقود/);
  assert.match(component, /إرفاق وإرسال للقانونية/);
  assert.match(component, /timeZone: "Asia\/Riyadh"/);
  assert.match(legalUi, /mode="legal"/);
  assert.match(billingUi, /mode="contracts"/);
  assert.match(documentDownload, /legal_requested_attachment/);
});

test("legal WhatsApp controls remain visible and explain missing prerequisites", async () => {
  const ui = await read("app/portal/LegalCaseWorkspace.tsx");
  assert.match(ui, /data\.canShareExternally && \(/);
  assert.match(ui, /!assignedExternalLawyer/);
  assert.match(ui, /أسند القضية إلى محامٍ خارجي/);
  assert.match(ui, /مشاركة جميع المرفقات عبر واتساب/);
  assert.doesNotMatch(ui, /externalLawyers\.map/);
});

test("owners and system administrators can update real functional roles without widening scoped or custom access", async () => {
  const [usersRoute, passwordRoute, page, dashboard, permissions] = await Promise.all([
    read("app/api/portal/users/route.ts"),
    read("app/api/portal/users/password/route.ts"),
    read("app/portal/page.tsx"),
    read("app/portal/PortalDashboard.tsx"),
    read("lib/portal-permissions.ts"),
  ]);
  assert.match(usersRoute, /submittedFunctionalRoles/);
  assert.match(usersRoute, /portalAccessScopes\)\.set\(\{ active: false/);
  assert.match(usersRoute, /scope\.active && !selectedRoleKeys\.has/);
  assert.match(usersRoute, /permissionProfile !== "custom"/);
  assert.match(usersRoute, /permissionsForProfile\(combinedPermissions, permissionProfile\)/);
  assert.match(usersRoute, /لا يستطيع مشرف النظام تعديل حساب مالك النظام/);
  assert.match(usersRoute, /revokePortalSessionsForUser/);
  assert.match(passwordRoute, /targetOwnerScope/);
  assert.match(page, /const functionalRoles = \[\.\.\.new Set/);
  assert.match(page, /inferPermissionProfile/);
  assert.match(dashboard, /user-functional-role-editor/);
  assert.match(dashboard, /صلاحيات مخصصة حالية/);
  assert.match(dashboard, /roleOptions\.filter\(\(role\) => isSystemOwner \|\| role\.roleKey !== "system_owner"\)/);
  assert.match(permissions, /export function inferPermissionProfile/);
});

test("company document center is limited to typed Dali corporate records", async () => {
  const [helper, upload, dashboard, migration] = await Promise.all([
    read("lib/company-documents.ts"),
    read("app/api/portal/documents/route.ts"),
    read("app/portal/PortalDashboard.tsx"),
    read("drizzle-pg/0069_legal_contract_correspondence.sql"),
  ]);
  for (const type of ["commercial_registration", "municipal_license", "vat_certificate", "national_address", "chamber_membership"]) {
    assert.match(helper, new RegExp(type));
  }
  assert.match(upload, /corporateDocumentTypeSet\.has\(documentType\)/);
  assert.match(upload, /documentType: typedDocument/);
  assert.match(dashboard, /documents\.filter\(isCorporateDocument\)/);
  assert.match(dashboard, /وثائق شركة دالي الرسمية/);
  assert.match(dashboard, /name="documentType"/);
  assert.match(migration, /other_company_document/);
  assert.match(migration, /reference_code LIKE 'DOC-%'/);
  assert.match(migration, /category IN \('license', 'certificate', 'other'\)/);
});

test("draft deletion is concurrency-safe and cancellation stays owner-controlled", async () => {
  const [deleteRoute, statusRoute, billing] = await Promise.all([
    read("app/api/portal/contracts/[id]/route.ts"),
    read("app/api/portal/contracts/[id]/status/route.ts"),
    read("app/portal/ContractBillingWorkspace.tsx"),
  ]);
  assert.match(deleteRoute, /for update/);
  assert.match(deleteRoute, /hasFinancialEffect/);
  assert.match(deleteRoute, /assignment\.status !== "planned"/);
  assert.match(deleteRoute, /representativeRequests\)\.set\(\{ status: "approved"/);
  assert.match(deleteRoute, /hasSignedCopy/);
  assert.match(deleteRoute, /CONTRACT_CHANGED_DURING_DELETE/);
  const deletion = deleteRoute.slice(deleteRoute.indexOf("export async function DELETE"));
  assert.ok(deletion.indexOf("delete(contractWorkerAbsences)") < deletion.indexOf("delete(contractPaymentSchedules)"));
  assert.match(deleteRoute, /CONTRACT_DELETE_BLOCKED/);
  assert.match(statusRoute, /\["signed", "terminated", "cancelled", "superseded"\]\.includes\(status\) && !canApprove/);
  assert.match(statusRoute, /contract-cancellation-referred-legal/);
  assert.match(billing, /setCancellingContract\(contract\)/);
  assert.match(billing, /deleteContract\(contract\)/);
});

test("open legal-contract coordination is searchable, resolvable, and routes notifications to the correct record", async () => {
  const [search, notifications, dashboard, legalWorkspace] = await Promise.all([
    read("app/api/portal/search/route.ts"),
    read("lib/portal-notifications.ts"),
    read("app/portal/PortalDashboard.tsx"),
    read("app/portal/LegalCaseWorkspace.tsx"),
  ]);
  assert.match(search, /legalContractCorrespondence/);
  assert.match(search, /legal-correspondence/);
  assert.match(search, /contract-correspondence/);
  assert.match(notifications, /legal-contract-correspondence:\$\{item\.id\}/);
  assert.match(notifications, /source: "system-check"/);
  assert.match(notifications, /requestStatus, "resolved"/);
  assert.match(dashboard, /setSelectedLegalRecordId/);
  assert.match(dashboard, /entityType === "legal-record"/);
  assert.match(legalWorkspace, /initialRecordId/);
});
