import { parseWorkforceContractClauses, type WorkforceContractClause } from "@/lib/workforce-contract-clauses";

// Contract field names are canonical across request, quotation, PDF and contract.
export const commercialTextFields = [
  { name: "clientName", label: "الاسم النظامي للمنشأة", max: 160 },
  { name: "clientCr", label: "السجل التجاري", max: 30 },
  { name: "clientVat", label: "الرقم الضريبي", max: 30 },
  { name: "clientAddress", label: "العنوان الوطني", max: 240 },
  { name: "clientRepresentative", label: "اسم ممثل المنشأة", max: 160 },
  { name: "clientRepresentativeTitle", label: "صفة ممثل المنشأة", max: 120 },
  { name: "clientMobile", label: "رقم جوال العميل", max: 30, type: "tel" },
  { name: "clientEmail", label: "البريد الإلكتروني", max: 160, type: "email" },
  { name: "workSite", label: "موقع العمل", max: 180 },
  { name: "startDate", label: "تاريخ البداية المتوقع", max: 10, type: "date" },
  { name: "endDate", label: "تاريخ النهاية المتوقع", max: 10, type: "date" },
  { name: "workingHours", label: "ساعات أو ورديات العمل", max: 240 },
  { name: "weeklyOff", label: "الراحة الأسبوعية", max: 120 },
  { name: "paymentTerms", label: "شروط الدفع", max: 1200, multiline: true },
  { name: "specialTerms", label: "اشتراطات خاصة", max: 2000, multiline: true },
  { name: "details", label: "نطاق العمل والتفاصيل", max: 4000, multiline: true },
] as const;
export type CommercialTerms = Partial<Record<typeof commercialTextFields[number]["name"], string>> & {
  contractDirection: "dali_supplier" | "dali_purchaser";
  contractClauses: WorkforceContractClause[];
  showPaymentSchedule: boolean;
};
export function readCommercialTerms(value: unknown): CommercialTerms {
  let raw: unknown = value;
  if (typeof raw === "string") { try { raw = JSON.parse(raw); } catch { raw = {}; } }
  const record = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const result: CommercialTerms = { contractDirection: record.contractDirection === "dali_purchaser" ? "dali_purchaser" : "dali_supplier", contractClauses: [], showPaymentSchedule: record.showPaymentSchedule !== false && record.showPaymentSchedule !== "false" };
  for (const field of commercialTextFields) {
    if (typeof record[field.name] === "string") result[field.name] = String(record[field.name]).trim().slice(0, field.max);
  }
  // An absent proposal must not replace the contract's complete standard clauses.
  if (record.contractClauses && record.contractClauses !== "[]" && (!Array.isArray(record.contractClauses) || record.contractClauses.length > 0)) result.contractClauses = parseWorkforceContractClauses(record.contractClauses, result.contractDirection, false);
  return result;
}

export function commercialTermsFromRequest(request: { companyName: string | null; fullName: string; mobile: string; email: string; clientCr: string | null; clientVat: string | null; clientAddress: string | null; representativeTitle: string | null; workSite: string | null; requiredStartDate: string | null; details: string; quotationTermsJson: string | null }): CommercialTerms {
  return readCommercialTerms({ ...readCommercialTerms(request.quotationTermsJson), clientName: request.companyName || request.fullName, clientCr: request.clientCr || "", clientVat: request.clientVat || "", clientAddress: request.clientAddress || "", clientRepresentative: request.fullName, clientRepresentativeTitle: request.representativeTitle || "", clientMobile: request.mobile, clientEmail: request.email, workSite: request.workSite || "", startDate: request.requiredStartDate || "", details: request.details });
}
