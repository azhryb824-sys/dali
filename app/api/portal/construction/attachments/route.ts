import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { constructionProjects, constructionRecordAttachments, constructionRecords } from "@/db/schema";
import { auditPortalAction, recordStatusChange } from "@/lib/audit";
import { canApproveOwn, canCreateConstructionRecord, getActivePortalScopes, scopeAllowsProject } from "@/lib/access-policy";
import { objectKey, safeFileName, uploadContentTypes } from "@/lib/company-documents";
import { hasPortalPermission, requirePortalApiRole } from "@/lib/portal-access";
import { emitPortalNotification } from "@/lib/portal-notifications";
import { getRuntimeEnv } from "@/lib/runtime-env";
import { jsonNoStore, readLimitedJson, rejectCrossSiteRequest, requestCorrelationId, validateUploadedFile } from "@/lib/security";

const MAX_BYTES = 20 * 1024 * 1024;
const engineeringTypes = new Set(["daily_log", "document", "rfi", "submittal", "inspection", "ncr", "safety", "handover"]);
const reviewStatuses = new Set(["under_review", "approved", "approved_as_noted", "revise_resubmit", "rejected"]);
const text = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";

async function authorization(recordId: number, write = false) {
  const access = await requirePortalApiRole(["admin", "manager", "employee"]);
  if (!access) return null;
  const scopes = await getActivePortalScopes(access);
  const permitted = await hasPortalPermission(access, "construction", write ? "write" : "read");
  if (!permitted && !(write && scopes.length)) return null;
  const record = await getDb().query.constructionRecords.findFirst({ where: eq(constructionRecords.id, recordId) });
  if (!record || !engineeringTypes.has(record.recordType)) return null;
  const project = record.projectId ? await getDb().query.constructionProjects.findFirst({ where: eq(constructionProjects.id, record.projectId) }) : null;
  if (!scopeAllowsProject(access, scopes, record.projectId, project?.cityId ?? null)) return null;
  if (write && !canCreateConstructionRecord(access, scopes, record.recordType)) return null;
  return { access, scopes, record };
}

export async function GET(request: Request) {
  const recordId = Number(new URL(request.url).searchParams.get("recordId"));
  if (!Number.isInteger(recordId) || recordId < 1) return jsonNoStore({ error: "معرف السجل غير صحيح" }, { status: 400 });
  if (!(await authorization(recordId))) return jsonNoStore({ error: "غير مصرح بعرض ملفات هذا السجل" }, { status: 403 });
  const attachments = await getDb().select().from(constructionRecordAttachments)
    .where(eq(constructionRecordAttachments.recordId, recordId)).orderBy(desc(constructionRecordAttachments.revision));
  return jsonNoStore({ attachments });
}

