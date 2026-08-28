import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { chartOfAccounts, financialRecords, fiscalPeriods, journalEntries, journalLines } from "@/db/schema";
import { auditPortalAction } from "@/lib/audit";
import { emitPortalNotification } from "@/lib/portal-notifications";

export type JournalLineInput = {
  accountId: number;
  bankAccountId?: number | null;
  description?: string | null;
  debitHalalas?: number;
  creditHalalas?: number;
  clientId?: number | null;
  contractId?: number | null;
  workerId?: number | null;
  employeeId?: number | null;
  costCenterCode?: string | null;
};

export function validateBalancedJournal(lines: JournalLineInput[]) {
  if (lines.length < 2) throw new Error("يجب أن يحتوي القيد على طرفين على الأقل");
  let debit = 0;
  let credit = 0;
  for (const line of lines) {
    const lineDebit = Number(line.debitHalalas || 0);
    const lineCredit = Number(line.creditHalalas || 0);
    if (!Number.isSafeInteger(line.accountId) || line.accountId < 1) throw new Error("الحساب المحاسبي غير صحيح");
    if (!Number.isSafeInteger(lineDebit) || !Number.isSafeInteger(lineCredit) || lineDebit < 0 || lineCredit < 0) throw new Error("قيمة بند القيد غير صحيحة");
    if ((lineDebit > 0) === (lineCredit > 0)) throw new Error("كل بند يجب أن يكون مدينًا أو دائنًا فقط");
    debit += lineDebit;
    credit += lineCredit;
  }
  if (!Number.isSafeInteger(debit) || debit <= 0 || debit !== credit) throw new Error("القيد غير متوازن");
  return { debitHalalas: debit, creditHalalas: credit };
}

