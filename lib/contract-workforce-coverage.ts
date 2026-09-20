export type CoverageProfession = { id: number; requiredCount: number };
export type CoverageAssignment = { contractProfessionId: number; workerId: number; status: string };
/** Excess staffing in one profession must never cancel another profession's shortage. */
export function contractWorkforceCoverage(professions: CoverageProfession[], assignments: CoverageAssignment[], open = false) {
  const rows = professions.map(profession => {
    const active = assignments.filter(row => row.contractProfessionId === profession.id && row.status === "active");
    const planned = assignments.filter(row => row.contractProfessionId === profession.id && row.status === "planned");
    const required = Math.max(0, profession.requiredCount);
    const shortage = open ? 0 : Math.max(0, required - active.length);
    return { professionId: profession.id, required, active: active.length, planned: planned.length, shortage, remaining: open ? null : Math.max(0, required - active.length - planned.length) };
  });
  const required = rows.reduce((n, row) => n + row.required, 0);
  const active = rows.reduce((n, row) => n + row.active, 0);
  const planned = rows.reduce((n, row) => n + row.planned, 0);
  const shortage = rows.reduce((n, row) => n + row.shortage, 0);
  return { rows, required, active, planned, shortage, percent: open || !required ? null : Math.round((required - shortage) / required * 100) };
}
export function eligibleContractWorker(worker: { id: number; profession: string; status: string; archivedAt?: string | null; sponsorshipType?: string | null; sponsorName?: string | null }, profession: { profession: string; sponsorshipType?: string | null; sponsorName?: string | null }, assignments: CoverageAssignment[]) {
  return !worker.archivedAt && worker.status === "available" && worker.profession === profession.profession
    && (!profession.sponsorshipType || worker.sponsorshipType === profession.sponsorshipType)
    && (profession.sponsorshipType !== "other" || !profession.sponsorName || worker.sponsorName === profession.sponsorName)
    && !assignments.some(row => row.workerId === worker.id && ["active", "planned"].includes(row.status));
}
