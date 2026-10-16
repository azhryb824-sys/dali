"use client";

import { type ReactNode, useId, useState } from "react";
import "./workforce-tabs.css";

type Tab = "payments" | "movements" | "accounts" | "posting" | "purchasing" | "reports" | "reconciliation";
export default function FinanceWorkspaceTabs({ children, payments, accounts, posting, purchasing, reports, reconciliation }: {
  children: ReactNode; payments: ReactNode; accounts: ReactNode; posting: ReactNode; purchasing: ReactNode; reports: ReactNode; reconciliation: ReactNode;
}) {
  const [tab, setTab] = useState<Tab>("movements");
  const id = useId();
  const tabs: { id: Tab; label: string; count?: number; content: ReactNode }[] = [
    { id: "movements", label: "الحركات والمستندات", content: children },
    { id: "payments", label: "الدفعات والتحصيل", content: payments },
    { id: "accounts", label: "الحسابات والخزينة", content: accounts },
    { id: "posting", label: "الترحيل المالي", content: posting },
    { id: "purchasing", label: "المشتريات والموردون", content: purchasing },
    { id: "reports", label: "التقارير المالية", content: reports },
    { id: "reconciliation", label: "التسوية البنكية", content: reconciliation },
  ];
  return <div className="workforce-workspace-tabs finance-workspace-tabs">
    <div className="workforce-tab-list" role="tablist" aria-label="أقسام الإدارة المالية">
      {tabs.map((item, index) => <button key={item.id} id={`${id}-tab-${item.id}`} type="button" role="tab" aria-selected={tab === item.id} aria-controls={`${id}-panel-${item.id}`} tabIndex={tab === item.id ? 0 : -1} onClick={() => setTab(item.id)} onKeyDown={event => {
        if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const rtl = getComputedStyle(event.currentTarget).direction === "rtl";
        const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + ((event.key === "ArrowRight") !== rtl ? 1 : -1) + tabs.length) % tabs.length;
        setTab(tabs[next].id);
        document.getElementById(`${id}-tab-${tabs[next].id}`)?.focus();
      }}><span>{item.label}</span>{item.count !== undefined && <b>{item.count}</b>}</button>)}
    </div>
    {tabs.map(item => <div key={item.id} id={`${id}-panel-${item.id}`} role="tabpanel" aria-labelledby={`${id}-tab-${item.id}`} hidden={tab !== item.id} tabIndex={0} className="workforce-tab-panel">{item.content}</div>)}
  </div>;
}
