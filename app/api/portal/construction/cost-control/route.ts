import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { constructionCostEntries, constructionProjects, constructionRecords } from "@/db/schema";
import { auditPortalAction } from "@/lib/audit";
import { assertFinancialLimit, canCreateConstructionRecord, canReadConstruction, getActivePortalScopes, scopeAllowsProject } from "@/lib/access-policy";
import { hasPortalPermission, requirePortalApiRole } from "@/lib/portal-access";
import { jsonNoStore, readLimitedJson, rejectCrossSiteRequest, requestCorrelationId } from "@/lib/security";

const types = new Set(["baseline", "commitment", "actual", "forecast_to_complete", "approved_change", "payment_certificate", "retention"]);
const categories = new Set(["labor", "materials", "equipment", "subcontract", "overhead", "other"]);
const clean = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";
const integer = (value: unknown) => { const parsed = Number(value); return Number.isInteger(parsed) && parsed >= 0 ? parsed : null; };

async function authorize(action: "read" | "write") {
  const access = await requirePortalApiRole(["admin", "manager", "employee"]);
  if (!access) return null;
  const scopes = await getActivePortalScopes(access);
  const permission = await hasPortalPermission(access, "construction", action);
  if (!permission && !(action === "write" && scopes.length)) return null;
  if (!canReadConstruction(access, scopes)) return null;
  if (action === "write" && !canCreateConstructionRecord(access, scopes, "estimate")) return null;
  return { access, scopes };
}

function summarize(project: typeof constructionProjects.$inferSelect, entries: Array<typeof constructionCostEntries.$inferSelect>) {
  const approved = entries.filter((entry) => entry.status === "approved");
  const total = (type: string) => approved.filter((entry) => entry.entryType === type).reduce((sum, entry) => sum + entry.amountHalalas, 0);
  const recordedBaseline = total("baseline");
  const baseline = recordedBaseline || project.budgetHalalas;
  const approvedChanges = total("approved_change");
  const revisedBudget = baseline + approvedChanges;
  const commitments = total("commitment");
  const actual = total("actual");
  const enteredEtc = total("forecast_to_complete");
  const forecastToComplete = enteredEtc || Math.max(0, commitments - actual, revisedBudget - actual);
  const estimateAtCompletion = actual + forecastToComplete;
  const earnedValue = Math.round(project.contractValueHalalas * project.progressBps / 10_000);
  const certified = total("payment_certificate");
  const retention = total("retention");
  return {
    baseline, approvedChanges, revisedBudget, commitments, actual, forecastToComplete, estimateAtCompletion,
    varianceAtCompletion: revisedBudget - estimateAtCompletion,
    earnedValue, certified, retention,
    wip: earnedValue - certified,
    costPerformanceBps: actual > 0 ? Math.round(earnedValue * 10_000 / actual) : null,
  };
}

export async function GET(request: Request) {
  const authorization = await authorize("read");
  if (!authorization) return jsonNoStore({ error: "غير مصرح بعرض رقابة تكاليف المقاولات" }, { status: 403 });
  const projectId = Number(new URL(request.url).searchParams.get("projectId"));
  if (!Number.isInteger(projectId) || projectId < 1) return jsonNoStore({ error: "اختر مشروعًا صحيحًا" }, { status: 400 });
  const db = getDb();
  const project = await db.query.constructionProjects.findFirst({ where: eq(constructionProjects.id, projectId) });
  if (!project || !scopeAllowsProject(authorization.access, authorization.scopes, project.id, project.cityId)) return jsonNoStore({ error: "المشروع غير موجود ضمن نطاق الصلاحية" }, { status: 404 });
  const entries = await db.select().from(constructionCostEntries).where(eq(constructionCostEntries.projectId, projectId)).orderBy(desc(constructionCostEntries.effectiveDate), desc(constructionCostEntries.id)).limit(3000);
  return jsonNoStore({ project, entries, summary: summarize(project, entries) });
}

