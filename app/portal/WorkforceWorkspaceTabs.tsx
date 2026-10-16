"use client";

import { type ReactNode, useId, useState } from "react";
import "./workforce-tabs.css";

type Tab = "workers" | "readiness" | "contracts" | "requests" | "legal";
export default function WorkforceWorkspaceTabs({ children, readiness, contracts, requests, legal, workerCount, contractCount, requestCount }: {
  children: ReactNode; readiness: ReactNode; contracts: ReactNode; requests: ReactNode; legal: ReactNode;
  workerCount: number; contractCount: number; requestCount: number;
}) {
  const [tab, setTab] = useState<Tab>("workers");
  const id = useId();
  const tabs: { id: Tab; label: string; count?: number; content: ReactNode }[] = [
    { id: "workers", label: "ملفات العمال", count: workerCount, content: children },
    { id: "readiness", label: "التوزيع والجاهزية", content: readiness },
    { id: "contracts", label: "العقود والمواقع", count: contractCount, content: contracts },
    { id: "requests", label: "طلبات العملاء", count: requestCount, content: requests },
    { id: "legal", label: "الإحالات القانونية", content: legal },
  ];
  return <div className="workforce-workspace-tabs">
    <div className="workforce-tab-list" role="tablist" aria-label="أقسام شؤون العمالة">
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
