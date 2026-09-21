export type WorkerContractPlacementAssignment = {
  workerId: number;
  contractId: number;
  status: string;
};

export type WorkerContractPlacementContract = {
  id: number;
  referenceCode: string;
  clientName: string;
  workSite: string;
};

/**
 * The active contract is the operational source of truth for a worker's site.
 * Worker.clientSite remains only a fallback for workers without a resolvable
 * active contract assignment.
 */
export function resolveWorkerContractPlacement(
  workerId: number,
  assignments: readonly WorkerContractPlacementAssignment[],
  contracts: readonly WorkerContractPlacementContract[],
  fallbackSite = "",
) {
  const assignment = assignments.find(
    (item) => item.workerId === workerId && item.status === "active",
  );
  const contract = assignment
    ? contracts.find((item) => item.id === assignment.contractId) || null
    : null;

  return {
    assignment,
    contract,
    site: contract?.workSite?.trim() || fallbackSite.trim(),
  };
}
