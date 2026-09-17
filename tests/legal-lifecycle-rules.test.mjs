import assert from "node:assert/strict";
import test from "node:test";
import { cancellationPaymentDecision, canShareApprovedContract, paymentLegalReferralError } from "../lib/legal-lifecycle-rules.ts";
import { canInvoiceContractPayment } from "../lib/contract-payment-integrity.ts";

const payment = { id: 1, dueDate: "2026-09-01", status: "due", amountHalalas: 115000,
  paidAmountHalalas: 0, invoiceDocumentId: null, financialRecordId: null, paymentJournalEntryId: null, billingBasis: "monthly_salary" };
const context = { effectiveDate: "2026-09-17", startDate: "2026-08-01", approved: true };

test("a separate overdue installment can be referred but an active or closed referral cannot be repeated", () => {
  assert.equal(paymentLegalReferralError(payment, "2026-09-17"), null);
  assert.equal(paymentLegalReferralError(payment, "2026-09-17", "returned"), null);
  for (const status of ["active", "closed"]) assert.ok(paymentLegalReferralError(payment, "2026-09-17", status));
  for (const status of ["paid", "cancelled"]) assert.ok(paymentLegalReferralError({ ...payment, status }, "2026-09-17"));
  assert.ok(paymentLegalReferralError({ ...payment, paidAmountHalalas: 115000 }, "2026-09-17"));
  assert.ok(paymentLegalReferralError(payment, "2026-09-01"));
  assert.ok(paymentLegalReferralError({ ...payment, cancellationDisposition: "review_invoice" }, "2026-09-17"));
  assert.equal(paymentLegalReferralError({ ...payment, paidAmountHalalas: 114999, status: "partially_paid" }, "2026-09-17"), null);
});

test("cancellation retains earned debt and distinguishes unused service, partial service and recorded advances", () => {
  assert.equal(cancellationPaymentDecision(payment, context), "preserve");
  assert.equal(cancellationPaymentDecision({ ...payment, dueDate: "2026-11-01" }, { ...context, previousDueDate: "2026-10-01" }), "cancel_future");
  assert.equal(cancellationPaymentDecision({ ...payment, dueDate: "2026-10-01" }, { ...context, previousDueDate: "2026-09-01" }), "review_accrual");
  for (const recorded of [{ invoiceDocumentId: 8 }, { financialRecordId: 9 }, { paidAmountHalalas: 100 }, { paymentJournalEntryId: 7 }, { status: "paid" }])
    assert.equal(cancellationPaymentDecision({ ...payment, dueDate: "2026-11-01", ...recorded }, context), "review_invoice");
  assert.equal(cancellationPaymentDecision(payment, { ...context, approved: false }), "cancel_future");
});

test("approved active and ended contracts remain shareable, drafts are denied", () => {
  for (const status of ["active", "approved", "terminated", "cancelled"])
    assert.equal(canShareApprovedContract({ approvedBy: "owner@example.test", status }), true);
  assert.equal(canShareApprovedContract({ approvedBy: null }), false);
  assert.equal(canShareApprovedContract(null), false);
});

test("advance billing does not turn an undelivered service month into fully earned debt", () => {
  assert.equal(cancellationPaymentDecision({ ...payment, servicePeriod: "2026-09" }, context), "review_accrual");
  assert.equal(cancellationPaymentDecision({ ...payment, servicePeriod: "2026-09", invoiceDocumentId: 1 }, context), "review_invoice");
  assert.equal(cancellationPaymentDecision({ ...payment, servicePeriod: "2026-10" }, context), "cancel_future");
  assert.equal(cancellationPaymentDecision({ ...payment, servicePeriod: "2026-08" }, context), "preserve");
});

test("closed contracts only invoice preserved obligations up to the cancellation cutoff", () => {
  const contract = { status: "terminated", approvedBy: "owner@example.test", cancellationEffectiveDate: "2026-09-17" };
  assert.equal(canInvoiceContractPayment(contract, { ...payment, cancellationDisposition: "preserve" }), true);
  for (const cancellationDisposition of [null, "review_accrual", "review_invoice", "cancel_future"])
    assert.equal(canInvoiceContractPayment(contract, { ...payment, cancellationDisposition }), false);
  assert.equal(canInvoiceContractPayment(contract, { ...payment, dueDate: "2026-10-01", cancellationDisposition: "preserve" }), false);
  assert.equal(canInvoiceContractPayment({ ...contract, approvedBy: null }, { ...payment, cancellationDisposition: "preserve" }), false);
});
