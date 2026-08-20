import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  businessLines,
  constructionOpportunities,
  constructionProjects,
  constructionRecords,
  constructionRecordLines,
  costCenters,
  serviceCities,
  serviceCoverage,
  serviceRegions,
} from "@/db/schema";
import { auditPortalAction, enqueueOutbox, recordStatusChange } from "@/lib/audit";
import { hasPortalPermission, requirePortalApiRole } from "@/lib/portal-access";
import { emitPortalNotification } from "@/lib/portal-notifications";
import { jsonNoStore, readLimitedJson, rejectCrossSiteRequest, requestCorrelationId } from "@/lib/security";

const clean = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";
const positiveInteger = (value: unknown, allowZero = false) => {
  const number = Number(value);
  return Number.isInteger(number) && number >= (allowZero ? 0 : 1) ? number : null;
};
const isoDate = (value: unknown, optional = false) => {
  const result = clean(value, 10);
  return optional && !result ? null : /^\d{4}-\d{2}-\d{2}$/.test(result) ? result : "";
};
const reference = (prefix: string) => `${prefix}-${new Date().getFullYear()}-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`;

async function requireConstructionAccess(action: "read" | "write") {
  const access = await requirePortalApiRole(["admin", "manager", "employee"]);
  if (!access || !(await hasPortalPermission(access, "construction", action))) return null;
  return access;
}

