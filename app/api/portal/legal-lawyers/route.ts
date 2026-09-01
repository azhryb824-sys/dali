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
  const fullName = clean(body.fullName, 180);
  const licenseNumber = clean(body.licenseNumber, 80) || null;
  const licenseExpiryDate = clean(body.licenseExpiryDate, 10);
  const mobile = clean(body.mobile, 20) || null;
  const email = clean(body.email, 254).toLowerCase() || null;
  const portalUserEmail =
    clean(body.portalUserEmail, 254).toLowerCase() || null;
  const notes = clean(body.notes, 2000) || null;
  if (
    fullName.length < 3 ||
    !validDate(licenseExpiryDate) ||
    !mobile ||
    !validMobile(mobile) ||
    !validEmail(email || "") ||
    !validEmail(portalUserEmail || "")
  )
    return jsonNoStore(
      { error: "بيانات المحامي غير مكتملة أو غير صحيحة" },
      { status: 400 },
    );
  if (portalUserEmail && !(await validLinkedUser(portalUserEmail)))
    return jsonNoStore(
      { error: "المستخدم المرتبط يجب أن يكون نشطًا ويحمل دور محامي أو محامي مشرف" },
      { status: 409 },
    );

  try {
    const [saved] = await getDb()
      .insert(legalLawyers)
      .values({
        fullName,
        licenseNumber,
        licenseExpiryDate: licenseExpiryDate || null,
        mobile,
        email,
        portalUserEmail,
        notes,
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
  const parsed = await readLimitedJson(request, 3000);
  if (!parsed.ok) return parsed.response;
  const body = parsed.value as Record<string, unknown>;
  const lawyerId = Number(body.lawyerId);
  const status = clean(body.status, 20);
  if (!Number.isInteger(lawyerId) || lawyerId < 1 || !["active", "inactive"].includes(status))
    return jsonNoStore({ error: "بيانات حالة المحامي غير صحيحة" }, { status: 400 });
  const db = getDb();
  const before = await db.query.legalLawyers.findFirst({
    where: eq(legalLawyers.id, lawyerId),
  });
  if (!before)
    return jsonNoStore({ error: "المحامي غير موجود" }, { status: 404 });
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
