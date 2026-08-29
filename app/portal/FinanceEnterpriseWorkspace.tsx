"use client";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { readApiJson } from "@/lib/client-api";
type Row = { id: number; [key: string]: unknown };
type Data = {
  rules: Row[];
  statementLines: Row[];
  assets: Row[];
  budgets: Row[];
  taxReturns: Row[];
  issues: Row[];
  periods: Row[];
  accounts: Row[];
  banks: Row[];
};
export default function FinanceEnterpriseWorkspace({
  canWrite,
}: {
  canWrite: boolean;
}) {
  const [data, setData] = useState<Data>({
      rules: [],
      statementLines: [],
      assets: [],
      budgets: [],
      taxReturns: [],
      issues: [],
      periods: [],
      accounts: [],
      banks: [],
    }),
    [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    const response = await fetch("/api/portal/finance/enterprise", {
        cache: "no-store",
      }),
      result = (await readApiJson(response)) as Data & { error?: string };
    if (!response.ok)
      throw new Error(result.error || "تعذر تحميل المركز المالي المتقدم");
    setData(result);
  }, []);
  useEffect(() => {
    void load().catch((error) =>
      setNotice(error instanceof Error ? error.message : "تعذر التحميل"),
    );
  }, [load]);
  async function submit(
    event: FormEvent<HTMLFormElement>,
    method: "POST" | "PATCH",
    action: string,
  ) {
    event.preventDefault();
    const form = event.currentTarget,
      payload: Record<string, unknown> = Object.fromEntries(new FormData(form));
    if (action === "import-bank-statement") {
      try {
        payload.lines = JSON.parse(String(payload.lines || "[]"));
      } catch {
        setNotice("صيغة حركات كشف البنك ليست JSON صحيحة");
        return;
      }
    }
    const response = await fetch("/api/portal/finance/enterprise", {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      }),
      result = (await readApiJson(response)) as { error?: string };
    if (!response.ok) {
      setNotice(result.error || "تعذر تنفيذ العملية");
      return;
    }
    form.reset();
    setNotice("تم حفظ العملية المالية وتوثيقها.");
    await load();
  }
  const accounts = data.accounts.filter((row) => row.isPosting);
  async function period(row: Row) {
    const response = await fetch("/api/portal/finance/enterprise", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "period-status",
          periodId: row.id,
          status: row.status === "closed" ? "open" : "closed",
          reason: "قرار إدارة المالية",
        }),
      }),
      result = (await readApiJson(response)) as { error?: string };
    if (!response.ok) {
      setNotice(result.error || "تعذر تحديث الفترة");
      return;
    }
    await load();
  }
  return (
    <section className="panel finance-enterprise-workspace">
      <div className="panel-head">
        <div>
          <h2>الرقابة المالية المتقدمة</h2>
          <p>
            قواعد الترحيل وكشوف البنوك والفترات والأصول والموازنة والضرائب
            ومعالجة الفشل
          </p>
        </div>
      </div>
      {notice && <p className="operations-notice">{notice}</p>}
      {canWrite && (
        <div className="accounting-forms">
          <details>
            <summary>قاعدة ترحيل</summary>
            <form
              onSubmit={(event) => void submit(event, "POST", "posting-rule")}
            >
              <input
                name="eventType"
                required
                placeholder="نوع العملية مثل asset_depreciation"
              />
              <select name="debitAccountId" required>
                {accounts.map((row) => (
                  <option key={row.id} value={row.id}>
                    {String(row.code)} · {String(row.nameAr)}
                  </option>
                ))}
              </select>
              <select name="creditAccountId" required>
                {accounts.map((row) => (
                  <option key={row.id} value={row.id}>
                    {String(row.code)} · {String(row.nameAr)}
                  </option>
                ))}
              </select>
              <button>حفظ القاعدة</button>
            </form>
          </details>
          <details>
            <summary>استيراد كشف بنك</summary>
            <form
              onSubmit={(event) =>
                void submit(event, "POST", "import-bank-statement")
              }
            >
              <select name="bankAccountId" required>
                {data.banks.map((row) => (
                  <option key={row.id} value={row.id}>
                    {String(row.bankName)} · {String(row.iban)}
                  </option>
                ))}
              </select>
              <input name="statementDate" type="date" required />
              <textarea
                name="lines"
                required
                placeholder='[{"transactionDate":"2026-08-29","description":"حوالة","amount":100,"direction":"credit","reference":"ABC"}]'
              />
              <button>استيراد مع كشف التكرار</button>
            </form>
          </details>
          <details>
            <summary>أصل ثابت</summary>
            <form onSubmit={(event) => void submit(event, "POST", "asset")}>
              <input name="assetCode" required placeholder="رمز الأصل" />
              <input name="nameAr" required placeholder="اسم الأصل" />
              <input name="acquisitionDate" type="date" required />
              <input
                name="cost"
                type="number"
                min="0.01"
                step="0.01"
                required
                placeholder="التكلفة"
              />
              <input
                name="residualValue"
                type="number"
                min="0"
                step="0.01"
                defaultValue="0"
                placeholder="القيمة المتبقية"
              />
              <input
                name="usefulLifeMonths"
                type="number"
                min="1"
                required
                placeholder="العمر بالأشهر"
              />
              <input name="costCenterCode" placeholder="مركز التكلفة" />
              <button>تسجيل الأصل</button>
            </form>
          </details>
          <details>
            <summary>إقرار ضريبي</summary>
            <form
              onSubmit={(event) => void submit(event, "POST", "tax-return")}
            >
              <input name="periodStart" type="date" required />
              <input name="periodEnd" type="date" required />
              <button>احتساب الإقرار من القيود المرحلة</button>
            </form>
          </details>
        </div>
      )}
      <div className="hr-grid">
        <section>
          <h3>الفترات المالية</h3>
          {data.periods.map((row) => (
            <article key={row.id}>
              <b>{String(row.nameAr)}</b>
              <span>{String(row.status)}</span>
              {canWrite && (
                <button onClick={() => void period(row)}>
                  {row.status === "closed" ? "إعادة فتح مقيدة" : "إغلاق"}
                </button>
              )}
            </article>
          ))}
        </section>
        <section>
          <h3>عمليات تحتاج معالجة</h3>
          {data.issues.map((row) => (
            <article key={row.id}>
              <b>
                {String(row.sourceType)} · {String(row.sourceId)}
              </b>
              <span>{String(row.errorMessage)}</span>
              <small>{String(row.status)}</small>
            </article>
          ))}
          {!data.issues.length && <p>لا توجد عمليات مالية فاشلة مفتوحة.</p>}
        </section>
      </div>
    </section>
  );
}
