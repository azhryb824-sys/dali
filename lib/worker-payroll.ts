import { and, asc, eq, inArray, isNull, lte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { contractProfessions, contractWorkerAssignments, financialRecords, workerPayrollDeductions, workerSalaryAllocations, workforceContracts } from "@/db/schema";
import { WorkflowError } from "@/lib/quote-request-workflow";
import { isValidIsoDate } from "@/lib/workforce-finance-integrity";
type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];
export async function calculateWorkerSalary(db: Tx | ReturnType<typeof getDb>, workerId: number, contractId: number, month: string) {
    if (!isValidIsoDate(`${month}-01`))
        throw new WorkflowError("شهر الراتب غير صحيح");
    const first = `${month}-01`, last = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10), daysInMonth = Number(last.slice(8));
    const contract = await db.query.workforceContracts.findFirst({ where: eq(workforceContracts.id, contractId) });
    if (!contract || ["draft", "internal_review", "legal_review", "cancelled"].includes(contract.status))
        throw new WorkflowError("العقد غير صالح لتسوية الراتب", 409);
    const assignments = await db.select().from(contractWorkerAssignments).where(and(eq(contractWorkerAssignments.workerId, workerId), eq(contractWorkerAssignments.contractId, contractId), inArray(contractWorkerAssignments.status, ["active", "released"])));
    const professions = await db.select().from(contractProfessions).where(eq(contractProfessions.contractId, contractId));
    const covered = new Map<string, number>();
    for (const assignment of assignments) {
        const start = [first, contract.startDate, assignment.assignedAt.slice(0, 10)].sort().at(-1)!;
        const end = [last, contract.endDate, assignment.releasedAt?.slice(0, 10) || last].sort()[0];
        if (end < start)
            continue;
        const salary = professions.find(p => p.id === assignment.contractProfessionId)?.actualSalaryHalalas || 0;
        if (salary <= 0)
            throw new WorkflowError("راتب العامل في مهنة العقد غير مسجل", 409);
        for (let day = new Date(`${start}T12:00:00Z`); day <= new Date(`${end}T12:00:00Z`); day = new Date(day.getTime() + 86400000)) {
            const key = day.toISOString().slice(0, 10);
            if (covered.has(key) && covered.get(key) !== salary)
                throw new WorkflowError("توجد إسنادات برواتب مختلفة في اليوم نفسه؛ راجع الإسناد", 409);
            covered.set(key, salary);
        }
    }
    if (!covered.size)
        throw new WorkflowError("العامل غير مسند إلى العقد خلال شهر الراتب", 409);
    const grossAmountHalalas = Math.round([...covered.values()].reduce((s, n) => s + n, 0) / daysInMonth);
    const deductions = await db.select().from(workerPayrollDeductions).where(and(eq(workerPayrollDeductions.workerId, workerId), lte(workerPayrollDeductions.deductionDate, last), isNull(workerPayrollDeductions.voidedAt), sql `${workerPayrollDeductions.settledHalalas}<${workerPayrollDeductions.amountHalalas}`)).orderBy(asc(workerPayrollDeductions.deductionDate), asc(workerPayrollDeductions.id));
    let remaining = grossAmountHalalas;
    const allocations = deductions.map(d => { const amountHalalas = Math.min(remaining, d.amountHalalas - d.settledHalalas); remaining -= amountHalalas; return { deductionId: d.id, amountHalalas }; }).filter(a => a.amountHalalas > 0);
    return { grossAmountHalalas, deductionAmountHalalas: grossAmountHalalas - remaining, amountHalalas: remaining, coveredDays: covered.size, daysInMonth, carryForwardHalalas: deductions.reduce((s, d) => s + d.amountHalalas - d.settledHalalas, 0) - (grossAmountHalalas - remaining), allocations };
}
export async function allocateWorkerDeductions(tx: Tx, financialRecordId: number, allocations: Array<{
    deductionId: number;
    amountHalalas: number;
}>) {
    for (const row of allocations) {
        const [updated] = await tx.update(workerPayrollDeductions).set({ settledHalalas: sql `${workerPayrollDeductions.settledHalalas}+${row.amountHalalas}` }).where(and(eq(workerPayrollDeductions.id, row.deductionId), isNull(workerPayrollDeductions.voidedAt), sql `${workerPayrollDeductions.settledHalalas}+${row.amountHalalas}<=${workerPayrollDeductions.amountHalalas}`)).returning();
        if (!updated)
            throw new WorkflowError("تغيرت الخصومات؛ أعد معاينة الراتب", 409);
        await tx.insert(workerSalaryAllocations).values({ ...row, financialRecordId });
    }
}
export async function cancelWorkerSalaryDeductions(tx: Tx, record: typeof financialRecords.$inferSelect) {
    if (record.status === "paid" || record.journalEntryId || record.postingStatus === "posted")
        throw new WorkflowError("لا يمكن إلغاء راتب مدفوع أو مرتبط بقيد؛ يلزم إجراء عكسي من المالية", 409);
    const allocations = await tx.select().from(workerSalaryAllocations).where(and(eq(workerSalaryAllocations.financialRecordId, record.id), isNull(workerSalaryAllocations.reversedAt))).for("update");
    for (const allocation of allocations)
        await tx.update(workerPayrollDeductions).set({ settledHalalas: sql `${workerPayrollDeductions.settledHalalas}-${allocation.amountHalalas}` }).where(eq(workerPayrollDeductions.id, allocation.deductionId));
    await tx.update(workerSalaryAllocations).set({ reversedAt: new Date().toISOString() }).where(and(eq(workerSalaryAllocations.financialRecordId, record.id), isNull(workerSalaryAllocations.reversedAt)));
}
