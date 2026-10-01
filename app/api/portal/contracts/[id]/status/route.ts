import { and, eq, inArray, or } from "drizzle-orm";
import { getDb } from "@/db";
import {
  clients,
  companyDocuments,
  contractPaymentSchedules,
  contractProfessions,
  contractWorkerAssignments,
  financialRecords,
  legalCaseActivities,
  legalRecords,
  workers,
  workforceContracts,
} from "@/db/schema";
import { auditPortalAction, recordStatusChange } from "@/lib/audit";
import { emitPortalNotification } from "@/lib/portal-notifications";
import { hasPortalPermission, requirePortalApiRole } from "@/lib/portal-access";
import { jsonNoStore, rejectCrossSiteRequest } from "@/lib/security";

const transitions: Record<string, string[]> = {
  draft: ["internal_review", "approved", "cancelled"],
  internal_review: ["draft", "legal_review", "approved", "cancelled"],
  legal_review: ["internal_review", "approved", "cancelled"],
  approved: ["sent", "active", "cancelled"],
  sent: ["signed", "cancelled"],
  signed: ["active", "cancelled"],
  active: ["suspended", "terminated", "expired", "superseded"],
  suspended: ["active", "terminated"],
  expired: ["superseded"],
  terminated: [],
  cancelled: [],
  superseded: [],
};

type CancellationRequest = {
  type: "contract-cancellation";
  requestedStatus: "cancelled" | "terminated";
  reason: string;
  requestedBy: string;
  requestedAt: string;
  contractStatusAtReferral: string;
};

type PortalActor = NonNullable<Awaited<ReturnType<typeof requirePortalApiRole>>>;

function clean(value: unknown, length: number) {
  return typeof value === "string" ? value.trim().slice(0, length) : "";
}

function isSystemApprover(access: PortalActor) {
  return access.role === "admin" || access.functionalRoles.some((role) => role === "system_owner" || role === "system_admin");
}

