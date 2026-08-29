"use client";

import { readApiJson } from "@/lib/client-api";
import { useDesktopLiveRefresh } from "@/lib/use-desktop-live-refresh";
import { FormEvent, useCallback, useEffect, useState } from "react";
import FinanceEnterpriseWorkspace from "./FinanceEnterpriseWorkspace";

type Account = {
  id: number;
  code: string;
  nameAr: string;
  accountType: string;
  isPosting: boolean;
  status: string;
};
type Period = {
  id: number;
  periodCode: string;
  nameAr: string;
  startDate: string;
  endDate: string;
  status: string;
};
type Entry = {
  id: number;
  entryNumber: string;
  entryDate: string;
  description: string;
  status: string;
  createdBy: string;
  approvedBy: string | null;
  postedBy: string | null;
};
type Line = {
  id: number;
  journalEntryId: number;
  accountId: number;
  debitHalalas: number;
  creditHalalas: number;
};
type Bank = {
  id: number;
  accountCode: string;
  bankName: string;
  accountName: string;
  iban: string;
  status: string;
  balanceHalalas: number;
};
type Treasury = {
  accountId: number;
  accountCode: string;
  accountName: string;
  balanceHalalas: number;
};
type Data = {
  accounts: Account[];
  periods: Period[];
  entries: Entry[];
  lines: Line[];
  banks: Bank[];
  treasury: Treasury | null;
};

const statusLabels: Record<string, string> = {
  draft: "مسودة",
  approved: "معتمد",
  posted: "مرحل",
  reversed: "معكوس",
  void: "ملغى",
  open: "مفتوحة",
  closed: "مغلقة",
  soft_closed: "إغلاق أولي",
  future: "مستقبلية",
};
const money = (halalas: number) =>
  new Intl.NumberFormat("ar-SA", { style: "currency", currency: "SAR" }).format(
    halalas / 100,
  );
const ibanLabel = (iban: string) => iban.replace(/(.{4})/g, "$1 ").trim();

