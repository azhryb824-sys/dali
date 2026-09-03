import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { officialLetters } from "@/db/schema";
import { auditPortalAction } from "@/lib/audit";
import { hasPortalPermission, requirePortalApiRole } from "@/lib/portal-access";
import { emitPortalNotification } from "@/lib/portal-notifications";
import { jsonNoStore, rejectCrossSiteRequest, requestCorrelationId } from "@/lib/security";

const clean = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";
const id = (value: unknown) => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0;
};
const code = () => `LTR-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0, 5).toUpperCase()}`;

type LetterAccess = NonNullable<Awaited<ReturnType<typeof requirePortalApiRole>>>;

async function hasLetterPermission(current: LetterAccess, action: "read" | "write") {
  return await hasPortalPermission(current, "contracts", action)
    || await hasPortalPermission(current, "documents", action)
    || await hasPortalPermission(current, "legal", action);
}

async function access(action: "read" | "write" = "read") {
  const current = await requirePortalApiRole(["admin", "manager", "employee"]);
  if (!current || !(await hasLetterPermission(current, action))) return null;
  return current;
}

export async function GET() {
  const current = await access();
  if (!current) return jsonNoStore({ error: "غير مصرح" }, { status: 403 });
  const letters = await getDb().select().from(officialLetters).orderBy(desc(officialLetters.updatedAt)).limit(1000);
  return jsonNoStore({
    letters,
    canWrite: await hasLetterPermission(current, "write"),
    canApprove: await hasPortalPermission(current, "contracts", "approve"),
  });
}

