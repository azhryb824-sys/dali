import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { employees, legalCaseActionLog, legalRecords, legalReferrals, workers, workforceContracts } from "@/db/schema";
import { auditPortalAction } from "@/lib/audit";
import { registerLegalReferral } from "@/lib/legal-referrals";
import { hasPortalPermission, requirePortalApiRole } from "@/lib/portal-access";
import { emitPortalNotification } from "@/lib/portal-notifications";
import { jsonNoStore, readLimitedJson, rejectCrossSiteRequest } from "@/lib/security";

const sourceModule = { contract: "contracts", employee: "employees", worker: "workforce" } as const;
type Source = keyof typeof sourceModule;
const isSource = (value: unknown): value is Source => typeof value === "string" && Object.hasOwn(sourceModule, value);
const root = (actor: NonNullable<Awaited<ReturnType<typeof requirePortalApiRole>>>) => actor.role === "admin" || actor.functionalRoles.some(role => ["system_owner", "system_admin"].includes(role));

export async function GET(request: Request) {
  const actor = await requirePortalApiRole(["admin", "manager", "employee"]);
  const sourceType = new URL(request.url).searchParams.get("sourceType");
  if (!actor || !isSource(sourceType) || !(await hasPortalPermission(actor, sourceModule[sourceType], "read")))
    return jsonNoStore({ error: "غير مصرح" }, { status: 403 });
  const db = getDb();
  const referrals = await db.select({ id: legalReferrals.id, sourceId: legalReferrals.sourceId,
    legalRecordId: legalReferrals.legalRecordId, reason: legalReferrals.reason, status: legalReferrals.status,
    returnReason: legalReferrals.returnReason, referredAt: legalReferrals.referredAt, returnedAt: legalReferrals.returnedAt,
    referenceCode: legalRecords.referenceCode })
    .from(legalReferrals).innerJoin(legalRecords, eq(legalRecords.id, legalReferrals.legalRecordId))
    .where(eq(legalReferrals.sourceType, sourceType)).orderBy(desc(legalReferrals.id));
  return jsonNoStore({ referrals, canRefer: await hasPortalPermission(actor, sourceModule[sourceType], "write") });
}

export async function POST(request: Request) {
  if (rejectCrossSiteRequest(request)) return jsonNoStore({ error: "مصدر الطلب غير مسموح" }, { status: 403 });
  const actor = await requirePortalApiRole(["admin", "manager", "employee"]);
  if (!actor) return jsonNoStore({ error: "غير مصرح" }, { status: 403 });
  const parsed = await readLimitedJson(request, 6000);
  if (!parsed.ok) return parsed.response;
  const body = parsed.value as Record<string, unknown>;
  const sourceType = body.sourceType, sourceId = Number(body.sourceId);
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 2000) : "";
  if (!isSource(sourceType) || !Number.isSafeInteger(sourceId) || sourceId < 1 || reason.length < 10)
    return jsonNoStore({ error: "اختر السجل واكتب سبب الإحالة بما لا يقل عن 10 أحرف" }, { status: 400 });
  if (!(await hasPortalPermission(actor, sourceModule[sourceType], "write")))
    return jsonNoStore({ error: "غير مصرح بإحالة سجلات هذا القسم" }, { status: 403 });
  const db = getDb(), now = new Date().toISOString();
  try {
    const result = await db.transaction(async tx => {
      const source = sourceType === "contract" ? await tx.query.workforceContracts.findFirst({ where: eq(workforceContracts.id, sourceId) }) :
        sourceType === "employee" ? await tx.query.employees.findFirst({ where: eq(employees.id, sourceId) }) :
          await tx.query.workers.findFirst({ where: eq(workers.id, sourceId) });
      if (!source) throw new Error("السجل المرتبط غير موجود");
      const name = "clientName" in source ? source.clientName : source.fullName;
      const reference = "referenceCode" in source ? source.referenceCode : "employeeNumber" in source ? source.employeeNumber : String(sourceId);
      return registerLegalReferral(tx, { sourceType, sourceId, contractId: sourceType === "contract" ? sourceId : null,
        clientId: "clientId" in source ? source.clientId : null, reason, actorEmail: actor.user.email, now,
        counterparty: name, title: `${sourceType === "contract" ? "إحالة عقد" : sourceType === "employee" ? "قضية موظف" : "قضية عامل"} — ${reference} — ${name}`,
        snapshot: { source: { type: sourceType, id: sourceId, name, reference }, capturedAt: now },
      });
    });
    await auditPortalAction({ actorEmail: actor.user.email, action: "legal-source-referred", entityType: "legal-record", entityId: result.matter.id, after: result.referral, reason });
    await emitPortalNotification({ eventType: "legal-source-referred", title: "إحالة جديدة للشؤون القانونية", message: `${result.matter.title} — ${reason}`, module: "legal", severity: "warning", entityType: "legal-record", entityId: result.matter.id, actionView: "legal", targetDepartment: "legal" }).catch(() => undefined);
    return jsonNoStore(result, { status: 201 });
  } catch (error) { return jsonNoStore({ error: error instanceof Error ? error.message : "تعذر تسجيل الإحالة" }, { status: 409 }); }
}

