import { createHash, randomUUID } from "node:crypto";
import { eq, like } from "drizzle-orm";
import { getDb } from "@/db";
import { portalSettings, workforceContracts } from "@/db/schema";
import { clauseDefaultsKey } from "@/lib/contract-clause-defaults";
import { defaultWorkforceContractClauses, parseWorkforceContractClauses, type WorkforceContractClause, type WorkforceContractDirection } from "@/lib/workforce-contract-clauses";
import { emitPortalNotification } from "@/lib/portal-notifications";
export const LEGAL_CLAUSE_REVIEW_PREFIX = "legal-clause-review:";
type Db = ReturnType<typeof getDb>;
export type ClauseReview = { id: string; kind: "defaults" | "contract"; status: "pending" | "approved" | "rejected" | "recommended" | "superseded"; direction: WorkforceContractDirection; clauses: WorkforceContractClause[]; baseRevision: string; contractId?: number; contractVersion?: number; contractSnapshot?: { title:string; clientName:string; workSite:string; startDate:string; endDate:string; documentId:number }; reference: string; createdBy: string; createdAt: string; revision: string; reviewer?: string; reviewedAt?: string; recommendation?: string };
export function reviewKey(id: string) { return `${LEGAL_CLAUSE_REVIEW_PREFIX}${id}`; }
export function readClauseReview(value: string): ClauseReview { return JSON.parse(value) as ClauseReview; }
export async function listClauseReviews(db: Pick<Db, "select"> = getDb()) {
  const rows = await db.select().from(portalSettings).where(like(portalSettings.key, `${LEGAL_CLAUSE_REVIEW_PREFIX}%`));
  return rows.map(row => readClauseReview(row.valueJson)).sort((a,b) => b.createdAt.localeCompare(a.createdAt));
}
export function additionalContractClauses(clauses: WorkforceContractClause[], baseline: WorkforceContractClause[]) {
  const text = (item: WorkforceContractClause) => JSON.stringify([item.body.trim(), item.bodyEn?.trim() || "", item.isPreamble === true, item.subclauses || []]);
  const available = baseline.filter(item=>item.included).map(text);
  return clauses.filter(item => { if (!item.included) return false; const index=available.indexOf(text(item)); if(index<0) return true; available.splice(index,1); return false; });
}
export async function queueContractClauseReview(tx: Pick<Db,"query"|"insert"|"execute"|"select"|"update">, input: { contractId: number; contractVersion: number; reference: string; direction: WorkforceContractDirection; clauses: WorkforceContractClause[]; actorEmail: string }) {
  const saved=await tx.query.portalSettings.findFirst({where:eq(portalSettings.key,clauseDefaultsKey(input.direction))});
  const baseline=saved ? parseWorkforceContractClauses(saved.valueJson,input.direction,true) : defaultWorkforceContractClauses(input.direction,true);
  const older = (await listClauseReviews(tx)).filter(item=>item.kind === "contract" && item.contractId === input.contractId && item.contractVersion !== input.contractVersion && item.status === "pending");
  for (const item of older) { const now=new Date().toISOString(); await tx.update(portalSettings).set({valueJson:JSON.stringify({...item,status:"superseded",revision:now}),updatedAt:now,updatedBy:input.actorEmail}).where(eq(portalSettings.key,reviewKey(item.id))); }
  if (!additionalContractClauses(input.clauses, baseline).length) return null;
  const fingerprint=createHash("sha256").update(JSON.stringify([input.contractId,input.contractVersion,input.clauses])).digest("hex");
  const id=`contract-${fingerprint}`, key=reviewKey(id);
  if (await tx.query.portalSettings.findFirst({where:eq(portalSettings.key,key)})) return null;
  const contract=await tx.query.workforceContracts.findFirst({where:eq(workforceContracts.id,input.contractId)});
  const now=new Date().toISOString();
  const review:ClauseReview={id,kind:"contract",status:"pending",direction:input.direction,clauses:input.clauses,baseRevision:saved?.updatedAt || "builtin",contractId:input.contractId,contractVersion:input.contractVersion,contractSnapshot:contract ? {title:contract.title,clientName:contract.clientName,workSite:contract.workSite,startDate:contract.startDate,endDate:contract.endDate,documentId:contract.documentId} : undefined,reference:input.reference,createdBy:input.actorEmail,createdAt:now,revision:now};
  const inserted = await tx.insert(portalSettings).values({key,valueJson:JSON.stringify(review),updatedAt:now,updatedBy:input.actorEmail}).onConflictDoNothing().returning({key:portalSettings.key});
  return inserted.length ? review : null;
}
export function newDefaultClauseReview(input: {direction:WorkforceContractDirection; clauses:WorkforceContractClause[]; baseRevision:string; actorEmail:string}):ClauseReview {
  const now=new Date().toISOString();return {id:randomUUID(),kind:"defaults",status:"pending",direction:input.direction,clauses:input.clauses,baseRevision:input.baseRevision,reference:input.direction === "dali_supplier" ? "دالي مورد" : "دالي مستورد",createdBy:input.actorEmail,createdAt:now,revision:now};
}
export async function notifyClauseReview(review:ClauseReview) {
  await emitPortalNotification({eventType:"legal-clause-review-requested",title:review.kind === "defaults" ? "بنود افتراضية تنتظر المراجعة القانونية" : "عقد ببنود إضافية للمراجعة القانونية",message:review.reference,module:"legal",severity:"warning",entityType:"clause-review",entityId:review.id,actionView:"legal",targetDepartment:"legal",dedupeKey:`clause-review:${review.id}`,source:"system-check"});
}
