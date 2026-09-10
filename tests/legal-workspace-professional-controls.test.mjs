import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(path, "utf8");

test("legal records and attachments use recoverable removal with an additive migration", async () => {
  const [migration, schema, casesRoute, attachmentRoute, notifications] = await Promise.all([
    read("drizzle-pg/0068_legal_workspace_governance.sql"),
    read("db/schema.ts"),
    read("app/api/portal/legal-cases/route.ts"),
    read("app/api/portal/legal-cases/attachments/[id]/route.ts"),
    read("lib/portal-notifications.ts"),
  ]);

  assert.match(migration, /ADD COLUMN IF NOT EXISTS deleted_at text/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.legal_external_share_bundles/);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.doesNotMatch(migration, /DROP\s+(?:TABLE|COLUMN)|TRUNCATE|DELETE\s+FROM/i);
  assert.match(schema, /deletionReason: text\("deletion_reason"\)/);
  assert.match(casesRoute, /export async function DELETE/);
  assert.match(casesRoute, /status: "cancelled",\s*deletedAt: now/);
  assert.match(casesRoute, /legal-case-deleted/);
  assert.match(attachmentRoute, /legal-case-attachment-deleted/);
  assert.match(attachmentRoute, /legalEvidenceCustody/);
  assert.doesNotMatch(attachmentRoute, /BUCKET\.delete/);
  assert.match(notifications, /activeLegalRecordIds\.has\(activity\.legalRecordId\)/);
});

test("every editable legal workflow exposes guarded edit and delete actions", async () => {
  const [ui, casesRoute, workflowsRoute, css] = await Promise.all([
    read("app/portal/LegalCaseWorkspace.tsx"),
    read("app/api/portal/legal-cases/route.ts"),
    read("app/api/portal/legal-cases/workflows/route.ts"),
    read("app/portal/portal.css"),
  ]);

  for (const kind of ["case", "activity", "attachment", "hearing", "submission", "settlement"]) {
    assert.match(ui, new RegExp(`kind: "${kind}"`));
  }
  assert.match(ui, /className="record-modal legal-lawyer-modal legal-record-editor"/);
  assert.match(ui, /deleteLegalEntity/);
  assert.match(ui, /appConfirm/);
  assert.match(ui, /appPrompt/);
  assert.match(casesRoute, /actionRequest === "update-case-profile"/);
  assert.match(casesRoute, /actionRequest === "update-activity"/);
  for (const action of ["hearing-update", "submission-update", "settlement-update"]) {
    assert.match(workflowsRoute, new RegExp(`action === "${action}"`));
  }
  assert.match(workflowsRoute, /export async function DELETE/);
  assert.match(css, /Professional legal operations workspace/);
  assert.match(css, /\.legal-record-editor/);
  assert.match(css, /\.legal-row-actions/);
});

test("legal status controls work for assigned lawyers while terminal decisions remain reasoned", async () => {
  const [dashboard, casesRoute, recordsRoute, ui] = await Promise.all([
    read("app/portal/PortalDashboard.tsx"),
    read("app/api/portal/legal-cases/route.ts"),
    read("app/api/portal/records/route.ts"),
    read("app/portal/LegalCaseWorkspace.tsx"),
  ]);

  assert.doesNotMatch(dashboard, /!canWrite \|\| entity === "legal"/);
  assert.match(dashboard, /entity !== "legal" \|\| !\["closed", "cancelled"\]\.includes\(status\)/);
  assert.match(recordsRoute, /assignedLawyerEmail\?\.toLowerCase\(\) === access\.user\.email\.toLowerCase\(\)/);
  assert.match(recordsRoute, /isNull\(legalRecords\.deletedAt\)/);
  assert.match(casesRoute, /canAccessMatter\(actor, matter\)/);
  assert.match(casesRoute, /\["closed", "cancelled"\]\.includes\(status\) && reason\.length < 5/);
  assert.match(ui, /تحديث حالة الملف/);
  assert.match(ui, /اكتب سبب الإغلاق أو الإلغاء بوضوح/);
});

test("all referred contract files can be shared in one audited WhatsApp bundle", async () => {
  const [shareRoute, bundlePage, bundleItem, referral, lawyerRoute, ui] = await Promise.all([
    read("app/api/portal/legal-cases/shares/route.ts"),
    read("app/api/legal-share-bundles/[token]/route.ts"),
    read("app/api/legal-share-bundles/[token]/items/[id]/route.ts"),
    read("app/api/portal/contract-payments/route.ts"),
    read("app/api/portal/legal-lawyers/route.ts"),
    read("app/portal/LegalCaseWorkspace.tsx"),
  ]);

  assert.match(shareRoute, /const shareAll =/);
  assert.match(shareRoute, /legalExternalShareBundleItems/);
  assert.match(shareRoute, /https:\/\/wa\.me\/\$\{phone\}/);
  assert.match(shareRoute, /preciseSaudiTime\(sharedAt\)/);
  assert.match(shareRoute, /normalizeSaudiWhatsAppNumber\(lawyer\.mobile\)/);
  assert.match(shareRoute, /mobile: "\[محجوب\]"/);
  assert.match(bundlePage, /legalExternalShareBundles\.tokenHash/);
  assert.match(bundlePage, /timeZone: "Asia\/Riyadh"/);
  assert.match(bundlePage, /content-security-policy/);
  assert.match(bundleItem, /downloadCount: sql/);
  assert.match(bundleItem, /legalAttachment\.sha256/);
  assert.match(referral, /const documentIds=/);
  assert.match(referral, /fileSnapshotJson:JSON\.stringify\(snapshot\)/);
  assert.doesNotMatch(referral, /companyDocuments\.counterparty,contract\.clientName/);
  assert.match(lawyerRoute, /legalExternalShareBundles/);
  assert.match(ui, /مشاركة جميع المرفقات عبر واتساب/);
  assert.match(ui, /يسجل النظام وقت المشاركة بالثانية/);
});

test("contract approval repairs untouched legacy annual schedules and never reports a committed approval as failed", async () => {
  const [statusRoute, billing, dashboard] = await Promise.all([
    read("app/api/portal/contracts/[id]/status/route.ts"),
    read("app/portal/ContractBillingWorkspace.tsx"),
    read("app/portal/PortalDashboard.tsx"),
  ]);

  assert.match(statusRoute, /annualScheduleNeedsRepair/);
  assert.match(statusRoute, /approvalInstallments\.some/);
  assert.match(statusRoute, /annualInstallmentPercentages\(12\)/);
  assert.match(statusRoute, /contract-approval-schedule-repaired/);
  assert.match(statusRoute, /await tx\.insert\(contractPaymentSchedules\)\.values/);
  assert.match(billing, /if \(result\.signatureUploadUrl\)/);
  assert.match(billing, /تم اعتماد العقد/);
  assert.match(dashboard, /if \(result\.signatureUploadUrl\)/);
  assert.match(dashboard, /تم اعتماد العقد/);
});
