"use client";

import { FormEvent, useState } from "react";

type StatusResult = { trackingCode: string; requestType: string; status: string; dueAt: string; completedAt: string | null; createdAt: string };
const labels: Record<string, string> = { received: "مستلم", verifying: "التحقق من الهوية", processing: "قيد المعالجة", completed: "مكتمل", rejected: "مرفوض" };

export default function PrivacyStatusLookup() {
  const [result, setResult] = useState<StatusResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setResult(null);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(`/api/privacy-requests?trackingCode=${encodeURIComponent(String(form.get("trackingCode") || ""))}&email=${encodeURIComponent(String(form.get("email") || ""))}`, { cache: "no-store" });
      const data = await response.json() as { request?: StatusResult; error?: string };
      if (!response.ok || !data.request) throw new Error(data.error || "تعذّر التحقق");
      setResult(data.request);
    } catch (submitError) { setError(submitError instanceof Error ? submitError.message : "تعذّر التحقق"); }
    finally { setBusy(false); }
  }

  return <form className="privacy-status-form" onSubmit={submit}><label>رقم المتابعة<input name="trackingCode" required dir="ltr" placeholder="PDR-..." maxLength={40}/></label><label>البريد المستخدم في الطلب<input name="email" required type="email" maxLength={160}/></label><button disabled={busy}>{busy ? "جارٍ التحقق" : "عرض الحالة"}</button>{error && <p role="alert">{error}</p>}{result && <div role="status"><strong>{labels[result.status] || result.status}</strong><span>{result.trackingCode} · الموعد المستهدف {new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium" }).format(new Date(result.dueAt))}</span></div>}</form>;
}
