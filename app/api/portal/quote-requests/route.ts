import { and, desc, eq, or } from "drizzle-orm";
import { getDb } from "@/db";
import { representativeRequests, salesRepresentatives, visitorConversations, workforceRequests } from "@/db/schema";
import { parseWorkforceRequestInput } from "@/lib/workforce-request-input";
import { WorkflowError } from "@/lib/quote-request-workflow";
import { canAdministerPortalUsers, hasPortalPermission, requirePortalApiRole } from "@/lib/portal-access";
import { auditPortalAction } from "@/lib/audit";
import { emitPortalNotification } from "@/lib/portal-notifications";
import { jsonNoStore, readLimitedJson, rejectCrossSiteRequest } from "@/lib/security";
import { makeReference } from "@/lib/company-documents";
export async function GET() {
    const access = await requirePortalApiRole(["admin", "manager", "employee"]);
    if (!access)
        return jsonNoStore({ error: "غير مصرح" }, { status: 403 });
    const requests = await getDb().select().from(workforceRequests).where(and(eq(workforceRequests.requestType, "quotation"), canAdministerPortalUsers(access) ? undefined : or(eq(workforceRequests.originEmail, access.user.email), eq(workforceRequests.assignedTo, access.user.email)))).orderBy(desc(workforceRequests.updatedAt)).limit(200);
    return jsonNoStore({ requests });
}
export async function POST(request: Request) {
    if (rejectCrossSiteRequest(request))
        return jsonNoStore({ error: "مصدر الطلب غير مسموح" }, { status: 403 });
    const access = await requirePortalApiRole(["admin", "manager", "employee"]);
    if (!access)
        return jsonNoStore({ error: "غير مصرح" }, { status: 403 });
    const parsed = await readLimitedJson(request, 200000);
    if (!parsed.ok)
        return parsed.response;
    const body = parsed.value as Record<string, unknown>;
    try {
        let values: ReturnType<typeof parseWorkforceRequestInput>;
        try {
            values = parseWorkforceRequestInput({ ...body, requestType: "quotation" });
        }
        catch (error) {
            throw new WorkflowError(error instanceof Error ? error.message : "بيانات الطلب غير صحيحة");
        }
        const db = getDb(), root = canAdministerPortalUsers(access), repId = Number(body.representativeId || 0), id = Number(body.requestId || 0);
        const rep = repId ? await db.query.salesRepresentatives.findFirst({ where: eq(salesRepresentatives.id, repId) }) : null;
        if (repId && (!rep || rep.status !== "active" || (!root && (rep.email?.toLowerCase() !== access.user.email.toLowerCase() || !await hasPortalPermission(access, "representatives", "write")))))
            throw new WorkflowError("لا يمكنك تقديم الطلب باسم هذا المندوب", 403);
        if (!repId && !root && !await hasPortalPermission(access, "conversations", "write") && !await hasPortalPermission(access, "workforce", "write"))
            throw new WorkflowError("غير مصرح", 403);
        const conversationId = typeof body.conversationId === "string" ? body.conversationId.slice(0, 80) : null;
        if (conversationId && !await db.query.visitorConversations.findFirst({ where: eq(visitorConversations.id, conversationId) }))
            throw new WorkflowError("المحادثة غير موجودة", 404);
        const saved = await db.transaction(async (tx) => {
            const now = new Date().toISOString();
            if (id) {
                const [before] = await tx.select().from(workforceRequests).where(eq(workforceRequests.id, id)).for("update");
                if (!before || (!root && before.originEmail !== access.user.email && before.assignedTo !== access.user.email))
                    throw new WorkflowError("غير مصرح بتعديل هذا الطلب", 403);
                if (before.approvalStatus !== "changes_requested" || before.version !== Number(body.version))
                    throw new WorkflowError("لا يقبل الطلب التعديل الآن؛ حدّث الصفحة", 409);
                const { idempotencyKey: _key, ...updatedValues } = values;
                void _key;
                const [updated] = await tx.update(workforceRequests).set({ ...updatedValues, approvalStatus: "pending", approvedAt: null, approvedBy: null, version: before.version + 1, updatedAt: now }).where(eq(workforceRequests.id, id)).returning();
                await tx.update(representativeRequests).set({ status: "submitted", clientName: values.companyName, clientMobile: values.mobile, details: values.details, workSite: values.workSite, itemsJson: values.quotationItemsJson, updatedAt: now }).where(eq(representativeRequests.workforceRequestId, id));
                return updated;
            }
            const [created] = await tx.insert(workforceRequests).values({ ...values, trackingCode: makeReference("DAL"), source: rep ? "representative" : conversationId ? "conversation" : "portal", originEmail: rep?.email || access.user.email, originConversationId: conversationId, assignedTo: access.user.email }).onConflictDoNothing({ target: workforceRequests.idempotencyKey }).returning();
            if (!created) {
                const existing = await tx.query.workforceRequests.findFirst({ where: and(eq(workforceRequests.idempotencyKey, values.idempotencyKey!), eq(workforceRequests.assignedTo, access.user.email)) });
                if (!existing)
                    throw new WorkflowError("تعذر تسجيل الطلب المكرر", 409);
                return existing;
            }
            const legacyId = Number(body.legacyRepresentativeRequestId || 0);
            if (legacyId) {
                const [legacy] = await tx.select().from(representativeRequests).where(eq(representativeRequests.id, legacyId)).for("update");
                if (!rep || !legacy || legacy.representativeId !== rep.id || legacy.workforceRequestId || legacy.quoteVersionId || !["submitted", "changes_requested", "approved"].includes(legacy.status))
                    throw new WorkflowError("الطلب السابق غير قابل للاستكمال", 409);
                await tx.update(representativeRequests).set({ workforceRequestId: created.id, status: "submitted", clientName: values.companyName, clientMobile: values.mobile, workSite: values.workSite, details: values.details, itemsJson: values.quotationItemsJson, updatedAt: now }).where(eq(representativeRequests.id, legacyId));
            }
            else {
                if (rep)
                    await tx.insert(representativeRequests).values({ requestCode: created.trackingCode, workforceRequestId: created.id, representativeId: rep.id, requestType: "sales", clientName: values.companyName, clientMobile: values.mobile, workSite: values.workSite, title: `طلب عرض سعر — ${values.companyName}`, details: values.details, itemsJson: values.quotationItemsJson, createdBy: access.user.email });
            }
            return created;
        });
        await auditPortalAction({ actorEmail: access.user.email, action: id ? "quote-request-resubmitted" : "quote-request-submitted", entityType: "workforce-request", entityId: saved.id, after: saved });
        await emitPortalNotification({ eventType: "quote-request-submitted", dedupeKey: `quote-request-review:${saved.id}:${saved.version}`, title: "طلب عرض سعر ينتظر الاعتماد", message: `${saved.trackingCode} — ${saved.companyName}`, severity: "warning", module: "workforce", entityType: "workforce-request", entityId: saved.id, actionView: rep ? "representatives" : "workforce", targetRole: "admin" }).catch(() => undefined);
        return jsonNoStore({ request: saved, trackingCode: saved.trackingCode }, { status: id ? 200 : 201 });
    }
    catch (error) {
        return jsonNoStore({ error: error instanceof WorkflowError ? error.message : "تعذر حفظ الطلب" }, { status: error instanceof WorkflowError ? error.status : 500 });
    }
}
