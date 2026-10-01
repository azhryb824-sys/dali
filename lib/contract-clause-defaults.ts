import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { portalSettings } from "@/db/schema";
import { defaultWorkforceContractClauses, parseWorkforceContractClauses, type WorkforceContractDirection } from "@/lib/workforce-contract-clauses";

export function clauseDefaultsKey(direction: WorkforceContractDirection) { return `contract-clause-defaults:${direction}`; }
export async function loadContractClauseDefaults(direction: WorkforceContractDirection) {
  const saved = await getDb().query.portalSettings.findFirst({ where: eq(portalSettings.key, clauseDefaultsKey(direction)) });
  return { direction, clauses: saved ? parseWorkforceContractClauses(saved.valueJson, direction, true) : defaultWorkforceContractClauses(direction), revision: saved?.updatedAt || "builtin" };
}