export async function POST(request: Request) {
  if (rejectCrossSiteRequest(request)) return jsonNoStore({ error: "مصدر الطلب غير مسموح" }, { status: 403 });
  let storageKey = "";
  try {
    const form = await request.formData();
    const recordId = Number(form.get("recordId"));
    const auth = Number.isInteger(recordId) && recordId > 0 ? await authorization(recordId, true) : null;
    if (!auth) return jsonNoStore({ error: "غير مصرح برفع ملف لهذا السجل" }, { status: 403 });
    const file = form.get("file");
    const title = text(form.get("title"), 180);
    if (!(file instanceof File) || title.length < 3) return jsonNoStore({ error: "أدخل عنوانًا واختر ملفًا صالحًا" }, { status: 400 });
    const validation = await validateUploadedFile(file, { contentTypes: uploadContentTypes, maxBytes: MAX_BYTES });
    if (!validation.valid) return jsonNoStore({ error: validation.error }, { status: 400 });
    const db = getDb();
    const current = await db.query.constructionRecordAttachments.findFirst({ where: and(eq(constructionRecordAttachments.recordId, recordId), eq(constructionRecordAttachments.isCurrent, true)), orderBy: desc(constructionRecordAttachments.revision) });
    const revision = (current?.revision ?? 0) + 1;
    const fileName = safeFileName(file.name);
    storageKey = objectKey(`construction/${recordId}`, fileName);
    await getRuntimeEnv().BUCKET.put(storageKey, validation.bytes, { httpMetadata: { contentType: file.type }, customMetadata: { uploadedBy: auth.access.user.email, recordCode: auth.record.recordCode, revision: String(revision), validation: validation.validationDetails } });
    const transmittalCode = `TR-${auth.record.recordCode}-${String(revision).padStart(2, "0")}`;
    const saved = await db.transaction(async (tx) => {
      if (current) await tx.update(constructionRecordAttachments).set({ isCurrent: false, status: "superseded", updatedAt: new Date().toISOString() }).where(eq(constructionRecordAttachments.id, current.id));
      const [created] = await tx.insert(constructionRecordAttachments).values({ recordId, revision, transmittalCode, title, fileName, storageKey, contentType: file.type, sizeBytes: file.size, createdBy: auth.access.user.email }).returning();
      return created;
    });
    await auditPortalAction({ actorEmail: auth.access.user.email, action: "construction-engineering-file-submitted", entityType: "construction-record-attachment", entityId: saved.id, after: { recordId, revision, transmittalCode }, correlationId: requestCorrelationId(request) });
    await emitPortalNotification({ eventType: "construction-engineering-file-submitted", title: "إحالة هندسية جديدة", message: `${transmittalCode} — ${title}.`, severity: "info", module: "construction", entityType: "construction-record", entityId: recordId, actionView: "construction", targetRole: "manager" }).catch(() => undefined);
    return jsonNoStore({ attachment: saved }, { status: 201 });
  } catch (error) {
    if (storageKey) await getRuntimeEnv().BUCKET.delete(storageKey).catch(() => undefined);
    console.error("construction-attachment-upload-failed", error);
    return jsonNoStore({ error: "تعذّر حفظ إصدار الملف الهندسي" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  if (rejectCrossSiteRequest(request)) return jsonNoStore({ error: "مصدر الطلب غير مسموح" }, { status: 403 });
  const parsed = await readLimitedJson(request, 8_000);
  if (!parsed.ok) return parsed.response;
  const body = parsed.value as Record<string, unknown>;
  const id = Number(body.id);
  const status = text(body.status, 30);
  if (!Number.isInteger(id) || id < 1 || !reviewStatuses.has(status)) return jsonNoStore({ error: "بيانات المراجعة غير صحيحة" }, { status: 400 });
  const db = getDb();
  const current = await db.query.constructionRecordAttachments.findFirst({ where: eq(constructionRecordAttachments.id, id) });
  if (!current) return jsonNoStore({ error: "الإصدار غير موجود" }, { status: 404 });
  const auth = await authorization(current.recordId, true);
  if (!auth) return jsonNoStore({ error: "غير مصرح بمراجعة هذا الإصدار" }, { status: 403 });
  if (!(await hasPortalPermission(auth.access, "construction", "approve"))) return jsonNoStore({ error: "قرار مراجعة الإصدار يتطلب صلاحية اعتماد المقاولات" }, { status: 403 });
  if (current.createdBy === auth.access.user.email && !canApproveOwn(auth.scopes)) return jsonNoStore({ error: "فصل الواجبات يمنع منشئ الإصدار من اعتماده" }, { status: 409 });
  const rejectionReason = text(body.rejectionReason, 1000);
  if (["rejected", "revise_resubmit"].includes(status) && rejectionReason.length < 5) return jsonNoStore({ error: "سبب الرفض أو طلب التعديل إلزامي" }, { status: 400 });
  const now = new Date().toISOString();
  const [updated] = await db.update(constructionRecordAttachments).set({ status, reviewerEmail: auth.access.user.email, reviewNotes: text(body.reviewNotes, 2000) || null, rejectionReason: rejectionReason || null, reviewedAt: now, approvedAt: ["approved", "approved_as_noted"].includes(status) ? now : null, updatedAt: now }).where(eq(constructionRecordAttachments.id, id)).returning();
  await auditPortalAction({ actorEmail: auth.access.user.email, action: "construction-engineering-file-reviewed", entityType: "construction-record-attachment", entityId: id, before: current, after: updated, correlationId: requestCorrelationId(request) });
  await recordStatusChange({ entityType: "construction-record-attachment", entityId: id, fromStatus: current.status, toStatus: status, reason: rejectionReason || text(body.reviewNotes, 1000) || undefined, actorEmail: auth.access.user.email });
  return jsonNoStore({ attachment: updated });
}
