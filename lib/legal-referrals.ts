import { and, desc, eq, ne, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { legalCaseActivities, legalRecords, legalReferrals } from "@/db/schema";

export type LegalTransaction = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

export async function registerLegalReferral(tx: LegalTransaction, input: {
  sourceType: "payment" | "contract" | "employee" | "worker";
  sourceId: number; contractId?: number | null; clientId?: number | null;
  reason: string; actorEmail: string; title: string; counterparty: string;
  snapshot?: unknown; now: string;
}) {
  // A transaction-scoped lock also protects sources that have no prior referral row.
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`legal:${input.sourceType}:${input.sourceId}`}))`);
  const prior = await tx.query.legalReferrals.findFirst({
    where: and(eq(legalReferrals.sourceType, input.sourceType), eq(legalReferrals.sourceId, input.sourceId), ne(legalReferrals.status, "returned")),
    orderBy: desc(legalReferrals.id),
  });
  if (prior) throw new Error("سبق إحالة هذا السجل؛ لا يمكن تكرار الإحالة إلا بعد إعادته من القانونية");
  const [matter] = await tx.insert(legalRecords).values({
    referenceCode: `LGL-${input.sourceType.toUpperCase()}-${input.sourceId}-${crypto.randomUUID().slice(0, 8)}`,
    category: "case", title: input.title, counterparty: input.counterparty,
    clientId: input.clientId || null, contractId: input.contractId || null,
    referralReason: input.reason, referredBy: input.actorEmail, referredAt: input.now,
    fileSnapshotJson: input.snapshot ? JSON.stringify(input.snapshot) : null, status: "reviewing",
  }).returning();
  const [referral] = await tx.insert(legalReferrals).values({
    legalRecordId: matter.id, sourceType: input.sourceType, sourceId: input.sourceId,
    contractId: input.contractId || null,
    paymentScheduleId: input.sourceType === "payment" ? input.sourceId : null,
    employeeId: input.sourceType === "employee" ? input.sourceId : null,
    workerId: input.sourceType === "worker" ? input.sourceId : null,
    reason: input.reason, referredBy: input.actorEmail, referredAt: input.now,
  }).returning();
  await tx.insert(legalCaseActivities).values({
    legalRecordId: matter.id, activityType: "task", title: "مراجعة الإحالة والمستندات والأثر المالي",
    details: input.reason, priority: "high", status: "open", createdBy: input.actorEmail,
  });
  return { matter, referral };
}
