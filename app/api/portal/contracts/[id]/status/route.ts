import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { contractWorkerAssignments, workers, workforceContracts } from "@/db/schema";
import { auditPortalAction, recordStatusChange } from "@/lib/audit";
import { emitPortalNotification } from "@/lib/portal-notifications";
import { hasPortalPermission, requirePortalApiRole } from "@/lib/portal-access";
import { jsonNoStore, rejectCrossSiteRequest } from "@/lib/security";

const transitions: Record<string, string[]> = {
  draft: ["internal_review", "cancelled"],
  internal_review: ["draft", "legal_review", "cancelled"],
  legal_review: ["internal_review", "approved", "cancelled"],
  approved: ["sent", "cancelled"],
  sent: ["signed", "cancelled"],
  signed: ["active", "cancelled"],
  active: ["suspended", "terminated", "expired", "superseded"],
  suspended: ["active", "terminated"],
  expired: ["superseded"],
  terminated: [], cancelled: [], superseded: [],
};

function clean(value: unknown, length: number) { return typeof value === "string" ? value.trim().slice(0, length) : ""; }

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (rejectCrossSiteRequest(request)) return jsonNoStore({ error: "مصدر الطلب غير مسموح" }, { status: 403 });
  const access = await requirePortalApiRole(["admin", "manager"]);
  if (!access || !(await hasPortalPermission(access, "workforce", "write"))) return jsonNoStore({ error: "غير مصرح" }, { status: 403 });
  try {
    const id = Number((await context.params).id);
    const payload = await request.json() as Record<string, unknown>;
    const status = clean(payload.status, 30);
    const reason = clean(payload.reason, 1000);
    if (!Number.isSafeInteger(id) || id < 1) return jsonNoStore({ error: "رقم العقد غير صحيح" }, { status: 400 });
    const db = getDb();
    const contract = await db.query.workforceContracts.findFirst({ where: eq(workforceContracts.id, id) });
    if (!contract) return jsonNoStore({ error: "العقد غير موجود" }, { status: 404 });
    if (!transitions[contract.status]?.includes(status)) return jsonNoStore({ error: "انتقال حالة العقد غير مسموح" }, { status: 409 });
    if (["cancelled", "terminated", "suspended"].includes(status) && reason.length < 10) return jsonNoStore({ error: "اكتب سببًا واضحًا لا يقل عن 10 أحرف" }, { status: 400 });
    if (["approved", "signed", "active", "terminated", "cancelled", "superseded"].includes(status) && access.role !== "admin") return jsonNoStore({ error: "هذه المرحلة تتطلب اعتماد مدير النظام" }, { status: 403 });
    const plannedAssignments = status === "active"
      ? await db.select().from(contractWorkerAssignments).where(and(eq(contractWorkerAssignments.contractId, id), eq(contractWorkerAssignments.status, "planned")))
      : [];
    if (status === "active") {
      for (const assignment of plannedAssignments) {
        const worker = await db.query.workers.findFirst({ where: eq(workers.id, assignment.workerId) });
        if (!worker || worker.status !== "available") return jsonNoStore({ error: `تعذّر تفعيل العقد لأن العامل رقم ${assignment.workerId} لم يعد متاحًا` }, { status: 409 });
      }
    }
    const now = new Date().toISOString();
    const [updated] = await db.update(workforceContracts).set({
      status,
      ...(status === "approved" ? { approvedBy: access.user.email, approvedAt: now } : {}),
      ...(status === "signed" ? { signedAt: now } : {}),
      ...(status === "active" ? { effectiveAt: now, suspendedAt: null } : {}),
      ...(status === "suspended" ? { suspendedAt: now, cancellationReason: reason } : {}),
      ...(status === "terminated" ? { terminatedAt: now, cancellationReason: reason } : {}),
      ...(status === "cancelled" ? { cancellationReason: reason } : {}),
      updatedAt: now,
    }).where(and(eq(workforceContracts.id, id), eq(workforceContracts.status, contract.status))).returning();
    if (!updated) return jsonNoStore({ error: "تغيرت حالة العقد قبل حفظ القرار" }, { status: 409 });
    if (status === "active") {
      try {
        for (const assignment of plannedAssignments) {
          await db.update(contractWorkerAssignments).set({ status: "active", assignedAt: now }).where(and(eq(contractWorkerAssignments.id, assignment.id), eq(contractWorkerAssignments.status, "planned")));
          const assignedWorkers = await db.update(workers).set({ status: "assigned", beneficiaryName: contract.clientName, clientSite: contract.workSite, assignmentStartDate: contract.startDate, updatedAt: now }).where(and(eq(workers.id, assignment.workerId), eq(workers.status, "available"))).returning();
          if (!assignedWorkers.length) throw new Error(`تعارض إسناد العامل رقم ${assignment.workerId}`);
        }
      } catch (error) {
        await db.update(workforceContracts).set({ status: contract.status, effectiveAt: null, updatedAt: now }).where(eq(workforceContracts.id, id)).catch(() => undefined);
        for (const assignment of plannedAssignments) {
          await db.update(contractWorkerAssignments).set({ status: "planned" }).where(eq(contractWorkerAssignments.id, assignment.id)).catch(() => undefined);
          await db.update(workers).set({ status: "available", beneficiaryName: null, clientSite: "غير مسند", assignmentStartDate: null, updatedAt: now }).where(and(eq(workers.id, assignment.workerId), eq(workers.status, "assigned"), eq(workers.beneficiaryName, contract.clientName))).catch(() => undefined);
        }
        throw error;
      }
    }
    const correlationId = await recordStatusChange({ entityType: "workforce-contract", entityId: id, fromStatus: contract.status, toStatus: status, reason: reason || null, actorEmail: access.user.email });
    await auditPortalAction({ actorEmail: access.user.email, action: "workforce-contract-status-changed", entityType: "workforce-contract", entityId: id, before: contract, after: updated, reason: reason || null, correlationId });
    await emitPortalNotification({ eventType: "workforce-contract-status-changed", title: "تغيّرت حالة عقد عمالة", message: `${updated.referenceCode} — ${updated.clientName} — ${contract.status} ← ${status}.`, severity: ["cancelled", "terminated", "suspended"].includes(status) ? "warning" : "info", module: "workforce", entityType: "workforce-contract", entityId: id, actionView: "workforce", targetDepartment: "workforce" }).catch(() => undefined);
    return jsonNoStore({ contract: updated });
  } catch (error) {
    return jsonNoStore({ error: error instanceof Error ? error.message : "تعذّر تحديث العقد" }, { status: 400 });
  }
}
