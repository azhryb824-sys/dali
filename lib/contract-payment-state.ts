export function contractPaymentState(input: {
  invoiceAmountHalalas: number;
  paidAmountHalalas: number;
  dueDate: string;
  currentStatus?: string;
  today?: string;
}) {
  const invoiceAmountHalalas = Math.max(
    0,
    Math.round(input.invoiceAmountHalalas),
  );
  const paidAmountHalalas = Math.min(
    invoiceAmountHalalas,
    Math.max(0, Math.round(input.paidAmountHalalas)),
  );
  const remainingAmountHalalas = invoiceAmountHalalas - paidAmountHalalas;
  const today = input.today || new Date().toISOString().slice(0, 10);
  const scheduleStatus = input.currentStatus === "cancelled"
    ? "cancelled"
    : remainingAmountHalalas === 0 && invoiceAmountHalalas > 0
      ? "paid"
      : paidAmountHalalas > 0
        ? "partially_paid"
        : "invoiced";
  const financialStatus = input.currentStatus === "cancelled"
    ? "cancelled"
    : remainingAmountHalalas === 0 && invoiceAmountHalalas > 0
      ? "paid"
      : input.dueDate < today
        ? "overdue"
        : paidAmountHalalas > 0
          ? "partially_paid"
          : "pending";
  return {
    invoiceAmountHalalas,
    paidAmountHalalas,
    remainingAmountHalalas,
    scheduleStatus,
    financialStatus,
    overdue: remainingAmountHalalas > 0 && input.dueDate < today,
  };
}