export async function GET() {
  const access = await requireConstructionAccess("read");
  if (!access) return jsonNoStore({ error: "غير مصرح بالوصول إلى قطاع المقاولات" }, { status: 403 });
  const db = getDb();
  try {
    const [lines, regions, cities, coverage, opportunities, projects, records, recordLines] = await Promise.all([
      db.select().from(businessLines).orderBy(businessLines.id),
      db.select().from(serviceRegions).orderBy(serviceRegions.sortOrder),
      db.select().from(serviceCities).orderBy(serviceCities.nameAr).limit(1000),
      db.select().from(serviceCoverage).orderBy(desc(serviceCoverage.updatedAt)).limit(2000),
      db.select().from(constructionOpportunities).orderBy(desc(constructionOpportunities.updatedAt)).limit(500),
      db.select().from(constructionProjects).orderBy(desc(constructionProjects.updatedAt)).limit(500),
      db.select().from(constructionRecords).orderBy(desc(constructionRecords.updatedAt)).limit(1000),
      db.select().from(constructionRecordLines).orderBy(desc(constructionRecordLines.id)).limit(5000),
    ]);
    return jsonNoStore({ lines, regions, cities, coverage, opportunities, projects, records, recordLines, canWrite: await hasPortalPermission(access, "construction", "write") });
  } catch (error) {
    console.error("construction-workspace-load-failed", error);
    return jsonNoStore({ error: "تعذر تحميل مساحة المقاولات" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const crossSite = rejectCrossSiteRequest(request);
  if (crossSite) return crossSite;
  const access = await requireConstructionAccess("write");
  if (!access) return jsonNoStore({ error: "غير مصرح بالتعديل في قطاع المقاولات" }, { status: 403 });
  const correlationId = requestCorrelationId(request);
  const parsed = await readLimitedJson(request, 32_000);
  if (!parsed.ok) return parsed.response;
  const body = parsed.value as { action?: unknown; payload?: unknown } | null;
  const action = clean(body?.action, 80);
  const payload = body?.payload && typeof body.payload === "object" ? body.payload as Record<string, unknown> : {};
  const actor = access.user.email;
  const db = getDb();
  try {
    if (action === "create-opportunity") {
      const title = clean(payload.title, 180);
      const clientName = clean(payload.clientName, 180);
      const projectType = clean(payload.projectType, 100);
      const scopeSummary = clean(payload.scopeSummary, 4000);
      const cityId = positiveInteger(payload.cityId);
      const bidDueDate = isoDate(payload.bidDueDate, true);
      const expectedStartDate = isoDate(payload.expectedStartDate, true);
      const estimatedValueHalalas = positiveInteger(payload.estimatedValueHalalas, true);
      if (title.length < 3 || clientName.length < 2 || !projectType || scopeSummary.length < 20 || !cityId || bidDueDate === "" || expectedStartDate === "") throw new Error("بيانات فرصة المقاولات غير مكتملة");
      const city = await db.query.serviceCities.findFirst({ where: eq(serviceCities.id, cityId) });
      if (!city || city.status !== "active") throw new Error("المدينة غير متاحة في سجل التغطية");
      const [opportunity] = await db.insert(constructionOpportunities).values({
        opportunityCode: reference("COP"), clientName, title, cityId, projectType, scopeSummary,
        estimatedValueHalalas, expectedStartDate, bidDueDate, ownerEmail: clean(payload.ownerEmail, 160).toLowerCase() || actor,
        stage: "new", createdBy: actor,
      }).returning();
      await auditPortalAction({ actorEmail: actor, action, entityType: "construction-opportunity", entityId: opportunity.id, after: opportunity, correlationId });
      await recordStatusChange({ entityType: "construction-opportunity", entityId: opportunity.id, toStatus: "new", actorEmail: actor, correlationId });
      await enqueueOutbox({ eventType: "construction.opportunity.created", aggregateType: "construction-opportunity", aggregateId: opportunity.id, payload: { opportunityId: opportunity.id, cityId } });
      await emitPortalNotification({ eventType: "construction-opportunity-created", title: "فرصة مقاولات جديدة", message: `${opportunity.opportunityCode} — ${opportunity.title} — ${clientName}.`, severity: "info", module: "construction", entityType: "construction-opportunity", entityId: opportunity.id, actionView: "construction", targetRole: "manager" }).catch(() => undefined);
      return jsonNoStore({ opportunity }, { status: 201 });
    }

    if (action === "update-opportunity-stage") {
      const id = positiveInteger(payload.id);
      const stage = clean(payload.stage, 30);
      const allowed = ["new","qualified","survey","estimating","review","submitted","negotiation","won","lost","declined"];
      if (!id || !allowed.includes(stage)) throw new Error("حالة الفرصة غير صحيحة");
      const current = await db.query.constructionOpportunities.findFirst({ where: eq(constructionOpportunities.id, id) });
      if (!current) throw new Error("الفرصة غير موجودة");
      const [opportunity] = await db.update(constructionOpportunities).set({ stage, lossReason: ["lost","declined"].includes(stage) ? clean(payload.reason, 1000) || null : null, updatedAt: new Date().toISOString(), version: current.version + 1 }).where(and(eq(constructionOpportunities.id, id), eq(constructionOpportunities.version, current.version))).returning();
      if (!opportunity) throw new Error("عُدلت الفرصة من مستخدم آخر؛ حدّث الصفحة");
      await auditPortalAction({ actorEmail: actor, action, entityType: "construction-opportunity", entityId: id, before: current, after: opportunity, correlationId });
      await recordStatusChange({ entityType: "construction-opportunity", entityId: id, fromStatus: current.stage, toStatus: stage, reason: clean(payload.reason, 1000) || undefined, actorEmail: actor, correlationId });
      await emitPortalNotification({ eventType: "construction-opportunity-stage-updated", title: "تحديث مرحلة فرصة مقاولات", message: `${opportunity.opportunityCode} — أصبحت ${stage}.`, severity: stage === "won" ? "success" : ["lost","declined"].includes(stage) ? "warning" : "info", module: "construction", entityType: "construction-opportunity", entityId: id, actionView: "construction", targetRole: "manager" }).catch(() => undefined);
      return jsonNoStore({ opportunity });
    }

    if (action === "create-project-from-opportunity") {
      const opportunityId = positiveInteger(payload.opportunityId);
      const startDate = isoDate(payload.startDate);
      const plannedEndDate = isoDate(payload.plannedEndDate);
      const contractValueHalalas = positiveInteger(payload.contractValueHalalas, true);
      const budgetHalalas = positiveInteger(payload.budgetHalalas, true);
      if (!opportunityId || !startDate || !plannedEndDate || plannedEndDate < startDate || contractValueHalalas == null || budgetHalalas == null) throw new Error("بيانات إنشاء المشروع غير صحيحة");
      const opportunity = await db.query.constructionOpportunities.findFirst({ where: eq(constructionOpportunities.id, opportunityId) });
      if (!opportunity || opportunity.stage !== "won") throw new Error("يجب تحويل الفرصة إلى فوز قبل إنشاء المشروع");
      const existing = await db.query.constructionProjects.findFirst({ where: eq(constructionProjects.opportunityId, opportunityId) });
      if (existing) throw new Error("أُنشئ مشروع لهذه الفرصة سابقًا");
      const projectCode = reference("PRJ");
      const costCenterCode = `CC-${projectCode}`;
      const project = await db.transaction(async (tx) => {
        const [created] = await tx.insert(constructionProjects).values({
          projectCode, opportunityId, clientId: opportunity.clientId, clientName: opportunity.clientName,
          title: opportunity.title, cityId: opportunity.cityId, projectType: opportunity.projectType,
          contractValueHalalas, budgetHalalas, startDate, plannedEndDate,
          managerEmail: clean(payload.managerEmail, 160).toLowerCase() || opportunity.ownerEmail,
          costCenterCode, createdBy: actor,
        }).returning();
        await tx.insert(costCenters).values({ code: costCenterCode, nameAr: `مشروع ${created.title}`, centerType: "project", status: "active", createdBy: actor });
        const [locked] = await tx.update(constructionOpportunities).set({ stage: "won", updatedAt: new Date().toISOString(), version: opportunity.version + 1 }).where(and(eq(constructionOpportunities.id, opportunity.id), eq(constructionOpportunities.version, opportunity.version))).returning({ id: constructionOpportunities.id });
        if (!locked) throw new Error("عُدلت الفرصة من مستخدم آخر؛ حدّث الصفحة");
        return created;
      });
      await auditPortalAction({ actorEmail: actor, action, entityType: "construction-project", entityId: project.id, after: project, correlationId });
      await recordStatusChange({ entityType: "construction-project", entityId: project.id, toStatus: "mobilizing", actorEmail: actor, correlationId });
      await enqueueOutbox({ eventType: "construction.project.created", aggregateType: "construction-project", aggregateId: project.id, payload: { projectId: project.id, opportunityId, costCenterCode } });
      await emitPortalNotification({ eventType: "construction-project-created", title: "أُنشئ مشروع مقاولات", message: `${project.projectCode} — ${project.title} — مركز التكلفة ${costCenterCode}.`, severity: "success", module: "construction", entityType: "construction-project", entityId: project.id, actionView: "construction", targetRole: "manager" }).catch(() => undefined);
      return jsonNoStore({ project }, { status: 201 });
    }

    if (action === "upsert-coverage") {
      const cityId = positiveInteger(payload.cityId);
      const businessLineId = positiveInteger(payload.businessLineId);
      const availability = clean(payload.availability, 20);
      const capacityLevel = clean(payload.capacityLevel, 30);
      const mobilizationDays = payload.mobilizationDays === "" || payload.mobilizationDays == null ? null : positiveInteger(payload.mobilizationDays, true);
      if (!cityId || !businessLineId || !["available","conditional","unavailable"].includes(availability) || !["high","medium","limited","review_required"].includes(capacityLevel) || (payload.mobilizationDays !== "" && payload.mobilizationDays != null && mobilizationDays == null)) throw new Error("بيانات التغطية غير صحيحة");
      const publicApproved = payload.publicApproved === true && access.role === "admin";
      const now = new Date().toISOString();
      const [coverage] = await db.insert(serviceCoverage).values({ cityId, businessLineId, availability, capacityLevel, mobilizationDays, ownerEmail: clean(payload.ownerEmail, 160).toLowerCase() || actor, operatingNotes: clean(payload.operatingNotes, 2000) || null, publicApproved, reviewedBy: publicApproved ? actor : null, reviewedAt: publicApproved ? now : null }).onConflictDoUpdate({ target: [serviceCoverage.cityId, serviceCoverage.businessLineId], set: { availability, capacityLevel, mobilizationDays, ownerEmail: clean(payload.ownerEmail, 160).toLowerCase() || actor, operatingNotes: clean(payload.operatingNotes, 2000) || null, publicApproved, reviewedBy: publicApproved ? actor : null, reviewedAt: publicApproved ? now : null, updatedAt: now } }).returning();
      await auditPortalAction({ actorEmail: actor, action, entityType: "service-coverage", entityId: coverage.id, after: coverage, correlationId });
      await emitPortalNotification({ eventType: "service-coverage-updated", title: "تحديث تغطية مدينة", message: `تم تحديث سجل التغطية التشغيلي رقم ${coverage.id}${publicApproved ? " واعتماده للنشر" : " ويحتاج اعتماد النشر"}.`, severity: publicApproved ? "success" : "info", module: "construction", entityType: "service-coverage", entityId: coverage.id, actionView: "construction", targetRole: "manager" }).catch(() => undefined);
      return jsonNoStore({ coverage });
    }

    if (action === "create-record") {
      const recordType = clean(payload.recordType, 40);
      const allowedTypes = ["survey","estimate","boq","contract","wbs","daily_log","document","rfi","submittal","inspection","ncr","safety","procurement","subcontract","change_order","payment_certificate","handover","risk"];
      const title = clean(payload.title, 180);
      const description = clean(payload.description, 6000);
      const projectId = payload.projectId ? positiveInteger(payload.projectId) : null;
      const opportunityId = payload.opportunityId ? positiveInteger(payload.opportunityId) : null;
      const dueDate = isoDate(payload.dueDate, true);
      const amountHalalas = payload.amountHalalas === "" || payload.amountHalalas == null ? null : positiveInteger(payload.amountHalalas, true);
      const retentionBps = payload.retentionBps === "" || payload.retentionBps == null ? 0 : positiveInteger(payload.retentionBps, true);
      if (!allowedTypes.includes(recordType) || title.length < 3 || description.length < 5 || dueDate === "" || amountHalalas === null && payload.amountHalalas !== "" && payload.amountHalalas != null || retentionBps == null || retentionBps > 10000) throw new Error("بيانات سجل المقاولات غير مكتملة");
      if (projectId && !(await db.query.constructionProjects.findFirst({ where: eq(constructionProjects.id, projectId) }))) throw new Error("المشروع غير موجود");
      if (opportunityId && !(await db.query.constructionOpportunities.findFirst({ where: eq(constructionOpportunities.id, opportunityId) }))) throw new Error("الفرصة غير موجودة");
      if (["wbs","daily_log","document","rfi","submittal","inspection","ncr","safety","procurement","subcontract","change_order","payment_certificate","handover","risk"].includes(recordType) && !projectId) throw new Error("يجب ربط هذا السجل بمشروع");
      const prefix:Record<string,string>={survey:"SRV",estimate:"EST",boq:"BOQ",contract:"CNT",wbs:"WBS",daily_log:"LOG",document:"DOC",rfi:"RFI",submittal:"SUB",inspection:"INS",ncr:"NCR",safety:"HSE",procurement:"PRC",subcontract:"SCT",change_order:"CO",payment_certificate:"IPC",handover:"HND",risk:"RSK"};
      const [record] = await db.insert(constructionRecords).values({ recordCode: reference(prefix[recordType]), recordType, opportunityId, projectId, title, description, status: "draft", priority: clean(payload.priority, 20) || "normal", responsibleEmail: clean(payload.responsibleEmail, 160).toLowerCase() || actor, dueDate, amountHalalas, retentionBps, createdBy: actor }).returning();
      await auditPortalAction({ actorEmail: actor, action, entityType: `construction-${recordType}`, entityId: record.id, after: record, correlationId });
      await enqueueOutbox({ eventType: `construction.${recordType}.created`, aggregateType: `construction-${recordType}`, aggregateId: record.id, payload: { recordId: record.id, projectId, opportunityId } });
      await emitPortalNotification({ eventType: `construction-${recordType}-created`, title: "سجل جديد في قطاع المقاولات", message: `${record.recordCode} — ${record.title}.`, severity: record.priority === "critical" ? "critical" : "info", module: "construction", entityType: `construction-${recordType}`, entityId: record.id, actionView: "construction", targetRole: "manager" }).catch(() => undefined);
      return jsonNoStore({ record }, { status: 201 });
    }

    if (action === "update-record-status") {
      const id = positiveInteger(payload.id);
      const status = clean(payload.status, 40);
      const allowedStatuses = ["draft","open","in_review","submitted","approved","approved_as_noted","revise_resubmit","rejected","answered","closed","void","contained","corrective_action","verified","requested","sourcing","ordered","partially_received","received","pricing","negotiated","certified","invoiced","partially_paid","paid","active","complete","cancelled"];
      if (!id || !allowedStatuses.includes(status)) throw new Error("حالة السجل غير صحيحة");
      const current = await db.query.constructionRecords.findFirst({ where: eq(constructionRecords.id, id) });
      if (!current) throw new Error("السجل غير موجود");
      const [record] = await db.update(constructionRecords).set({ status, updatedAt: new Date().toISOString(), version: current.version + 1 }).where(and(eq(constructionRecords.id, id), eq(constructionRecords.version, current.version))).returning();
      if (!record) throw new Error("عُدل السجل من مستخدم آخر؛ حدّث الصفحة");
      await auditPortalAction({ actorEmail: actor, action, entityType: `construction-${record.recordType}`, entityId: id, before: current, after: record, correlationId });
      await recordStatusChange({ entityType: `construction-${record.recordType}`, entityId: id, fromStatus: current.status, toStatus: status, actorEmail: actor, correlationId });
      await emitPortalNotification({ eventType: `construction-${record.recordType}-status`, title: "تحديث حالة سجل مقاولات", message: `${record.recordCode} — ${status}.`, severity: ["rejected","cancelled"].includes(status) ? "warning" : status === "approved" || status === "closed" ? "success" : "info", module: "construction", entityType: `construction-${record.recordType}`, entityId: id, actionView: "construction", targetRole: "manager" }).catch(() => undefined);
      return jsonNoStore({ record });
    }

    if (action === "add-record-line") {
      const recordId = positiveInteger(payload.recordId);
      const description = clean(payload.description, 1000);
      const unit = clean(payload.unit, 30) || null;
      const quantityMilli = positiveInteger(payload.quantityMilli, true);
      const unitRateHalalas = positiveInteger(payload.unitRateHalalas, true);
      if (!recordId || description.length < 2 || quantityMilli == null || unitRateHalalas == null) throw new Error("بيانات البند غير صحيحة");
      const parent = await db.query.constructionRecords.findFirst({ where: eq(constructionRecords.id, recordId) });
      if (!parent || !["boq","estimate","wbs","payment_certificate","change_order"].includes(parent.recordType)) throw new Error("لا يقبل هذا السجل بنوداً تفصيلية");
      const existingLines = await db.select({ id: constructionRecordLines.id }).from(constructionRecordLines).where(eq(constructionRecordLines.recordId, recordId));
      const totalHalalas = Math.round(quantityMilli * unitRateHalalas / 1000);
      const [line] = await db.insert(constructionRecordLines).values({ recordId, lineNumber: existingLines.length + 1, itemCode: clean(payload.itemCode, 50) || null, description, unit, quantityMilli, unitRateHalalas, totalHalalas }).returning();
      await auditPortalAction({ actorEmail: actor, action, entityType: "construction-record-line", entityId: line.id, after: line, correlationId });
      return jsonNoStore({ line }, { status: 201 });
    }

    return jsonNoStore({ error: "الإجراء غير معروف" }, { status: 400 });
  } catch (error) {
    console.error("construction-workspace-action-failed", correlationId, error);
    return jsonNoStore({ error: error instanceof Error ? error.message : "تعذر تنفيذ الإجراء" }, { status: 400 });
  }
}
