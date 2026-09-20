/** Shared validation for quotation creation and full editing. Amounts are integer halalas. */
export type CommercialLine = {
  profession: string;
  quantity: number;
  durationMonths: number;
  unitPriceHalalas: number;
  actualSalaryHalalas: number;
  lineTotalHalalas: number;
  notes: string | null;
  sponsorshipType: "dali" | "other" | null;
  sponsorName: string | null;
  ajirContractStatus: "with_ajir" | "without_ajir" | "not_applicable";
  sortOrder: number;
};
const text = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";
function integer(value: unknown, min: number, max: number) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < min || number > max) throw new Error("بيانات بنود عرض السعر غير صحيحة");
  return number;
}
function money(value: unknown, allowZero = false) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < (allowZero ? 0 : 0.01) || number > 1000000) throw new Error("أدخل سعرًا وراتبًا صحيحين لكل بند");
  return Math.round(number * 100);
}
export function parseCommercialLineItems(value: unknown, options: { quantityMode: "fixed" | "open"; seasonType: string; workforce: boolean }): CommercialLine[] {
  let raw = value;
  if (typeof raw === "string") { try { raw = JSON.parse(raw); } catch { throw new Error("بيانات بنود عرض السعر غير صحيحة"); } }
  if (!Array.isArray(raw) || !raw.length || raw.length > 50) throw new Error("أضف من بند واحد إلى 50 بندًا");
  const lines = raw.map((entry, index): CommercialLine => {
    const item = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
    const profession = text(item.profession, 120);
    if (profession.length < 2 || profession === "أخرى") throw new Error("اكتب اسم المهنة أو بند الأعمال الفعلي");
    const quantity = options.quantityMode === "open" ? 0 : integer(item.quantity, 1, 100000);
    const durationMonths = options.workforce && options.seasonType === "regular" ? 12 : integer(item.durationMonths, 1, 120);
    const unitPriceHalalas = money(item.unitPrice);
    const actualSalaryHalalas = options.workforce ? money(item.actualSalary ?? 0, true) : 0;
    const sponsorshipType = options.workforce ? item.sponsorshipType === "other" ? "other" : "dali" : null;
    const sponsorName = sponsorshipType === "other" ? text(item.sponsorName, 160) : null;
    const ajirContractStatus = item.ajirContractStatus === "with_ajir" ? "with_ajir" : item.ajirContractStatus === "without_ajir" ? "without_ajir" : "not_applicable";
    if (sponsorshipType === "other" && (!sponsorName || ajirContractStatus === "not_applicable")) throw new Error("أكمل اسم الكفيل وحالة أجير للعمالة على كفالة جهة أخرى");
    const lineTotalHalalas = quantity * durationMonths * unitPriceHalalas;
    // These values are stored in PostgreSQL integer columns; reject overflow before writing.
    if (!Number.isSafeInteger(lineTotalHalalas) || lineTotalHalalas > 2147483647) throw new Error("قيمة البند تتجاوز الحد المسموح");
    return { profession, quantity, durationMonths, unitPriceHalalas, actualSalaryHalalas, lineTotalHalalas, notes: text(item.notes, 500) || null, sponsorshipType, sponsorName, ajirContractStatus, sortOrder: index };
  });
  const keys = lines.map(item => [item.profession, item.sponsorshipType, item.sponsorName, item.ajirContractStatus].join("::"));
  if (options.workforce && new Set(keys).size !== keys.length) throw new Error("لا تكرر توزيع المهنة والكفيل وحالة أجير نفسه؛ اجمع العدد في بند واحد");
  return lines;
}
export function commercialTotals(items: CommercialLine[], vatRate: number, discount = 0) {
  if (!Number.isFinite(vatRate) || vatRate < 0 || vatRate > 100 || !Number.isFinite(discount) || discount < 0) throw new Error("نسبة الضريبة أو الخصم غير صحيحة");
  const subtotalHalalas = items.reduce((sum, item) => sum + item.lineTotalHalalas, 0);
  const discountHalalas = Math.min(subtotalHalalas, Math.round(discount * 100));
  const vatRateBps = Math.round(vatRate * 100);
  const vatHalalas = Math.round((subtotalHalalas - discountHalalas) * vatRateBps / 10000);
  const totalHalalas = subtotalHalalas - discountHalalas + vatHalalas;
  if (!Number.isSafeInteger(totalHalalas) || totalHalalas > 2147483647 || subtotalHalalas > 2147483647) throw new Error("إجمالي العرض يتجاوز الحد المسموح");
  return { subtotalHalalas, discountHalalas, vatRateBps, totalHalalas };
}
