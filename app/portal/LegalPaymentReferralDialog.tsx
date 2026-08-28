"use client";

import { FormEvent, useState } from "react";

type ReferralPayment = {
  id: number;
  title: string;
  dueDate: string;
};

type ReferralContract = {
  referenceCode: string;
  clientName: string;
};

export default function LegalPaymentReferralDialog({
  payment,
  contract,
  busy,
  onClose,
  onConfirm,
}: {
  payment: ReferralPayment;
  contract: ReferralContract;
  busy: boolean;
  onClose: () => void;
  onConfirm: (reason: string, cancelContract: boolean) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [cancelContract, setCancelContract] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanReason = reason.trim();
    if (cleanReason.length < 10) {
      setError("اكتب سببًا واضحًا للإحالة لا يقل عن 10 أحرف.");
      return;
    }
    setError("");
    await onConfirm(cleanReason, cancelContract);
  }

  return <div className="modal-layer">
    <button className="drawer-backdrop" aria-label="إغلاق نافذة الإحالة القانونية" onClick={onClose}/>
    <section className="record-modal legal-referral-modal" role="dialog" aria-modal="true" aria-labelledby="legal-referral-title">
      <div className="drawer-head"><div><span>{contract.referenceCode}</span><h2 id="legal-referral-title">إحالة دفعة إلى الشؤون القانونية</h2></div><button type="button" onClick={onClose} aria-label="إغلاق">×</button></div>
      <form className="feature-form" onSubmit={submit}>
        <div className="legal-referral-summary span-two"><strong>{contract.clientName}</strong><span>{payment.title} · استحقاق {payment.dueDate}</span></div>
        <label className="span-two">سبب الإحالة<textarea value={reason} onChange={event=>{setReason(event.target.value);setError("")}} required minLength={10} maxLength={1000} rows={4} autoFocus placeholder="اشرح التأخر والإجراءات السابقة بوضوح..."/><small>{reason.trim().length}/1000 — الحد الأدنى 10 أحرف</small></label>
        <fieldset className="legal-cancellation-choice span-two"><legend>هل تريد إلغاء العقد أيضًا؟</legend><label><input type="radio" name="cancelContract" checked={!cancelContract} onChange={()=>setCancelContract(false)}/><span><strong>لا، إحالة الدفعة فقط</strong><small>يبقى العقد بحالته الحالية ويُفتح ملف قانوني للمطالبة.</small></span></label><label className={cancelContract?"selected":""}><input type="radio" name="cancelContract" checked={cancelContract} onChange={()=>setCancelContract(true)}/><span><strong>نعم، إلغاء أو إنهاء العقد</strong><small>يُحال الملف كاملًا، وتبقى المطالبة المالية قائمة دون حذف أو عكس.</small></span></label></fieldset>
        {error&&<p className="operations-notice span-two" role="alert">{error}</p>}
        <div className="modal-actions span-two"><button type="button" onClick={onClose} disabled={busy}>رجوع</button><button className={`admin-primary ${cancelContract?"cancel-action":""}`} disabled={busy}>{busy?"جارٍ تنفيذ الإحالة...":cancelContract?"إحالة الدفعة وإنهاء العقد":"إحالة الدفعة فقط"}</button></div>
      </form>
    </section>
  </div>;
}