function journalNumber() {
  return `JE-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

export async function createDraftJournal(input: {
  entryDate: string;
  description: string;
  sourceType: string;
  sourceId?: string | null;
  actorEmail: string;
  reversalOfId?: number | null;
  lines: JournalLineInput[];
}) {
  const totals = validateBalancedJournal(input.lines);
  const db = getDb();
  const period = await db.query.fiscalPeriods.findFirst({
    where: and(
      sql`${fiscalPeriods.startDate} <= ${input.entryDate}`,
      sql`${fiscalPeriods.endDate} >= ${input.entryDate}`,
      eq(fiscalPeriods.status, "open"),
    ),
  });
  if (!period) throw new Error("لا توجد فترة مالية مفتوحة لتاريخ القيد");

  const accountIds = [...new Set(input.lines.map((line) => line.accountId))];
  const accounts = await db.select({ id: chartOfAccounts.id, isPosting: chartOfAccounts.isPosting, status: chartOfAccounts.status })
    .from(chartOfAccounts)
    .where(inArray(chartOfAccounts.id, accountIds));
  if (accounts.length !== accountIds.length || accounts.some((account) => !account.isPosting || account.status !== "active")) {
    throw new Error("يحتوي القيد على حساب غير نشط أو غير قابل للترحيل");
  }

  const now = new Date().toISOString();
  const [entry] = await db.insert(journalEntries).values({
    entryNumber: journalNumber(),
    entryDate: input.entryDate,
    fiscalPeriodId: period.id,
    description: input.description.trim().slice(0, 500),
    sourceType: input.sourceType.trim().slice(0, 80),
    sourceId: input.sourceId?.trim().slice(0, 120) || null,
    reversalOfId: input.reversalOfId || null,
    createdBy: input.actorEmail,
    updatedAt: now,
  }).returning();

  try {
    await db.insert(journalLines).values(input.lines.map((line, index) => ({
      journalEntryId: entry.id,
      lineNumber: index + 1,
      accountId: line.accountId,
      bankAccountId: line.bankAccountId || null,
      description: line.description?.trim().slice(0, 300) || null,
      debitHalalas: line.debitHalalas || 0,
      creditHalalas: line.creditHalalas || 0,
      clientId: line.clientId || null,
      contractId: line.contractId || null,
      workerId: line.workerId || null,
      employeeId: line.employeeId || null,
      costCenterCode: line.costCenterCode?.trim().slice(0, 60) || null,
    })));
  } catch (error) {
    await db.delete(journalEntries).where(eq(journalEntries.id, entry.id)).catch(() => undefined);
    throw error;
  }

  await auditPortalAction({ actorEmail: input.actorEmail, action: "journal-entry-created", entityType: "journal-entry", entityId: entry.id, after: { ...entry, ...totals } });
  return { entry, totals };
}

export async function createReversalDraft(entryId: number, actorEmail: string, reason: string) {
  const db = getDb();
  const original = await db.query.journalEntries.findFirst({ where: eq(journalEntries.id, entryId) });
  if (!original || original.status !== "posted") throw new Error("لا يمكن عكس قيد غير مرحّل");
  const existing = await db.query.journalEntries.findFirst({
    where: and(eq(journalEntries.reversalOfId, entryId), inArray(journalEntries.status, ["draft", "approved", "posted"])),
  });
  if (existing) return { entry: existing, created: false };
  const lines = await db.select().from(journalLines).where(eq(journalLines.journalEntryId, entryId));
  const result = await createDraftJournal({
    entryDate: new Date().toISOString().slice(0, 10),
    description: `عكس ${original.entryNumber} — ${reason}`.slice(0, 500),
    sourceType: "journal-reversal",
    sourceId: String(entryId),
    reversalOfId: entryId,
    actorEmail,
    lines: lines.map((line) => ({
      accountId: line.accountId,
      bankAccountId: line.bankAccountId,
      description: `عكس: ${line.description || original.description}`.slice(0, 300),
      debitHalalas: line.creditHalalas,
      creditHalalas: line.debitHalalas,
      clientId: line.clientId,
      contractId: line.contractId,
      workerId: line.workerId,
      employeeId: line.employeeId,
      costCenterCode: line.costCenterCode,
    })),
  });
  await emitPortalNotification({ eventType: "journal-reversal-created", title: "قيد عكسي بانتظار الاعتماد", message: `${result.entry.entryNumber} — عكس ${original.entryNumber}.`, severity: "warning", module: "finance", entityType: "journal-entry", entityId: result.entry.id, actionView: "finance", targetDepartment: "finance" }).catch(() => undefined);
  return { ...result, created: true };
}

export async function postJournal(entryId: number, actorEmail: string) {
  const db = getDb();
  const entry = await db.query.journalEntries.findFirst({ where: eq(journalEntries.id, entryId) });
  if (!entry || entry.status !== "approved") throw new Error("لا يمكن ترحيل قيد غير معتمد");
  if (entry.createdBy.trim().toLowerCase() === actorEmail.trim().toLowerCase()) throw new Error("لا يمكن لمنشئ القيد ترحيله");
  const period = await db.query.fiscalPeriods.findFirst({ where: eq(fiscalPeriods.id, entry.fiscalPeriodId) });
  if (!period || period.status !== "open") throw new Error("الفترة المالية مغلقة");
  const lines = await db.select().from(journalLines).where(eq(journalLines.journalEntryId, entry.id));
  validateBalancedJournal(lines);
  const now = new Date().toISOString();
  const [posted] = await db.update(journalEntries).set({ status: "posted", postedBy: actorEmail, postedAt: now, updatedAt: now })
    .where(and(eq(journalEntries.id, entry.id), eq(journalEntries.status, "approved"))).returning();
  if (!posted) throw new Error("تغيرت حالة القيد قبل الترحيل");
  if (posted.sourceType === "financial-record" && posted.sourceId && /^\d+$/.test(posted.sourceId)) {
    await db.update(financialRecords).set({ postingStatus: "posted", postedAt: posted.postedAt, updatedAt: now })
      .where(and(eq(financialRecords.id, Number(posted.sourceId)), eq(financialRecords.journalEntryId, posted.id)));
  }
  if (posted.reversalOfId) {
    await db.update(journalEntries).set({ status: "reversed", updatedAt: now })
      .where(and(eq(journalEntries.id, posted.reversalOfId), eq(journalEntries.status, "posted")));
    await db.update(financialRecords).set({ postingStatus: "reversed", updatedAt: now })
      .where(eq(financialRecords.journalEntryId, posted.reversalOfId));
  }
  await auditPortalAction({ actorEmail, action: "journal-entry-posted", entityType: "journal-entry", entityId: posted.id, before: entry, after: posted });
  await emitPortalNotification({ eventType: "journal-entry-posted", title: "تم ترحيل قيد محاسبي", message: `${posted.entryNumber} — ${posted.description}.`, severity: "success", module: "finance", entityType: "journal-entry", entityId: posted.id, actionView: "finance", targetDepartment: "finance" }).catch(() => undefined);
  return posted;
}

export async function approveJournal(entryId: number, actorEmail: string) {
  const db = getDb();
  const entry = await db.query.journalEntries.findFirst({ where: eq(journalEntries.id, entryId) });
  if (!entry || entry.status !== "draft") throw new Error("لا يمكن اعتماد القيد في حالته الحالية");
  if (entry.createdBy.trim().toLowerCase() === actorEmail.trim().toLowerCase()) throw new Error("يجب أن يعتمد القيد مستخدم آخر تطبيقًا لفصل المهام");
  const now = new Date().toISOString();
  const [approved] = await db.update(journalEntries).set({ status: "approved", approvedBy: actorEmail, approvedAt: now, updatedAt: now })
    .where(and(eq(journalEntries.id, entry.id), eq(journalEntries.status, "draft"))).returning();
  if (!approved) throw new Error("تغيرت حالة القيد قبل الاعتماد");
  await auditPortalAction({ actorEmail, action: "journal-entry-approved", entityType: "journal-entry", entityId: approved.id, before: entry, after: approved });
  await emitPortalNotification({ eventType: "journal-entry-approved", title: "قيد محاسبي جاهز للترحيل", message: `${approved.entryNumber} — ${approved.description}.`, severity: "info", module: "finance", entityType: "journal-entry", entityId: approved.id, actionView: "finance", targetDepartment: "finance" }).catch(() => undefined);
  return approved;
}
