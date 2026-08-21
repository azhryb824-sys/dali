import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { complianceObligations, complianceReviews } from "@/db/schema";
import { auditPortalAction } from "@/lib/audit";
import { emitPortalNotification } from "@/lib/portal-notifications";
import { hasPortalPermission, requirePortalApiRole } from "@/lib/portal-access";
import { jsonNoStore, rejectCrossSiteRequest } from "@/lib/security";

function clean(value: unknown, length: number) { return typeof value === "string" ? value.trim().slice(0, length) : ""; }
function positiveId(value: unknown) { const id = Number(value); return Number.isSafeInteger(id) && id > 0 ? id : 0; }
function validDate(value: string, optional = false) { return optional && !value ? null : /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : ""; }
function code() { return `CMP-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`; }

export async function GET() {
  const access = await requirePortalApiRole(["admin", "manager", "employee"]);
  if (!access || !(await hasPortalPermission(access, "legal", "read"))) return jsonNoStore({ error: "غير مصرح" }, { status: 403 });
  const db = getDb();
  const [obligations, reviews] = await Promise.all([
    db.select().from(complianceObligations).orderBy(complianceObligations.expiryDate).limit(1000),
    db.select().from(complianceReviews).orderBy(desc(complianceReviews.reviewDate), desc(complianceReviews.id)).limit(3000),
  ]);
  return jsonNoStore({ obligations, reviews });
}

