import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("contract cancellation is referred to legal before the contract status changes", async () => {
  const [contractsUi, statusApi, referralsApi] = await Promise.all([
    source("app/portal/ContractBillingWorkspace.tsx"),
    source("app/api/portal/contracts/[id]/status/route.ts"),
    source("app/api/portal/contracts/cancellation-referrals/route.ts"),
  ]);

  assert.match(contractsUi, /contract-cancellation-modal/);
  assert.match(contractsUi, /action:\s*"request-cancellation"/);
  assert.match(contractsUi, /سيبقى العقد على حالته الحالية حتى صدور القرار القانوني/);
  assert.match(contractsUi, /قيد المراجعة القانونية/);
  assert.match(statusApi, /action === "request-cancellation"/);
  assert.match(statusApi, /fileSnapshotJson: JSON\.stringify\(caseSnapshot\)/);
  assert.match(statusApi, /pendingLegalDecision: true/);
  assert.match(statusApi, /يجب إحالة طلب الإلغاء إلى القانونية أولًا/);
  assert.match(referralsApi, /contract-cancellation/);
  assert.match(referralsApi, /eq\(legalRecords\.status, "reviewing"\)/);
});

test("legal users can inspect the contract and attachments before approving or rejecting cancellation", async () => {
  const [legalUi, statusApi, styles] = await Promise.all([
    source("app/portal/LegalCaseWorkspace.tsx"),
    source("app/api/portal/contracts/[id]/status/route.ts"),
    source("app/portal/contract-lifecycle.css"),
  ]);

  assert.match(legalUi, /هل تريد إلغاء العقد؟/);
  assert.match(legalUi, /استعراض العقد الأصلي/);
  assert.match(legalUi, /مرفقات الملف/);
  assert.match(legalUi, /\/api\/portal\/documents\/\$\{document\.id\}/);
  assert.match(legalUi, /action:\s*"legal-cancellation-decision"/);
  assert.match(legalUi, /اعتماد .*إلغاء.* العقد/);
  assert.match(legalUi, /رفض الطلب والإبقاء على العقد/);
  assert.match(statusApi, /hasPortalPermission\(access, "legal", "approve"\)/);
  assert.match(statusApi, /contract-cancellation-approved-by-legal/);
  assert.match(statusApi, /contract-cancellation-rejected-by-legal/);
  assert.match(statusApi, /inArray\(contractPaymentSchedules\.status, \["scheduled", "due", "referred"\]\)/);
  assert.match(styles, /\.contract-cancellation-backdrop/);
  assert.match(styles, /\.legal-cancellation-decision/);
  assert.match(styles, /\.legal-attachment-list/);
});
