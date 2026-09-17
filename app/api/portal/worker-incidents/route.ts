import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { contractWorkerAbsences, contractProfessions, contractWorkerAssignments, workerIncidents, workerPayrollDeductions, workers, workforceContracts } from "@/db/schema";
import { auditPortalAction } from "@/lib/audit";
import { attachmentHeaders, cleanText, makeReference, objectKey, safeFileName } from "@/lib/company-documents";
import { canAdministerPortalUsers, hasPortalPermission, requirePortalApiRole, type PortalAccess } from "@/lib/portal-access";
import { emitPortalNotification } from "@/lib/portal-notifications";
import { getRuntimeEnv } from "@/lib/runtime-env";
import { jsonNoStore, readLimitedJson, rejectCrossSiteRequest, validateUploadedFile } from "@/lib/security";
import { chargeableAbsenceDates, isValidIsoDate } from "@/lib/workforce-finance-integrity";
import { WorkflowError } from "@/lib/quote-request-workflow";
const canReport = (a: PortalAccess) => canAdministerPortalUsers(a) || a.functionalRoles.includes("workforce_supervisor");
const reasonOptions: Record<string, string> = { unexplained: "غياب دون إفادة", personal: "ظرف شخصي", medical: "سبب طبي", transport: "تعذر الوصول للموقع", site: "ظرف في موقع العمل" };
const incidentTypes = ["absence", "abandonment", "work_injury", "sick_leave", "other"];
function failure(error: unknown) { return jsonNoStore({ error: error instanceof WorkflowError ? error.message : "تعذر حفظ الحالة؛ حدّث الصفحة وحاول مجددًا" }, { status: error instanceof WorkflowError ? error.status : 409 }); }
export async function GET(request: Request) {
    const access = await requirePortalApiRole(["admin", "manager", "employee"]);
    if (!access || !await hasPortalPermission(access, "workforce", "read"))
        return jsonNoStore({ error: "غير مصرح" }, { status: 403 });
    const params = new URL(request.url).searchParams, id = Number(params.get("file") || 0), workerId = Number(params.get("workerId") || 0), db = getDb();
    if (id) {
        if (!canReport(access))
            return jsonNoStore({ error: "غير مصرح بعرض مرفق الحالة" }, { status: 403 });
        const incident = await db.query.workerIncidents.findFirst({ where: eq(workerIncidents.id, id) });
        if (!incident?.storageKey)
            return jsonNoStore({ error: "المرفق غير موجود" }, { status: 404 });
        const object = await getRuntimeEnv().BUCKET.get(incident.storageKey);
        if (!object)
            return jsonNoStore({ error: "المرفق غير متاح" }, { status: 404 });
        return new Response(object.body, { headers: attachmentHeaders(incident.fileName!, incident.contentType!, object.httpEtag, "attachment") });
    }
    const rows = await db.select().from(workerIncidents).where(workerId ? eq(workerIncidents.workerId, workerId) : undefined).orderBy(desc(workerIncidents.createdAt)).limit(300);
    const canFinance = canAdministerPortalUsers(access) || await hasPortalPermission(access, "finance", "read");
    const [workerRows, assignments, contracts] = canReport(access) ? await Promise.all([db.select({ id: workers.id, fullName: workers.fullName, archivedAt: workers.archivedAt }).from(workers), db.select().from(contractWorkerAssignments).where(inArray(contractWorkerAssignments.status, ["active", "released"])), db.select({ id: workforceContracts.id, referenceCode: workforceContracts.referenceCode, startDate: workforceContracts.startDate, endDate: workforceContracts.endDate, status: workforceContracts.status }).from(workforceContracts)]) : [[], [], []];
    return jsonNoStore({ incidents: rows.map(({ storageKey: _key, ...row }) => { void _key; return canFinance ? row : { ...row, monthlySalaryHalalas: null, deductionHalalas: null }; }), workers: workerRows, assignments, contracts, canReport: canReport(access), canReview: canAdministerPortalUsers(access) });
}
export async function POST(request: Request) {
    if (rejectCrossSiteRequest(request))
        return jsonNoStore({ error: "مصدر الطلب غير مسموح" }, { status: 403 });
    const access = await requirePortalApiRole(["admin", "manager", "employee"]);
    if (!access || !canReport(access))
        return jsonNoStore({ error: "تسجيل الحالة للمالك والمشرف ومشرف العمالة فقط" }, { status: 403 });
    let storageKey: string | null = null, committed = false;
    try {
        if (Number(request.headers.get("content-length")) > 12 * 1024 * 1024)
            throw new WorkflowError("المرفق أكبر من الحد المسموح");
        const form = await request.formData(), workerId = Number(form.get("workerId")), assignmentId = Number(form.get("assignmentId")), incidentType = cleanText(form.get("incidentType"), 30), reasonCode = cleanText(form.get("reasonCode"), 40) || "other", reason = cleanText(form.get("reason"), 2000) || reasonOptions[reasonCode] || "", startDate = cleanText(form.get("startDate"), 10), endDate = cleanText(form.get("endDate"), 10), file = form.get("file");
        if (!incidentTypes.includes(incidentType) || reason.length < 3 || !isValidIsoDate(startDate) || !isValidIsoDate(endDate) || endDate < startDate || endDate > new Date().toISOString().slice(0, 10) || new Date(endDate).getTime() - new Date(startDate).getTime() > 366 * 86400000)
            throw new WorkflowError("أكمل السبب وحدد فترة صحيحة لا تتجاوز سنة ولا تشمل أيامًا مستقبلية");
        const hasFile = file instanceof File && file.size > 0;
        if (["work_injury", "sick_leave"].includes(incidentType) && !hasFile)
            throw new WorkflowError("إرفاق التقرير إلزامي لإصابة العمل أو الإجازة المرضية");
        let attachment = { fileName: null as string | null, contentType: null as string | null, sizeBytes: null as number | null };
        if (hasFile) {
            const validation = await validateUploadedFile(file, { contentTypes: new Set(["application/pdf", "image/png", "image/jpeg"]), maxBytes: 10 * 1024 * 1024 });
            if (!validation.valid)
                throw new WorkflowError(validation.error);
            storageKey = objectKey("worker-incidents", safeFileName(file.name));
            await getRuntimeEnv().BUCKET.put(storageKey, validation.bytes, { httpMetadata: { contentType: file.type } });
            attachment = { fileName: safeFileName(file.name), contentType: file.type, sizeBytes: file.size };
        }
        const db = getDb(), assignment = await db.query.contractWorkerAssignments.findFirst({ where: eq(contractWorkerAssignments.id, assignmentId) });
        if (!assignment || assignment.workerId !== workerId)
            throw new WorkflowError("حدد إسناد العامل المرتبط بالحالة");
        const saved = await db.transaction(async (tx) => {
            const [contract] = await tx.select().from(workforceContracts).where(eq(workforceContracts.id, assignment.contractId)).for("update");
            const [worker] = await tx.select().from(workers).where(eq(workers.id, workerId)).for("update");
            const [current] = await tx.select().from(contractWorkerAssignments).where(eq(contractWorkerAssignments.id, assignmentId)).for("update");
            if (!worker || !contract || !current || !["active", "released"].includes(current.status) || !["active", "suspended", "expired", "terminated"].includes(contract.status) || startDate < contract.startDate || endDate > contract.endDate || startDate < current.assignedAt.slice(0, 10) || (current.releasedAt && endDate > current.releasedAt.slice(0, 10)))
                throw new WorkflowError("الفترة خارج سريان العقد أو مدة إسناد العامل", 409);
            const profession = await tx.query.contractProfessions.findFirst({ where: eq(contractProfessions.id, current.contractProfessionId) });
            const duplicate = await tx.query.workerIncidents.findFirst({ where: and(eq(workerIncidents.workerId, workerId), eq(workerIncidents.status, "pending"), eq(workerIncidents.incidentType, incidentType), sql `${workerIncidents.startDate}<=${endDate} and ${workerIncidents.endDate}>=${startDate}`) });
            if (duplicate)
                throw new WorkflowError("توجد حالة مماثلة قيد المراجعة لهذه الفترة", 409);
            const [created] = await tx.insert(workerIncidents).values({ referenceCode: makeReference("WIN"), workerId, assignmentId, contractId: contract.id, incidentType, reasonCode, reason, startDate, endDate, storageKey, ...attachment, monthlySalaryHalalas: profession?.actualSalaryHalalas || 0, chargeableDays: chargeableAbsenceDates(startDate, endDate).length, createdBy: access.user.email }).returning();
            return created;
        });
        committed = true;
        await auditPortalAction({ actorEmail: access.user.email, action: "worker-incident-submitted", entityType: "worker-incident", entityId: saved.id, after: saved });
        await emitPortalNotification({ eventType: "worker-incident-submitted", title: "حالة عمالية تنتظر القرار", message: `${saved.referenceCode} — ${reason}`, severity: "warning", module: "workforce", entityType: "worker-incident", entityId: saved.id, actionView: "workforce-supervision", targetRole: "admin" }).catch(() => undefined);
        return jsonNoStore({ incident: saved }, { status: 201 });
    }
    catch (error) {
        if (storageKey && !committed)
            await getRuntimeEnv().BUCKET.delete(storageKey).catch(() => undefined);
        return failure(error);
    }
}
export async function PATCH(request: Request) {
    if (rejectCrossSiteRequest(request))
        return jsonNoStore({ error: "مصدر الطلب غير مسموح" }, { status: 403 });
    const access = await requirePortalApiRole(["admin", "manager", "employee"]);
    if (!access || !canAdministerPortalUsers(access))
        return jsonNoStore({ error: "قرار الحالة للمالك أو المشرف فقط" }, { status: 403 });
    const parsed = await readLimitedJson(request, 6000);
    if (!parsed.ok)
        return parsed.response;
    const b = parsed.value as Record<string, unknown>, id = Number(b.id), status = b.status, reason = cleanText(b.reason, 2000);
    if (!["accepted", "rejected"].includes(String(status)) || reason.length < 3)
        return jsonNoStore({ error: "حدد القرار وسببه" }, { status: 400 });
    const warning = status === "rejected" && b.warning === true, deduct = status === "rejected" && b.deduct === true, archiveWorker = status === "rejected" && b.archiveWorker === true, releaseWorker = status === "rejected" && (b.releaseWorker === true || archiveWorker);
    if (status === "rejected" && !warning && !deduct && !releaseWorker)
        return jsonNoStore({ error: "حدد أثر رفض السبب: إنذار أو خصم أو استبعاد" }, { status: 400 });
    try {
        const db = getDb(), initial = await db.query.workerIncidents.findFirst({ where: eq(workerIncidents.id, id) });
        if (!initial)
            throw new WorkflowError("الحالة غير موجودة", 404);
        const result = await db.transaction(async (tx) => {
            await tx.select().from(workforceContracts).where(eq(workforceContracts.id, initial.contractId)).for("update");
            const [worker] = await tx.select().from(workers).where(eq(workers.id, initial.workerId)).for("update");
            const [before] = await tx.select().from(workerIncidents).where(eq(workerIncidents.id, id)).for("update");
            if (!before || before.status !== "pending" || before.version !== Number(b.version))
                throw new WorkflowError("سبق اتخاذ القرار أو تغيرت الحالة؛ حدّث الصفحة", 409);
            const now = new Date().toISOString(), dates = chargeableAbsenceDates(before.startDate, before.endDate), rate = Math.round(before.monthlySalaryHalalas / 30);
            if (deduct) {
                if (!dates.length)
                    throw new WorkflowError("لا يخصم يوم الجمعة؛ الفترة لا تحتوي أيام خصم");
                if (rate <= 0)
                    throw new WorkflowError("راتب العامل في العقد غير مسجل؛ استكمله قبل تطبيق الخصم", 409);
                const historical = await tx.select().from(contractWorkerAbsences).where(and(eq(contractWorkerAbsences.workerId,before.workerId),eq(contractWorkerAbsences.status,"active"),sql`${contractWorkerAbsences.absenceDate}<=${before.endDate} and coalesce(${contractWorkerAbsences.absenceEndDate},${contractWorkerAbsences.absenceDate})>=${before.startDate}`));
                if(historical.some(row=>chargeableAbsenceDates(row.absenceDate,row.absenceEndDate||row.absenceDate).some(date=>dates.includes(date))))throw new WorkflowError("يوجد قيد غياب سابق لهذه الأيام؛ راجع القيد المالي الأصلي لمنع تكرار الخصم",409);
                const existing = await tx.select().from(workerPayrollDeductions).where(and(eq(workerPayrollDeductions.workerId, before.workerId), inArray(workerPayrollDeductions.deductionDate, dates), isNull(workerPayrollDeductions.voidedAt)));
                if (existing.length)
                    throw new WorkflowError("يوجد خصم مسجل لبعض أيام الفترة؛ لا يمكن تكرار الخصم", 409);
                await tx.insert(workerPayrollDeductions).values(dates.map(deductionDate => ({ workerId: before.workerId, contractId: before.contractId, incidentId: id, deductionDate, amountHalalas: rate })));
            }
            if (releaseWorker) {
                const active = await tx.select().from(contractWorkerAssignments).where(and(eq(contractWorkerAssignments.workerId, before.workerId), eq(contractWorkerAssignments.status, "active"))).for("update");
                if (active.some(a => a.id !== before.assignmentId))
                    throw new WorkflowError("انتقل العامل إلى إسناد آخر؛ لا يمكن استبعاده من الحالة السابقة", 409);
                await tx.update(contractWorkerAssignments).set({ status: "released", releasedAt: now }).where(and(eq(contractWorkerAssignments.id, before.assignmentId), eq(contractWorkerAssignments.status, "active")));
                await tx.update(workers).set({ status: archiveWorker ? "suspended" : (worker.archivedAt || ["leave","suspended"].includes(worker.status)) ? worker.status : "available", clientId: null, beneficiaryName: null, clientSite: "", assignmentStartDate: null, archivedAt: archiveWorker ? now : worker.archivedAt, archivedBy: archiveWorker ? access.user.email : worker.archivedBy, archiveReason: archiveWorker ? reason : worker.archiveReason, updatedAt: now }).where(eq(workers.id, before.workerId));
            }
            const [updated] = await tx.update(workerIncidents).set({ status: String(status), decisionReason: reason, warning, deduct, releaseWorker, archiveWorker, deductionHalalas: deduct ? rate * dates.length : 0, decidedBy: access.user.email, decidedAt: now, version: before.version + 1, updatedAt: now }).where(eq(workerIncidents.id, id)).returning();
            return { before, updated };
        });
        await auditPortalAction({ actorEmail: access.user.email, action: "worker-incident-decided", entityType: "worker-incident", entityId: id, before: result.before, after: result.updated, reason });
        await emitPortalNotification({ eventType: "worker-incident-decided", title: status === "accepted" ? "اعتمد سبب الحالة العمالية" : "رُفض السبب وطُبقت الإجراءات المحددة", message: `${result.updated.referenceCode} — ${reason}`, severity: status === "accepted" ? "success" : "warning", module: "workforce", entityType: "worker-incident", entityId: id, actionView: "workforce-supervision", targetEmail: result.before.createdBy }).catch(() => undefined);
        if (deduct)
            await emitPortalNotification({ eventType: "worker-deduction-approved", title: "خصم عمالي معتمد للتسوية مع الراتب", message: `${result.updated.referenceCode} — ${result.updated.chargeableDays} يوم دون الجمعة — ${(result.updated.deductionHalalas / 100).toFixed(2)} ريال`, severity: "warning", module: "finance", entityType: "worker", entityId: result.updated.workerId, actionView: "finance", targetDepartment: "finance" }).catch(() => undefined);
        return jsonNoStore({ incident: result.updated });
    }
    catch (error) {
        return failure(error);
    }
}
