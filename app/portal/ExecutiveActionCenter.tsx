"use client";
import { useCallback, useEffect, useState } from "react";
import { readApiJson } from "@/lib/client-api";
import ContractBillingWorkspace from "./ContractBillingWorkspace";
import PaymentManagementDashboard from "./PaymentManagementDashboard";
import AccountingWorkspace from "./AccountingWorkspace";
import FinancialPostingWorkspace from "./FinancialPostingWorkspace";
import LegalCaseWorkspace from "./LegalCaseWorkspace";

type Metrics = { pendingContracts: number; overdueReceivablesHalalas: number; legalPaymentRequests: number; legalPaymentAmountHalalas: number; cancellationReviews: number; openLegalCases: number };
const money = (amount: number) => new Intl.NumberFormat("ar-SA", { style: "currency", currency: "SAR" }).format(amount / 100);
export default function ExecutiveActionCenter() {
  const [tab, setTab] = useState("approvals"), [metrics, setMetrics] = useState<Metrics | null>(null), [error, setError] = useState("");
  const load = useCallback(async () => {
    const response = await fetch("/api/portal/executive-center", { cache: "no-store" });
    const result = await readApiJson(response) as Metrics & { error?: string };
    if (!response.ok) throw new Error(result.error || "تعذر تحميل مركز الإدارة");
    setMetrics(result); setError("");
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => void load().catch(error => setError(error.message)), 0); const refresh = () => void load().catch(error => setError(error.message)); window.addEventListener("dali-contract-updated", refresh); window.addEventListener("dali-server-changes", refresh); return () => { window.clearTimeout(timer); window.removeEventListener("dali-contract-updated", refresh); window.removeEventListener("dali-server-changes", refresh); }; }, [load]);
  if (!metrics) return <p role="status">{error || "جارٍ تحميل مركز الإدارة..."}</p>;
  return <section className="executive-action-center">
    <header className="executive-center-heading"><div><span>المالك ومشرف النظام</span><h2>مركز القرارات والاعتمادات</h2><p>القرارات المعلقة، التحصيل، القيود وطلبات السداد القانونية.</p></div><button onClick={() => void load().catch(error => setError(error.message))}>تحديث الإحصائيات</button></header>
    {error && <p role="alert">{error}</p>}
    <div className="executive-kpis">
      <button onClick={() => setTab("approvals")}><span>عقود تنتظر الاعتماد</span><strong>{metrics.pendingContracts}</strong><small>قرار المالك أو المشرف</small></button>
      <button onClick={() => setTab("payments")}><span>مستحقات عملاء متأخرة</span><strong>{money(metrics.overdueReceivablesHalalas)}</strong><small>دون الدفعات الملغاة أو قيد التسوية</small></button>
      <button onClick={() => setTab("legal")}><span>طلبات سداد قانونية</span><strong>{metrics.legalPaymentRequests}</strong><small>{money(metrics.legalPaymentAmountHalalas)}</small></button>
      <button onClick={() => setTab("payments")}><span>دفعات تنتظر تسوية إلغاء</span><strong>{metrics.cancellationReviews}</strong><small>{metrics.openLegalCases} ملفات قانونية مفتوحة</small></button>
    </div>
    <nav className="legal-tabs" aria-label="مهام الإدارة">{[["approvals", "اعتماد العقود"], ["payments", "الفواتير والتحصيل والتسويات"], ["posting", "الاعتماد والترحيل المالي"], ["legal", "طلبات السداد القانونية"]].map(([id, label]) => <button key={id} aria-pressed={tab === id} onClick={() => setTab(id)}>{label}</button>)}</nav>
    {tab === "approvals" && <ContractBillingWorkspace onlyPendingApproval />}
    {tab === "payments" && <><PaymentManagementDashboard /><ContractBillingWorkspace /></>}
    {tab === "posting" && <><AccountingWorkspace canWrite isAdmin /><FinancialPostingWorkspace canWrite /></>}
    {tab === "legal" && <LegalCaseWorkspace paymentsOnly />}
  </section>;
}
