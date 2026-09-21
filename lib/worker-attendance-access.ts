type WorkerAttendanceActor = {
  role: string;
  functionalRoles: readonly string[];
};

/** Used only after session authorization on the server. Movement, finance,
 * or wildcard permissions alone never grant absence/deduction approval. */
export function canManageWorkerAttendance(actor: WorkerAttendanceActor | null | undefined): boolean {
  return Boolean(actor && (actor.role === "admin" || actor.functionalRoles.some(
    role => role === "system_owner" || role === "system_admin",
  )));
}
