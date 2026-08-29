import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { contractProfessions, contractWorkerAssignments, portalActivity, workers, workforceContracts } from "@/db/schema";
import { hasPortalPermission, requirePortalApiRole } from "@/lib/portal-access";
import { emitPortalNotification } from "@/lib/portal-notifications";
import { rejectCrossSiteRequest } from "@/lib/security";

function positiveId(value: unknown) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function requireContractWrite() {
  const access = await requirePortalApiRole(["admin", "manager", "employee"]);
  return access && await hasPortalPermission(access, "contracts", "write") ? access : null;
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (rejectCrossSiteRequest(request)) return Response.json({ error: "مصدر الطلب غير مسموح" }, { status: 403 });
  const access = await requireContractWrite();
  if (!access) return Response.json({ error: "غير مصرح بإسناد العمالة إلى العقود" }, { status: 403 });

  const { id: value } = await context.params;
  const contractId = positiveId(value);
  const payload = await request.json().catch(() => ({})) as Record<string, unknown>;
  const contractProfessionId = positiveId(payload.contractProfessionId);
  const workerId = positiveId(payload.workerId);
  if (!contractId || !contractProfessionId || !workerId) {
    return Response.json({ error: "بيانات الإسناد غير صحيحة" }, { status: 400 });
  }

  try {
    const db = getDb();
    const [contract, profession, worker] = await Promise.all([
      db.query.workforceContracts.findFirst({ where: eq(workforceContracts.id, contractId) }),
      db.query.contractProfessions.findFirst({ where: eq(contractProfessions.id, contractProfessionId) }),
      db.query.workers.findFirst({ where: eq(workers.id, workerId) }),
    ]);
    if (!contract || contract.status !== "active") return Response.json({ error: "العقد غير موجود أو غير نشط" }, { status: 404 });
    if (!profession || profession.contractId !== contract.id) return Response.json({ error: "المهنة ليست ضمن هذا العقد" }, { status: 400 });
    if (!worker || worker.profession !== profession.profession) return Response.json({ error: "مهنة العامل لا تطابق المهنة المطلوبة في العقد" }, { status: 400 });
    if (worker.status !== "available") return Response.json({ error: "العامل غير متاح لأنه مرتبط بجهة أخرى أو موقوف حالياً" }, { status: 409 });
    const sponsorshipMismatch = profession.sponsorshipType && (
      worker.sponsorshipType !== profession.sponsorshipType
      || (profession.sponsorshipType === "other" && profession.sponsorName && worker.sponsorName !== profession.sponsorName)
    );
    if (sponsorshipMismatch) {
      return Response.json({ error: "جهة كفالة العامل لا تطابق جهة الكفالة المعتمدة في العقد" }, { status: 409 });
    }

    const activeAssignments = await db.select().from(contractWorkerAssignments).where(and(
      eq(contractWorkerAssignments.contractProfessionId, profession.id),
      eq(contractWorkerAssignments.status, "active"),
    ));
    if (activeAssignments.length >= profession.requiredCount) {
      return Response.json({ error: `اكتمل العدد المطلوب لمهنة ${profession.profession} ولا يمكن إضافة عامل آخر` }, { status: 409 });
    }

    const reservedWorkers = await db.update(workers).set({
      status: "assigned", beneficiaryName: contract.clientName, clientSite: contract.workSite,
      assignmentStartDate: contract.startDate, updatedAt: new Date().toISOString(),
    }).where(and(eq(workers.id, worker.id), eq(workers.status, "available"))).returning();
    const updatedWorker = reservedWorkers[0];
    if (!updatedWorker) return Response.json({ error: "العامل لم يعد متاحًا؛ حدّث الصفحة وحاول بعامل آخر" }, { status: 409 });

    const existingAssignment = await db.query.contractWorkerAssignments.findFirst({ where: and(
      eq(contractWorkerAssignments.contractId, contract.id),
      eq(contractWorkerAssignments.workerId, worker.id),
    ) });
    let assignment: typeof contractWorkerAssignments.$inferSelect;
    try {
      [assignment] = existingAssignment
        ? await db.update(contractWorkerAssignments).set({
          contractProfessionId: profession.id,
          status: "active",
          assignedBy: access.user.email,
          assignedAt: new Date().toISOString(),
          releasedAt: null,
          }).where(eq(contractWorkerAssignments.id, existingAssignment.id)).returning()
        : await db.insert(contractWorkerAssignments).values({
          contractId: contract.id,
          contractProfessionId: profession.id,
          workerId: worker.id,
          assignedBy: access.user.email,
          }).returning();
      if (!assignment) throw new Error("ASSIGNMENT_WRITE_FAILED");
    } catch (error) {
      await db.update(workers).set({ status: "available", beneficiaryName: null, clientSite: "غير مسند", assignmentStartDate: null, updatedAt: new Date().toISOString() })
        .where(and(eq(workers.id, worker.id), eq(workers.status, "assigned"), eq(workers.beneficiaryName, contract.clientName))).catch(() => undefined);
      throw error;
    }

    await db.insert(portalActivity).values({
      actorEmail: access.user.email,
      action: "contract-worker-assigned",
      entityType: "workforce-contract",
      entityId: String(contract.id),
    });
    await emitPortalNotification({ eventType: "contract-worker-assigned", title: "أُسند عامل إلى عقد", message: `${updatedWorker.fullName} — ${profession.profession} — ${contract.referenceCode} — ${contract.clientName}.`, severity: "success", module: "workforce", entityType: "workforce-contract", entityId: contract.id, actionView: "workforce", targetDepartment: "workforce" }).catch(() => undefined);
    return Response.json({ assignment, worker: updatedWorker }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (message.includes("unique")) return Response.json({ error: "العامل مضاف إلى هذا العقد مسبقاً" }, { status: 409 });
    return Response.json({ error: "تعذّر إسناد العامل إلى العقد حالياً" }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  if (rejectCrossSiteRequest(request)) return Response.json({ error: "مصدر الطلب غير مسموح" }, { status: 403 });
  const access = await requireContractWrite();
  if (!access) return Response.json({ error: "غير مصرح بإلغاء إسناد العمالة" }, { status: 403 });

  const { id: value } = await context.params;
  const contractId = positiveId(value);
  const payload = await request.json().catch(() => ({})) as Record<string, unknown>;
  const assignmentId = positiveId(payload.assignmentId);
  if (!contractId || !assignmentId) return Response.json({ error: "بيانات الإسناد غير صحيحة" }, { status: 400 });

  try {
    const db = getDb();
    const assignment = await db.query.contractWorkerAssignments.findFirst({ where: eq(contractWorkerAssignments.id, assignmentId) });
    if (!assignment || assignment.contractId !== contractId || assignment.status !== "active") {
      return Response.json({ error: "الإسناد غير موجود أو منتهٍ" }, { status: 404 });
    }

    const [released] = await db.update(contractWorkerAssignments).set({
      status: "released",
      releasedAt: new Date().toISOString(),
    }).where(and(eq(contractWorkerAssignments.id, assignment.id), eq(contractWorkerAssignments.status, "active"))).returning();
    if (!released) return Response.json({ error: "تغير الإسناد قبل تنفيذ العملية" }, { status: 409 });
    const otherActive = await db.query.contractWorkerAssignments.findFirst({ where: and(eq(contractWorkerAssignments.workerId, assignment.workerId), eq(contractWorkerAssignments.status, "active")) });
    if (otherActive) return Response.json({ assignment: released, worker: await db.query.workers.findFirst({ where: eq(workers.id, assignment.workerId) }) });
    const [updatedWorker] = await db.update(workers).set({
      status: "available",
      beneficiaryName: null,
      clientSite: "غير مسند",
      assignmentStartDate: null,
      updatedAt: new Date().toISOString(),
    }).where(eq(workers.id, assignment.workerId)).returning();

    await db.insert(portalActivity).values({
      actorEmail: access.user.email,
      action: "contract-worker-released",
      entityType: "workforce-contract",
      entityId: String(contractId),
    });
    await emitPortalNotification({ eventType: "contract-worker-released", title: "انتهى إسناد عامل", message: `${updatedWorker.fullName} أصبح متاحاً بعد إنهاء إسناده من العقد رقم ${contractId}.`, severity: "info", module: "workforce", entityType: "workforce-contract", entityId: contractId, actionView: "workforce", targetDepartment: "workforce" }).catch(() => undefined);
    return Response.json({ assignment: released, worker: updatedWorker });
  } catch {
    return Response.json({ error: "تعذّر إلغاء إسناد العامل حالياً" }, { status: 500 });
  }
}