export async function POST(request: Request) {
  const crossSite = rejectCrossSiteRequest(request); if (crossSite) return crossSite;
  const authorization = await authorize("write");
  if (!authorization) return jsonNoStore({ error: "غير مصرح بتعديل رقابة التكاليف" }, { status: 403 });
  const parsed = await readLimitedJson(request, 16_000); if (!parsed.ok) return parsed.response;
  const body = parsed.value as Record<string, unknown> | null;
  const projectId = integer(body?.projectId); const amountHalalas = integer(body?.amountHalalas);
  const entryType = clean(body?.entryType, 40); const costCategory = clean(body?.costCategory, 30);
  const costCode = clean(body?.costCode, 40).toUpperCase(); const costTitle = clean(body?.costTitle, 180);
  const effectiveDate = clean(body?.effectiveDate, 10); const sourceRecordId = integer(body?.sourceRecordId);
  if (!projectId || amountHalalas === null || !types.has(entryType) || !categories.has(costCategory) || !costCode || costTitle.length < 3 || !/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) return jsonNoStore({ error: "بيانات حركة التكلفة غير مكتملة" }, { status: 400 });
  const db = getDb();
  const project = await db.query.constructionProjects.findFirst({ where: eq(constructionProjects.id, projectId) });
  if (!project || !scopeAllowsProject(authorization.access, authorization.scopes, project.id, project.cityId)) return jsonNoStore({ error: "المشروع خارج نطاق الصلاحية" }, { status: 404 });
  assertFinancialLimit(authorization.access, authorization.scopes, amountHalalas);
  if (sourceRecordId) {
    const source = await db.query.constructionRecords.findFirst({ where: and(eq(constructionRecords.id, sourceRecordId), eq(constructionRecords.projectId, projectId)) });
    if (!source) return jsonNoStore({ error: "المستند المصدر لا يتبع المشروع" }, { status: 400 });
  }
  const [entry] = await db.insert(constructionCostEntries).values({ projectId, amountHalalas, entryType, costCategory, costCode, costTitle, effectiveDate, sourceRecordId: sourceRecordId || null, referenceCode: clean(body?.referenceCode, 80) || null, notes: clean(body?.notes, 1000) || null, createdBy: authorization.access.user.email }).returning();
  await auditPortalAction({ actorEmail: authorization.access.user.email, action: "create-cost-entry", entityType: "construction-cost-entry", entityId: entry.id, after: entry, correlationId: requestCorrelationId(request) });
  return jsonNoStore({ entry }, { status: 201 });
}

export async function PATCH(request: Request) {
  const crossSite = rejectCrossSiteRequest(request); if (crossSite) return crossSite;
  const authorization = await authorize("write");
  if (!authorization) return jsonNoStore({ error: "غير مصرح بتعديل رقابة التكاليف" }, { status: 403 });
  const parsed = await readLimitedJson(request, 4000); if (!parsed.ok) return parsed.response;
  const body = parsed.value as Record<string, unknown> | null; const id = integer(body?.id);
  if (!id) return jsonNoStore({ error: "الحركة غير صحيحة" }, { status: 400 });
  const db = getDb(); const current = await db.query.constructionCostEntries.findFirst({ where: eq(constructionCostEntries.id, id) });
  if (!current) return jsonNoStore({ error: "الحركة غير موجودة" }, { status: 404 });
  const project = await db.query.constructionProjects.findFirst({ where: eq(constructionProjects.id, current.projectId) });
  if (!project || !scopeAllowsProject(authorization.access, authorization.scopes, project.id, project.cityId)) return jsonNoStore({ error: "الحركة خارج نطاق الصلاحية" }, { status: 404 });
  const [entry] = await db.update(constructionCostEntries).set({ status: "cancelled", updatedAt: new Date().toISOString() }).where(eq(constructionCostEntries.id, id)).returning();
  await auditPortalAction({ actorEmail: authorization.access.user.email, action: "cancel-cost-entry", entityType: "construction-cost-entry", entityId: id, before: current, after: entry, correlationId: requestCorrelationId(request) });
  return jsonNoStore({ entry });
}
