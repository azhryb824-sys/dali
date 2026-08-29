import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  legalCaseActivities,
  legalHearings,
  legalRecords,
  legalSettlements,
  legalSubmissions,
} from "@/db/schema";
import { auditPortalAction } from "@/lib/audit";
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
const owner = (actor: Actor) =>
  actor.role === "admin" ||
  actor.functionalRoles.some((role) =>
    ["system_owner", "system_admin"].includes(role),
  );
async function access(write = false) {
  const actor = await requirePortalApiRole(["admin", "manager", "employee"]);
  return actor &&
    (await hasPortalPermission(actor, "legal", write ? "write" : "read"))
    ? actor
    : null;
}
async function matterAccess(actor: Actor, legalRecordId: number) {
  const matter = await getDb().query.legalRecords.findFirst({
    where: eq(legalRecords.id, legalRecordId),
  });
  return matter &&
    (supervisor(actor) ||
      matter.assignedLawyerEmail?.toLowerCase() ===
        actor.user.email.toLowerCase())
    ? matter
    : null;
}

export async function GET() {
  const actor = await access();
  if (!actor) return jsonNoStore({ error: "غير مصرح" }, { status: 403 });
  const db = getDb(),
    cases = supervisor(actor)
      ? await db.select({ id: legalRecords.id }).from(legalRecords)
      : await db
          .select({ id: legalRecords.id })
          .from(legalRecords)
          .where(
            eq(
              legalRecords.assignedLawyerEmail,
              actor.user.email.toLowerCase(),
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
      scheduledAt = clean(body.scheduledAt, 40);
    if (!hearingNumber || !scheduledAt)
      return jsonNoStore(
        { error: "رقم الجلسة وموعدها إلزاميان" },
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
        nextHearingAt: clean(body.nextHearingAt, 40) || null,
        status: clean(body.status, 30) || "scheduled",
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
    await auditPortalAction({
      actorEmail: actor.user.email,
      action: `legal-settlement-${decision}`,
      entityType: "legal-settlement",
      entityId: row.id,
      before: row,
      after: saved,
    });
    return jsonNoStore({ settlement: saved });
  }
  return jsonNoStore({ error: "العملية غير مدعومة" }, { status: 400 });
}
