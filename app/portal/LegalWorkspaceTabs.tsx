"use client";
import { type ReactNode, useState } from "react";

export default function LegalWorkspaceTabs({ children, register, compliance }: { children: ReactNode; register: ReactNode; compliance: ReactNode }) {
  const [tab, setTab] = useState("cases");
  return <div className="legal-module-tabs">
    <nav className="legal-tabs" aria-label="أقسام الشؤون القانونية">{[["cases", "القضايا والمحامون والمشاركة"], ["register", "سجل الملفات والتراخيص"], ["compliance", "الامتثال والالتزامات"]].map(([id, title]) => <button type="button" key={id} aria-pressed={tab === id} onClick={() => setTab(id)}>{title}</button>)}</nav>
    <div hidden={tab !== "cases"}>{children}</div><div hidden={tab !== "register"}>{register}</div><div hidden={tab !== "compliance"}>{compliance}</div>
  </div>;
}
