"use client";

import { readApiJson } from "@/lib/client-api";

/* eslint-disable react-hooks/purity -- payment cutoffs are intentionally calculated from the current dashboard time */
import { useEffect, useMemo, useState } from "react";

type Contract = {
  id: number;
  referenceCode: string;
  clientName: string;
  approvedBy: string | null;
};
type Payment = {
  id: number;
  contractId: number;
  title: string;
  dueDate: string;
  invoiceAmountHalalas: number;
  paidAmountHalalas: number;
  remainingAmountHalalas: number;
  isOverdue: boolean;
  status: string;
  cancellationDisposition?: string | null;
  invoiceDocumentId: number | null;
};
type Data = { contracts: Contract[]; payments: Payment[] };

const money = (value: number) =>
  new Intl.NumberFormat("ar-SA", {
    style: "currency",
    currency: "SAR",
    maximumFractionDigits: 2,
  }).format(value / 100);

const statusLabels: Record<string, string> = {
  scheduled: "مجدولة",
  due: "مستحقة",
  referred: "محالة للمحاسبة",
  invoiced: "مفوتر",
  partially_paid: "مسددة جزئيًا",
  paid: "مسددة",
  cancelled: "ملغاة",
};

export default function PaymentManagementDashboard() {
  const [data, setData] = useState<Data | null>(null);
  const [filter, setFilter] = useState("all");
  const [error, setError] = useState("");
  useEffect(() => {
    void fetch("/api/portal/contract-payments", { cache: "no-store" })
      .then(async (response) => {
        const result = (await readApiJson(response)) as Data & {
          error?: string;
        };
        if (!response.ok)
          throw new Error(result.error || "تعذر تحميل الدفعات");
        setData(result);
      })
      .catch((problem) =>
        setError(problem instanceof Error ? problem.message : "تعذر التحميل"),
      );
  }, []);
  const today = new Date().toISOString().slice(0, 10);
  const metrics = useMemo(() => {
    const approvedContractIds = new Set((data?.contracts || []).filter(item => item.approvedBy).map(item => item.id));
    const rows = (data?.payments || []).filter(item => approvedContractIds.has(item.contractId) && item.status !== "cancelled" && !item.cancellationDisposition?.startsWith("review_"));
    const total = rows.reduce(
      (sum, item) => sum + item.invoiceAmountHalalas,
      0,
    );
    const paid = (data?.payments || []).reduce(
      (sum, item) => sum + item.paidAmountHalalas,
      0,
    );
    const invoiced = (data?.payments || [])
      .filter((item) => item.invoiceDocumentId && item.status !== "cancelled")
      .reduce((sum, item) => sum + item.remainingAmountHalalas, 0);
    const overdue = rows
      .filter((item) => item.isOverdue && item.status !== "cancelled")
      .reduce((sum, item) => sum + item.remainingAmountHalalas, 0);
    const due30 = rows
      .filter(
        (item) =>
          item.status !== "cancelled" &&
          item.remainingAmountHalalas > 0 &&
          item.dueDate >= today &&
          item.dueDate <=
            new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
      )
      .reduce((sum, item) => sum + item.remainingAmountHalalas, 0);
    return {
      total,
      paid,
      invoiced,
      overdue,
      due30,
      collection: total ? Math.round((rows.reduce((sum, item) => sum + item.paidAmountHalalas, 0) / total) * 100) : 0,
    };
  }, [data, today]);
  if (!data)
    return (
      <section className="payment-command-center panel">
        <p>{error || "جارٍ إعداد مركز الدفعات..."}</p>
      </section>
    );
  const visible = data.payments.filter((item) => {
    if (filter === "all") return true;
    if (filter === "overdue") return item.isOverdue;
    return item.status === filter;
  });
  return (
    <section className="payment-command-center panel">
      <header>
        <div>
          <span>Payment Command Center</span>
          <h2>مركز إدارة الدفعات والتحصيل</h2>
          <p>
            العقد ← الاستحقاق ← الفاتورة ← التحصيل الجزئي أو الكامل ← القيد
            المالي أو الإحالة القانونية.
          </p>
        </div>
        <div
          className="collection-ring"
          style={{ "--progress": `${metrics.collection * 3.6}deg` } as React.CSSProperties}
        >
          <strong>{metrics.collection}%</strong>
          <small>نسبة التحصيل</small>
        </div>
      </header>
      <div className="payment-kpis">
        <article><span>قيمة الدفعات القائمة</span><strong>{money(metrics.total)}</strong><small>{data.payments.length} دفعة</small></article>
        <article className="success"><span>المحصل فعليًا</span><strong>{money(metrics.paid)}</strong><small>يشمل التحصيل الجزئي</small></article>
        <article><span>الرصيد القائم</span><strong>{money(metrics.invoiced)}</strong><small>المتبقي على الفواتير</small></article>
        <article className="warning"><span>متأخر</span><strong>{money(metrics.overdue)}</strong><small>كامل أو جزء متبقٍ</small></article>
        <article><span>خلال 30 يومًا</span><strong>{money(metrics.due30)}</strong><small>توقع نقدي للمتبقي</small></article>
      </div>
      <details className="payment-table-disclosure"><summary>عرض جدول الدفعات والتصفية — {data.payments.length} دفعة</summary>
      <nav className="payment-filters">
        {[
          ["all", "كل الدفعات"],
          ["invoiced", "المفوتر"],
          ["partially_paid", "المسدد جزئيًا"],
          ["paid", "المسدد"],
          ["overdue", "المتأخر"],
          ["cancelled", "الملغى"],
        ].map(([value, label]) => (
          <button key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{label}</button>
        ))}
      </nav>
      <div className="payment-dashboard-table">
        <table>
          <thead><tr><th>العقد والعميل</th><th>الدفعة</th><th>الاستحقاق</th><th>الفاتورة</th><th>المسدد والمتبقي</th><th>الحالة</th><th>المستند</th></tr></thead>
          <tbody>
            {visible.map((item) => {
              const contract = data.contracts.find((candidate) => candidate.id === item.contractId);
              return (
                <tr key={item.id} className={item.isOverdue ? "overdue" : ""}>
                  <td><strong>{contract?.referenceCode}</strong><small>{contract?.clientName}</small></td>
                  <td>{item.title}</td>
                  <td>{new Intl.DateTimeFormat("ar-SA").format(new Date(`${item.dueDate}T00:00:00`))}</td>
                  <td><b>{money(item.invoiceAmountHalalas)}</b></td>
                  <td><strong>{money(item.paidAmountHalalas)}</strong><small>متبقي {money(item.remainingAmountHalalas)}</small></td>
                  <td><span className={`workflow-status ${item.status}`}>{item.isOverdue ? "متأخرة" : statusLabels[item.status] || item.status}</span></td>
                  <td>
                    {item.invoiceDocumentId ? (
                      <span className="pdf-language-actions">
                        <a href={`/api/portal/documents/${item.invoiceDocumentId}?language=ar`}>عربي</a>
                        <a href={`/api/portal/documents/${item.invoiceDocumentId}?language=en`}>English</a>
                      </span>
                    ) : <small>يُنشأ عند الاستحقاق</small>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      </details>
    </section>
  );
}
