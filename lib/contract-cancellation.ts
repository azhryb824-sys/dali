import { loadContractLegalDocuments } from "@/lib/contract-legal-documents";
import { asc, eq, inArray, sql } from "drizzle-orm";
import { clients, contractProfessions, contractWorkerAssignments, workers, contractPaymentSchedules, financialRecords, legalCaseActivities, legalRecords, workforceContracts } from "@/db/schema";
import { cancellationPaymentDecision } from "@/lib/legal-lifecycle-rules";
import type { LegalTransaction } from "@/lib/legal-referrals";

export async function applyContractCancellation(tx: LegalTransaction, input: {
  contract: typeof workforceContracts.$inferSelect; status: string;
  reason: string; actorEmail: string; now: string;
}) {
  const { contract, now } = input;
  const effectiveDate = now.slice(0, 10);
  await tx.execute(sql`select id from contract_payment_schedules where contract_id = ${contract.id} order by id for update`);
  const payments = await tx.select().from(contractPaymentSchedules)
    .where(eq(contractPaymentSchedules.contractId, contract.id)).orderBy(asc(contractPaymentSchedules.dueDate), asc(contractPaymentSchedules.id));
  const summary = { effectiveDate, cancelledFutureHalalas: 0, preservedHalalas: 0, paidHalalas: 0,
    reviewHalalas: 0, reviewPaymentIds: [] as number[], reason: input.reason };
  let previousDueDate = contract.startDate;
  for (const payment of payments) {
    const decision = cancellationPaymentDecision(payment, { effectiveDate, startDate: contract.startDate, endDate: contract.endDate,
      approved: Boolean(contract.approvedBy), previousDueDate });
    previousDueDate = payment.dueDate;
    if (payment.status === "cancelled") continue;
    summary.paidHalalas += payment.paidAmountHalalas;
    if (decision === "cancel_future") summary.cancelledFutureHalalas += payment.amountHalalas;
    else if (decision.startsWith("review_")) {
      summary.reviewHalalas += payment.amountHalalas;
      summary.reviewPaymentIds.push(payment.id);
    } else summary.preservedHalalas += payment.amountHalalas;
    await tx.update(contractPaymentSchedules).set({
      cancellationDisposition: decision, cancellationOriginalAmountHalalas: payment.amountHalalas,
      ...(decision === "cancel_future" ? { status: "cancelled" } : {}), updatedAt: now,
    }).where(eq(contractPaymentSchedules.id, payment.id));
  }
  // Invoices, collections, payroll and posted journals retain their legal/accounting history.
  // The actual final service amount and any credit/refund require an explicit finance decision.
  const finances = await tx.select().from(financialRecords).where(eq(financialRecords.contractId, contract.id));
  await tx.update(workforceContracts).set({ cancellationEffectiveDate: effectiveDate,
    cancellationSummaryJson: JSON.stringify(summary) }).where(eq(workforceContracts.id, contract.id));
  const finalPayments = await tx.select().from(contractPaymentSchedules).where(eq(contractPaymentSchedules.contractId, contract.id));
  const documents = await loadContractLegalDocuments(tx, contract, [...finances.map(item => item.documentId), ...finalPayments.map(item => item.invoiceDocumentId)]);
  const client = contract.clientId ? await tx.query.clients.findFirst({ where: eq(clients.id, contract.clientId) }) : null;
  const professions = await tx.select().from(contractProfessions).where(eq(contractProfessions.contractId, contract.id));
  const assignments = await tx.select().from(contractWorkerAssignments).where(eq(contractWorkerAssignments.contractId, contract.id));
  const workerIds = [...new Set(assignments.map(item => item.workerId))];
  const linkedWorkers = workerIds.length ? await tx.select().from(workers).where(inArray(workers.id, workerIds)) : [];
  const [matter] = await tx.insert(legalRecords).values({
    referenceCode: `LGL-CAN-${contract.id}-${crypto.randomUUID().slice(0, 8)}`,
    category: "case", title: `${input.status === "terminated" ? "إنهاء" : "إلغاء"} العقد ${contract.referenceCode}`,
    counterparty: contract.clientName, clientId: contract.clientId, contractId: contract.id,
    referralReason: input.reason, referredBy: input.actorEmail, referredAt: now, status: "reviewing",
    fileSnapshotJson: JSON.stringify({ capturedAt: now, cancellation: summary,
      contract: { ...contract, status: input.status }, client, documents, payments: finalPayments, finances, professions, assignments, workers: linkedWorkers, originalPayments: payments }),
  }).returning();
  await tx.insert(legalCaseActivities).values([
    { legalRecordId: matter.id, activityType: "task", title: "مراجعة سبب الإلغاء والالتزامات القانونية", details: input.reason, priority: "high", createdBy: input.actorEmail },
    { legalRecordId: matter.id, activityType: "task", title: "مطابقة المستحقات حتى الإلغاء والتعويضات والمبالغ المقدمة",
      details: `ألغيت الدفعات المستقبلية غير المعالجة فقط. ${summary.reviewPaymentIds.length} دفعات تتطلب تحديد مستحقات الخدمة أو إشعار دائن أو استرداد معتمد. الرواتب والقيود السابقة محفوظة.`, priority: "critical", createdBy: input.actorEmail },
  ]);
  // Revoked signing requests are handled by the enclosing lifecycle transaction.
  return { summary, legalRecordId: matter.id };
}