function readCancellationRequest(fileSnapshotJson: string | null): CancellationRequest | null {
  if (!fileSnapshotJson) return null;
  try {
    const snapshot = JSON.parse(fileSnapshotJson) as { request?: Partial<CancellationRequest> };
    const request = snapshot.request;
    if (
      request?.type === "contract-cancellation" &&
      (request.requestedStatus === "cancelled" || request.requestedStatus === "terminated") &&
      typeof request.reason === "string" &&
      typeof request.requestedBy === "string" &&
      typeof request.requestedAt === "string" &&
      typeof request.contractStatusAtReferral === "string"
    ) {
      return request as CancellationRequest;
    }
  } catch {
    return null;
  }
  return null;
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (rejectCrossSiteRequest(request)) return jsonNoStore({ error: "مصدر الطلب غير مسموح" }, { status: 403 });

  const access = await requirePortalApiRole(["admin", "manager", "employee"]);
  if (!access) return jsonNoStore({ error: "غير مصرح" }, { status: 403 });

  try {
    const id = Number((await context.params).id);
    const payload = (await request.json()) as Record<string, unknown>;
    const action = clean(payload.action, 50);
    const reason = clean(payload.reason, 1000);

    if (!Number.isSafeInteger(id) || id < 1) return jsonNoStore({ error: "رقم العقد غير صحيح" }, { status: 400 });

    const db = getDb();
    const contract = await db.query.workforceContracts.findFirst({ where: eq(workforceContracts.id, id) });
    if (!contract) return jsonNoStore({ error: "العقد غير موجود" }, { status: 404 });

    if (action === "request-cancellation") {
      const canWriteWorkforce = await hasPortalPermission(access, "workforce", "write");
      if (!canWriteWorkforce || !isSystemApprover(access)) {
        return jsonNoStore({ error: "طلب إلغاء العقد متاح للمالك أو مشرف النظام فقط" }, { status: 403 });
      }
      if (["expired", "terminated", "cancelled", "superseded"].includes(contract.status)) {
        return jsonNoStore({ error: "لا يمكن طلب إلغاء عقد منتهٍ أو ملغى" }, { status: 409 });
      }
      if (reason.length < 10) return jsonNoStore({ error: "اكتب سببًا واضحًا لا يقل عن 10 أحرف" }, { status: 400 });

      const expectedStatus: "cancelled" | "terminated" = ["active", "suspended"].includes(contract.status) ? "terminated" : "cancelled";
      const requestedStatus = (clean(payload.requestedStatus, 30) || expectedStatus) as "cancelled" | "terminated";
      if (requestedStatus !== expectedStatus) {
        return jsonNoStore({ error: `الإجراء الصحيح لحالة العقد الحالية هو ${expectedStatus === "terminated" ? "الإنهاء" : "الإلغاء"}` }, { status: 409 });
      }

      const reviewingCases = await db
        .select()
        .from(legalRecords)
        .where(and(eq(legalRecords.contractId, id), eq(legalRecords.status, "reviewing")));
      const pendingCase = reviewingCases.find((item) => Boolean(readCancellationRequest(item.fileSnapshotJson)));
      if (pendingCase) {
        return jsonNoStore(
          { error: "يوجد طلب إلغاء لهذا العقد قيد المراجعة القانونية", legalRecordId: pendingCase.id },
          { status: 409 },
        );
      }

      const now = new Date().toISOString();
      const [client, documents, payments, finances, professions, assignments] = await Promise.all([
        contract.clientId ? db.query.clients.findFirst({ where: eq(clients.id, contract.clientId) }) : Promise.resolve(null),
        db.select().from(companyDocuments).where(or(eq(companyDocuments.id, contract.documentId), eq(companyDocuments.counterparty, contract.clientName))),
        db.select().from(contractPaymentSchedules).where(eq(contractPaymentSchedules.contractId, id)),
        db.select().from(financialRecords).where(eq(financialRecords.contractId, id)),
        db.select().from(contractProfessions).where(eq(contractProfessions.contractId, id)),
        db.select().from(contractWorkerAssignments).where(eq(contractWorkerAssignments.contractId, id)),
      ]);
      const assignedWorkerIds = [...new Set(assignments.map((item) => item.workerId))];
      const linkedWorkers = assignedWorkerIds.length
        ? await db.select().from(workers).where(inArray(workers.id, assignedWorkerIds))
        : [];
      const cancellationRequest: CancellationRequest = {
        type: "contract-cancellation",
        requestedStatus,
        reason,
        requestedBy: access.user.email,
        requestedAt: now,
        contractStatusAtReferral: contract.status,
      };
      const caseSnapshot = {
        schemaVersion: 2,
        capturedAt: now,
        request: cancellationRequest,
        cancellation: { status: requestedStatus, reason, referredBy: access.user.email },
        client,
        contract,
        documents,
        payments,
        finances,
        professions,
        assignments,
        workers: linkedWorkers,
      };
      const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
      const legalReference = `LGL-CAN-${contract.referenceCode}-${suffix}`.slice(0, 120);
      const legal = await db.transaction(async (tx) => {
        const [created] = await tx
          .insert(legalRecords)
          .values({
            referenceCode: legalReference,
            category: "case",
            title: `${requestedStatus === "terminated" ? "طلب إنهاء" : "طلب إلغاء"} العقد ${contract.referenceCode}`,
            counterparty: contract.clientName,
            clientId: contract.clientId,
            contractId: id,
            referralReason: reason,
            referredBy: access.user.email,
            referredAt: now,
            fileSnapshotJson: JSON.stringify(caseSnapshot),
            expiryDate: null,
            status: "reviewing",
          })
          .returning();
        if (!created) throw new Error("تعذر إنشاء الملف القانوني");
        await tx.insert(legalCaseActivities).values([
          {
            legalRecordId: created.id,
            activityType: "task",
            title: `مراجعة طلب ${requestedStatus === "terminated" ? "إنهاء" : "إلغاء"} العقد`,
            details: "مراجعة العقد ومرفقاته وسبب الطلب وتحديد الأثر النظامي قبل إصدار القرار.",
            priority: "critical",
            status: "open",
            assignedTo: null,
            createdBy: access.user.email,
          },
          {
            legalRecordId: created.id,
            activityType: "task",
            title: "مطابقة الرصيد المالي والالتزامات",
            details: "مراجعة الدفعات والفواتير والقيود المالية والالتزامات القائمة قبل اعتماد الإلغاء.",
            priority: "high",
            status: "open",
            assignedTo: null,
            createdBy: access.user.email,
          },
          {
            legalRecordId: created.id,
            activityType: "deadline",
            title: "إصدار القرار القانوني",
            details: "تسجيل قرار الاعتماد أو الرفض مع تسبيب واضح في الملف القانوني.",
            priority: "critical",
            status: "open",
            dueAt: new Date(Date.now() + 3 * 86_400_000).toISOString(),
            assignedTo: null,
            createdBy: access.user.email,
          },
        ]);
        return created;
      });

      await auditPortalAction({
        actorEmail: access.user.email,
        action: "contract-cancellation-referred-legal",
        entityType: "legal-record",
        entityId: legal.id,
        after: {
          ...legal,
          requestedStatus,
          snapshotCounts: {
            documents: documents.length,
            payments: payments.length,
            finances: finances.length,
            workers: linkedWorkers.length,
          },
        },
        reason,
      });
      await emitPortalNotification({
        eventType: "contract-cancellation-referred-legal",
        title: "ملف عميل كامل محال للشؤون القانونية",
        message: `${contract.referenceCode} — ${contract.clientName} — ${documents.length} مستندات، ${finances.length} سجلات مالية، ${payments.length} دفعات.`,
        severity: "critical",
        module: "legal",
        entityType: "legal-record",
        entityId: legal.id,
        actionView: "legal",
        targetDepartment: "legal",
      }).catch(() => undefined);

      return jsonNoStore({ legalRecord: legal, contract, pendingLegalDecision: true }, { status: 201 });
    }

    if (action === "legal-cancellation-decision") {
      if (!(await hasPortalPermission(access, "legal", "approve"))) {
        return jsonNoStore({ error: "قرار إلغاء العقد يتطلب صلاحية الاعتماد القانونية" }, { status: 403 });
      }
      const legalRecordId = Number(payload.legalRecordId);
      const decision = clean(payload.decision, 20);
      if (!Number.isSafeInteger(legalRecordId) || legalRecordId < 1 || !["approve", "reject"].includes(decision)) {
        return jsonNoStore({ error: "بيانات القرار القانوني غير صحيحة" }, { status: 400 });
      }
      if (reason.length < 10) return jsonNoStore({ error: "اكتب تسبيبًا قانونيًا لا يقل عن 10 أحرف" }, { status: 400 });

      const matter = await db.query.legalRecords.findFirst({ where: eq(legalRecords.id, legalRecordId) });
      if (!matter || matter.contractId !== id) return jsonNoStore({ error: "ملف الإلغاء القانوني غير موجود" }, { status: 404 });
      if (matter.status !== "reviewing") return jsonNoStore({ error: "سبق إصدار قرار على هذا الطلب" }, { status: 409 });
      const cancellationRequest = readCancellationRequest(matter.fileSnapshotJson);
      if (!cancellationRequest) return jsonNoStore({ error: "الملف لا يحتوي طلب إلغاء عقد صالحًا" }, { status: 409 });

      const now = new Date().toISOString();
      if (decision === "reject") {
        const result = await db.transaction(async (tx) => {
          const [closed] = await tx
            .update(legalRecords)
            .set({ status: "closed", updatedAt: now })
            .where(and(eq(legalRecords.id, legalRecordId), eq(legalRecords.status, "reviewing")))
            .returning();
          if (!closed) throw new Error("تغيرت حالة الملف قبل حفظ القرار");
          await tx
            .update(legalCaseActivities)
            .set({ status: "cancelled", completedAt: now, updatedAt: now })
            .where(
              and(
                eq(legalCaseActivities.legalRecordId, legalRecordId),
                inArray(legalCaseActivities.status, ["open", "in_progress"]),
              ),
            );
          const [activity] = await tx
            .insert(legalCaseActivities)
            .values({
              legalRecordId,
              activityType: "note",
              title: `رفض طلب ${cancellationRequest.requestedStatus === "terminated" ? "إنهاء" : "إلغاء"} العقد`,
              details: reason,
              priority: "high",
              status: "completed",
              completedAt: now,
              assignedTo: access.user.email,
              createdBy: access.user.email,
              updatedAt: now,
            })
            .returning();
          return { closed, activity };
        });
        await auditPortalAction({
          actorEmail: access.user.email,
          action: "contract-cancellation-rejected-by-legal",
          entityType: "legal-record",
          entityId: legalRecordId,
          before: matter,
          after: result.closed,
          reason,
        });
        await emitPortalNotification({
          eventType: "contract-cancellation-rejected-by-legal",
          title: "رُفض طلب إلغاء عقد",
          message: `${contract.referenceCode} — ${contract.clientName}: ${reason}`,
          severity: "warning",
          module: "workforce",
          entityType: "workforce-contract",
          entityId: id,
          actionView: "workforce",
          targetDepartment: "workforce",
        }).catch(() => undefined);
        return jsonNoStore({ legalRecord: result.closed, decision: "reject", contract });
      }

      const targetStatus = cancellationRequest.requestedStatus;
      if (!transitions[contract.status]?.includes(targetStatus)) {
        return jsonNoStore({ error: "تغيرت حالة العقد ولم يعد قرار الإلغاء متوافقًا معها" }, { status: 409 });
      }
      const finalReason = `${cancellationRequest.reason}\nقرار القانونية: ${reason}`.slice(0, 2000);
      const result = await db.transaction(async (tx) => {
        const [updated] = await tx
          .update(workforceContracts)
          .set({
            status: targetStatus,
            cancellationReason: finalReason,
            ...(targetStatus === "terminated" ? { terminatedAt: now } : {}),
            updatedAt: now,
          })
          .where(and(eq(workforceContracts.id, id), eq(workforceContracts.status, contract.status)))
          .returning();
        if (!updated) throw new Error("تغيرت حالة العقد قبل حفظ القرار");

        await tx
          .update(contractPaymentSchedules)
          .set({ status: "cancelled", updatedAt: now })
          .where(
            and(
              eq(contractPaymentSchedules.contractId, id),
              inArray(contractPaymentSchedules.status, ["scheduled", "due", "referred"]),
            ),
          );
        const assignments = await tx
          .select()
          .from(contractWorkerAssignments)
          .where(
            and(
              eq(contractWorkerAssignments.contractId, id),
              inArray(contractWorkerAssignments.status, ["planned", "active"]),
            ),
          );
        let releasedAssignments = 0;
        for (const assignment of assignments) {
          const [released] = await tx
            .update(contractWorkerAssignments)
            .set({ status: "released", releasedAt: now })
            .where(
              and(
                eq(contractWorkerAssignments.id, assignment.id),
                inArray(contractWorkerAssignments.status, ["planned", "active"]),
              ),
            )
            .returning();
          if (!released) continue;
          releasedAssignments += 1;
          if (assignment.status === "active") {
            await tx
              .update(workers)
              .set({
                status: "available",
                beneficiaryName: null,
                clientSite: "غير مسند",
                assignmentStartDate: null,
                updatedAt: now,
              })
              .where(
                and(
                  eq(workers.id, assignment.workerId),
                  eq(workers.status, "assigned"),
                  eq(workers.beneficiaryName, contract.clientName),
                ),
              );
          }
        }
        const [closed] = await tx
          .update(legalRecords)
          .set({ status: "closed", updatedAt: now })
          .where(and(eq(legalRecords.id, legalRecordId), eq(legalRecords.status, "reviewing")))
          .returning();
        if (!closed) throw new Error("تغيرت حالة الملف القانوني قبل حفظ القرار");
        await tx
          .update(legalCaseActivities)
          .set({ status: "cancelled", completedAt: now, updatedAt: now })
          .where(
            and(
              eq(legalCaseActivities.legalRecordId, legalRecordId),
              inArray(legalCaseActivities.status, ["open", "in_progress"]),
            ),
          );
        const [activity] = await tx
          .insert(legalCaseActivities)
          .values({
            legalRecordId,
            activityType: "settlement",
            title: `اعتماد ${targetStatus === "terminated" ? "إنهاء" : "إلغاء"} العقد`,
            details: reason,
            priority: "critical",
            status: "completed",
            completedAt: now,
            assignedTo: access.user.email,
            createdBy: access.user.email,
            updatedAt: now,
          })
          .returning();
        return { updated, closed, activity, releasedAssignments };
      });

      const correlationId = await recordStatusChange({
        entityType: "workforce-contract",
        entityId: id,
        fromStatus: contract.status,
        toStatus: targetStatus,
        reason: finalReason,
        actorEmail: access.user.email,
      });
      await auditPortalAction({
        actorEmail: access.user.email,
        action: "contract-cancellation-approved-by-legal",
        entityType: "workforce-contract",
        entityId: id,
        before: contract,
        after: result.updated,
        reason,
        correlationId,
      });
      await auditPortalAction({
        actorEmail: access.user.email,
        action: "legal-cancellation-case-closed",
        entityType: "legal-record",
        entityId: legalRecordId,
        before: matter,
        after: result.closed,
        reason,
        correlationId,
      });
      await emitPortalNotification({
        eventType: "contract-cancellation-approved-by-legal",
        title: targetStatus === "terminated" ? "اعتمدت القانونية إنهاء العقد" : "اعتمدت القانونية إلغاء العقد",
        message: `${contract.referenceCode} — ${contract.clientName}: ${reason}`,
        severity: "critical",
        module: "workforce",
        entityType: "workforce-contract",
        entityId: id,
        actionView: "workforce",
        targetDepartment: "workforce",
      }).catch(() => undefined);
      return jsonNoStore({ contract: result.updated, legalRecord: result.closed, decision: "approve" });
    }

    if (!(await hasPortalPermission(access, "workforce", "write"))) {
      return jsonNoStore({ error: "غير مصرح" }, { status: 403 });
    }

    const reviewingCancellationCases = await db
      .select({ fileSnapshotJson: legalRecords.fileSnapshotJson })
      .from(legalRecords)
      .where(and(eq(legalRecords.contractId, id), eq(legalRecords.status, "reviewing")));
    if (reviewingCancellationCases.some((item) => Boolean(readCancellationRequest(item.fileSnapshotJson)))) {
      return jsonNoStore(
        { error: "لا يمكن تغيير حالة العقد أثناء مراجعة طلب إلغائه لدى الشؤون القانونية" },
        { status: 409 },
      );
    }

    const status = clean(payload.status, 30);
    if (["cancelled", "terminated"].includes(status)) {
      return jsonNoStore({ error: "يجب إحالة طلب الإلغاء إلى القانونية أولًا ثم إصدار القرار من لوحة القانونية" }, { status: 409 });
    }
    if (!transitions[contract.status]?.includes(status)) {
      return jsonNoStore({ error: "انتقال حالة العقد غير مسموح" }, { status: 409 });
    }
    if (status === "suspended" && reason.length < 10) {
      return jsonNoStore({ error: "اكتب سببًا واضحًا لا يقل عن 10 أحرف" }, { status: 400 });
    }

    const canApprove = isSystemApprover(access);
    if (status === "approved" && !canApprove) {
      return jsonNoStore({ error: "اعتماد العقد متاح للمالك أو مشرف النظام فقط" }, { status: 403 });
    }
    if (["signed", "superseded"].includes(status) && !canApprove) {
      return jsonNoStore({ error: "هذه المرحلة تتطلب صلاحية المالك أو مشرف النظام" }, { status: 403 });
    }
    if (status === "active" && !contract.approvedBy) {
      return jsonNoStore({ error: "لا يمكن تفعيل العقد قبل اعتماده من المالك أو مشرف النظام" }, { status: 409 });
    }

    const plannedAssignments =
      status === "active"
        ? await db
            .select()
            .from(contractWorkerAssignments)
            .where(
              and(
                eq(contractWorkerAssignments.contractId, id),
                eq(contractWorkerAssignments.status, "planned"),
              ),
            )
        : [];
    if (status === "active") {
      for (const assignment of plannedAssignments) {
        const worker = await db.query.workers.findFirst({ where: eq(workers.id, assignment.workerId) });
        if (!worker || worker.status !== "available") {
          return jsonNoStore(
            { error: `تعذّر تفعيل العقد لأن العامل رقم ${assignment.workerId} لم يعد متاحًا` },
            { status: 409 },
          );
        }
      }
    }

    const now = new Date().toISOString();
    const [updated] = await db
      .update(workforceContracts)
      .set({
        status,
        ...(status === "approved" ? { approvedBy: access.user.email, approvedAt: now } : {}),
        ...(status === "signed" ? { signedAt: now } : {}),
        ...(status === "active" ? { effectiveAt: now, suspendedAt: null } : {}),
        ...(status === "suspended" ? { suspendedAt: now, cancellationReason: reason } : {}),
        updatedAt: now,
      })
      .where(and(eq(workforceContracts.id, id), eq(workforceContracts.status, contract.status)))
      .returning();
    if (!updated) return jsonNoStore({ error: "تغيرت حالة العقد قبل حفظ القرار" }, { status: 409 });

    if (status === "active") {
      try {
        for (const assignment of plannedAssignments) {
          await db
            .update(contractWorkerAssignments)
            .set({ status: "active", assignedAt: now })
            .where(
              and(
                eq(contractWorkerAssignments.id, assignment.id),
                eq(contractWorkerAssignments.status, "planned"),
              ),
            );
          const assignedWorkers = await db
            .update(workers)
            .set({
              status: "assigned",
              beneficiaryName: contract.clientName,
              clientSite: contract.workSite,
              assignmentStartDate: contract.startDate,
              updatedAt: now,
            })
            .where(and(eq(workers.id, assignment.workerId), eq(workers.status, "available")))
            .returning();
          if (!assignedWorkers.length) throw new Error(`تعارض إسناد العامل رقم ${assignment.workerId}`);
        }
      } catch (error) {
        await db
          .update(workforceContracts)
          .set({ status: contract.status, effectiveAt: null, updatedAt: now })
          .where(eq(workforceContracts.id, id))
          .catch(() => undefined);
        for (const assignment of plannedAssignments) {
          await db
            .update(contractWorkerAssignments)
            .set({ status: "planned" })
            .where(eq(contractWorkerAssignments.id, assignment.id))
            .catch(() => undefined);
          await db
            .update(workers)
            .set({
              status: "available",
              beneficiaryName: null,
              clientSite: "غير مسند",
              assignmentStartDate: null,
              updatedAt: now,
            })
            .where(
              and(
                eq(workers.id, assignment.workerId),
                eq(workers.status, "assigned"),
                eq(workers.beneficiaryName, contract.clientName),
              ),
            )
            .catch(() => undefined);
        }
        throw error;
      }
    }

    const correlationId = await recordStatusChange({
      entityType: "workforce-contract",
      entityId: id,
      fromStatus: contract.status,
      toStatus: status,
      reason: reason || null,
      actorEmail: access.user.email,
    });
    await auditPortalAction({
      actorEmail: access.user.email,
      action: "workforce-contract-status-changed",
      entityType: "workforce-contract",
      entityId: id,
      before: contract,
      after: updated,
      reason: reason || null,
      correlationId,
    });
    await emitPortalNotification({
      eventType: "workforce-contract-status-changed",
      title: "تغيّرت حالة عقد عمالة",
      message: `${updated.referenceCode} — ${updated.clientName} — ${contract.status} ← ${status}.`,
      severity: status === "suspended" ? "warning" : "info",
      module: "workforce",
      entityType: "workforce-contract",
      entityId: id,
      actionView: "workforce",
      targetDepartment: "workforce",
    }).catch(() => undefined);
    return jsonNoStore({ contract: updated });
  } catch (error) {
    return jsonNoStore({ error: error instanceof Error ? error.message : "تعذّر تحديث العقد" }, { status: 400 });
  }
}
