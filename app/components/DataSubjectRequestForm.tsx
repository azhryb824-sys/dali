"use client";

import { FormEvent, useState } from "react";

export default function DataSubjectRequestForm() {
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = event.currentTarget;
    try {
      const response = await fetch("/api/privacy-requests", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(Object.fromEntries(new FormData(form).entries())) });
      const data = await response.json() as { trackingCode?: string; error?: string };
      if (!response.ok) throw new Error(data.error || "تعذّر إرسال الطلب");
      setResult(data.trackingCode || "");
      form.reset();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "تعذّر إرسال الطلب");
    } finally { setBusy(false); }
  }

  if (result) return <div className="public-form-success" role="status"><span>✓</span><h3>تم تسجيل طلبك</h3><p>رقم المتابعة: <strong dir="ltr">{result}</strong>. سيتواصل معك الفريق للتحقق من الهوية قبل تنفيذ الطلب.</p></div>;
  return <form className="public-quote-form privacy-request-form" onSubmit={submit}>
    <label>نوع الطلب<select name="requestType" required defaultValue=""><option value="" disabled>اختر نوع الطلب</option><option value="access">الوصول إلى بياناتي</option><option value="correction">تصحيح بياناتي</option><option value="deletion">طلب حذف البيانات</option><option value="withdraw_consent">سحب الموافقة</option><option value="complaint">شكوى متعلقة بالخصوصية</option></select></label>
    <label>الاسم الكامل<input name="fullName" required minLength={2} maxLength={120}/></label>
    <label>البريد الإلكتروني<input name="email" required type="email" maxLength={160}/></label>
    <label>رقم الجوال<input name="mobile" type="tel" maxLength={20}/></label>
    <label className="span-two">تفاصيل تساعد في تحديد البيانات<textarea name="details" rows={5} maxLength={2000}/></label>
    <label className="public-honeypot" aria-hidden="true">الموقع<input name="website" tabIndex={-1} autoComplete="off"/></label>
    {error && <p className="public-form-error span-two" role="alert">{error}</p>}
    <button className="btn primary span-two" disabled={busy}>{busy ? "جارٍ التسجيل..." : "تسجيل طلب الخصوصية"}</button>
  </form>;
}
