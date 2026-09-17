import { and, inArray, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { contractPaymentSchedules, financialRecords, legalJudgmentPaymentRequests, legalRecords, workforceContracts } from "@/db/schema";
import { requirePortalApiRole } from "@/lib/portal-access";
import { jsonNoStore } from "@/lib/security";

export async function GET() {
  const actor = await requirePortalApiRole(["admin", "manager", "employee"]);
  if (!actor || !(actor.role === "admin" || actor.functionalRoles.some(role => ["system_owner", "system_admin"].includes(role))))
    return jsonNoStore({ error: "هذه الصفحة مخصصة للمالك ومشرف النظام" }, { status: 403 });
  const db = getDb();
  const [contracts, payments, legalPayments, cases, financials] = await Promise.all([
    db.select({ id: workforceContracts.id, status: workforceContracts.status, approvedBy: workforceContracts.approvedBy, direction: workforceContracts.contractDirection }).from(workforceContracts),
    db.select().from(contractPaymentSchedules),
    db.select().from(legalJudgmentPaymentRequests).where(inArray(legalJudgmentPaymentRequests.status, ["requested", "changes_requested"])),
    db.select({ id: legalRecords.id }).from(legalRecords).where(and(isNull(legalRecords.deletedAt), inArray(legalRecords.status, ["active", "reviewing", "awaiting_contracts"]))),
    db.select({ id: financialRecords.id, amountHalalas: financialRecords.amountHalalas }).from(financialRecords),
  ]);
  const amounts = new Map(financials.map(item => [item.id, item.amountHalalas]));
  const today = new Date().toISOString().slice(0, 10), customerIds = new Set(contracts.filter(item => item.approvedBy && item.direction === "dali_supplier").map(item => item.id));
  return jsonNoStore({
    pendingContracts: contracts.filter(item => ["draft", "internal_review", "legal_review"].includes(item.status)).length,
    overdueReceivablesHalalas: payments.filter(item => customerIds.has(item.contractId) && item.status !== "cancelled" && !item.cancellationDisposition?.startsWith("review_") && item.dueDate < today).reduce((sum, item) => sum + Math.max(0, (item.financialRecordId ? amounts.get(item.financialRecordId) ?? item.amountHalalas : item.amountHalalas) - item.paidAmountHalalas), 0),
    legalPaymentRequests: legalPayments.length,
    legalPaymentAmountHalalas: legalPayments.reduce((sum, item) => sum + item.amountHalalas, 0),
    cancellationReviews: payments.filter(item => item.cancellationDisposition?.startsWith("review_")).length,
    openLegalCases: cases.length,
  });
}
