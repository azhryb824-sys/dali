import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("contract cancellation is referred to legal before the contract status changes", async () => {
  const [contractsUi, statusApi, referralsApi, styles] = await Promise.all([
    source("app/portal/ContractBillingWorkspace.tsx"),
    source("app/api/portal/contracts/[id]/status/route.ts"),
    source("app/api/portal/contracts/cancellation-referrals/route.ts"),
    source("app/portal/contract-cancellation.css"),
  ]);

  assert.match(contractsUi, /contract-cancellation-modal/);
  assert.match(contractsUi, /action:\s*"request-cancellation"/);
  assert.match(contractsUi, /سيبقى العقد على حالته الحالية حتى صدور القرار القانوني/);
  assert.match(contractsUi, /قيد المراجعة القانونية/);
  assert.match(statusApi, /action === "request-cancellation"/);
  assert.match(statusApi, /fileSnapshotJson: JSON\.stringify\(caseSnapshot\)/);
  assert.match(statusApi, /pendingLegalDecision: true/);
  assert.match(statusApi, /يجب إحالة طلب الإلغاء إلى القانونية أولًا/);
  assert.match(statusApi, /crypto\.randomUUID\(\)/);
  assert.match(referralsApi, /contract-cancellation/);
  assert.match(referralsApi, /eq\(legalRecords\.status, "reviewing"\)/);
  assert.match(referralsApi, /canReadFinance/);
  assert.match(styles, /\.contract-cancellation-backdrop/);
  assert.match(styles, /\.pending-legal-action/);
});

test("legal users can inspect the contract and attachments before approving or rejecting cancellation", async () => {
  const [legalWorkspace, snapshotUi, decisionUi, statusApi, styles] = await Promise.all([
    source("app/portal/LegalCaseWorkspace.tsx"),
    source("app/portal/LegalCaseSnapshot.tsx"),
    source("app/portal/LegalCancellationDecision.tsx"),
    source("app/api/portal/contracts/[id]/status/route.ts"),
    source("app/portal/legal-contract-case.css"),
  ]);

  assert.match(decisionUi, /هل تريد إلغاء العقد؟/);
  assert.match(snapshotUi, /استعراض العقد الأصلي/);
  assert.match(snapshotUi, /مرفقات الملف/);
  assert.match(snapshotUi, /\/api\/portal\/documents\/\$\{document\.id\}/);
  assert.match(legalWorkspace, /action:\s*"legal-cancellation-decision"/);
  assert.match(decisionUi, /اعتماد .*إلغاء.* العقد/);
  assert.match(decisionUi, /رفض الطلب والإبقاء على العقد/);
  assert.match(statusApi, /hasPortalPermission\(access, "legal", "approve"\)/);
  assert.match(statusApi, /contract-cancellation-approved-by-legal/);
  assert.match(statusApi, /contract-cancellation-rejected-by-legal/);
  assert.match(statusApi, /inArray\(contractPaymentSchedules\.status, \["scheduled", "due", "referred"\]\)/);
  assert.match(statusApi, /inArray\(legalCaseActivities\.status, \["open", "in_progress"\]\)/);
  assert.match(statusApi, /eq\(workers\.beneficiaryName, contract\.clientName\)/);
  assert.match(styles, /\.legal-cancellation-decision/);
  assert.match(styles, /\.legal-attachment-list/);
  assert.match(styles, /\.legal-open-contract/);
});

test("pending cancellation freezes the contract and grants legal review access to its document", async () => {
  const [contractApi, documentApi] = await Promise.all([
    source("app/api/portal/contracts/[id]/route.ts"),
    source("app/api/portal/documents/[id]/route.ts"),
  ]);

  assert.match(contractApi, /hasPendingCancellation/);
  assert.match(contractApi, /لا يمكن تعديل العقد أثناء مراجعة طلب إلغائه/);
  assert.match(contractApi, /لا يمكن حذف العقد أثناء مراجعة طلب إلغائه/);
  assert.match(documentApi, /hasPortalPermission\(access, "legal", "read"\)/);
  assert.match(documentApi, /eq\(legalRecords\.status, "reviewing"\)/);
  assert.match(documentApi, /contract-regenerated-for-legal-review/);
  assert.match(documentApi, /إحالته رسميًا للمراجعة القانونية/);
});
