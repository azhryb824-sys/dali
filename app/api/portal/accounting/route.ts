import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { bankAccounts, chartOfAccounts, fiscalPeriods, journalEntries, journalLines } from "@/db/schema";
import { approveJournal, createDraftJournal, postJournal } from "@/lib/accounting";
import { auditPortalAction } from "@/lib/audit";
import { emitPortalNotification } from "@/lib/portal-notifications";
import { hasPortalPermission, requirePortalApiRole } from "@/lib/portal-access";
import { jsonNoStore, rejectCrossSiteRequest } from "@/lib/security";

const defaultAccounts = [
  { code: "1000", nameAr: "الأصول", accountType: "asset", normalBalance: "debit", isPosting: false, isSystem: true },
  { code: "1100", nameAr: "النقدية في الخزينة", accountType: "asset", normalBalance: "debit", isPosting: true, isSystem: true },
  { code: "1200", nameAr: "الحسابات البنكية", accountType: "asset", normalBalance: "debit", isPosting: true, isSystem: true },
  { code: "1300", nameAr: "ذمم العملاء", accountType: "asset", normalBalance: "debit", isPosting: true, isSystem: true },
  { code: "1400", nameAr: "ضريبة قيمة مضافة قابلة للاسترداد", accountType: "asset", normalBalance: "debit", isPosting: true, isSystem: true },
  { code: "2000", nameAr: "الالتزامات", accountType: "liability", normalBalance: "credit", isPosting: false, isSystem: true },
  { code: "2100", nameAr: "ذمم الموردين", accountType: "liability", normalBalance: "credit", isPosting: true, isSystem: true },
  { code: "2200", nameAr: "مستحقات الموظفين والعمال", accountType: "liability", normalBalance: "credit", isPosting: true, isSystem: true },
  { code: "2210", nameAr: "استقطاعات الموظفين المستحقة", accountType: "liability", normalBalance: "credit", isPosting: true, isSystem: true },
  { code: "2300", nameAr: "ضريبة القيمة المضافة المستحقة", accountType: "liability", normalBalance: "credit", isPosting: true, isSystem: true },
  { code: "3000", nameAr: "حقوق الملكية", accountType: "equity", normalBalance: "credit", isPosting: true, isSystem: true },
  { code: "4000", nameAr: "إيرادات توريد العمالة", accountType: "revenue", normalBalance: "credit", isPosting: true, isSystem: true },
  { code: "4100", nameAr: "إيرادات التشغيل والصيانة", accountType: "revenue", normalBalance: "credit", isPosting: true, isSystem: true },
  { code: "5000", nameAr: "مصروف الرواتب والأجور", accountType: "expense", normalBalance: "debit", isPosting: true, isSystem: true },
  { code: "5100", nameAr: "مصروفات العمالة والتشغيل", accountType: "expense", normalBalance: "debit", isPosting: true, isSystem: true },
  { code: "5200", nameAr: "المصروفات الإدارية والعمومية", accountType: "expense", normalBalance: "debit", isPosting: true, isSystem: true },
] as const;

function clean(value: unknown, length: number) {
  return typeof value === "string" ? value.trim().slice(0, length) : "";
}

function positiveId(value: unknown) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : 0;
}