export async function PATCH(request: Request) {
  if (rejectCrossSiteRequest(request)) return jsonNoStore({ error: "مصدر الطلب غير مسموح" }, { status: 403 });
  const actor = await requirePortalApiRole(["admin", "manager", "employee"]);
  if (!actor || !(await hasPortalPermission(actor, "legal", "write"))) return jsonNoStore({ error: "غير مصرح" }, { status: 403 });
  const parsed = await readLimitedJson(request, 5000);
  if (!parsed.ok) return parsed.response;
  const body = parsed.value as Record<string, unknown>, id = Number(body.id);
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 2000) : "";
  if (!Number.isSafeInteger(id) || id < 1 || reason.length < 10) return jsonNoStore({ error: "اكتب سبب الإرجاع بوضوح" }, { status: 400 });
  const db = getDb();
  const referral = await db.query.legalReferrals.findFirst({ where: eq(legalReferrals.id, id) });
  if (!referral || !["employee", "worker"].includes(referral.sourceType)) return jsonNoStore({ error: "استخدم مراسلات العقد لإرجاع العقود والدفعات" }, { status: 409 });
  const matter = await db.query.legalRecords.findFirst({ where: and(eq(legalRecords.id, referral.legalRecordId), isNull(legalRecords.deletedAt)) });
  const manager = root(actor) || actor.functionalRoles.some(role => ["legal_supervisor", "lawyer"].includes(role));
  if (!matter || (!manager && matter.assignedLawyerEmail?.toLowerCase() !== actor.user.email.toLowerCase())) return jsonNoStore({ error: "غير مصرح بهذا الملف" }, { status: 403 });
  const now = new Date().toISOString();
  try {
    const updated = await db.transaction(async tx => {
      await tx.execute(sql`select id from legal_records where id = ${matter.id} for update`);
      const current = await tx.query.legalRecords.findFirst({ where: and(eq(legalRecords.id, matter.id), isNull(legalRecords.deletedAt)) });
      if (!current || ["closed", "cancelled", "expired"].includes(current.status)) throw new Error("الملف مغلق ولا يقبل الإرجاع");
      const [record] = await tx.update(legalReferrals).set({ status: "returned", returnedBy: actor.user.email, returnedAt: now, returnReason: reason })
        .where(and(eq(legalReferrals.id, id), eq(legalReferrals.status, "active"))).returning();
      if (!record) throw new Error("سبق معالجة هذه الإحالة");
      await tx.update(legalRecords).set({ status: "reviewing", updatedAt: now }).where(and(eq(legalRecords.id, matter.id), inArray(legalRecords.status, ["active", "reviewing", "expiring"])));
      await tx.insert(legalCaseActionLog).values({ legalRecordId: matter.id, action: "updated", details: `إعادة إلى القسم المختص: ${reason}`, actorEmail: actor.user.email, actorRole: actor.role });
      return record;
    });
    const department = referral.sourceType === "employee" ? "employees" : "workforce";
    await auditPortalAction({ actorEmail: actor.user.email, action: "legal-source-returned", entityType: "legal-record", entityId: matter.id, before: referral, after: updated, reason });
    await emitPortalNotification({ eventType: "legal-source-returned", title: "أعادت القانونية ملفًا يتطلب إجراء", message: `${matter.referenceCode} — ${reason}`, module: department, severity: "warning", entityType: referral.sourceType, entityId: referral.sourceId, actionView: department, targetDepartment: department }).catch(() => undefined);
    return jsonNoStore({ referral: updated });
  } catch (error) { return jsonNoStore({ error: error instanceof Error ? error.message : "تعذر الإرجاع" }, { status: 409 }); }
}
