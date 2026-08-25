"use client";

import { readApiJson } from "@/lib/client-api";


import { useState } from "react";

export default function ClientTimesheetActions({ id, status, canApprove }: { id: number; status: string; canApprove: boolean }) {
  const [current, setCurrent] = useState(status);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  if (!canApprove || current !== "submitted") return <span className={`client-status ${current}`}>{current}</span>;
  async function decide(decision: "approved" | "rejected") {
    const reason = decision === "rejected" ? window.prompt("اكتب سبب الرفض") || "" : "";
    if (decision === "rejected" && !reason) return;
    setBusy(true); setNotice("");
    try {
      const response = await fetch("/api/client/timesheets", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, decision, reason }) });
      const result = await readApiJson(response) as { error?: string };
      if (!response.ok) throw new Error(result.error || "تعذّر حفظ القرار");
      setCurrent(decision); setNotice(decision === "approved" ? "تم الاعتماد" : "تم الرفض");
    } catch (error) { setNotice(error instanceof Error ? error.message : "تعذّر الحفظ"); }
    finally { setBusy(false); }
  }
  return <div className="client-approval"><button disabled={busy} onClick={() => void decide("approved")}>اعتماد</button><button disabled={busy} onClick={() => void decide("rejected")}>رفض</button>{notice && <small role="status">{notice}</small>}</div>;
}
