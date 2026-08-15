"use client";

import { FormEvent, useState } from "react";

type AccessRequest = {
  requestedDepartment: string | null;
  requestedJobTitle: string | null;
  requestReason: string | null;
  requestSubmittedAt: string | null;
};

const departmentLabels: Record<string, string> = {
  general: "الإدارة العامة",
  employees: "إدارة الموظفين",
  finance: "الإدارة المالية",
  legal: "الشؤون القانونية",
  workforce: "شؤون العمالة والتشغيل",
};

export default function PortalAccessRequestForm({ initialRequest }: { initialRequest: AccessRequest }) {
  const [requestData, setRequestData] = useState(initialRequest);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSaved(false);
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      const response = await fetch("/api/portal/access-request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          requestedDepartment: data.get("requestedDepartment"),
          requestedJobTitle: data.get("requestedJobTitle"),
          requestReason: data.get("requestReason"),
          termsAccepted: data.get("termsAccepted") === "on",
        }),
      });
      const result = await response.json() as { request?: AccessRequest; error?: string };
      if (!response.ok || !result.request) throw new Error(result.error || "تعذّر إرسال الطلب.");
      setRequestData(result.request);
      setSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذّر إرسال الطلب.");
    } finally {
      setBusy(false);
    }
  }

  return <form className="gate-access-form" onSubmit={submit}>
    <div className="gate-form-heading">
      <strong>{requestData.requestSubmittedAt ? "تحديث بيانات طلب الانضمام" : "أكمل طلب الانضمام"}</strong>
      <span>لا تُمنح أي صلاحية قبل مراجعة مدير النظام للهوية والحاجة الوظيفية.</span>
    </div>
    <label>القسم المطلوب<select name="requestedDepartment" required defaultValue={requestData.requestedDepartment || ""}><option value="" disabled>اختر القسم</option>{Object.entries(departmentLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
    <label>المسمى الوظيفي<input name="requestedJobTitle" required minLength={2} maxLength={120} defaultValue={requestData.requestedJobTitle || ""} placeholder="مثال: مسؤول تشغيل" autoComplete="organization-title"/></label>
    <label className="wide">سبب الحاجة إلى الوصول<textarea name="requestReason" required minLength={20} maxLength={1200} rows={4} defaultValue={requestData.requestReason || ""} placeholder="اذكر مسؤولياتك والوحدات التي تحتاجها لإنجاز عملك."/></label>
    <label className="gate-terms wide"><input name="termsAccepted" type="checkbox" required defaultChecked={Boolean(requestData.requestSubmittedAt)}/><span>أتعهد باستخدام الحساب بنفسي، وعدم مشاركة الجلسة أو تصدير بيانات العمل دون تفويض، وأوافق على <a href="/terms" target="_blank" rel="noreferrer">شروط الاستخدام</a> و<a href="/privacy" target="_blank" rel="noreferrer">سياسة الخصوصية</a>.</span></label>
    {error && <p className="gate-form-error wide" role="alert">{error}</p>}
    {saved && <p className="gate-form-success wide" role="status">تم حفظ الطلب وإشعار مدير النظام للمراجعة.</p>}
    <button className="wide" disabled={busy}>{busy ? "جارٍ الحفظ..." : requestData.requestSubmittedAt ? "تحديث الطلب" : "إرسال طلب الانضمام"}</button>
  </form>;
}