export async function GET() {
  const access = await requirePortalApiRole(["admin", "manager", "employee"]);
  if (!access || !(await hasPortalPermission(access, "finance", "read"))) return jsonNoStore({ error: "غير مصرح" }, { status: 403 });
  const db = getDb();
  const [accounts, periods, entries, lines, banks, postedBalances] = await Promise.all([
    db.select().from(chartOfAccounts).orderBy(chartOfAccounts.code).limit(500),
    db.select().from(fiscalPeriods).orderBy(desc(fiscalPeriods.startDate)).limit(120),
    db.select().from(journalEntries).orderBy(desc(journalEntries.entryDate), desc(journalEntries.id)).limit(300),
    db.select().from(journalLines).orderBy(desc(journalLines.id)).limit(3000),
    db.select().from(bankAccounts).orderBy(bankAccounts.accountCode).limit(100),
    db.select({
      accountId: journalLines.accountId,
      bankAccountId: journalLines.bankAccountId,
      debitHalalas: sql<number>`coalesce(sum(${journalLines.debitHalalas}), 0)`,
      creditHalalas: sql<number>`coalesce(sum(${journalLines.creditHalalas}), 0)`,
    }).from(journalLines).innerJoin(journalEntries, eq(journalEntries.id, journalLines.journalEntryId))
      .where(eq(journalEntries.status, "posted")).groupBy(journalLines.accountId, journalLines.bankAccountId),
  ]);
  const cashAccount = accounts.find((account) => account.code === "1100") || null;
  const balanceFor = (accountId: number, bankAccountId: number | null) => postedBalances
    .filter((row) => row.accountId === accountId && row.bankAccountId === bankAccountId)
    .reduce((sum, row) => sum + Number(row.debitHalalas) - Number(row.creditHalalas), 0);
  return jsonNoStore({
    accounts, periods, entries, lines,
    treasury: cashAccount ? { accountId: cashAccount.id, accountCode: cashAccount.code, accountName: cashAccount.nameAr, balanceHalalas: balanceFor(cashAccount.id, null) } : null,
    banks: banks.map((bank) => ({ ...bank, balanceHalalas: balanceFor(bank.ledgerAccountId, bank.id) })),
  });
}

