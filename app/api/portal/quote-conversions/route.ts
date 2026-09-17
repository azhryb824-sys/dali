import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { quoteConversionRequests, quoteVersions, workforceContracts } from "@/db/schema";
import { ownRepresentativeQuote, WorkflowError } from "@/lib/quote-request-workflow";
import { hasPortalPermission, requirePortalApiRole } from "@/lib/portal-access";
import { auditPortalAction } from "@/lib/audit";
import { emitPortalNotification } from "@/lib/portal-notifications";
import { jsonNoStore, readLimitedJson, rejectCrossSiteRequest } from "@/lib/security";
export async function POST(request: Request) {
    if (rejectCrossSiteRequest(request))
        return jsonNoStore({ error: "مصدر الطلب غير مسموح" }, { status: 403 });
    const access = await requirePortalApiRole(["admin", "manager", "employee"]);
    if (!access)
        return jsonNoStore({ error: "غير مصرح" }, { status: 403 });
    const parsed = await readLimitedJson(request, 2000);
    if (!parsed.ok)
        return parsed.response;
    const id = Number((parsed.value as Record<string, unknown>).quoteId);
    if (!Number.isSafeInteger(id) || id < 1)
        return jsonNoStore({ error: "العرض غير صحيح" }, { status: 400 });
    if (!await hasPortalPermission(access, "contracts", "write") && !await ownRepresentativeQuote(access, id))
        return jsonNoStore({ error: "غير مصرح" }, { status: 403 });
    try {
        const saved = await getDb().transaction(async (tx) => {
            const [quote] = await tx.select().from(quoteVersions).where(eq(quoteVersions.id, id)).for("update");
            if (!quote?.approvedBy || !["approved", "sent", "accepted"].includes(quote.status))
                throw new WorkflowError("يلزم عرض سعر معتمد", 409);
            if (await tx.query.workforceContracts.findFirst({ where: eq(workforceContracts.quoteVersionId, id) }))
                throw new WorkflowError("تم تحويل العرض إلى عقد مسبقًا", 409);
            const [created] = await tx.insert(quoteConversionRequests).values({ quoteVersionId: id, requestedBy: access.user.email }).onConflictDoNothing().returning();
            return created || await tx.query.quoteConversionRequests.findFirst({ where: eq(quoteConversionRequests.quoteVersionId, id) });
        });
        await auditPortalAction({ actorEmail: access.user.email, action: "quote-conversion-requested", entityType: "quote-version", entityId: id, after: saved });
        await emitPortalNotification({ eventType: "quote-conversion-requested", dedupeKey: `quote-conversion:${id}`, title: "طلب تحويل عرض سعر إلى عقد", message: `عرض #${id} — راجع الطلب في صفحة عروض الأسعار.`, severity: "warning", module: "sales", entityType: "quote-version", entityId: id, actionView: "contractual-documents", targetRole: "admin" }).catch(() => undefined);
        return jsonNoStore({ conversion: saved }, { status: 201 });
    }
    catch (error) {
        return jsonNoStore({ error: error instanceof Error ? error.message : "تعذر تسجيل الطلب" }, { status: error instanceof WorkflowError ? error.status : 500 });
    }
}
