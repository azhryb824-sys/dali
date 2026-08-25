export type PaymentScheduleDraft = {
  title: string;
  dueDate: string;
  percentageBps: number;
};

export type SeasonType = "regular" | "ramadan" | "hajj";

export const ANNUAL_CONTRACT_MONTHS = 12;

export function parsePaymentSchedule(value: unknown): PaymentScheduleDraft[] {
  let raw = value;
  if (typeof raw === "string") {
    try { raw = JSON.parse(raw); } catch { raw = []; }
  }
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 24).map((entry) => {
    const row = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
    return {
      title: typeof row.title === "string" ? row.title.trim().slice(0, 160) : "",
      dueDate: typeof row.dueDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(row.dueDate) ? row.dueDate : "",
      percentageBps: Math.round(Number(row.percentage ?? Number(row.percentageBps || 0) / 100) * 100),
    };
  });
}

export function validateSeasonalSchedule(rows: PaymentScheduleDraft[]) {
  return rows.length > 0
    && rows.every((row) => row.title.length >= 2 && row.dueDate && row.percentageBps > 0 && row.percentageBps <= 10000)
    && rows.reduce((sum, row) => sum + row.percentageBps, 0) === 10000;
}

export function addUtcMonths(value: string, months: number) {
  const source = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(source.getTime())) return "";
  const day = source.getUTCDate();
  const target = new Date(Date.UTC(source.getUTCFullYear(), source.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.toISOString().slice(0, 10);
}

export function annualContractEndDate(startDate: string) {
  return addUtcMonths(startDate, ANNUAL_CONTRACT_MONTHS);
}

export function annualInstallmentPercentages(installments = ANNUAL_CONTRACT_MONTHS) {
  const count = Math.max(1, Math.floor(installments));
  const base = Math.floor(10000 / count);
  return Array.from({ length: count }, (_, index) => index === count - 1 ? 10000 - base * (count - 1) : base);
}

export function annualApprovalSchedule(approvedAt: string, installments = ANNUAL_CONTRACT_MONTHS) {
  const approvalDate = approvedAt.slice(0, 10);
  return Array.from({ length: Math.max(0, installments) }, (_, index) => addUtcMonths(approvalDate, index + 1));
}
