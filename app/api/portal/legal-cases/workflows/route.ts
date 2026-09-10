import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import {
  legalCaseActivities,
  legalCaseActionLog,
  legalHearings,
  legalRecords,
  legalSettlements,
  legalSubmissions,
} from "@/db/schema";
import { auditPortalAction } from "@/lib/audit";
import { emitPortalNotification } from "@/lib/portal-notifications";
import { hasPortalPermission, requirePortalApiRole } from "@/lib/portal-access";
import {
  jsonNoStore,
  readLimitedJson,
  rejectCrossSiteRequest,
} from "@/lib/security";

type Actor = NonNullable<Awaited<ReturnType<typeof requirePortalApiRole>>>;
const clean = (value: unknown, max = 2000) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";
const id = (value: unknown) => {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : 0;
};
const supervisor = (actor: Actor) =>
  actor.role === "admin" ||
  actor.functionalRoles.some((role) =>
    ["system_owner", "system_admin", "legal_supervisor"].includes(role),
  );
const caseManager = (actor: Actor) =>
  supervisor(actor) || actor.functionalRoles.includes("lawyer");
const owner = (actor: Actor) =>
  actor.role === "admin" ||
  actor.functionalRoles.some((role) =>
    ["system_owner", "system_admin"].includes(role),
  );
const actorRole = (actor: Actor) =>
  actor.functionalRoles.includes("legal_supervisor")
    ? "legal_supervisor"
    : actor.functionalRoles.includes("lawyer")
      ? "lawyer"
      : actor.functionalRoles.includes("legal_lawyer")
        ? "legal_lawyer"
        : actor.role === "admin"
          ? "system_admin"
          : "legal_staff";
async function access(write = false) {
  const actor = await requirePortalApiRole(["admin", "manager", "employee"]);
  return actor &&
    (await hasPortalPermission(actor, "legal", write ? "write" : "read"))
    ? actor
    : null;
}
async function matterAccess(actor: Actor, legalRecordId: number) {
  const matter = await getDb().query.legalRecords.findFirst({
    where: and(
      eq(legalRecords.id, legalRecordId),
      isNull(legalRecords.deletedAt),
    ),
  });
  return matter &&
    (caseManager(actor) ||
      matter.assignedLawyerEmail?.toLowerCase() ===
        actor.user.email.toLowerCase())
    ? matter
    : null;
}

export async function GET() {
  const actor = await access();
  if (!actor) return jsonNoStore({ error: "غير مصرح" }, { status: 403 });
  const db = getDb(),
    cases = caseManager(actor)
      ? await db
          .select({ id: legalRecords.id })
          .from(legalRecords)
          .where(isNull(legalRecords.deletedAt))
      : await db
          .select({ id: legalRecords.id })
          .from(legalRecords)
          .where(
            and(
              eq(
                legalRecords.assignedLawyerEmail,
                actor.user.email.toLowerCase(),
              ),
              isNull(legalRecords.deletedAt),
            ),
          ),
    ids = cases.map((row) => row.id),
    visible = ids.length ? ids : [-1];
  const [hearings, submissions, settlements] = await Promise.all([
    db
      .select()
      .from(legalHearings)
      .where(inArray(legalHearings.legalRecordId, visible))
      .orderBy(asc(legalHearings.scheduledAt)),
    db
      .select()
      .from(legalSubmissions)
      .where(inArray(legalSubmissions.legalRecordId, visible))
      .orderBy(asc(legalSubmissions.createdAt)),
    db
      .select()
      .from(legalSettlements)
      .where(inArray(legalSettlements.legalRecordId, visible))
      .orderBy(asc(legalSettlements.createdAt)),
  ]);
  return jsonNoStore({
    hearings,
    submissions,
    settlements,
    canSupervise: supervisor(actor),
    canApproveSettlement: owner(actor),
  });
}

