export const workerLegalReasons = [
  { value: "labor_dispute", label: "نزاع عمالي" },
  { value: "absence", label: "انقطاع عن العمل" },
  { value: "violation", label: "مخالفة تستدعي إجراء قانونياً" },
  { value: "financial_claim", label: "مطالبة مالية عمالية" },
  { value: "documents", label: "مشكلة في الإقامة أو المستندات" },
  { value: "injury", label: "إصابة عمل" },
  { value: "other", label: "سبب آخر" },
] as const;

export function workerLegalReason(value: unknown) {
  return workerLegalReasons.find(reason => reason.value === value);
}