export async function POST(request: Request) {
  if (rejectCrossSiteRequest(request)) return jsonNoStore({ error: "مصدر الطلب غير مسموح" }, { status: 403 });
  const access = await requirePortalApiRole(["admin", "manager", "employee"]);
  if (!access || !(await hasPortalPermission(access, "legal", "write"))) return jsonNoStore({ error: "غير مصرح" }, { status: 403 });
  try {
    const payload = await request.json() as Record<string, unknown>;
    const action = clean(payload.action, 30);
    const db = getDb();
    const now = new Date().toISOString();
    if (action === "create") {
      const title = clean(payload.title, 200);
      const category = clean(payload.category, 40);
      const authority = clean(payload.authority, 160);
      const ownerDepartment = clean(payload.ownerDepartment, 100);
      const issueDate = validDate(clean(payload.issueDate, 10), true);
      const expiryDate = validDate(clean(payload.expiryDate, 10));
      const reminderDays = Number(payload.reminderDays || 30);
      const riskLevel = clean(payload.riskLevel, 20);
      const categories = new Set(["license","certificate","insurance","labor","tax","municipal","contractual","data_protection","safety","other"]);
      const risks = new Set(["low","medium","high","critical"]);
      if (title.length < 3 || !categories.has(category) || authority.length < 2 || !ownerDepartment || issueDate === "" || !expiryDate || !Number.isInteger(reminderDays) || reminderDays < 1 || reminderDays > 365 || !risks.has(riskLevel)) return jsonNoStore({ error: "بيانات الالتزام غير مكتملة أو غير صحيحة" }, { status: 400 });
      const [saved] = await db.insert(complianceObligations).values({ obligationCode: code(), title, category, authority, ownerDepartment, issueDate, expiryDate, reminderDays, riskLevel, notes: clean(payload.notes, 2000) || null, createdBy: access.user.email, updatedAt: now }).returning();
      await auditPortalAction({ actorEmail: access.user.email, action: "compliance-obligation-created", entityType: "compliance-obligation", entityId: saved.id, after: saved });
      await emitPortalNotification({ eventType: "compliance-obligation-created", title: "أضيف التزام امتثال", message: `${saved.title} — ينتهي في ${saved.expiryDate}`, severity: saved.riskLevel === "critical" ? "critical" : saved.riskLevel === "high" ? "warning" : "info", module: "legal", entityType: "compliance-obligation", entityId: saved.id, actionView: "legal", targetDepartment: "legal" }).catch(() => undefined);
      return jsonNoStore({ obligation: saved }, { status: 201 });
    }
    if (action === "review") {
      const obligationId = positiveId(payload.obligationId);
      const obligation = await db.query.complianceObligations.findFirst({ where: eq(complianceObligations.id, obligationId) });
      const outcome = clean(payload.outcome, 30);
      const reviewDate = validDate(clean(payload.reviewDate, 10));
      const nextReviewDate = validDate(clean(payload.nextReviewDate, 10), true);
      const notes = clean(payload.notes, 2000);
      const outcomes = new Set(["compliant","action_required","renewal_required","non_compliant","closed"]);
      if (!obligation) return jsonNoStore({ error: "الالتزام غير موجود" }, { status: 404 });
      if (!outcomes.has(outcome) || !reviewDate || nextReviewDate === "" || notes.length < 3) return jsonNoStore({ error: "بيانات المراجعة غير صحيحة" }, { status: 400 });
      const [review] = await db.insert(complianceReviews).values({ obligationId, reviewDate, outcome, notes, nextReviewDate, reviewedBy: access.user.email }).returning();
      const status = outcome === "closed" ? "closed" : outcome === "renewal_required" ? "renewal" : outcome === "non_compliant" || outcome === "action_required" ? "under_review" : "active";
      const [updated] = await db.update(complianceObligations).set({ status, reviewedBy: access.user.email, reviewedAt: now, updatedAt: now }).where(eq(complianceObligations.id, obligationId)).returning();
      await auditPortalAction({ actorEmail: access.user.email, action: "compliance-reviewed", entityType: "compliance-obligation", entityId: obligationId, before: obligation, after: { obligation: updated, review } });
      if (["action_required", "renewal_required", "non_compliant"].includes(outcome)) await emitPortalNotification({ eventType: "compliance-action-required", title: "إجراء امتثال مطلوب", message: `${updated.title} — ${notes.slice(0, 180)}`, severity: outcome === "non_compliant" ? "critical" : "warning", module: "legal", entityType: "compliance-obligation", entityId: updated.id, actionView: "legal", targetDepartment: "legal" }).catch(() => undefined);
      return jsonNoStore({ obligation: updated, review }, { status: 201 });
    }
    return jsonNoStore({ error: "العملية غير مدعومة" }, { status: 400 });
  } catch (error) {
    return jsonNoStore({ error: error instanceof Error ? error.message : "تعذّر حفظ بيانات الامتثال" }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  if (rejectCrossSiteRequest(request)) return jsonNoStore({ error: "مصدر الطلب غير مسموح" }, { status: 403 });
  const access = await requirePortalApiRole(["admin", "manager", "employee"]);
  if (!access || !(await hasPortalPermission(access, "legal", "approve"))) return jsonNoStore({ error: "غير مصرح" }, { status: 403 });
  try {
    const payload = await request.json() as Record<string, unknown>;
    const id = positiveId(payload.id);
    const status = clean(payload.status, 30);
    const allowed = new Set(["draft","active","under_review","renewal","expired","suspended","closed"]);
    if (!id || !allowed.has(status)) return jsonNoStore({ error: "بيانات التحديث غير صحيحة" }, { status: 400 });
    const db = getDb();
    const existing = await db.query.complianceObligations.findFirst({ where: eq(complianceObligations.id, id) });
    if (!existing) return jsonNoStore({ error: "الالتزام غير موجود" }, { status: 404 });
    const [updated] = await db.update(complianceObligations).set({ status, reviewedBy: access.user.email, reviewedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }).where(eq(complianceObligations.id, id)).returning();
    await auditPortalAction({ actorEmail: access.user.email, action: "compliance-status-updated", entityType: "compliance-obligation", entityId: id, before: existing, after: updated });
    return jsonNoStore({ obligation: updated });
  } catch (error) { return jsonNoStore({ error: error instanceof Error ? error.message : "تعذّر تحديث الالتزام" }, { status: 400 }); }
}
