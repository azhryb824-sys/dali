import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { contractProfessions, contractWorkerAssignments, portalActivity, workers, workforceContracts } from "@/db/schema";
import { hasPortalPermission, requirePortalApiRole } from "@/lib/portal-access";
import { emitPortalNotification } from "@/lib/portal-notifications";
import { rejectCrossSiteRequest } from "@/lib/security";

function positiveId(value: unknown) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function requireWorkerAssignmentWrite() {
  const access = await requirePortalApiRole(["admin", "manager", "employee"]);
  if (!access) return null;
  const [canWriteContracts, canWriteWorkforce] = await Promise.all([
    hasPortalPermission(access, "contracts", "write"),
    hasPortalPermission(access, "workforce", "write"),
  ]);
  return canWriteContracts && canWriteWorkforce ? access : null;
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (rejectCrossSiteRequest(request)) return Response.json({ error: "مصدر الطلب غير مسموح" }, { status: 403 });
  const access = await requireWorkerAssignmentWrite();
  if (!access) return Response.json({ error: "إسناد العمالة يتطلب صلاحيتي العقود والقوى العاملة معًا" }, { status: 403 });

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
    const now = new Date().toISOString();
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`select id from workforce_contracts where id = ${contractId} for update`);
      await tx.execute(sql`select id from contract_professions where id = ${contractProfessionId} for update`);
      await tx.execute(sql`select id from workers where id = ${workerId} for update`);

      const [[contract], [profession], [worker]] = await Promise.all([
        tx.select().from(workforceContracts).where(eq(workforceContracts.id, contractId)).limit(1),
        tx.select().from(contractProfessions).where(eq(contractProfessions.id, contractProfessionId)).limit(1),
        tx.select().from(workers).where(eq(workers.id, workerId)).limit(1),
      ]);
      if (!contract || contract.status !== "active") throw new Error("CONTRACT_NOT_ACTIVE");
      if (!profession || profession.contractId !== contract.id) throw new Error("PROFESSION_CONTRACT_MISMATCH");
      if (!worker || worker.archivedAt || worker.profession !== profession.profession) throw new Error("WORKER_PROFESSION_MISMATCH");
      if (worker.status !== "available") throw new Error("WORKER_NOT_AVAILABLE");

      const sponsorshipMismatch = profession.sponsorshipType && (
        worker.sponsorshipType !== profession.sponsorshipType
        || (profession.sponsorshipType === "other" && profession.sponsorName && worker.sponsorName !== profession.sponsorName)
      );
      if (sponsorshipMismatch) throw new Error("SPONSORSHIP_MISMATCH");

      const activeAssignments = await tx.select({ id: contractWorkerAssignments.id })
        .from(contractWorkerAssignments)
        .where(and(
          eq(contractWorkerAssignments.contractProfessionId, profession.id),
          eq(contractWorkerAssignments.status, "active"),
        ));
      if (activeAssignments.length >= profession.requiredCount) throw new Error("CONTRACT_PROFESSION_CAPACITY_REACHED");

      const [updatedWorker] = await tx.update(workers).set({
        status: "assigned",
        beneficiaryName: contract.clientName,
        clientSite: contract.workSite,
        clientId: contract.clientId,
        assignmentStartDate: now.slice(0, 10),
        updatedAt: now,
      }).where(and(eq(workers.id, worker.id), eq(workers.status, "available"))).returning();
      if (!updatedWorker) throw new Error("WORKER_NOT_AVAILABLE");

      const [assignment] = await tx.insert(contractWorkerAssignments).values({
        contractId: contract.id,
        contractProfessionId: profession.id,
        workerId: worker.id,
        status: "active",
        assignedBy: access.user.email,
        assignedAt: now,
      }).returning();
      if (!assignment) throw new Error("ASSIGNMENT_CHANGED");

      await tx.insert(portalActivity).values({
        actorEmail: access.user.email,
        action: "contract-worker-assigned",
        entityType: "workforce-contract",
        entityId: String(contract.id),
      });
      return { assignment, worker: updatedWorker, contract, profession };
    });

    await emitPortalNotification({
      eventType: "contract-worker-assigned",
      title: "أُسند عامل إلى عقد",
      message: `${result.worker.fullName} — ${result.profession.profession} — ${result.contract.referenceCode} — ${result.contract.clientName}.`,
      severity: "success",
      module: "workforce",
      entityType: "workforce-contract",
      entityId: result.contract.id,
      actionView: "workforce",
      targetDepartment: "workforce",
    }).catch(() => undefined);
    return Response.json({ assignment: result.assignment, worker: result.worker }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "CONTRACT_NOT_ACTIVE") return Response.json({ error: "العقد غير موجود أو غير نشط" }, { status: 409 });
    if (message === "PROFESSION_CONTRACT_MISMATCH") return Response.json({ error: "المهنة ليست ضمن هذا العقد" }, { status: 400 });
    if (message === "WORKER_PROFESSION_MISMATCH") return Response.json({ error: "العامل غير موجود أو مهنته لا تطابق المهنة المطلوبة" }, { status: 400 });
    if (message === "WORKER_NOT_AVAILABLE" || message.includes("WORKER_ALREADY_ASSIGNED")) return Response.json({ error: "العامل لم يعد متاحًا؛ حدّث الصفحة وحاول بعامل آخر" }, { status: 409 });
    if (message.includes("WORKER_COVERING_ABSENCE")) return Response.json({ error: "العامل مسجل كبديل لتغطية غياب اليوم ولا يمكن إسناده إلى عقد آخر في اليوم نفسه" }, { status: 409 });
    if (message === "SPONSORSHIP_MISMATCH") return Response.json({ error: "جهة كفالة العامل لا تطابق جهة الكفالة المعتمدة في العقد" }, { status: 409 });
    if (message.includes("CONTRACT_PROFESSION_CAPACITY_REACHED")) return Response.json({ error: "اكتمل العدد المطلوب لهذه المهنة ولا يمكن إضافة عامل آخر" }, { status: 409 });
    if (message === "ASSIGNMENT_CHANGED" || message.toLowerCase().includes("unique")) return Response.json({ error: "تغير إسناد العامل قبل الحفظ؛ حدّث الصفحة ثم أعد المحاولة" }, { status: 409 });
    console.error("contract-worker-assignment-failed", error);
    return Response.json({ error: "تعذّر إسناد العامل إلى العقد حالياً" }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  if (rejectCrossSiteRequest(request)) return Response.json({ error: "مصدر الطلب غير مسموح" }, { status: 403 });
  const access = await requireWorkerAssignmentWrite();
  if (!access) return Response.json({ error: "إنهاء الإسناد يتطلب صلاحيتي العقود والقوى العاملة معًا" }, { status: 403 });

  const { id: value } = await context.params;
  const contractId = positiveId(value);
  const payload = await request.json().catch(() => ({})) as Record<string, unknown>;
  const assignmentId = positiveId(payload.assignmentId);
  if (!contractId || !assignmentId) return Response.json({ error: "بيانات الإسناد غير صحيحة" }, { status: 400 });

  try {
    const db = getDb();
    const now = new Date().toISOString();
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`select id from workforce_contracts where id = ${contractId} for update`);
      await tx.execute(sql`select id from contract_worker_assignments where id = ${assignmentId} for update`);
      const [assignment] = await tx.select().from(contractWorkerAssignments)
        .where(eq(contractWorkerAssignments.id, assignmentId)).limit(1);
      if (!assignment || assignment.contractId !== contractId || assignment.status !== "active") throw new Error("ASSIGNMENT_NOT_ACTIVE");

      await tx.execute(sql`select id from workers where id = ${assignment.workerId} for update`);
      const [released] = await tx.update(contractWorkerAssignments).set({
        status: "released",
        releasedAt: now,
      }).where(and(
        eq(contractWorkerAssignments.id, assignment.id),
        eq(contractWorkerAssignments.status, "active"),
      )).returning();
      if (!released) throw new Error("ASSIGNMENT_CHANGED");

      const [otherActive] = await tx.select({ id: contractWorkerAssignments.id })
        .from(contractWorkerAssignments)
        .where(and(
          eq(contractWorkerAssignments.workerId, assignment.workerId),
          eq(contractWorkerAssignments.status, "active"),
        )).limit(1);
      let [updatedWorker] = await tx.select().from(workers).where(eq(workers.id, assignment.workerId)).limit(1);
      if (!updatedWorker) throw new Error("WORKER_NOT_FOUND");
      if (!otherActive) {
        [updatedWorker] = await tx.update(workers).set({
          status: updatedWorker.archivedAt
            ? "suspended"
            : updatedWorker.status === "assigned" ? "available" : updatedWorker.status,
          beneficiaryName: null,
          clientSite: "غير مسند",
          clientId: null,
          assignmentStartDate: null,
          updatedAt: now,
        }).where(eq(workers.id, assignment.workerId)).returning();
      }
      if (!updatedWorker) throw new Error("WORKER_NOT_FOUND");

      await tx.insert(portalActivity).values({
        actorEmail: access.user.email,
        action: "contract-worker-released",
        entityType: "workforce-contract",
        entityId: String(contractId),
      });
      return { assignment: released, worker: updatedWorker };
    });

    await emitPortalNotification({
      eventType: "contract-worker-released",
      title: "انتهى إسناد عامل",
      message: `${result.worker.fullName} أصبح متاحاً بعد إنهاء إسناده من العقد رقم ${contractId}.`,
      severity: "info",
      module: "workforce",
      entityType: "workforce-contract",
      entityId: contractId,
      actionView: "workforce",
      targetDepartment: "workforce",
    }).catch(() => undefined);
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "ASSIGNMENT_NOT_ACTIVE") return Response.json({ error: "الإسناد غير موجود أو منتهٍ" }, { status: 404 });
    if (message === "ASSIGNMENT_CHANGED") return Response.json({ error: "تغير الإسناد قبل تنفيذ العملية" }, { status: 409 });
    console.error("contract-worker-release-failed", error);
    return Response.json({ error: "تعذّر إلغاء إسناد العامل حالياً" }, { status: 500 });
  }
}
