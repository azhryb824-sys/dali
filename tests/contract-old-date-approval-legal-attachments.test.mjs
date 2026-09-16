import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  AUTOMATED_CONTRACT_BILLING_ACTOR,
  canAutomaticallyInvoiceContract,
  isRecoverablePreApprovalInvoice,
} from "../lib/contract-payment-integrity.ts";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("unapproved old-dated contracts cannot be invoiced before approval", async () => {
  const [generation, payments, invoicing, notifications] = await Promise.all([
    read("app/api/portal/documents/generate/route.ts"),
    read("app/api/portal/contract-payments/route.ts"),
    read("lib/contract-payment-invoicing.ts"),
    read("lib/portal-notifications.ts"),
  ]);

  assert.equal(canAutomaticallyInvoiceContract({ status: "draft", approvedBy: null }), false);
  assert.equal(canAutomaticallyInvoiceContract({ status: "approved", approvedBy: "owner@example.com" }), true);
  assert.equal(canAutomaticallyInvoiceContract({ status: "cancelled", approvedBy: "owner@example.com" }), false);
  assert.match(generation, /servicePeriod: payment\.servicePeriod, status: "scheduled"/);
  assert.match(payments, /isNotNull\(workforceContracts\.approvedBy\)/);
  assert.match(payments, /inArray\(workforceContracts\.status,invoiceEligibleContractStatuses\)/);
  assert.match(payments, /inArray\(contractPaymentSchedules\.contractId,billableContractIds\)/);
  assert.match(invoicing, /canAutomaticallyInvoiceContract\(contract\)/);
  assert.match(invoicing, /لا يمكن إصدار فاتورة قبل اعتماد العقد أو بعد إغلاقه/);
  assert.match(notifications, /billableContractIds\.has\(payment\.contractId\)/);
  assert.match(notifications, /issueDueContractInvoice\(payment\.id,AUTOMATED_CONTRACT_BILLING_ACTOR\)/);
});

test("legacy automatic invoices can unblock old contract approval without deletion", async () => {
  const statusRoute = await read("app/api/portal/contracts/[id]/status/route.ts");
  const payment = {
    id: 91,
    contractId: 12,
    installmentNumber: 1,
    dueDate: "2026-01-31",
    status: "invoiced",
    invoiceDocumentId: 301,
    financialRecordId: 401,
    paymentJournalEntryId: null,
    invoicedBy: AUTOMATED_CONTRACT_BILLING_ACTOR,
    paidAt: null,
  };
  const document = {
    id: 301,
    status: "active",
    metadataJson: JSON.stringify({ automaticAtDueDate: true }),
  };
  const financial = {
    id: 401,
    contractId: 12,
    contractPaymentScheduleId: 91,
    documentId: 301,
    journalEntryId: null,
    postingStatus: "unposted",
    status: "pending",
  };

  assert.equal(isRecoverablePreApprovalInvoice({ contractId: 12, expectedDueDate: "2026-01-31", payment, document, financial }), true);
  assert.equal(isRecoverablePreApprovalInvoice({ contractId: 12, expectedDueDate: "2026-02-01", payment, document, financial }), false);
  assert.equal(isRecoverablePreApprovalInvoice({ contractId: 12, expectedDueDate: "2026-01-31", payment: { ...payment, invoicedBy: "accountant@example.com" }, document, financial }), false);
  assert.equal(isRecoverablePreApprovalInvoice({ contractId: 12, expectedDueDate: "2026-01-31", payment, document, financial: { ...financial, postingStatus: "posted" } }), false);
  assert.match(statusRoute, /isRecoverablePreApprovalInvoice/);
  assert.match(statusRoute, /contract-approved-with-preserved-legacy-auto-invoices/);
  assert.match(statusRoute, /if \(payment\.invoiceDocumentId \|\| payment\.financialRecordId/);
  assert.doesNotMatch(statusRoute, /delete\(companyDocuments\)/);
  assert.doesNotMatch(statusRoute, /delete\(financialRecords\)/);
});

test("every legal referral path collects all documents linked to the contract", async () => {
  const [collector, paymentReferral, cancellationReferral, shares, generation] = await Promise.all([
    read("lib/contract-legal-documents.ts"),
    read("app/api/portal/contract-payments/route.ts"),
    read("app/api/portal/contracts/[id]/status/route.ts"),
    read("app/api/portal/legal-cases/shares/route.ts"),
    read("app/api/portal/documents/generate/route.ts"),
  ]);

  assert.match(collector, /metadata\.contractId/);
  assert.match(collector, /metadata\.linkedContractId/);
  assert.match(collector, /metadata\.contractReference === contract\.referenceCode/);
  assert.match(collector, /directIdSet\.has\(document\.id\)/);
  assert.match(paymentReferral, /loadContractLegalDocuments\(db,contract/);
  assert.match(cancellationReferral, /loadContractLegalDocuments\(db, contract/);
  assert.match(shares, /loadContractLegalDocuments\(db, contract, \[\.\.\.snapshotDocumentIds\]\)/);
  for (const requiredFile of ["commercialRegistrationFile", "vatCertificateFile", "nationalAddressFile"]) {
    assert.match(generation, new RegExp(requiredFile));
  }
  assert.match(generation, /metadataJson: JSON\.stringify\(\{ clientId: client\?\.id \|\| null, supplierId: supplier\?\.id \|\| null, clientName, contractId: contract\.id/);
});
