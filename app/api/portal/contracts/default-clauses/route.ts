import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { portalSettings } from "@/db/schema";
import { auditPortalAction } from "@/lib/audit";
import { hasPortalPermission, requirePortalApiRole } from "@/lib/portal-access";
import { emitPortalNotification } from "@/lib/portal-notifications";
import { clauseDefaultsKey, loadContractClauseDefaults } from "@/lib/contract-clause-defaults";
import { parseWorkforceContractClauses, validateContractClauses } from "@/lib/workforce-contract-clauses";
import { jsonNoStore, readLimitedJson, rejectCrossSiteRequest } from "@/lib/security";

async function access(write = false) {
  const actor = await requirePortalApiRole(["admin", "manager", "employee"]);
  if (!actor) return null;
  const elevated = actor.role === "admin" || actor.functionalRoles.includes("system_owner") || actor.functionalRoles.includes("system_admin");
  return elevated || await hasPortalPermission(actor, "contracts", write ? "write" : "read") || (!write && await hasPortalPermission(actor, "sales", "read")) ? actor : null;
}
export async function GET(request: Request) {
  if (!await access()) return jsonNoStore({ error: "غير مصرح بعرض البنود الافتراضية" }, { status: 403 });
  const direction = new URL(request.url).searchParams.get("direction");
  if (direction !== "dali_supplier" && direction !== "dali_purchaser") return jsonNoStore({ error: "اتجاه العقد غير صحيح" }, { status: 400 });
  return jsonNoStore(await loadContractClauseDefaults(direction));
}
export async function PUT(request: Request) {
  if (rejectCrossSiteRequest(request)) return jsonNoStore({ error: "مصدر الطلب غير مسموح" }, { status: 403 });
  const actor = await access(true);
  if (!actor) return jsonNoStore({ error: "غير مصرح بتعديل البنود الافتراضية" }, { status: 403 });
  const parsed = await readLimitedJson(request, 1_000_000);
  if (!parsed.ok) return parsed.response;
  const payload = parsed.value as Record<string, unknown>;
  if (!payload || (payload.direction !== "dali_supplier" && payload.direction !== "dali_purchaser") || !Array.isArray(payload.clauses) || !payload.clauses.length || payload.clauses.length > 80) return jsonNoStore({ error: "بيانات البنود غير صحيحة" }, { status: 400 });
  const clauses = parseWorkforceContractClauses(payload.clauses, payload.direction, true);
  const error = clauses.length !== payload.clauses.length ? "يوجد بند غير صالح أو يحتوي على بيانات تشغيلية داخلية" : validateContractClauses(clauses, true);
  if (error) return jsonNoStore({ error }, { status: 400 });
  const key = clauseDefaultsKey(payload.direction), db = getDb();
  const saved = await db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${key}))`);
    const current = await tx.query.portalSettings.findFirst({ where: eq(portalSettings.key, key) });
    if (payload.revision !== (current?.updatedAt || "builtin")) return null;
    const updatedAt = new Date().toISOString(), valueJson = JSON.stringify(clauses);
    await tx.insert(portalSettings).values({ key, valueJson, updatedBy: actor.user.email, updatedAt }).onConflictDoUpdate({ target: portalSettings.key, set: { valueJson, updatedBy: actor.user.email, updatedAt } });
    return { revision: updatedAt, before: current?.valueJson || null };
  });
  if (!saved) return jsonNoStore({ error: "تغيرت البنود الافتراضية لدى مستخدم آخر؛ أعد تحميلها قبل الحفظ" }, { status: 409 });
  await auditPortalAction({ actorEmail: actor.user.email, action: "contract-clause-defaults-updated", entityType: "portal-settings", entityId: key, before: saved.before, after: clauses });
  await emitPortalNotification({ eventType: "contract-clause-defaults-updated", title: "تحديث البنود الافتراضية للعقود", message: payload.direction === "dali_supplier" ? "تم تحديث بنود دالي كمورد؛ تطبق على العقود الجديدة" : "تم تحديث بنود دالي كمستورد؛ تطبق على العقود الجديدة", severity: "info", module: "contractual-documents", entityType: "portal-settings", entityId: key, actionView: "contractual-documents", targetDepartment: "workforce" });
  return jsonNoStore({ clauses, revision: saved.revision, direction: payload.direction });
}
