"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import { readApiJson } from "@/lib/client-api";

type Referral = { id: number; sourceId: number; referenceCode: string; reason: string; status: string; returnReason: string | null; referredAt: string };
export default function LegalReferralPanel({ sourceType, records }: {
  sourceType: "contract" | "employee" | "worker"; records: { id: number; label: string }[];
}) {
  const [referrals, setReferrals] = useState<Referral[]>([]), [canRefer, setCanRefer] = useState(false);
  const [notice, setNotice] = useState(""), [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const response = await fetch(`/api/portal/legal-referrals?sourceType=${sourceType}`, { cache: "no-store" });
    const result = await readApiJson(response) as { referrals: Referral[]; canRefer: boolean; error?: string };
    if (!response.ok) throw new Error(result.error || "تعذر تحميل الإحالات");
    setReferrals(result.referrals); setCanRefer(result.canRefer);
  }, [sourceType]);
  useEffect(() => { const timer = window.setTimeout(() => void load().catch(error => setNotice(error.message)), 0); return () => window.clearTimeout(timer); }, [load]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const fd = new FormData(form); setBusy(true); setNotice("");
    try {
      const response = await fetch("/api/portal/legal-referrals", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sourceType, sourceId: Number(fd.get("sourceId")), reason: fd.get("reason") }) });
      const result = await readApiJson(response) as { error?: string };
      if (!response.ok) throw new Error(result.error || "تعذرت الإحالة");
      form.reset(); await load(); setNotice("أحيل الملف إلى القانونية وسُجل السبب وأُشعر القسم المختص.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "تعذرت الإحالة"); }
    finally { setBusy(false); }
  }
  return <details className="panel legal-source-panel"><summary>الإحالات القانونية ومتابعة الإرجاع <b>{referrals.length}</b></summary>
    {notice && <p role="status" className="operations-notice">{notice}</p>}
    {canRefer && <form className="legal-activity-form" onSubmit={submit}>
      <label>السجل المرتبط<select name="sourceId" required defaultValue=""><option value="" disabled>اختر السجل</option>{records.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
      <label>سبب الإحالة<textarea name="reason" required minLength={10} maxLength={2000} /></label>
      <button disabled={busy}>إحالة إلى القانونية</button>
    </form>}
    <div className="legal-card-grid">{referrals.map(item => <details key={item.id} className={`legal-source-card ${item.status}`}>
      <summary><strong>{records.find(record => record.id === item.sourceId)?.label || item.referenceCode}</strong><span>{item.status === "returned" ? "أعيد من القانونية — يتطلب إجراء" : item.status === "closed" ? "ملف مغلق" : "محال إلى القانونية"}</span></summary>
      <p>{item.reason}</p><small>{item.referenceCode}</small>
      {item.returnReason && <p className="operations-notice"><strong>المطلوب من القسم: </strong>{item.returnReason}</p>}
    </details>)}</div>
    {!referrals.length && <p className="legal-empty">لا توجد إحالات مسجلة.</p>}
  </details>;
}
