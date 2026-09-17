export const AUTOMATED_CONTRACT_BILLING_ACTOR =
  "system@dally-corporation.com";

export const invoiceEligibleContractStatuses = [
  "approved",
  "sent",
  "signed",
  "active",
  "suspended",
  "expired",
];

type ContractApprovalState = {
  status: string;
  approvedBy: string | null;
  cancellationEffectiveDate?: string | null;
};

type ApprovalPayment = {
  id: number;
  contractId: number;
  installmentNumber: number;
  dueDate: string;
  status: string;
  paidAmountHalalas?: number;
  invoiceDocumentId: number | null;
  financialRecordId: number | null;
  paymentJournalEntryId: number | null;
  invoicedBy: string | null;
  paidAt: string | null;
};

type ApprovalDocument = {
  id: number;
  status: string;
  metadataJson: string | null;
};

type ApprovalFinancialRecord = {
  id: number;
  contractId: number | null;
  contractPaymentScheduleId: number | null;
  documentId: number | null;
  journalEntryId: number | null;
  postingStatus: string;
  status: string;
};

export function canAutomaticallyInvoiceContract(
  contract: ContractApprovalState,
) {
  return (
    Boolean(contract.approvedBy) &&
    invoiceEligibleContractStatuses.includes(contract.status)
  );
}

export function canInvoiceContractPayment(contract: ContractApprovalState, payment: {
  dueDate: string; status: string; cancellationDisposition?: string | null;
}) {
  if (payment.status === "cancelled" || payment.cancellationDisposition?.startsWith("review_")) return false;
  if (canAutomaticallyInvoiceContract(contract)) return true;
  return Boolean(contract.approvedBy && contract.cancellationEffectiveDate &&
    ["cancelled", "terminated"].includes(contract.status) &&
    payment.cancellationDisposition === "preserve" && payment.dueDate <= contract.cancellationEffectiveDate);
}

function documentWasAutomaticallyIssued(metadataJson: string | null) {
  if (!metadataJson) return false;
  try {
    const metadata = JSON.parse(metadataJson) as Record<string, unknown>;
    return metadata.automaticAtDueDate === true;
  } catch {
    return false;
  }
}

export function isRecoverablePreApprovalInvoice(input: {
  contractId: number;
  expectedDueDate: string;
  payment: ApprovalPayment;
  document: ApprovalDocument | undefined;
  financial: ApprovalFinancialRecord | undefined;
}) {
  const { contractId, expectedDueDate, payment, document, financial } = input;
  return (
    payment.contractId === contractId &&
    payment.dueDate === expectedDueDate &&
    payment.status === "invoiced" &&
    payment.invoiceDocumentId !== null &&
    payment.financialRecordId !== null &&
    payment.paymentJournalEntryId === null &&
    (payment.paidAmountHalalas ?? 0) === 0 &&
    payment.invoicedBy === AUTOMATED_CONTRACT_BILLING_ACTOR &&
    payment.paidAt === null &&
    document?.id === payment.invoiceDocumentId &&
    document.status === "active" &&
    documentWasAutomaticallyIssued(document.metadataJson) &&
    financial?.id === payment.financialRecordId &&
    financial.contractId === contractId &&
    financial.contractPaymentScheduleId === payment.id &&
    financial.documentId === document.id &&
    financial.journalEntryId === null &&
    financial.postingStatus === "unposted" &&
    financial.status === "pending"
  );
}
