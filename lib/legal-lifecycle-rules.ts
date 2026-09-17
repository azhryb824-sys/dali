/** Pure rules shared by the server and the regression suite. Amounts are halalas. */
export function paymentLegalReferralError(payment: {
  status: string; dueDate: string; amountHalalas: number; paidAmountHalalas: number; cancellationDisposition?: string | null;
}, today: string, previousStatus?: string | null) {
  if (["cancelled", "paid"].includes(payment.status)) return "الدفعة ملغاة أو مسددة بالكامل";
  if (payment.cancellationDisposition?.startsWith("review_")) return "يلزم اعتماد تسوية الإلغاء قبل إحالة الدفعة";
  if (payment.dueDate >= today || payment.amountHalalas <= payment.paidAmountHalalas)
    return "لا يمكن الإحالة قبل التأخر الفعلي في كامل الدفعة أو جزء منها";
  if (previousStatus && previousStatus !== "returned")
    return "سبق إحالة هذه الدفعة؛ لا يمكن تكرار الإحالة إلا بعد إعادتها من القانونية";
  return null;
}

export function canShareApprovedContract(contract: { approvedBy: string | null } | null | undefined) {
  // Expiry/termination does not erase approval or prevent legal access to the approved instrument.
  return Boolean(contract?.approvedBy);
}

export type CancellationPayment = {
  id: number; dueDate: string; status: string; amountHalalas: number;
  paidAmountHalalas: number; invoiceDocumentId: number | null;
  financialRecordId: number | null; paymentJournalEntryId: number | null;
  billingBasis: string; servicePeriod?: string | null;
};

export function cancellationPaymentDecision(
  payment: CancellationPayment,
  context: { effectiveDate: string; startDate: string; endDate?: string; approved: boolean; previousDueDate?: string },
): "preserve" | "cancel_future" | "review_accrual" | "review_invoice" {
  if (payment.status === "cancelled") return "preserve";
  const recorded = payment.paidAmountHalalas > 0 || payment.invoiceDocumentId !== null ||
    payment.financialRecordId !== null || payment.paymentJournalEntryId !== null ||
    ["invoiced", "partially_paid", "paid"].includes(payment.status);
  // An installment can be payable in advance: its due date alone does not prove
  // the full month of service was delivered. Prefer the explicit service period.
  if (payment.billingBasis === "monthly_salary" && /^\d{4}-(0[1-9]|1[0-2])$/.test(payment.servicePeriod || "")) {
    const [year, month] = payment.servicePeriod!.split("-").map(Number);
    const calendarEnd = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
    const serviceStart = [context.startDate, `${payment.servicePeriod}-01`].sort().at(-1)!;
    const serviceEnd = context.endDate && context.endDate < calendarEnd ? context.endDate : calendarEnd;
    if (serviceStart > context.effectiveDate) return recorded ? "review_invoice" : "cancel_future";
    if (serviceEnd > context.effectiveDate) return recorded ? "review_invoice" : context.approved ? "review_accrual" : "cancel_future";
    return recorded || context.approved ? "preserve" : "cancel_future";
  }
  if (recorded) return payment.dueDate > context.effectiveDate ? "review_invoice" : "preserve";
  if (!context.approved) return "cancel_future";
  if (payment.dueDate <= context.effectiveDate) return "preserve";
  const periodStart = context.previousDueDate || context.startDate;
  if (payment.billingBasis === "monthly_salary" && periodStart <= context.effectiveDate)
    return "review_accrual";
  return "cancel_future";
}