export async function POST(request: Request) {
  if (rejectCrossSiteRequest(request))
    return jsonNoStore({ error: "مصدر الطلب غير مسموح" }, { status: 403 });
  const actor = await access(true);
  if (!actor) return jsonNoStore({ error: "غير مصرح" }, { status: 403 });
  const parsed = await readLimitedJson(request, 30000);
  if (!parsed.ok) return parsed.response;
  const body = parsed.value as Record<string, unknown>,
    action = clean(body.action, 40),
    legalRecordId = id(body.legalRecordId),
    matter = await matterAccess(actor, legalRecordId);
  if (!matter)
    return jsonNoStore(
      { error: "القضية غير موجودة أو غير مسندة إليك" },
      { status: 403 },
    );
  const db = getDb(),
    now = new Date().toISOString();
  if (action === "hearing") {
    const hearingNumber = clean(body.hearingNumber, 80),
      scheduledAt = clean(body.scheduledAt, 40),
      nextHearingAt = clean(body.nextHearingAt, 40) || null,
      status = clean(body.status, 30) || "scheduled";
    if (
      !hearingNumber ||
      Number.isNaN(Date.parse(scheduledAt)) ||
      (nextHearingAt && Number.isNaN(Date.parse(nextHearingAt))) ||
      !["scheduled", "held", "postponed", "cancelled"].includes(status)
    )
      return jsonNoStore(
        { error: "رقم الجلسة وموعدها وحالتها يجب أن تكون صحيحة" },
        { status: 400 },
      );
    const [row] = await db
      .insert(legalHearings)
      .values({
        legalRecordId,
        hearingNumber,
        scheduledAt,
        courtName: clean(body.courtName, 180) || matter.courtName,
        circuitName: clean(body.circuitName, 180) || matter.circuitName,
        attendeesJson: JSON.stringify(
          clean(body.attendees, 2000).split("\n").filter(Boolean),
        ),
        requestsJson: JSON.stringify(
          clean(body.requests, 5000).split("\n").filter(Boolean),
        ),
        decisionText: clean(body.decisionText, 5000) || null,
        nextHearingAt,
        status,
        createdBy: actor.user.email,
        updatedAt: now,
      })
      .returning();
    await db.insert(legalCaseActivities).values({
      legalRecordId,
      activityType: "hearing",
      title: `جلسة ${hearingNumber}`,
      details: row.decisionText,
      priority: "high",
      status: row.status === "held" ? "completed" : "open",
      dueAt: scheduledAt,
      assignedTo: matter.assignedLawyerEmail,
      createdBy: actor.user.email,
      updatedAt: now,
    });
    await auditPortalAction({
      actorEmail: actor.user.email,
      action: "legal-hearing-created",
      entityType: "legal-hearing",
      entityId: row.id,
      after: row,
    });
    await db.insert(legalCaseActionLog).values({
      legalRecordId,
      action: "created",
      details: `إضافة جلسة ${hearingNumber} في ${scheduledAt}`,
      actorEmail: actor.user.email,
      actorRole: actorRole(actor),
    });
    await emitPortalNotification({
      eventType: "legal-hearing-created",
      title: "أضيفت جلسة إلى ملف قانوني",
      message: `${matter.referenceCode} — جلسة ${hearingNumber} في ${scheduledAt}.`,
      severity: "warning",
      module: "legal",
      entityType: "legal-record",
      entityId: legalRecordId,
      actionView: "legal",
      targetDepartment: "legal",
      targetEmail: matter.assignedLawyerEmail,
    }).catch(() => undefined);
    return jsonNoStore({ hearing: row }, { status: 201 });
  }
  if (action === "submission") {
    const title = clean(body.title, 180),
      submissionType = clean(body.submissionType, 80),
      parentId = id(body.parentId) || null;
    if (title.length < 3 || !submissionType)
      return jsonNoStore(
        { error: "بيانات المذكرة غير مكتملة" },
        { status: 400 },
      );
    let versionNumber = 1;
    if (parentId) {
      const parent = await db.query.legalSubmissions.findFirst({
        where: and(
          eq(legalSubmissions.id, parentId),
          eq(legalSubmissions.legalRecordId, legalRecordId),
        ),
      });
      if (!parent)
        return jsonNoStore(
          { error: "الإصدار السابق غير موجود" },
          { status: 404 },
        );
      versionNumber = parent.versionNumber + 1;
      await db
        .update(legalSubmissions)
        .set({ status: "superseded", updatedAt: now })
        .where(eq(legalSubmissions.id, parent.id));
    }
    const [row] = await db
      .insert(legalSubmissions)
      .values({
        legalRecordId,
        submissionType,
        title,
        versionNumber,
        status: "draft",
        content: clean(body.content, 20000) || null,
        parentId,
        createdBy: actor.user.email,
        updatedAt: now,
      })
      .returning();
    await auditPortalAction({
      actorEmail: actor.user.email,
      action: "legal-submission-created",
      entityType: "legal-submission",
      entityId: row.id,
      after: row,
    });
    await db.insert(legalCaseActionLog).values({
      legalRecordId,
      action: "created",
      details: `إضافة مسودة ${submissionType}: ${title}`,
      actorEmail: actor.user.email,
      actorRole: actorRole(actor),
    });
    await emitPortalNotification({
      eventType: "legal-submission-created",
      title: "أضيفت مسودة مذكرة قانونية",
      message: `${matter.referenceCode} — ${title} — الإصدار ${versionNumber}.`,
      severity: "info",
      module: "legal",
      entityType: "legal-record",
      entityId: legalRecordId,
      actionView: "legal",
      targetDepartment: "legal",
      targetEmail: matter.assignedLawyerEmail,
    }).catch(() => undefined);
    return jsonNoStore({ submission: row }, { status: 201 });
  }
  if (action === "settlement") {
    const amountHalalas = Math.round(Number(body.amount || 0) * 100),
      schedule = clean(body.paymentSchedule, 10000),
      concessions = clean(body.concessions, 5000);
    if (!Number.isSafeInteger(amountHalalas) || amountHalalas < 1)
      return jsonNoStore({ error: "قيمة التسوية غير صحيحة" }, { status: 400 });
    const [row] = await db
      .insert(legalSettlements)
      .values({
        legalRecordId,
        amountHalalas,
        concessions: concessions || null,
        paymentScheduleJson: JSON.stringify(
          schedule.split("\n").filter(Boolean),
        ),
        status: "pending_approval",
        requestedBy: actor.user.email,
        updatedAt: now,
      })
      .returning();
    await auditPortalAction({
      actorEmail: actor.user.email,
      action: "legal-settlement-requested",
      entityType: "legal-settlement",
      entityId: row.id,
      after: row,
    });
    await db.insert(legalCaseActionLog).values({
      legalRecordId,
      action: "created",
      details: `إنشاء طلب تسوية بقيمة ${(amountHalalas / 100).toFixed(2)} ر.س.`,
      actorEmail: actor.user.email,
      actorRole: actorRole(actor),
    });
    await emitPortalNotification({
      eventType: "legal-settlement-requested",
      title: "تسوية قانونية بانتظار الاعتماد",
      message: `${matter.referenceCode} — ${(amountHalalas / 100).toFixed(2)} ر.س.`,
      severity: "warning",
      module: "legal",
      entityType: "legal-record",
      entityId: legalRecordId,
      actionView: "legal",
      targetRole: "admin",
    }).catch(() => undefined);
    return jsonNoStore({ settlement: row }, { status: 201 });
  }
  return jsonNoStore({ error: "العملية غير مدعومة" }, { status: 400 });
}

