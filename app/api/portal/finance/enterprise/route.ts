import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  accountingPostingRules,
  bankAccounts,
  bankStatementLines,
  budgetLines,
  chartOfAccounts,
  financialOperationIssues,
  fiscalPeriods,
  fixedAssets,
  journalEntries,
  journalLines,
  taxReturns,
} from "@/db/schema";
import { createDraftJournal } from "@/lib/accounting";
import { auditPortalAction } from "@/lib/audit";
import { hasPortalPermission, requirePortalApiRole } from "@/lib/portal-access";
import {
  jsonNoStore,
  readLimitedJson,
  rejectCrossSiteRequest,
} from "@/lib/security";
const clean = (value: unknown, max = 1000) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";
const id = (value: unknown) => {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : 0;
};
const amount = (value: unknown) => Math.round(Number(value || 0) * 100);
async function access(write = false) {
  const actor = await requirePortalApiRole(["admin", "manager", "employee"]);
  return actor &&
    (await hasPortalPermission(actor, "finance", write ? "write" : "read"))
    ? actor
    : null;
}
export async function GET() {
  const actor = await access();
  if (!actor) return jsonNoStore({ error: "غير مصرح" }, { status: 403 });
  const db = getDb();
  const [
    rules,
    statementLines,
    assets,
    budgets,
    returns,
    issues,
    periods,
    accounts,
    banks,
  ] = await Promise.all([
    db
      .select()
      .from(accountingPostingRules)
      .orderBy(asc(accountingPostingRules.eventType)),
    db
      .select()
      .from(bankStatementLines)
      .orderBy(desc(bankStatementLines.transactionDate))
      .limit(3000),
    db.select().from(fixedAssets).orderBy(asc(fixedAssets.assetCode)),
    db.select().from(budgetLines).orderBy(desc(budgetLines.id)).limit(3000),
    db.select().from(taxReturns).orderBy(desc(taxReturns.periodEnd)),
    db
      .select()
      .from(financialOperationIssues)
      .orderBy(desc(financialOperationIssues.createdAt))
      .limit(1000),
    db.select().from(fiscalPeriods).orderBy(desc(fiscalPeriods.startDate)),
    db.select().from(chartOfAccounts).orderBy(asc(chartOfAccounts.code)),
    db.select().from(bankAccounts).where(eq(bankAccounts.status, "active")),
  ]);
  return jsonNoStore({
    rules,
    statementLines,
    assets,
    budgets,
    taxReturns: returns,
    issues,
    periods,
    accounts,
    banks,
  });
}
export async function POST(request: Request) {
  if (rejectCrossSiteRequest(request))
    return jsonNoStore({ error: "مصدر الطلب غير مسموح" }, { status: 403 });
  const actor = await access(true);
  if (!actor) return jsonNoStore({ error: "غير مصرح" }, { status: 403 });
  const parsed = await readLimitedJson(request, 1000000);
  if (!parsed.ok) return parsed.response;
  const body = parsed.value as Record<string, unknown>,
    action = clean(body.action, 40),
    db = getDb(),
    now = new Date().toISOString();
  if (action === "posting-rule") {
    const eventType = clean(body.eventType, 80),
      debitAccountId = id(body.debitAccountId),
      creditAccountId = id(body.creditAccountId),
      taxAccountId = id(body.taxAccountId) || null;
    if (!eventType || !debitAccountId || !creditAccountId)
      return jsonNoStore(
        { error: "قاعدة الترحيل غير مكتملة" },
        { status: 400 },
      );
    const [row] = await db
      .insert(accountingPostingRules)
      .values({
        eventType,
        debitAccountId,
        creditAccountId,
        taxAccountId,
        updatedBy: actor.user.email,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: accountingPostingRules.eventType,
        set: {
          debitAccountId,
          creditAccountId,
          taxAccountId,
          active: true,
          updatedBy: actor.user.email,
          updatedAt: now,
        },
      })
      .returning();
    return jsonNoStore({ rule: row }, { status: 201 });
  }
  if (action === "import-bank-statement") {
    const bankAccountId = id(body.bankAccountId),
      statementDate = clean(body.statementDate, 10),
      lines = Array.isArray(body.lines)
        ? (body.lines as Array<Record<string, unknown>>)
        : [];
    const bank = await db.query.bankAccounts.findFirst({
      where: and(
        eq(bankAccounts.id, bankAccountId),
        eq(bankAccounts.status, "active"),
      ),
    });
    if (
      !bank ||
      !/^\d{4}-\d{2}-\d{2}$/.test(statementDate) ||
      !lines.length ||
      lines.length > 5000
    )
      return jsonNoStore(
        { error: "بيانات كشف البنك غير صحيحة" },
        { status: 400 },
      );
    let imported = 0,
      duplicates = 0;
    for (const line of lines) {
      const transactionDate = clean(line.transactionDate, 10),
        description = clean(line.description, 500),
        reference = clean(line.reference, 180) || null,
        direction = clean(line.direction, 10),
        amountHalalas = amount(line.amount);
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(transactionDate) ||
        !description ||
        !["credit", "debit"].includes(direction) ||
        amountHalalas < 1
      )
        continue;
      const fingerprint = Array.from(
        new Uint8Array(
          await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(
              `${bankAccountId}|${transactionDate}|${reference}|${description}|${amountHalalas}|${direction}`,
            ).buffer,
          ),
        ),
      )
        .map((value) => value.toString(16).padStart(2, "0"))
        .join("");
      const [row] = await db
        .insert(bankStatementLines)
        .values({
          bankAccountId,
          statementDate,
          transactionDate,
          reference,
          description,
          amountHalalas,
          direction,
          fingerprint,
          importedBy: actor.user.email,
        })
        .onConflictDoNothing()
        .returning();
      if (row) imported++;
      else duplicates++;
    }
    return jsonNoStore({ imported, duplicates }, { status: 201 });
  }
  if (action === "asset") {
    const costHalalas = amount(body.cost),
      residualValueHalalas = amount(body.residualValue),
      usefulLifeMonths = Number(body.usefulLifeMonths);
    if (
      !clean(body.assetCode, 60) ||
      !clean(body.nameAr, 180) ||
      costHalalas < 1 ||
      residualValueHalalas < 0 ||
      !Number.isInteger(usefulLifeMonths) ||
      usefulLifeMonths < 1
    )
      return jsonNoStore({ error: "بيانات الأصل غير صحيحة" }, { status: 400 });
    const [row] = await db
      .insert(fixedAssets)
      .values({
        assetCode: clean(body.assetCode, 60),
        nameAr: clean(body.nameAr, 180),
        acquisitionDate: clean(body.acquisitionDate, 10),
        costHalalas,
        residualValueHalalas,
        usefulLifeMonths,
        costCenterCode: clean(body.costCenterCode, 60) || null,
        createdBy: actor.user.email,
      })
      .returning();
    return jsonNoStore({ asset: row }, { status: 201 });
  }
  if (action === "budget") {
    const fiscalPeriodId = id(body.fiscalPeriodId),
      accountId = id(body.accountId),
      amountHalalas = amount(body.amount);
    if (!fiscalPeriodId || !accountId || amountHalalas < 0)
      return jsonNoStore(
        { error: "بيانات الموازنة غير صحيحة" },
        { status: 400 },
      );
    const [row] = await db
      .insert(budgetLines)
      .values({
        fiscalPeriodId,
        accountId,
        costCenterCode: clean(body.costCenterCode, 60) || null,
        amountHalalas,
        createdBy: actor.user.email,
      })
      .returning();
    return jsonNoStore({ budget: row }, { status: 201 });
  }
  if (action === "tax-return") {
    const periodStart = clean(body.periodStart, 10),
      periodEnd = clean(body.periodEnd, 10);
    if (!periodStart || !periodEnd || periodEnd < periodStart)
      return jsonNoStore({ error: "فترة الإقرار غير صحيحة" }, { status: 400 });
    const rows = await db
      .select({
        code: chartOfAccounts.code,
        debit: sql<number>`coalesce(sum(${journalLines.debitHalalas}),0)`,
        credit: sql<number>`coalesce(sum(${journalLines.creditHalalas}),0)`,
      })
      .from(journalLines)
      .innerJoin(
        journalEntries,
        eq(journalEntries.id, journalLines.journalEntryId),
      )
      .innerJoin(
        chartOfAccounts,
        eq(chartOfAccounts.id, journalLines.accountId),
      )
      .where(
        and(
          eq(journalEntries.status, "posted"),
          gte(journalEntries.entryDate, periodStart),
          lte(journalEntries.entryDate, periodEnd),
          inArray(chartOfAccounts.code, ["1400", "2300"]),
        ),
      )
      .groupBy(chartOfAccounts.code);
    const output =
        Number(rows.find((row) => row.code === "2300")?.credit || 0) -
        Number(rows.find((row) => row.code === "2300")?.debit || 0),
      input =
        Number(rows.find((row) => row.code === "1400")?.debit || 0) -
        Number(rows.find((row) => row.code === "1400")?.credit || 0);
    const [row] = await db
      .insert(taxReturns)
      .values({
        periodStart,
        periodEnd,
        outputVatHalalas: Math.max(0, output),
        inputVatHalalas: Math.max(0, input),
        netVatHalalas: output - input,
        status: output - input < 0 ? "refundable" : "draft",
        createdBy: actor.user.email,
      })
      .returning();
    return jsonNoStore({ taxReturn: row }, { status: 201 });
  }
  return jsonNoStore({ error: "العملية غير مدعومة" }, { status: 400 });
}
export async function PATCH(request: Request) {
  if (rejectCrossSiteRequest(request))
    return jsonNoStore({ error: "مصدر الطلب غير مسموح" }, { status: 403 });
  const actor = await access(true);
  if (!actor) return jsonNoStore({ error: "غير مصرح" }, { status: 403 });
  const parsed = await readLimitedJson(request, 20000);
  if (!parsed.ok) return parsed.response;
  const body = parsed.value as Record<string, unknown>,
    action = clean(body.action, 40),
    db = getDb(),
    now = new Date().toISOString();
  if (action === "match-statement") {
    const lineId = id(body.lineId),
      journalEntryId = id(body.journalEntryId),
      line = await db.query.bankStatementLines.findFirst({
        where: eq(bankStatementLines.id, lineId),
      });
    if (!line || line.matchStatus === "matched")
      return jsonNoStore({ error: "حركة الكشف غير متاحة" }, { status: 409 });
    const journal = await db.query.journalEntries.findFirst({
      where: eq(journalEntries.id, journalEntryId),
    });
    const matching =
      journal &&
      (await db.query.journalLines.findFirst({
        where: and(
          eq(journalLines.journalEntryId, journal.id),
          eq(journalLines.bankAccountId, line.bankAccountId),
          line.direction === "credit"
            ? eq(journalLines.debitHalalas, line.amountHalalas)
            : eq(journalLines.creditHalalas, line.amountHalalas),
        ),
      }));
    if (journal?.status !== "posted" || !matching)
      return jsonNoStore(
        { error: "القيد المرحل لا يطابق البنك والاتجاه والمبلغ" },
        { status: 409 },
      );
    const [row] = await db
      .update(bankStatementLines)
      .set({
        matchStatus: "matched",
        journalEntryId: journal.id,
        matchedBy: actor.user.email,
        matchedAt: now,
      })
      .where(
        and(
          eq(bankStatementLines.id, line.id),
          eq(bankStatementLines.matchStatus, "unmatched"),
        ),
      )
      .returning();
    return jsonNoStore({ line: row });
  }
  if (action === "period-status") {
    if (
      actor.role !== "admin" &&
      !actor.functionalRoles.some((role) =>
        ["system_owner", "system_admin", "finance_director"].includes(role),
      )
    )
      return jsonNoStore(
        { error: "إقفال الفترة من صلاحيات الإدارة المالية" },
        { status: 403 },
      );
    const periodId = id(body.periodId),
      status = clean(body.status, 20),
      period = await db.query.fiscalPeriods.findFirst({
        where: eq(fiscalPeriods.id, periodId),
      });
    if (!period || !["open", "soft_closed", "closed"].includes(status))
      return jsonNoStore(
        { error: "الفترة أو الحالة غير صحيحة" },
        { status: 400 },
      );
    if (status === "closed") {
      const unresolved = await db.query.journalEntries.findFirst({
        where: and(
          eq(journalEntries.fiscalPeriodId, period.id),
          inArray(journalEntries.status, ["draft", "approved"]),
        ),
      });
      if (unresolved)
        return jsonNoStore(
          { error: "لا يمكن إغلاق فترة تحتوي قيودًا غير مرحلة" },
          { status: 409 },
        );
    }
    const [row] = await db
      .update(fiscalPeriods)
      .set({
        status,
        closedBy: status === "closed" ? actor.user.email : null,
        closedAt: status === "closed" ? now : null,
      })
      .where(eq(fiscalPeriods.id, period.id))
      .returning();
    await auditPortalAction({
      actorEmail: actor.user.email,
      action: `fiscal-period-${status}`,
      entityType: "fiscal-period",
      entityId: period.id,
      before: period,
      after: row,
      reason: clean(body.reason, 500),
    });
    return jsonNoStore({ period: row });
  }
  if (action === "depreciate-asset") {
    const assetId = id(body.assetId),
      asset = await db.query.fixedAssets.findFirst({
        where: eq(fixedAssets.id, assetId),
      }),
      rule = await db.query.accountingPostingRules.findFirst({
        where: and(
          eq(accountingPostingRules.eventType, "asset_depreciation"),
          eq(accountingPostingRules.active, true),
        ),
      });
    if (!asset || asset.status !== "active" || !rule)
      return jsonNoStore(
        { error: "الأصل أو قاعدة ترحيل الإهلاك غير مهيأة" },
        { status: 409 },
      );
    const monthly = Math.floor(
        (asset.costHalalas - asset.residualValueHalalas) /
          asset.usefulLifeMonths,
      ),
      remaining =
        asset.costHalalas -
        asset.residualValueHalalas -
        asset.accumulatedDepreciationHalalas,
      value = Math.min(monthly, remaining);
    if (value < 1)
      return jsonNoStore({ error: "اكتمل إهلاك الأصل" }, { status: 409 });
    const journal = await createDraftJournal({
      entryDate: clean(body.entryDate, 10),
      description: `إهلاك ${asset.assetCode} — ${asset.nameAr}`,
      sourceType: "fixed-asset-depreciation",
      sourceId: String(asset.id),
      actorEmail: actor.user.email,
      lines: [
        {
          accountId: rule.debitAccountId,
          debitHalalas: value,
          costCenterCode: asset.costCenterCode,
          description: "مصروف الإهلاك",
        },
        {
          accountId: rule.creditAccountId,
          creditHalalas: value,
          costCenterCode: asset.costCenterCode,
          description: "مجمع الإهلاك",
        },
      ],
    });
    await db
      .update(fixedAssets)
      .set({
        accumulatedDepreciationHalalas:
          asset.accumulatedDepreciationHalalas + value,
      })
      .where(eq(fixedAssets.id, asset.id));
    return jsonNoStore({ journal: journal.entry, valueHalalas: value });
  }
  if (action === "issue-status") {
    const issueId = id(body.issueId),
      status = clean(body.status, 20);
    if (!["investigating", "resolved", "ignored"].includes(status))
      return jsonNoStore({ error: "حالة المعالجة غير صحيحة" }, { status: 400 });
    const [row] = await db
      .update(financialOperationIssues)
      .set({
        status,
        retryCount: sql`${financialOperationIssues.retryCount}+${status === "investigating" ? 1 : 0}`,
        assignedTo: status === "investigating" ? actor.user.email : null,
        resolvedBy: ["resolved", "ignored"].includes(status)
          ? actor.user.email
          : null,
        resolvedAt: ["resolved", "ignored"].includes(status) ? now : null,
        updatedAt: now,
      })
      .where(eq(financialOperationIssues.id, issueId))
      .returning();
    return jsonNoStore({ issue: row });
  }
  return jsonNoStore({ error: "العملية غير مدعومة" }, { status: 400 });
}