export async function POST(request: Request) {
  if (rejectCrossSiteRequest(request)) return jsonNoStore({ error: "مصدر الطلب غير مسموح" }, { status: 403 });
  const access = await requirePortalApiRole(["admin", "manager", "employee"]);
  if (!access || !(await hasPortalPermission(access, "finance", "write"))) return jsonNoStore({ error: "غير مصرح" }, { status: 403 });
  try {
    const payload = await request.json() as Record<string, unknown>;
    const action = clean(payload.action, 40);
    const db = getDb();

    if (action === "initialize") {
      if (access.role !== "admin") return jsonNoStore({ error: "تهيئة المحاسبة متاحة لمدير النظام فقط" }, { status: 403 });
      for (const account of defaultAccounts) {
        await db.insert(chartOfAccounts).values(account).onConflictDoNothing({ target: chartOfAccounts.code });
      }
      const year = new Date().getUTCFullYear();
      await db.insert(fiscalPeriods).values({ periodCode: String(year), nameAr: `السنة المالية ${year}`, startDate: `${year}-01-01`, endDate: `${year}-12-31` })
        .onConflictDoNothing({ target: fiscalPeriods.periodCode });
      await auditPortalAction({ actorEmail: access.user.email, action: "accounting-initialized", entityType: "accounting", entityId: String(year), after: { year, accounts: defaultAccounts.length } });
      return jsonNoStore({ ok: true });
    }

    if (action === "create-journal") {
      const amountHalalas = Math.round(Number(payload.amount) * 100);
      const debitAccountId = positiveId(payload.debitAccountId);
      const creditAccountId = positiveId(payload.creditAccountId);
      const entryDate = clean(payload.entryDate, 10);
      const description = clean(payload.description, 500);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(entryDate) || description.length < 3 || !Number.isSafeInteger(amountHalalas) || amountHalalas <= 0 || debitAccountId === creditAccountId) {
        return jsonNoStore({ error: "بيانات القيد غير صحيحة" }, { status: 400 });
      }
      const result = await createDraftJournal({ entryDate, description, sourceType: "manual", actorEmail: access.user.email, lines: [
        { accountId: debitAccountId, debitHalalas: amountHalalas, description },
        { accountId: creditAccountId, creditHalalas: amountHalalas, description },
      ] });
      return jsonNoStore(result, { status: 201 });
    }

    if (action === "transfer-liquidity") {
      const direction = clean(payload.direction, 20);
      const bankAccountId = positiveId(payload.bankAccountId);
      const amountHalalas = Math.round(Number(payload.amount) * 100);
      const entryDate = clean(payload.entryDate, 10);
      const reference = clean(payload.reference, 180);
      if (!["bank_to_cash", "cash_to_bank"].includes(direction) || !bankAccountId || !/^\d{4}-\d{2}-\d{2}$/.test(entryDate) || !Number.isSafeInteger(amountHalalas) || amountHalalas <= 0) {
        return jsonNoStore({ error: "بيانات التحويل بين البنك والخزينة غير صحيحة" }, { status: 400 });
      }
      const [bank, cashAccount] = await Promise.all([
        db.query.bankAccounts.findFirst({ where: and(eq(bankAccounts.id, bankAccountId), eq(bankAccounts.status, "active")) }),
        db.query.chartOfAccounts.findFirst({ where: and(eq(chartOfAccounts.code, "1100"), eq(chartOfAccounts.status, "active"), eq(chartOfAccounts.isPosting, true)) }),
      ]);
      if (!bank || !cashAccount) return jsonNoStore({ error: "الخزينة أو الحساب البنكي غير مهيأ أو غير نشط" }, { status: 409 });
      const sourceAccountId = direction === "bank_to_cash" ? bank.ledgerAccountId : cashAccount.id;
      const sourceBankCondition = direction === "bank_to_cash" ? eq(journalLines.bankAccountId, bank.id) : isNull(journalLines.bankAccountId);
      const sourceLines = await db.select({ status: journalEntries.status, debitHalalas: journalLines.debitHalalas, creditHalalas: journalLines.creditHalalas })
        .from(journalLines).innerJoin(journalEntries, eq(journalEntries.id, journalLines.journalEntryId))
        .where(and(eq(journalLines.accountId, sourceAccountId), sourceBankCondition, inArray(journalEntries.status, ["draft", "approved", "posted"])));
      const postedBalance = sourceLines.filter((line) => line.status === "posted").reduce((sum, line) => sum + line.debitHalalas - line.creditHalalas, 0);
      const reservedOutgoing = sourceLines.filter((line) => line.status !== "posted").reduce((sum, line) => sum + line.creditHalalas, 0);
      const availableHalalas = postedBalance - reservedOutgoing;
      if (availableHalalas < amountHalalas) return jsonNoStore({ error: `الرصيد المتاح غير كافٍ. المتاح ${new Intl.NumberFormat("ar-SA", { style: "currency", currency: "SAR" }).format(availableHalalas / 100)}` }, { status: 409 });
      const description = `${direction === "bank_to_cash" ? "تغذية الخزينة من" : "إيداع نقدية الخزينة في"} ${bank.bankName} — ${bank.accountCode}${reference ? ` — مرجع ${reference}` : ""}`;
      const result = await createDraftJournal({
        entryDate, description, sourceType: "treasury-transfer", sourceId: crypto.randomUUID(), actorEmail: access.user.email,
        lines: direction === "bank_to_cash"
          ? [{ accountId: cashAccount.id, debitHalalas: amountHalalas, description }, { accountId: bank.ledgerAccountId, bankAccountId: bank.id, creditHalalas: amountHalalas, description }]
          : [{ accountId: bank.ledgerAccountId, bankAccountId: bank.id, debitHalalas: amountHalalas, description }, { accountId: cashAccount.id, creditHalalas: amountHalalas, description }],
      });
      await auditPortalAction({ actorEmail: access.user.email, action: "treasury-bank-transfer-created", entityType: "journal-entry", entityId: result.entry.id, after: { direction, bankAccountId: bank.id, amountHalalas, entryDate, reference, journalEntryId: result.entry.id } });
      await emitPortalNotification({ eventType: "treasury-bank-transfer-created", title: "تحويل بين الخزينة والبنك بانتظار الاعتماد", message: `${description} — ${new Intl.NumberFormat("ar-SA", { style: "currency", currency: "SAR" }).format(amountHalalas / 100)}`, severity: "info", module: "finance", entityType: "journal-entry", entityId: result.entry.id, actionView: "finance", targetDepartment: "finance" }).catch(() => undefined);
      return jsonNoStore({ ...result, availableHalalas: availableHalalas - amountHalalas }, { status: 201 });
    }

    if (action === "add-bank") {
      const bankName = clean(payload.bankName, 120);
      const accountName = clean(payload.accountName, 160);
      const accountCode = clean(payload.accountCode, 30).toUpperCase();
      const iban = clean(payload.iban, 40).replaceAll(" ", "").toUpperCase();
      const ledgerAccountId = positiveId(payload.ledgerAccountId);
      if (bankName.length < 2 || accountName.length < 2 || !accountCode || !/^SA\d{22}$/.test(iban) || !ledgerAccountId) return jsonNoStore({ error: "بيانات الحساب البنكي غير صحيحة" }, { status: 400 });
      const account = await db.query.chartOfAccounts.findFirst({ where: eq(chartOfAccounts.id, ledgerAccountId) });
      if (!account || account.accountType !== "asset" || !account.isPosting) return jsonNoStore({ error: "يجب ربط البنك بحساب أصول قابل للترحيل" }, { status: 400 });
      const ledgerAlreadyUsed = await db.query.bankAccounts.findFirst({ where: eq(bankAccounts.ledgerAccountId, ledgerAccountId) });
      if (ledgerAlreadyUsed) return jsonNoStore({ error: "هذا الحساب المحاسبي مرتبط ببنك آخر؛ أنشئ حساب أصول مستقل لكل بنك" }, { status: 409 });
      const [saved] = await db.insert(bankAccounts).values({ accountCode, bankName, accountName, iban, ledgerAccountId }).returning();
      await auditPortalAction({ actorEmail: access.user.email, action: "bank-account-created", entityType: "bank-account", entityId: saved.id, after: { ...saved, iban: `${iban.slice(0, 6)}••••${iban.slice(-4)}` } });
      return jsonNoStore({ bank: saved }, { status: 201 });
    }

    return jsonNoStore({ error: "العملية غير مدعومة" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "تعذّر تنفيذ العملية المحاسبية";
    return jsonNoStore({ error: message.toLowerCase().includes("unique") ? "القيمة مستخدمة في سجل آخر" : message }, { status: message.toLowerCase().includes("unique") ? 409 : 400 });
  }
}

export async function PATCH(request: Request) {
  if (rejectCrossSiteRequest(request)) return jsonNoStore({ error: "مصدر الطلب غير مسموح" }, { status: 403 });
  const access = await requirePortalApiRole(["admin", "manager", "employee"]);
  if (!access) return jsonNoStore({ error: "غير مصرح" }, { status: 403 });
  try {
    const payload = await request.json() as Record<string, unknown>;
    const action = clean(payload.action, 30);
    const entryId = positiveId(payload.entryId);
    if (!entryId) return jsonNoStore({ error: "رقم القيد غير صحيح" }, { status: 400 });
    if (action === "approve") {
      if (!(await hasPortalPermission(access, "finance", "approve"))) return jsonNoStore({ error: "لا تملك صلاحية اعتماد القيود" }, { status: 403 });
      return jsonNoStore({ entry: await approveJournal(entryId, access.user.email) });
    }
    if (action === "post") {
      if (access.role !== "admin" && !(await hasPortalPermission(access, "finance", "post"))) return jsonNoStore({ error: "لا تملك صلاحية ترحيل القيود" }, { status: 403 });
      return jsonNoStore({ entry: await postJournal(entryId, access.user.email) });
    }
    return jsonNoStore({ error: "العملية غير مدعومة" }, { status: 400 });
  } catch (error) {
    return jsonNoStore({ error: error instanceof Error ? error.message : "تعذّر تحديث القيد" }, { status: 400 });
  }
}