export async function PATCH(request: Request) {
  if (rejectCrossSiteRequest(request))
    return jsonNoStore({ error: "مصدر الطلب غير مسموح" }, { status: 403 });
  const actor = await access(true);
  if (!actor) return jsonNoStore({ error: "غير مصرح" }, { status: 403 });
  const parsed = await readLimitedJson(request, 10000);
  if (!parsed.ok) return parsed.response;
  const body = parsed.value as Record<string, unknown>,
    action = clean(body.action, 40),
    db = getDb(),
    now = new Date().toISOString();
  if (action === "hearing-update") {
    const hearingId = id(body.hearingId);
    const before = await db.query.legalHearings.findFirst({
      where: eq(legalHearings.id, hearingId),
    });
    if (!before || !(await matterAccess(actor, before.legalRecordId)))
      return jsonNoStore({ error: "الجلسة غير متاحة" }, { status: 404 });
    if (["held", "cancelled"].includes(before.status))
      return jsonNoStore(
        { error: "لا يمكن تعديل جلسة منعقدة أو ملغاة" },
        { status: 409 },
      );
    const hearingNumber = clean(body.hearingNumber, 80),
      scheduledAt = clean(body.scheduledAt, 40),
      nextHearingAt = clean(body.nextHearingAt, 40) || null,
      status = clean(body.status, 30);
    if (
      !hearingNumber ||
      Number.isNaN(Date.parse(scheduledAt)) ||
      (nextHearingAt && Number.isNaN(Date.parse(nextHearingAt))) ||
      !["scheduled", "postponed"].includes(status)
    )
      return jsonNoStore(
        { error: "بيانات الجلسة غير مكتملة أو غير صحيحة" },
        { status: 400 },
      );
    const [saved] = await db
      .update(legalHearings)
      .set({
        hearingNumber,
        scheduledAt,
        courtName: clean(body.courtName, 180) || null,
        circuitName: clean(body.circuitName, 180) || null,
        attendeesJson: JSON.stringify(
          clean(body.attendees, 2000).split("\n").filter(Boolean),
        ),
        requestsJson: JSON.stringify(
          clean(body.requests, 5000).split("\n").filter(Boolean),
        ),
        decisionText: clean(body.decisionText, 5000) || null,
        nextHearingAt,
        status,
        updatedAt: now,
      })
      .where(
        and(
          eq(legalHearings.id, hearingId),
          eq(legalHearings.updatedAt, before.updatedAt),
        ),
      )
      .returning();
    if (!saved)
      return jsonNoStore(
        { error: "تغيرت الجلسة قبل حفظ التعديل" },
        { status: 409 },
      );
    await auditPortalAction({
      actorEmail: actor.user.email,
      action: "legal-hearing-updated",
      entityType: "legal-hearing",
      entityId: hearingId,
      before,
      after: saved,
    });
    await db.insert(legalCaseActionLog).values({
      legalRecordId: before.legalRecordId,
      action: "updated",
      details: `تعديل جلسة ${hearingNumber} إلى ${scheduledAt}`,
      actorEmail: actor.user.email,
      actorRole: actorRole(actor),
    });
    await emitPortalNotification({
      eventType: "legal-hearing-updated",
      title: "عُدّلت بيانات جلسة قانونية",
      message: `الملف #${before.legalRecordId} — جلسة ${hearingNumber} — ${scheduledAt}.`,
      severity: "info",
      module: "legal",
      entityType: "legal-record",
      entityId: before.legalRecordId,
      actionView: "legal",
      targetDepartment: "legal",
    }).catch(() => undefined);
    return jsonNoStore({ hearing: saved });
  }
  if (action === "submission-update") {
    const submissionId = id(body.submissionId);
    const before = await db.query.legalSubmissions.findFirst({
      where: eq(legalSubmissions.id, submissionId),
    });
    if (!before || !(await matterAccess(actor, before.legalRecordId)))
      return jsonNoStore({ error: "المذكرة غير متاحة" }, { status: 404 });
    if (!["draft", "review"].includes(before.status))
      return jsonNoStore(
        { error: "لا يمكن تعديل مذكرة معتمدة أو صادرة" },
        { status: 409 },
      );
    const title = clean(body.title, 180),
      submissionType = clean(body.submissionType, 80);
    if (title.length < 3 || !submissionType)
      return jsonNoStore(
        { error: "بيانات المذكرة غير مكتملة" },
        { status: 400 },
      );
    const [saved] = await db
      .update(legalSubmissions)
      .set({
        title,
        submissionType,
        content: clean(body.content, 20000) || null,
        status: "draft",
        reviewedBy: null,
        approvedBy: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(legalSubmissions.id, submissionId),
          eq(legalSubmissions.updatedAt, before.updatedAt),
        ),
      )
      .returning();
    if (!saved)
      return jsonNoStore(
        { error: "تغيرت المذكرة قبل حفظ التعديل" },
        { status: 409 },
      );
    await auditPortalAction({
      actorEmail: actor.user.email,
      action: "legal-submission-updated",
      entityType: "legal-submission",
      entityId: submissionId,
      before,
      after: saved,
    });
    await db.insert(legalCaseActionLog).values({
      legalRecordId: before.legalRecordId,
      action: "updated",
      details: `تعديل مسودة المذكرة: ${title}`,
      actorEmail: actor.user.email,
      actorRole: actorRole(actor),
    });
    await emitPortalNotification({
      eventType: "legal-submission-updated",
      title: "عُدّلت مسودة مذكرة قانونية",
      message: `الملف #${before.legalRecordId} — ${title}.`,
      severity: "info",
      module: "legal",
      entityType: "legal-record",
      entityId: before.legalRecordId,
      actionView: "legal",
      targetDepartment: "legal",
    }).catch(() => undefined);
    return jsonNoStore({ submission: saved });
  }
  if (action === "settlement-update") {
    const settlementId = id(body.settlementId);
    const before = await db.query.legalSettlements.findFirst({
      where: eq(legalSettlements.id, settlementId),
    });
    if (!before || !(await matterAccess(actor, before.legalRecordId)))
      return jsonNoStore({ error: "التسوية غير متاحة" }, { status: 404 });
    if (!["draft", "pending_approval"].includes(before.status))
      return jsonNoStore(
        { error: "لا يمكن تعديل تسوية صدر قرار بشأنها" },
        { status: 409 },
      );
    if (before.requestedBy !== actor.user.email && !caseManager(actor))
      return jsonNoStore(
        { error: "لا يمكن تعديل تسوية أنشأها مستخدم آخر" },
        { status: 403 },
      );
    const amountHalalas = Math.round(Number(body.amount || 0) * 100),
      schedule = clean(body.paymentSchedule, 10000),
      concessions = clean(body.concessions, 5000);
    if (!Number.isSafeInteger(amountHalalas) || amountHalalas < 1)
      return jsonNoStore({ error: "قيمة التسوية غير صحيحة" }, { status: 400 });
    const [saved] = await db
      .update(legalSettlements)
      .set({
        amountHalalas,
        concessions: concessions || null,
        paymentScheduleJson: JSON.stringify(
          schedule.split("\n").filter(Boolean),
        ),
        status: "pending_approval",
        approvedBy: null,
        approvedAt: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(legalSettlements.id, settlementId),
          eq(legalSettlements.updatedAt, before.updatedAt),
        ),
      )
      .returning();
    if (!saved)
      return jsonNoStore(
        { error: "تغيرت التسوية قبل حفظ التعديل" },
        { status: 409 },
      );
    await auditPortalAction({
      actorEmail: actor.user.email,
      action: "legal-settlement-updated",
      entityType: "legal-settlement",
      entityId: settlementId,
      before,
      after: saved,
    });
    await db.insert(legalCaseActionLog).values({
      legalRecordId: before.legalRecordId,
      action: "updated",
      details: `تعديل طلب التسوية وإعادته للاعتماد بقيمة ${(amountHalalas / 100).toFixed(2)} ر.س.`,
      actorEmail: actor.user.email,
      actorRole: actorRole(actor),
    });
    await emitPortalNotification({
      eventType: "legal-settlement-updated",
      title: "عُدّلت تسوية قانونية وتنتظر الاعتماد",
      message: `الملف #${before.legalRecordId} — ${(amountHalalas / 100).toFixed(2)} ر.س.`,
      severity: "warning",
      module: "legal",
      entityType: "legal-record",
      entityId: before.legalRecordId,
      actionView: "legal",
      targetRole: "admin",
    }).catch(() => undefined);
    return jsonNoStore({ settlement: saved });
  }
  if (action === "submission-status") {
    const submissionId = id(body.submissionId),
      status = clean(body.status, 30),
      row = await db.query.legalSubmissions.findFirst({
        where: eq(legalSubmissions.id, submissionId),
      });
    if (!row || !(await matterAccess(actor, row.legalRecordId)))
      return jsonNoStore({ error: "المذكرة غير متاحة" }, { status: 404 });
    if (
      !["review", "approved", "issued"].includes(status) ||
      !(
        (row.status === "draft" && status === "review") ||
        (row.status === "review" && status === "approved") ||
        (row.status === "approved" && status === "issued")
      ) ||
      (status !== "review" && !supervisor(actor))
    )
      return jsonNoStore(
        { error: "انتقال حالة المذكرة غير مصرح" },
        { status: 403 },
      );
    const [saved] = await db
      .update(legalSubmissions)
      .set({
        status,
        reviewedBy: status === "review" ? actor.user.email : row.reviewedBy,
        approvedBy: ["approved", "issued"].includes(status)
          ? actor.user.email
          : row.approvedBy,
        updatedAt: now,
      })
      .where(
        and(
          eq(legalSubmissions.id, row.id),
          eq(legalSubmissions.status, row.status),
        ),
      )
      .returning();
    if (!saved)
      return jsonNoStore(
        { error: "تغيرت حالة المذكرة قبل حفظ القرار" },
        { status: 409 },
      );
    await auditPortalAction({
      actorEmail: actor.user.email,
      action: "legal-submission-status-updated",
      entityType: "legal-submission",
      entityId: row.id,
      before: row,
      after: saved,
    });
    await db.insert(legalCaseActionLog).values({
      legalRecordId: row.legalRecordId,
      action: "status_changed",
      fromStatus: row.status,
      toStatus: status,
      details: `تغيير حالة المذكرة «${row.title}» من ${row.status} إلى ${status}`,
      actorEmail: actor.user.email,
      actorRole: actorRole(actor),
    });
    await emitPortalNotification({
      eventType: "legal-submission-status-updated",
      title: "تغيّرت حالة مذكرة قانونية",
      message: `الملف #${row.legalRecordId} — ${row.title}: ${row.status} ← ${status}.`,
      severity: status === "issued" ? "success" : "info",
      module: "legal",
      entityType: "legal-record",
      entityId: row.legalRecordId,
      actionView: "legal",
      targetDepartment: "legal",
    }).catch(() => undefined);
    return jsonNoStore({ submission: saved });
  }
  if (action === "settlement-decision") {
    if (!owner(actor))
      return jsonNoStore(
        { error: "اعتماد التسوية من صلاحيات المالك" },
        { status: 403 },
      );
    const settlementId = id(body.settlementId),
      decision = clean(body.decision, 20),
      row = await db.query.legalSettlements.findFirst({
        where: eq(legalSettlements.id, settlementId),
      });
    if (
      !row ||
      row.status !== "pending_approval" ||
      !["approved", "rejected"].includes(decision)
    )
      return jsonNoStore(
        { error: "التسوية غير متاحة للقرار" },
        { status: 409 },
      );
    const [saved] = await db
      .update(legalSettlements)
      .set({
        status: decision,
        approvedBy: actor.user.email,
        approvedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(legalSettlements.id, row.id),
          eq(legalSettlements.status, "pending_approval"),
        ),
      )
      .returning();
    if (!saved)
      return jsonNoStore(
        { error: "تم اتخاذ قرار بشأن التسوية من مستخدم آخر" },
        { status: 409 },
      );
    await auditPortalAction({
      actorEmail: actor.user.email,
      action: `legal-settlement-${decision}`,
      entityType: "legal-settlement",
      entityId: row.id,
      before: row,
      after: saved,
    });
    await db.insert(legalCaseActionLog).values({
      legalRecordId: row.legalRecordId,
      action: "status_changed",
      fromStatus: row.status,
      toStatus: decision,
      details: `${decision === "approved" ? "اعتماد" : "رفض"} التسوية القانونية`,
      actorEmail: actor.user.email,
      actorRole: actorRole(actor),
    });
    await emitPortalNotification({
      eventType: `legal-settlement-${decision}`,
      title: decision === "approved" ? "اعتُمدت تسوية قانونية" : "رُفضت تسوية قانونية",
      message: `الملف #${row.legalRecordId} — ${(row.amountHalalas / 100).toFixed(2)} ر.س.`,
      severity: decision === "approved" ? "success" : "warning",
      module: "legal",
      entityType: "legal-record",
      entityId: row.legalRecordId,
      actionView: "legal",
      targetDepartment: "legal",
      targetEmail: row.requestedBy,
    }).catch(() => undefined);
    return jsonNoStore({ settlement: saved });
  }
  return jsonNoStore({ error: "العملية غير مدعومة" }, { status: 400 });
}