export default function AccountingWorkspace({
  canWrite,
  isAdmin,
}: {
  canWrite: boolean;
  isAdmin: boolean;
}) {
  const [data, setData] = useState<Data>({
    accounts: [],
    periods: [],
    entries: [],
    lines: [],
    banks: [],
    treasury: null,
  });
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const response = await fetch("/api/portal/accounting", {
      cache: "no-store",
    });
    const result = (await readApiJson(response)) as Data & { error?: string };
    if (!response.ok) throw new Error(result.error || "تعذّر تحميل المحاسبة");
    setData(result);
  }, []);
  useDesktopLiveRefresh(load);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/portal/accounting", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const result = (await readApiJson(response)) as Data & {
          error?: string;
        };
        if (!response.ok)
          throw new Error(result.error || "تعذّر تحميل المحاسبة");
        setData(result);
      })
      .catch((error) => {
        if (error instanceof Error && error.name !== "AbortError")
          setNotice(error.message);
      });
    return () => controller.abort();
  }, []);
  const postingAccounts = data.accounts.filter(
    (item) => item.isPosting && item.status === "active",
  );
  const totalFor = (entryId: number) =>
    data.lines
      .filter((line) => line.journalEntryId === entryId)
      .reduce((sum, line) => sum + line.debitHalalas, 0);

  async function action(
    method: "POST" | "PATCH",
    payload: Record<string, unknown>,
    key: string,
  ) {
    setBusy(key);
    setNotice("");
    try {
      const response = await fetch("/api/portal/accounting", {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await readApiJson(response)) as { error?: string };
      if (!response.ok) throw new Error(result.error || "تعذّر تنفيذ العملية");
      await load();
      setNotice("تمت العملية بنجاح وسُجلت في سجل التدقيق.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "تعذّر تنفيذ العملية");
    } finally {
      setBusy("");
    }
  }

  function submitJournal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fd = new FormData(form);
    void action(
      "POST",
      {
        action: "create-journal",
        entryDate: fd.get("entryDate"),
        description: fd.get("description"),
        amount: fd.get("amount"),
        debitAccountId: fd.get("debitAccountId"),
        creditAccountId: fd.get("creditAccountId"),
      },
      "journal",
    ).then(() => form.reset());
  }

  function submitBank(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fd = new FormData(form);
    void action(
      "POST",
      {
        action: "add-bank",
        accountCode: fd.get("accountCode"),
        bankName: fd.get("bankName"),
        accountName: fd.get("accountName"),
        iban: fd.get("iban"),
        ledgerAccountId: fd.get("ledgerAccountId"),
      },
      "bank",
    ).then(() => form.reset());
  }

  function submitLiquidityTransfer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fd = new FormData(form);
    void action(
      "POST",
      {
        action: "transfer-liquidity",
        direction: fd.get("direction"),
        bankAccountId: fd.get("bankAccountId"),
        amount: fd.get("amount"),
        entryDate: fd.get("entryDate"),
        reference: fd.get("reference"),
      },
      "liquidity-transfer",
    ).then(() => form.reset());
  }

  if (!data.accounts.length)
    return (
      <section className="panel accounting-setup">
        <h2>تهيئة المحاسبة المؤسسية</h2>
        <p>
          لم يُنشأ دليل الحسابات والفترة المالية بعد. التهيئة لا تغيّر السجلات
          المالية القديمة.
        </p>
        {isAdmin ? (
          <button
            className="admin-primary"
            disabled={busy === "initialize"}
            onClick={() =>
              void action("POST", { action: "initialize" }, "initialize")
            }
          >
            {busy === "initialize"
              ? "جارٍ التهيئة..."
              : "إنشاء دليل الحسابات والفترة المالية"}
          </button>
        ) : (
          <p className="form-error">يلزم مدير النظام لإجراء التهيئة الأولى.</p>
        )}
        {notice && <p role="status">{notice}</p>}
      </section>
    );

  return (
    <section className="accounting-workspace">
      <div className="accounting-heading">
        <div>
          <span>المحاسبة مزدوجة القيد</span>
          <h2>الأستاذ العام والحسابات البنكية</h2>
          <p>
            لا يؤثر أي سجل في الأرصدة قبل اعتماده وترحيله، ولا يقبل النظام قيدًا
            غير متوازن.
          </p>
        </div>
        <div className="accounting-periods">
          {data.periods.slice(0, 3).map((period) => (
            <span key={period.id} className={period.status}>
              <b>{period.nameAr}</b>
              {statusLabels[period.status] || period.status}
            </span>
          ))}
        </div>
      </div>
      {notice && (
        <div className="operations-notice" role="status">
          {notice}
        </div>
      )}
      <div className="accounting-metrics">
        <article>
          <span>رصيد الخزينة المرحل</span>
          <b>{money(data.treasury?.balanceHalalas || 0)}</b>
          <small>
            {data.treasury?.accountCode || "1100"} · لا يشمل المسودات
          </small>
        </article>
        <article>
          <span>إجمالي أرصدة البنوك</span>
          <b>
            {money(
              data.banks.reduce((sum, bank) => sum + bank.balanceHalalas, 0),
            )}
          </b>
          <small>من القيود المرحلة لكل بنك</small>
        </article>
        <article>
          <span>بانتظار الاعتماد</span>
          <b>{data.entries.filter((item) => item.status === "draft").length}</b>
          <small>لا تؤثر في الرصيد حتى الترحيل</small>
        </article>
        <article>
          <span>الحسابات البنكية</span>
          <b>{data.banks.length}</b>
          <small>مرتبطة بالأستاذ العام</small>
        </article>
      </div>
      {canWrite && (
        <div className="accounting-forms">
          <details open>
            <summary>تحويل بين الخزينة والبنك</summary>
            <form onSubmit={submitLiquidityTransfer}>
              <select name="direction" required defaultValue="">
                <option value="" disabled>
                  اتجاه التحويل
                </option>
                <option value="bank_to_cash">
                  سحب من البنك وتغذية الخزينة
                </option>
                <option value="cash_to_bank">إيداع من الخزينة في البنك</option>
              </select>
              <select name="bankAccountId" required defaultValue="">
                <option value="" disabled>
                  الحساب البنكي
                </option>
                {data.banks
                  .filter((bank) => bank.status === "active")
                  .map((bank) => (
                    <option key={bank.id} value={bank.id}>
                      {bank.bankName} · {bank.accountCode} ·{" "}
                      {money(bank.balanceHalalas)}
                    </option>
                  ))}
              </select>
              <input
                name="amount"
                type="number"
                min="0.01"
                step="0.01"
                required
                placeholder="المبلغ بالريال"
              />
              <input
                name="entryDate"
                type="date"
                required
                defaultValue={new Date().toISOString().slice(0, 10)}
              />
              <input
                name="reference"
                maxLength={180}
                placeholder="مرجع السحب أو الإيداع"
              />
              <button disabled={busy === "liquidity-transfer"}>
                {busy === "liquidity-transfer"
                  ? "جارٍ إنشاء القيد..."
                  : "حفظ التحويل كمسودة"}
              </button>
            </form>
            <p className="form-hint">
              يُنشأ قيد متوازن ولا يتغير أي رصيد قبل الاعتماد والترحيل. يمنع
              النظام تجاوز الرصيد المتاح.
            </p>
          </details>
          <details>
            <summary>إنشاء قيد يومية</summary>
            <form onSubmit={submitJournal}>
              <input name="entryDate" type="date" required />
              <input
                name="description"
                required
                minLength={3}
                maxLength={500}
                placeholder="بيان القيد"
              />
              <input
                name="amount"
                type="number"
                min="0.01"
                step="0.01"
                required
                placeholder="المبلغ بالريال"
              />
              <select name="debitAccountId" required defaultValue="">
                <option value="" disabled>
                  الحساب المدين
                </option>
                {postingAccounts.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.code} · {item.nameAr}
                  </option>
                ))}
              </select>
              <select name="creditAccountId" required defaultValue="">
                <option value="" disabled>
                  الحساب الدائن
                </option>
                {postingAccounts.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.code} · {item.nameAr}
                  </option>
                ))}
              </select>
              <button disabled={busy === "journal"}>
                {busy === "journal" ? "جارٍ الحفظ..." : "حفظ كمسودة"}
              </button>
            </form>
          </details>
          <details>
            <summary>إضافة حساب بنكي</summary>
            <form onSubmit={submitBank}>
              <input
                name="accountCode"
                required
                placeholder="رمز الحساب البنكي"
              />
              <input name="bankName" required placeholder="اسم البنك" />
              <input
                name="accountName"
                required
                placeholder="اسم صاحب الحساب"
              />
              <input
                name="iban"
                required
                dir="ltr"
                pattern="SA[0-9 ]{22,28}"
                placeholder="SA00 0000 0000 0000 0000 0000"
              />
              <select name="ledgerAccountId" required defaultValue="">
                <option value="" disabled>
                  حساب الأستاذ المرتبط
                </option>
                {postingAccounts
                  .filter((item) => item.accountType === "asset")
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.code} · {item.nameAr}
                    </option>
                  ))}
              </select>
              <button disabled={busy === "bank"}>
                {busy === "bank" ? "جارٍ الحفظ..." : "حفظ الحساب"}
              </button>
            </form>
          </details>
        </div>
      )}
      <div className="accounting-grid">
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>القيود اليومية</h2>
              <p>المسودة لا تغير الرصيد حتى الاعتماد والترحيل</p>
            </div>
          </div>
          <div className="accounting-table">
            <table>
              <thead>
                <tr>
                  <th>القيد</th>
                  <th>التاريخ</th>
                  <th>البيان</th>
                  <th>المبلغ</th>
                  <th>الحالة</th>
                  <th>الإجراء</th>
                </tr>
              </thead>
              <tbody>
                {data.entries.map((entry) => (
                  <tr key={entry.id}>
                    <td dir="ltr">{entry.entryNumber}</td>
                    <td>{entry.entryDate}</td>
                    <td>
                      <strong>{entry.description}</strong>
                      <small>{entry.createdBy}</small>
                    </td>
                    <td>{money(totalFor(entry.id))}</td>
                    <td>
                      <span className={`workflow-status ${entry.status}`}>
                        {statusLabels[entry.status] || entry.status}
                      </span>
                    </td>
                    <td>
                      {canWrite && entry.status === "draft" ? (
                        <button
                          disabled={busy === `approve-${entry.id}`}
                          onClick={() =>
                            void action(
                              "PATCH",
                              { action: "approve", entryId: entry.id },
                              `approve-${entry.id}`,
                            )
                          }
                        >
                          اعتماد
                        </button>
                      ) : isAdmin && entry.status === "approved" ? (
                        <button
                          disabled={busy === `post-${entry.id}`}
                          onClick={() =>
                            void action(
                              "PATCH",
                              { action: "post", entryId: entry.id },
                              `post-${entry.id}`,
                            )
                          }
                        >
                          ترحيل
                        </button>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!data.entries.length && (
              <p className="empty-operational">لا توجد قيود يومية بعد.</p>
            )}
          </div>
        </section>
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>الحسابات البنكية</h2>
              <p>كل بنك مرتبط بحساب مستقل ورصيده المرحل</p>
            </div>
          </div>
          <div className="bank-list">
            {data.banks.map((bank) => (
              <article key={bank.id}>
                <span>{bank.accountCode}</span>
                <p>
                  <strong>{bank.bankName}</strong>
                  <small>
                    {bank.accountName} · الرصيد {money(bank.balanceHalalas)}
                  </small>
                </p>
                <b dir="ltr">{ibanLabel(bank.iban)}</b>
              </article>
            ))}
            {!data.banks.length && (
              <p className="empty-operational">لم تُضف حسابات بنكية بعد.</p>
            )}
          </div>
        </section>
      </div>
      <FinanceEnterpriseWorkspace canWrite={canWrite} />
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>دليل الحسابات</h2>
            <p>الحسابات التي تستقبل القيود المحاسبية</p>
          </div>
        </div>
        <div className="account-list">
          {data.accounts.map((account) => (
            <article key={account.id}>
              <span dir="ltr">{account.code}</span>
              <strong>{account.nameAr}</strong>
              <small>
                {account.isPosting ? "قابل للترحيل" : "حساب تجميعي"}
              </small>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}
