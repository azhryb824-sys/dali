type ContractInvoiceCopyInput = {
  purchaser: boolean;
  paymentTitle: string;
  paymentTitleEn?: string | null;
  installmentNumber: number;
  contractReference: string;
  absenceDeductionHalalas: number;
};

const predefinedTitles: Record<string, string> = {
  "الدفعة الأولى": "First installment",
  "الدفعة الثانية": "Second installment",
  "الدفعة الثالثة": "Third installment",
  "الدفعة الأخيرة": "Final installment",
  "الدفعة المقدمة": "Advance installment",
};

export function invoicePaymentTitleEnglish(title: string, titleEn: string | null | undefined, installmentNumber: number) {
  const explicit = titleEn?.trim();
  if (explicit && !/[\u0600-\u06ff]/.test(explicit)) return explicit.slice(0, 160);
  const normalized = title.trim();
  if (predefinedTitles[normalized]) return predefinedTitles[normalized];
  const monthlySalary = normalized.match(/^استحقاق رواتب شهر\s+(\d{4}-\d{2})$/);
  if (monthlySalary) return `Salary installment for ${monthlySalary[1]}`;
  return `Installment ${installmentNumber}`;
}

export function contractInvoicePdfCopy(input: ContractInvoiceCopyInput) {
  const paymentTitleEn = invoicePaymentTitleEnglish(input.paymentTitle, input.paymentTitleEn, input.installmentNumber);
  const absenceSar = (input.absenceDeductionHalalas / 100).toFixed(2);
  const titleAr = input.purchaser ? `استحقاق مورّد ${input.paymentTitle}` : `فاتورة ${input.paymentTitle}`;
  const titleEn = input.purchaser ? `Supplier Payable - ${paymentTitleEn}` : `Invoice - ${paymentTitleEn}`;
  const detailsAr = `خصم غياب العمالة قبل الضريبة: ${absenceSar} ر.س.\n${input.purchaser ? `استحقاق المورد للدفعة رقم ${input.installmentNumber} (${input.paymentTitle}) من عقد شراء العمالة ${input.contractReference}.` : `فاتورة الدفعة رقم ${input.installmentNumber} (${input.paymentTitle}) من العقد ${input.contractReference}.`}`;
  const detailsEn = `Manpower absence deduction before VAT: ${absenceSar} SAR.\n${input.purchaser ? `Supplier payable for installment No. ${input.installmentNumber} (${paymentTitleEn}) under manpower purchase contract ${input.contractReference}.` : `Invoice for installment No. ${input.installmentNumber} (${paymentTitleEn}) under contract ${input.contractReference}.`}`;
  return { paymentTitleEn, titleAr, titleEn, detailsAr, detailsEn };
}
