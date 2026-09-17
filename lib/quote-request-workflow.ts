import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { representativeRequests, workforceRequests } from "@/db/schema";
import { auditPortalAction } from "@/lib/audit";
import { emitPortalNotification } from "@/lib/portal-notifications";
import { canAdministerPortalUsers, type PortalAccess } from "@/lib/portal-access";
export class WorkflowError extends Error {
    constructor(message: string, public status = 400) { super(message); }
}
export async function decideQuoteRequest(access: PortalAccess, id: number, version: number, decision: string, reason: string) {
    if (!canAdministerPortalUsers(access))
        throw new WorkflowError("اعتماد الطلب للمالك أو مشرف النظام فقط", 403);
    if (!["approved", "rejected", "changes_requested"].includes(decision))
        throw new WorkflowError("القرار غير صحيح");
    if (decision === "changes_requested" && reason.length < 5)
        throw new WorkflowError("حدد التعديلات المطلوبة");
    const db = getDb();
    const result = await db.transaction(async (tx) => {
        const [before] = await tx.select().from(workforceRequests).where(eq(workforceRequests.id, id)).for("update");
        if (!before || before.requestType !== "quotation" || before.approvalStatus !== "pending" || before.version !== version)
            throw new WorkflowError("تغير الطلب أو أنه لا ينتظر المراجعة؛ حدّث الصفحة", 409);
        const now = new Date().toISOString();
        const [updated] = await tx.update(workforceRequests).set({ approvalStatus: decision, approvalReason: reason || null, approvedBy: decision === "approved" ? access.user.email : null, approvedAt: decision === "approved" ? now : null, version: before.version + 1, updatedAt: now }).where(eq(workforceRequests.id, id)).returning();
        const [rep] = await tx.update(representativeRequests).set({ status: decision, decisionReason: reason || null, decidedBy: access.user.email, decidedAt: now, updatedAt: now }).where(eq(representativeRequests.workforceRequestId, id)).returning();
        return { before, updated, rep };
    });
    await auditPortalAction({ actorEmail: access.user.email, action: `quote-request-${decision}`, entityType: "workforce-request", entityId: id, before: result.before, after: result.updated, reason });
    await emitPortalNotification({ eventType: `quote-request-${decision}`, title: decision === "approved" ? "اعتمد طلب عرض السعر" : decision === "changes_requested" ? "أعيد طلب عرض السعر للتعديل" : "رُفض طلب عرض السعر بدون تعديلات", message: `${result.updated.trackingCode} — ${reason || (decision === "approved" ? "متاح لإنشاء عرض سعر" : "رفض نهائي")}`, severity: decision === "approved" ? "success" : "warning", module: "workforce", entityType: "workforce-request", entityId: id, actionView: result.rep ? "representatives" : result.updated.originConversationId ? "conversations" : "workforce", targetEmail: result.updated.originEmail || result.updated.assignedTo || undefined, targetDepartment: result.updated.originEmail ? undefined : "workforce" }).catch(() => undefined);
    if (decision === "approved")
        await emitPortalNotification({ eventType: "quote-request-ready", title: "طلب معتمد جاهز لإعداد العرض", message: result.updated.trackingCode, severity: "info", module: "sales", entityType: "workforce-request", entityId: id, actionView: "contractual-documents", targetRole: "admin" }).catch(() => undefined);
    return result.updated;
}
export async function ownRepresentativeQuote(access: PortalAccess, quoteId: number) {
    if (!(access.functionalRoles.includes("sales_representative") || access.functionalRoles.includes("purchasing_representative")))
        return false;
    const db = getDb();
    const row = await db.query.representativeRequests.findFirst({ where: eq(representativeRequests.quoteVersionId, quoteId) });
    if (!row)
        return false;
    const representative = await db.query.salesRepresentatives.findFirst({ where: (table, { eq, and }) => and(eq(table.id, row.representativeId), eq(table.status, "active")) });
    return representative?.email?.toLowerCase() === access.user.email.toLowerCase();
}
