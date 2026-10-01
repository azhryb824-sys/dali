import { listClauseReviews, newDefaultClauseReview, notifyClauseReview, reviewKey } from "@/lib/legal-clause-reviews";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { portalSettings } from "@/db/schema";
import { auditPortalAction } from "@/lib/audit";
import { hasPortalPermission, requirePortalApiRole } from "@/lib/portal-access";
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
  const defaults = await loadContractClauseDefaults(direction);
  const pending = (await listClauseReviews()).filter(item => item.kind === "defaults" && item.direction === direction && item.status === "pending");
  return jsonNoStore({ ...defaults, pendingReviews: pending });
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
    const review = newDefaultClauseReview({ direction: payload.direction as "dali_supplier" | "dali_purchaser", clauses, baseRevision: current?.updatedAt || "builtin", actorEmail: actor.user.email });
    await tx.insert(portalSettings).values({ key: reviewKey(review.id), valueJson: JSON.stringify(review), updatedBy: actor.user.email, updatedAt: review.createdAt });
    return { review, before: current?.valueJson || null };
  });
  if (!saved) return jsonNoStore({ error: "تغيرت البنود الافتراضية لدى مستخدم آخر؛ أعد تحميلها قبل الحفظ" }, { status: 409 });
  await auditPortalAction({ actorEmail: actor.user.email, action: "contract-clause-defaults-submitted", entityType: "clause-review", entityId: saved.review.id, before: saved.before, after: saved.review });
  await notifyClauseReview(saved.review);
  const active = await loadContractClauseDefaults(payload.direction);
  return jsonNoStore({ ...active, review: saved.review, pendingReviews: (await listClauseReviews()).filter(item => item.kind === "defaults" && item.direction === payload.direction && item.status === "pending") }, { status: 202 });
}
