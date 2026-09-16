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
};

type ApprovalPayment = {
  id: number;
  contractId: number;
  installmentNumber: number;
  dueDate: string;
  status: string;
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
