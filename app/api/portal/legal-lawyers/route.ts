import {
  and,
  asc,
  eq,
  gte,
  inArray,
  isNull,
  lte,
  notInArray,
  or,
} from "drizzle-orm";
import { getDb } from "@/db";
import {
  legalCaseActionLog,
  legalExternalShares,
  legalLawyers,
  legalRecords,
  portalAccessScopes,
  portalUsers,
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
const clean = (value: unknown, max = 1000) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";
const validEmail = (value: string) =>
  !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const validMobile = (value: string) =>
  !value || /^\+?[0-9\s()-]{8,20}$/.test(value);
const validDate = (value: string) =>
  !value ||
  (/^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00Z`)));

function lawyerDetails(body: Record<string, unknown>) {
  return {
    fullName: clean(body.fullName, 180),
    licenseNumber: clean(body.licenseNumber, 80) || null,
    licenseExpiryDate: clean(body.licenseExpiryDate, 10),
    mobile: clean(body.mobile, 20) || null,
    email: clean(body.email, 254).toLowerCase() || null,
    portalUserEmail:
      clean(body.portalUserEmail, 254).toLowerCase() || null,
    notes: clean(body.notes, 2000) || null,
  };
}

function validLawyerDetails(details: ReturnType<typeof lawyerDetails>) {
  return (
    details.fullName.length >= 3 &&
    validDate(details.licenseExpiryDate) &&
    Boolean(details.mobile) &&
    validMobile(details.mobile || "") &&
    validEmail(details.email || "") &&
    validEmail(details.portalUserEmail || "")
  );
}

function canManageLawyers(actor: Actor) {
  return (
    actor.role === "admin" ||
    actor.functionalRoles.some((role) =>
      [
        "system_owner",
        "system_admin",
        "legal_supervisor",
        "lawyer",
      ].includes(role),
    )
  );
}

function legalActorRole(actor: Actor) {
  if (actor.functionalRoles.includes("legal_supervisor"))
    return "legal_supervisor";
  if (actor.functionalRoles.includes("lawyer")) return "lawyer";
  if (actor.functionalRoles.includes("system_owner")) return "system_owner";
  if (actor.functionalRoles.includes("system_admin") || actor.role === "admin")
    return "system_admin";
  return "legal_staff";
}

async function access(write = false) {
  const actor = await requirePortalApiRole(["admin", "manager", "employee"]);
  if (
    !actor ||
    !(await hasPortalPermission(actor, "legal", write ? "write" : "read"))
  )
    return null;
  return actor;
}

async function validLinkedUser(email: string) {
  if (!email) return null;
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);
  const [user, scope] = await Promise.all([
    db.query.portalUsers.findFirst({
      where: and(eq(portalUsers.email, email), eq(portalUsers.status, "active")),
    }),
    db.query.portalAccessScopes.findFirst({
      where: and(
        eq(portalAccessScopes.userEmail, email),
        eq(portalAccessScopes.active, true),
        inArray(portalAccessScopes.functionalRole, [
          "lawyer",
          "legal_supervisor",
        ]),
        or(
          isNull(portalAccessScopes.validFrom),
          lte(portalAccessScopes.validFrom, today),
        ),
        or(
          isNull(portalAccessScopes.validUntil),
          gte(portalAccessScopes.validUntil, today),
        ),
      ),
    }),
  ]);
  return user && scope ? user : null;
}

export async function GET() {
  const actor = await access();
  if (!actor) return jsonNoStore({ error: "غير مصرح" }, { status: 403 });
  const db = getDb();
  const lawyers = await db
    .select()
    .from(legalLawyers)
    .orderBy(asc(legalLawyers.status), asc(legalLawyers.fullName));
  if (!canManageLawyers(actor))
    return jsonNoStore({ lawyers, userCandidates: [], canManage: false });

  const today = new Date().toISOString().slice(0, 10);
  const scopes = await db
    .select({ userEmail: portalAccessScopes.userEmail })
    .from(portalAccessScopes)
    .where(
      and(
        eq(portalAccessScopes.active, true),
        inArray(portalAccessScopes.functionalRole, [
          "lawyer",
          "legal_supervisor",
        ]),
        or(
          isNull(portalAccessScopes.validFrom),
          lte(portalAccessScopes.validFrom, today),
        ),
        or(
          isNull(portalAccessScopes.validUntil),
          gte(portalAccessScopes.validUntil, today),
        ),
      ),
    );
  const emails = [...new Set(scopes.map((row) => row.userEmail))];
  const users = emails.length
    ? await db
        .select({ email: portalUsers.email, displayName: portalUsers.displayName })
        .from(portalUsers)
        .where(
          and(
            inArray(portalUsers.email, emails),
            eq(portalUsers.status, "active"),
          ),
        )
    : [];
  const linked = new Set(
    lawyers
      .map((lawyer) => lawyer.portalUserEmail?.toLowerCase())
      .filter((email): email is string => Boolean(email)),
  );
  return jsonNoStore({
    lawyers,
    userCandidates: users.filter(
      (user) => !linked.has(user.email.toLowerCase()),
    ),
    canManage: true,
  });
}

export async function POST(request: Request) {
  if (rejectCrossSiteRequest(request))
    return jsonNoStore({ error: "مصدر الطلب غير مسموح" }, { status: 403 });
  const actor = await access(true);
  if (!actor || !canManageLawyers(actor))
    return jsonNoStore({ error: "غير مصرح بإضافة محامٍ" }, { status: 403 });
  const parsed = await readLimitedJson(request, 8000);
  if (!parsed.ok) return parsed.response;
  const body = parsed.value as Record<string, unknown>;
  const details = lawyerDetails(body);
  if (!validLawyerDetails(details))
    return jsonNoStore(
      { error: "بيانات المحامي غير مكتملة أو غير صحيحة" },
      { status: 400 },
    );
  if (
    details.portalUserEmail &&
    !(await validLinkedUser(details.portalUserEmail))
  )
    return jsonNoStore(
      { error: "المستخدم المرتبط يجب أن يكون نشطًا ويحمل دور محامي أو محامي مشرف" },
      { status: 409 },
    );

  try {
    const [saved] = await getDb()
      .insert(legalLawyers)
      .values({
        ...details,
        licenseExpiryDate: details.licenseExpiryDate || null,
        createdBy: actor.user.email,
        updatedAt: new Date().toISOString(),
      })
      .returning();
    await auditPortalAction({
      actorEmail: actor.user.email,
      action: "legal-lawyer-created",
      entityType: "legal-lawyer",
      entityId: saved.id,
      after: saved,
    });
    await emitPortalNotification({
      eventType: "legal-lawyer-created",
      title: "أُضيف محامٍ إلى السجل القانوني",
      message: `${saved.fullName} — ${saved.portalUserEmail ? "مرتبط بمستخدم" : "محامٍ خارجي"}.`,
      severity: "success",
      module: "legal",
      entityType: "legal-lawyer",
      entityId: saved.id,
      actionView: "legal",
      targetDepartment: "legal",
    }).catch(() => undefined);
    return jsonNoStore({ lawyer: saved }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    return jsonNoStore(
      {
        error: message.includes("unique")
          ? "رقم الرخصة أو البريد أو المستخدم مرتبط بمحامٍ آخر"
          : "تعذر إضافة المحامي",
      },
      { status: message.includes("unique") ? 409 : 500 },
    );
  }
}

export async function PATCH(request: Request) {
  if (rejectCrossSiteRequest(request))
    return jsonNoStore({ error: "مصدر الطلب غير مسموح" }, { status: 403 });
  const actor = await access(true);
  if (!actor || !canManageLawyers(actor))
    return jsonNoStore({ error: "غير مصرح بتحديث المحامي" }, { status: 403 });
  const parsed = await readLimitedJson(request, 8000);
  if (!parsed.ok) return parsed.response;
  const body = parsed.value as Record<string, unknown>;
  const lawyerId = Number(body.lawyerId);
  const action = clean(body.action, 40);
  if (!Number.isInteger(lawyerId) || lawyerId < 1)
    return jsonNoStore({ error: "المحامي غير محدد" }, { status: 400 });
  const db = getDb();
  const before = await db.query.legalLawyers.findFirst({
    where: eq(legalLawyers.id, lawyerId),
  });
  if (!before)
    return jsonNoStore({ error: "المحامي غير موجود" }, { status: 404 });

  if (action === "transfer-cases") {
    const targetLawyerId = Number(body.targetLawyerId);
    const scope = clean(body.scope, 20) || "open";
    if (
      !Number.isInteger(targetLawyerId) ||
      targetLawyerId < 1 ||
      targetLawyerId === lawyerId ||
      !["open", "all"].includes(scope)
    )
      return jsonNoStore(
        { error: "اختر محاميًا بديلًا مختلفًا ونطاق تحويل صحيحًا" },
        { status: 400 },
      );
    const target = await db.query.legalLawyers.findFirst({
      where: and(
        eq(legalLawyers.id, targetLawyerId),
        eq(legalLawyers.status, "active"),
      ),
    });
    if (!target)
      return jsonNoStore(
        { error: "المحامي البديل غير موجود أو غير نشط" },
        { status: 409 },
      );
    const now = new Date().toISOString();
    const transferWhere =
      scope === "open"
        ? and(
            eq(legalRecords.assignedLawyerId, lawyerId),
            notInArray(legalRecords.status, ["closed", "cancelled"]),
          )
        : eq(legalRecords.assignedLawyerId, lawyerId);
    const transferred = await db.transaction(async (tx) => {
      const rows = await tx
        .update(legalRecords)
        .set({
          assignedLawyerId: target.id,
          assignedLawyerEmail: target.portalUserEmail,
          assignedBy: actor.user.email,
          assignedAt: now,
          updatedAt: now,
        })
        .where(transferWhere)
        .returning();
      if (!rows.length) return rows;
      await tx.insert(legalCaseActionLog).values(
        rows.map((matter) => ({
          legalRecordId: matter.id,
          activityId: null,
          action: "assigned",
          fromStatus: null,
          toStatus: null,
          details: `تحويل القضية من المحامي ${before.fullName} إلى المحامي ${target.fullName}`,
          actorEmail: actor.user.email,
          actorRole: legalActorRole(actor),
        })),
      );
      return rows;
    });
    if (!transferred.length)
      return jsonNoStore(
        {
          error:
            scope === "open"
              ? "لا توجد قضايا مفتوحة مسندة إلى هذا المحامي"
              : "لا توجد قضايا مسندة إلى هذا المحامي",
        },
        { status: 409 },
      );
    await auditPortalAction({
      actorEmail: actor.user.email,
      action: "legal-lawyer-cases-transferred",
      entityType: "legal-lawyer",
      entityId: lawyerId,
      before: {
        lawyer: before,
        scope,
        caseIds: transferred.map((matter) => matter.id),
      },
      after: {
        targetLawyer: target,
        transferredAt: now,
        caseIds: transferred.map((matter) => matter.id),
      },
    });
    await emitPortalNotification({
      eventType: "legal-lawyer-cases-transferred",
      title: "حُولت قضايا إلى محامٍ آخر",
      message: `${transferred.length} قضية — من ${before.fullName} إلى ${target.fullName}.`,
      severity: "warning",
      module: "legal",
      entityType: "legal-lawyer",
      entityId: target.id,
      actionView: "legal",
      ...(target.portalUserEmail
        ? { targetEmail: target.portalUserEmail }
        : { targetDepartment: "legal" as const }),
    }).catch(() => undefined);
    return jsonNoStore({
      transferredCount: transferred.length,
      transferredAt: now,
      sourceLawyer: before,
      targetLawyer: target,
    });
  }

  if (action === "update-details") {
    const details = lawyerDetails(body);
    if (!validLawyerDetails(details))
      return jsonNoStore(
        { error: "بيانات المحامي غير مكتملة أو غير صحيحة" },
        { status: 400 },
      );
    if (
      details.portalUserEmail &&
      !(await validLinkedUser(details.portalUserEmail))
    )
      return jsonNoStore(
        {
          error:
            "المستخدم المرتبط يجب أن يكون نشطًا ويحمل دور محامي أو محامي مشرف",
        },
        { status: 409 },
      );
    try {
      const now = new Date().toISOString();
      const saved = await db.transaction(async (tx) => {
        const [row] = await tx
          .update(legalLawyers)
          .set({
            ...details,
            licenseExpiryDate: details.licenseExpiryDate || null,
            updatedAt: now,
          })
          .where(eq(legalLawyers.id, lawyerId))
          .returning();
        if (before.portalUserEmail !== details.portalUserEmail)
          await tx
            .update(legalRecords)
            .set({
              assignedLawyerEmail: details.portalUserEmail,
              updatedAt: now,
            })
            .where(eq(legalRecords.assignedLawyerId, lawyerId));
        return row;
      });
      await auditPortalAction({
        actorEmail: actor.user.email,
        action: "legal-lawyer-details-updated",
        entityType: "legal-lawyer",
        entityId: lawyerId,
        before,
        after: saved,
      });
      await emitPortalNotification({
        eventType: "legal-lawyer-details-updated",
        title: "عُدلت بيانات محامٍ",
        message: `${saved.fullName} — تم تحديث بيانات السجل القانوني.`,
        severity: "info",
        module: "legal",
        entityType: "legal-lawyer",
        entityId: saved.id,
        actionView: "legal",
        targetDepartment: "legal",
      }).catch(() => undefined);
      return jsonNoStore({ lawyer: saved });
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : "";
      return jsonNoStore(
        {
          error: message.includes("unique")
            ? "رقم الرخصة أو البريد أو المستخدم مرتبط بمحامٍ آخر"
            : "تعذر تعديل بيانات المحامي",
        },
        { status: message.includes("unique") ? 409 : 500 },
      );
    }
  }

  const status = clean(body.status, 20);
  if (!["active", "inactive"].includes(status))
    return jsonNoStore(
      { error: "بيانات حالة المحامي غير صحيحة" },
      { status: 400 },
    );
  if (status === "inactive") {
    const openMatter = await db.query.legalRecords.findFirst({
      where: and(
        eq(legalRecords.assignedLawyerId, lawyerId),
        notInArray(legalRecords.status, ["closed", "cancelled"]),
      ),
    });
    if (openMatter)
      return jsonNoStore(
        { error: "أعد إسناد القضايا المفتوحة قبل تعطيل المحامي" },
        { status: 409 },
      );
  }
  const [saved] = await db
    .update(legalLawyers)
    .set({ status, updatedAt: new Date().toISOString() })
    .where(eq(legalLawyers.id, lawyerId))
    .returning();
  await auditPortalAction({
    actorEmail: actor.user.email,
    action: "legal-lawyer-status-updated",
    entityType: "legal-lawyer",
    entityId: lawyerId,
    before,
    after: saved,
  });
  await emitPortalNotification({
    eventType: "legal-lawyer-status-updated",
    title: "تغيّرت حالة محامٍ",
    message: `${saved.fullName} — ${status === "active" ? "نشط" : "غير نشط"}.`,
    severity: status === "active" ? "success" : "warning",
    module: "legal",
    entityType: "legal-lawyer",
    entityId: saved.id,
    actionView: "legal",
    targetDepartment: "legal",
  }).catch(() => undefined);
  return jsonNoStore({ lawyer: saved });
}

export async function DELETE(request: Request) {
  if (rejectCrossSiteRequest(request))
    return jsonNoStore({ error: "مصدر الطلب غير مسموح" }, { status: 403 });
  const actor = await access(true);
  if (!actor || !canManageLawyers(actor))
    return jsonNoStore({ error: "غير مصرح بحذف المحامي" }, { status: 403 });
  const parsed = await readLimitedJson(request, 3000);
  if (!parsed.ok) return parsed.response;
  const body = parsed.value as Record<string, unknown>;
  const lawyerId = Number(body.lawyerId);
  const reason = clean(body.reason, 1000);
  if (!Number.isInteger(lawyerId) || lawyerId < 1 || reason.length < 3)
    return jsonNoStore(
      { error: "حدد المحامي واكتب سبب الحذف" },
      { status: 400 },
    );
  const db = getDb();
  const before = await db.query.legalLawyers.findFirst({
    where: eq(legalLawyers.id, lawyerId),
  });
  if (!before)
    return jsonNoStore({ error: "المحامي غير موجود" }, { status: 404 });

  try {
    const deleted = await db.transaction(async (tx) => {
      const [locked] = await tx
        .update(legalLawyers)
        .set({ updatedAt: new Date().toISOString() })
        .where(eq(legalLawyers.id, lawyerId))
        .returning();
      if (!locked) throw new Error("LAWYER_NOT_FOUND");
      const [assignedMatter, externalShare] = await Promise.all([
        tx.query.legalRecords.findFirst({
          where: eq(legalRecords.assignedLawyerId, lawyerId),
        }),
        tx.query.legalExternalShares.findFirst({
          where: eq(legalExternalShares.lawyerId, lawyerId),
        }),
      ]);
      if (assignedMatter || externalShare) throw new Error("LAWYER_IN_USE");
      const [row] = await tx
        .delete(legalLawyers)
        .where(eq(legalLawyers.id, lawyerId))
        .returning();
      return row;
    });
    await auditPortalAction({
      actorEmail: actor.user.email,
      action: "legal-lawyer-deleted",
      entityType: "legal-lawyer",
      entityId: lawyerId,
      before,
      after: { deleted: true },
      reason,
    });
    await emitPortalNotification({
      eventType: "legal-lawyer-deleted",
      title: "حُذف محامٍ من السجل القانوني",
      message: `${deleted.fullName} — ${reason}.`,
      severity: "warning",
      module: "legal",
      entityType: "legal-lawyer",
      entityId: lawyerId,
      actionView: "legal",
      targetDepartment: "legal",
    }).catch(() => undefined);
    return jsonNoStore({ deleted: true, lawyerId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "LAWYER_IN_USE")
      return jsonNoStore(
        {
          error:
            "لا يمكن حذف محامٍ مرتبط بقضية أو سجل مشاركة؛ أعد إسناد القضايا ثم عطّله للحفاظ على التاريخ.",
        },
        { status: 409 },
      );
    if (message === "LAWYER_NOT_FOUND")
      return jsonNoStore({ error: "المحامي غير موجود" }, { status: 404 });
    return jsonNoStore({ error: "تعذر حذف المحامي" }, { status: 500 });
  }
}
