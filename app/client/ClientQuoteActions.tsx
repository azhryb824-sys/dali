"use client";

import { useState } from "react";

export default function ClientQuoteActions({ id, status, canApprove }: { id: number; status: string; canApprove: boolean }) {
  const [current, setCurrent] = useState(status);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  if (!canApprove || current !== "sent") return <span className={`client-status ${current}`}>{current}</span>;

  async function decide(decision: "accepted" | "rejected") {
    const reason = decision === "rejected" ? window.prompt("اكتب سبب رفض العرض")?.trim() || "" : "";
    if (decision === "rejected" && !reason) return;
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/client/quotes", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, decision, reason }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "تعذّر حفظ قرار العرض");
      setCurrent(decision);
      setNotice(decision === "accepted" ? "تم قبول العرض" : "تم رفض العرض");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "تعذّر حفظ القرار");
    } finally {
      setBusy(false);
    }
  }

  return <div className="client-approval"><button disabled={busy} onClick={() => void decide("accepted")}>قبول العرض</button><button disabled={busy} onClick={() => void decide("rejected")}>رفض</button>{notice && <small role="status">{notice}</small>}</div>;
}
