const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidIsoDate(value: string) {
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}

export function countChargeableAbsenceDays(start: string, end: string) {
  if (!isValidIsoDate(start) || !isValidIsoDate(end) || end < start) return 0;
  let count = 0;
  let cursor = new Date(`${start}T12:00:00Z`);
  const last = new Date(`${end}T12:00:00Z`);
  while (cursor <= last) {
    if (cursor.getUTCDay() !== 5) count += 1;
    cursor = new Date(cursor.getTime() + 86_400_000);
  }
  return count;
}

export function absenceRangesOverlap(
  firstStart: string,
  firstEnd: string | null,
  secondStart: string,
  secondEnd: string | null,
) {
  const normalizedFirstEnd = firstEnd || firstStart;
  const normalizedSecondEnd = secondEnd || secondStart;
  return firstStart <= normalizedSecondEnd && secondStart <= normalizedFirstEnd;
}

export function workerMonthlySalaryHalalas(workerSalaryHalalas: number, professionFallbackHalalas: number) {
  return workerSalaryHalalas > 0 ? workerSalaryHalalas : Math.max(0, professionFallbackHalalas);
}
