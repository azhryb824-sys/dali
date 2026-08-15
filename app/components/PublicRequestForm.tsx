"use client";

import { FormEvent, useRef, useState } from "react";

export default function PublicRequestForm({ specialization, submitLabel, detailsLabel, detailsPlaceholder }: {
  specialization: "طلب توظيف" | "شراكة أو توريد" | "شكاوى واقتراحات";
  submitLabel: string;
  detailsLabel: string;
  detailsPlaceholder: string;
}) {
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
        body: JSON.stringify({ ...Object.fromEntries(new FormData(form).entries()), requestType: "general", specialization, idempotencyKey: idempotencyKey.current }),
      });
      const result = await response.json() as { error?: string; trackingCode?: string };
      if (!response.ok) throw new Error(result.error || "تعذّر إرسال الطلب");
      setTrackingCode(result.trackingCode || "");
      form.reset();
      idempotencyKey.current = crypto.randomUUID();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "تعذّر الإرسال حاليًا.");
    } finally {
      setSending(false);
    }
  }

  if (trackingCode) return <div className="public-form-success" role="status"><span>✓</span><h3>تم استلام الطلب</h3><p>رقم المتابعة: <strong dir="ltr">{trackingCode}</strong></p><button type="button" onClick={() => setTrackingCode("")}>إرسال طلب آخر</button></div>;

  return <form className="public-quote-form compact-public-form" onSubmit={submit}>
    <label>الاسم الكامل<input name="fullName" required minLength={2} maxLength={100} autoComplete="name"/></label>
    <label>اسم المنشأة أو جهة العمل<input name="companyName" maxLength={160} autoComplete="organization"/></label>
    <label>رقم الجوال<input name="mobile" required type="tel" maxLength={20} autoComplete="tel"/></label>
    <label>البريد الإلكتروني<input name="email" required type="email" maxLength={160} autoComplete="email"/></label>
    <label className="span-two">{detailsLabel}<textarea name="details" required minLength={10} maxLength={2000} rows={6} placeholder={detailsPlaceholder}/></label>
    <label className="public-honeypot" aria-hidden="true">الموقع<input name="website" tabIndex={-1} autoComplete="off"/></label>
    <p className="form-consent span-two">بإرسال النموذج تقر باطلاعك على <a href="/privacy">سياسة الخصوصية</a>. لا ترسل كلمات مرور أو بيانات بنكية أو صور هوية.</p>
    {error && <p className="public-form-error span-two" role="alert">{error}</p>}
    <button className="btn primary span-two" disabled={sending}>{sending ? "جارٍ الإرسال..." : submitLabel}</button>
  </form>;
}