export async function POST(request: Request) {
  if (rejectCrossSiteRequest(request)) return jsonNoStore({ error: "مصدر الطلب غير مسموح" }, { status: 403 });
  const current = await access("write");
  if (!current) return jsonNoStore({ error: "غير مصرح" }, { status: 403 });
  const correlationId = requestCorrelationId(request);
  try {
    const payload = await request.json() as Record<string, unknown>;
    const subject = clean(payload.subject, 250);
    const recipient = clean(payload.recipient, 200);
    const body = clean(payload.body, 20_000);
    if (subject.length < 3 || recipient.length < 2 || body.length < 10) {
      return jsonNoStore({ error: "موضوع الخطاب والجهة والنص مطلوبة" }, { status: 400 });
    }
    const [saved] = await getDb().insert(officialLetters).values({
      referenceCode: code(),
      subject,
      recipient,
      body,
      createdBy: current.user.email,
      updatedAt: new Date().toISOString(),
    }).returning();
    await auditPortalAction({ actorEmail: current.user.email, action: "official-letter-created", entityType: "official-letter", entityId: saved.id, after: saved, correlationId });
    await emitPortalNotification({
      eventType: "official-letter-created",
      title: "أُنشئ خطاب رسمي جديد",
      message: `${saved.referenceCode} — ${saved.subject}`,
      severity: "info",
      module: "contractual-documents",
      entityType: "official-letter",
      entityId: saved.id,
      actionView: "contractual-documents",
      targetDepartment: "legal",
    }).catch(() => undefined);
    return jsonNoStore({ letter: saved }, { status: 201 });
  } catch (error) {
    console.error("official-letter-create-failed", { correlationId, error });
    return jsonNoStore({ error: "تعذر إنشاء الخطاب بسبب عدم توافق قاعدة البيانات", correlationId }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  if (rejectCrossSiteRequest(request)) return jsonNoStore({ error: "مصدر الطلب غير مسموح" }, { status: 403 });
  const current = await access("write");
  if (!current) return jsonNoStore({ error: "غير مصرح" }, { status: 403 });
  try {
    const payload = await request.json() as Record<string, unknown>;
    const letterId = id(payload.id);
    const action = clean(payload.action, 30);
    const db = getDb();
    const now = new Date().toISOString();
    const letter = await db.query.officialLetters.findFirst({ where: eq(officialLetters.id, letterId) });
    if (!letter) return jsonNoStore({ error: "الخطاب غير موجود" }, { status: 404 });

    if (action === "edit") {
      if (letter.status !== "draft") return jsonNoStore({ error: "يمكن تعديل مسودة الخطاب فقط" }, { status: 409 });
      const subject = clean(payload.subject, 250);
      const recipient = clean(payload.recipient, 200);
      const body = clean(payload.body, 20_000);
      if (subject.length < 3 || recipient.length < 2 || body.length < 10) {
        return jsonNoStore({ error: "بيانات الخطاب غير مكتملة" }, { status: 400 });
      }
      const [updated] = await db.update(officialLetters).set({ subject, recipient, body, updatedAt: now }).where(eq(officialLetters.id, letterId)).returning();
      await auditPortalAction({ actorEmail: current.user.email, action: "official-letter-edited", entityType: "official-letter", entityId: letterId, before: letter, after: updated });
      return jsonNoStore({ letter: updated });
    }

    if (action === "status") {
      const status = clean(payload.status, 20);
      if (!["approved", "sent", "cancelled"].includes(status)) return jsonNoStore({ error: "الحالة غير صحيحة" }, { status: 400 });
      if (status === "approved" && !(await hasPortalPermission(current, "contracts", "approve"))) {
        return jsonNoStore({ error: "اعتماد الخطابات يتطلب صلاحية اعتماد العقود" }, { status: 403 });
      }
      if (status === "cancelled" && !(await hasPortalPermission(current, "contracts", "approve"))) {
        return jsonNoStore({ error: "إلغاء الخطابات متاح للمالك أو مشرف النظام فقط" }, { status: 403 });
      }
      const reason = clean(payload.reason, 1000);
      if (status === "cancelled" && reason.length < 10) return jsonNoStore({ error: "سبب الإلغاء مطلوب" }, { status: 400 });
      const [updated] = await db.update(officialLetters).set({
        status,
        cancellationReason: status === "cancelled" ? reason : null,
        cancelledBy: status === "cancelled" ? current.user.email : null,
        cancelledAt: status === "cancelled" ? now : null,
        updatedAt: now,
      }).where(eq(officialLetters.id, letterId)).returning();
      await auditPortalAction({ actorEmail: current.user.email, action: "official-letter-status-changed", entityType: "official-letter", entityId: letterId, before: letter, after: updated, reason: reason || null });
      await emitPortalNotification({
        eventType: "official-letter-status-changed",
        title: "تغيّرت حالة خطاب رسمي",
        message: `${updated.referenceCode} — ${updated.subject} — ${updated.status}`,
        severity: status === "cancelled" ? "warning" : "info",
        module: "contractual-documents",
        entityType: "official-letter",
        entityId: letterId,
        actionView: "contractual-documents",
        targetDepartment: "legal",
      }).catch(() => undefined);
      return jsonNoStore({ letter: updated });
    }

    return jsonNoStore({ error: "العملية غير مدعومة" }, { status: 400 });
  } catch (error) {
    return jsonNoStore({ error: error instanceof Error ? error.message : "تعذر تحديث الخطاب" }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  if (rejectCrossSiteRequest(request)) return jsonNoStore({ error: "مصدر الطلب غير مسموح" }, { status: 403 });
  const current = await access("write");
  if (!current) return jsonNoStore({ error: "غير مصرح" }, { status: 403 });
  const letterId = id(new URL(request.url).searchParams.get("id"));
  const db = getDb();
  const letter = await db.query.officialLetters.findFirst({ where: eq(officialLetters.id, letterId) });
  if (!letter) return jsonNoStore({ error: "الخطاب غير موجود" }, { status: 404 });
  if (letter.status !== "draft") return jsonNoStore({ error: "لا يُحذف إلا الخطاب المسودة؛ استخدم الإلغاء بعد الاعتماد" }, { status: 409 });
  await db.delete(officialLetters).where(eq(officialLetters.id, letterId));
  await auditPortalAction({ actorEmail: current.user.email, action: "official-letter-deleted", entityType: "official-letter", entityId: letterId, before: letter });
  return jsonNoStore({ deleted: true });
}