export async function DELETE(request: Request) {
  if (rejectCrossSiteRequest(request))
    return jsonNoStore({ error: "مصدر الطلب غير مسموح" }, { status: 403 });
  const actor = await access(true);
  if (!actor) return jsonNoStore({ error: "غير مصرح" }, { status: 403 });
  const parsed = await readLimitedJson(request, 2500);
  if (!parsed.ok) return parsed.response;
  const body = parsed.value as Record<string, unknown>,
    entity = clean(body.entity, 30),
    reason = clean(body.reason, 1000),
    entityId = id(body.id),
    db = getDb(),
    now = new Date().toISOString();
  if (!entityId || reason.length < 5)
    return jsonNoStore(
      { error: "اكتب سبب الحذف بوضوح لحفظ الأثر القانوني" },
      { status: 400 },
    );

  if (entity === "hearing") {
    const before = await db.query.legalHearings.findFirst({
      where: eq(legalHearings.id, entityId),
    });
    if (!before || !(await matterAccess(actor, before.legalRecordId)))
      return jsonNoStore({ error: "الجلسة غير متاحة" }, { status: 404 });
    if (before.status === "held")
      return jsonNoStore(
        { error: "لا تُحذف جلسة منعقدة؛ صحح بياناتها مع إبقاء محضرها" },
        { status: 409 },
      );
    const [saved] = await db
      .update(legalHearings)
      .set({ status: "cancelled", updatedAt: now })
      .where(
        and(
          eq(legalHearings.id, entityId),
          eq(legalHearings.status, before.status),
        ),
      )
      .returning();
    if (!saved)
      return jsonNoStore({ error: "تغيرت الجلسة قبل الحذف" }, { status: 409 });
    await auditPortalAction({
      actorEmail: actor.user.email,
      action: "legal-hearing-deleted",
      entityType: "legal-hearing",
      entityId,
      before,
      after: saved,
      reason,
    });
    await db.insert(legalCaseActionLog).values({
      legalRecordId: before.legalRecordId,
      action: "deleted",
      fromStatus: before.status,
      toStatus: "cancelled",
      details: `حذف جلسة ${before.hearingNumber}: ${reason}`,
      actorEmail: actor.user.email,
      actorRole: actorRole(actor),
    });
    await emitPortalNotification({
      eventType: "legal-hearing-deleted",
      title: "أُلغيت جلسة قانونية مع حفظ أثرها",
      message: `الملف #${before.legalRecordId} — جلسة ${before.hearingNumber}.`,
      severity: "warning",
      module: "legal",
      entityType: "legal-record",
      entityId: before.legalRecordId,
      actionView: "legal",
      targetDepartment: "legal",
    }).catch(() => undefined);
    return jsonNoStore({ hearing: saved, archived: true });
  }

  if (entity === "submission") {
    const before = await db.query.legalSubmissions.findFirst({
      where: eq(legalSubmissions.id, entityId),
    });
    if (!before || !(await matterAccess(actor, before.legalRecordId)))
      return jsonNoStore({ error: "المذكرة غير متاحة" }, { status: 404 });
    if (!["draft", "review"].includes(before.status))
      return jsonNoStore(
        { error: "لا تُحذف مذكرة معتمدة أو صادرة" },
        { status: 409 },
      );
    const [saved] = await db
      .update(legalSubmissions)
      .set({ status: "superseded", updatedAt: now })
      .where(
        and(
          eq(legalSubmissions.id, entityId),
          eq(legalSubmissions.status, before.status),
        ),
      )
      .returning();
    if (!saved)
      return jsonNoStore({ error: "تغيرت المذكرة قبل الحذف" }, { status: 409 });
    await auditPortalAction({
      actorEmail: actor.user.email,
      action: "legal-submission-deleted",
      entityType: "legal-submission",
      entityId,
      before,
      after: saved,
      reason,
    });
    await db.insert(legalCaseActionLog).values({
      legalRecordId: before.legalRecordId,
      action: "deleted",
      details: `حذف مسودة المذكرة «${before.title}»: ${reason}`,
      actorEmail: actor.user.email,
      actorRole: actorRole(actor),
    });
    await emitPortalNotification({
      eventType: "legal-submission-deleted",
      title: "حُذفت مسودة مذكرة مع حفظ أثرها",
      message: `الملف #${before.legalRecordId} — ${before.title}.`,
      severity: "warning",
      module: "legal",
      entityType: "legal-record",
      entityId: before.legalRecordId,
      actionView: "legal",
      targetDepartment: "legal",
    }).catch(() => undefined);
    return jsonNoStore({ submission: saved, archived: true });
  }

  if (entity === "settlement") {
    const before = await db.query.legalSettlements.findFirst({
      where: eq(legalSettlements.id, entityId),
    });
    if (!before || !(await matterAccess(actor, before.legalRecordId)))
      return jsonNoStore({ error: "التسوية غير متاحة" }, { status: 404 });
    if (!["draft", "pending_approval"].includes(before.status))
      return jsonNoStore(
        { error: "لا تُحذف تسوية صدر قرار بشأنها" },
        { status: 409 },
      );
    if (before.requestedBy !== actor.user.email && !caseManager(actor))
      return jsonNoStore(
        { error: "لا يمكن حذف تسوية أنشأها مستخدم آخر" },
        { status: 403 },
      );
    const [saved] = await db
      .update(legalSettlements)
      .set({ status: "cancelled", updatedAt: now })
      .where(
        and(
          eq(legalSettlements.id, entityId),
          eq(legalSettlements.status, before.status),
        ),
      )
      .returning();
    if (!saved)
      return jsonNoStore({ error: "تغيرت التسوية قبل الحذف" }, { status: 409 });
    await auditPortalAction({
      actorEmail: actor.user.email,
      action: "legal-settlement-deleted",
      entityType: "legal-settlement",
      entityId,
      before,
      after: saved,
      reason,
    });
    await db.insert(legalCaseActionLog).values({
      legalRecordId: before.legalRecordId,
      action: "deleted",
      fromStatus: before.status,
      toStatus: "cancelled",
      details: `إلغاء طلب التسوية مع حفظ أثره: ${reason}`,
      actorEmail: actor.user.email,
      actorRole: actorRole(actor),
    });
    await emitPortalNotification({
      eventType: "legal-settlement-deleted",
      title: "أُلغي طلب تسوية قانونية",
      message: `الملف #${before.legalRecordId} — ${reason}.`,
      severity: "warning",
      module: "legal",
      entityType: "legal-record",
      entityId: before.legalRecordId,
      actionView: "legal",
      targetDepartment: "legal",
    }).catch(() => undefined);
    return jsonNoStore({ settlement: saved, archived: true });
  }

  return jsonNoStore({ error: "نوع السجل غير صحيح" }, { status: 400 });
}
