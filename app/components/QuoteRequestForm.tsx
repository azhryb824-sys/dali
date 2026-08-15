"use client";

import { FormEvent, useRef, useState } from "react";

export default function QuoteRequestForm() {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [trackingCode, setTrackingCode] = useState("");
  const idempotencyKey = useRef(crypto.randomUUID());

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    setError("");
    const form = event.currentTarget;
    try {
      const response = await fetch("/api/workforce-requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...Object.fromEntries(new FormData(form).entries()), requestType: "quotation", specialization: "طلب عرض سعر", idempotencyKey: idempotencyKey.current }),
      });
      const result = await response.json() as { error?: string; trackingCode?: string };
      if (!response.ok) throw new Error(result.error || "تعذّر إرسال الطلب");
      setTrackingCode(result.trackingCode || "");
      form.reset();
      idempotencyKey.current = crypto.randomUUID();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "تعذّر إرسال الطلب حالياً.");
    } finally {
      setSending(false);
    }
  }

  if (trackingCode) return <div className="public-form-success" role="status"><span>✓</span><h3>استلمنا طلب عرض السعر</h3><p>رقم المتابعة: <strong dir="ltr">{trackingCode}</strong></p><button type="button" onClick={() => setTrackingCode("")}>إرسال طلب آخر</button></div>;

  return <form className="public-quote-form" onSubmit={submit}>
    <label>الاسم الكامل<input name="fullName" required minLength={2} maxLength={100} autoComplete="name"/></label>
    <label>اسم المنشأة<input name="companyName" required minLength={2} maxLength={160} autoComplete="organization"/></label>
    <label>رقم الجوال<input name="mobile" required type="tel" maxLength={20} autoComplete="tel"/></label>
    <label>البريد الإلكتروني<input name="email" required type="email" maxLength={160} autoComplete="email"/></label>
    <label>موقع العمل<input name="workSite" required minLength={2} maxLength={180} placeholder="المدينة، الحي أو موقع المشروع"/></label>
    <label>تاريخ البداية المتوقع<input name="requiredStartDate" type="date"/></label>
    <label>عدد العمالة<input name="requestedCount" required type="number" min={1} max={100000}/></label>
    <label>المدة<select name="duration" required defaultValue=""><option value="" disabled>اختر المدة</option><option>أقل من شهر</option><option>من شهر إلى 3 أشهر</option><option>من 3 إلى 6 أشهر</option><option>من 6 إلى 12 شهراً</option><option>أكثر من سنة</option><option>غير محدد</option></select></label>
    <label>وسيلة التواصل<select name="preferredContact" defaultValue="either"><option value="either">الهاتف أو البريد</option><option value="phone">الهاتف</option><option value="email">البريد</option></select></label>
    <label className="span-two">تفاصيل المهن والأعداد<textarea name="details" required minLength={10} maxLength={2000} rows={6} placeholder="اذكر كل مهنة والعدد المطلوب وأي اشتراطات تشغيلية."/></label>
    <label className="public-honeypot" aria-hidden="true">الموقع<input name="website" tabIndex={-1} autoComplete="off"/></label>
    <p className="form-consent span-two">بإرسال الطلب تقر بأنك اطلعت على <a href="/privacy">سياسة الخصوصية</a>، وأن البيانات ستستخدم لمراجعة الاحتياج والتواصل معك.</p>
    {error && <p className="public-form-error span-two" role="alert">{error}</p>}
    <button className="btn primary span-two" disabled={sending}>{sending ? "جارٍ الإرسال..." : "إرسال طلب عرض السعر"}</button>
  </form>;
}
