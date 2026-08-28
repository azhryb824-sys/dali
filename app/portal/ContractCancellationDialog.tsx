"use client";

import { FormEvent, useState } from "react";

type CancellationContract = {
  id: number;
  referenceCode: string;
  clientName: string;
  status: string;
};

export default function ContractCancellationDialog({
  contract,
  busy,
  onClose,
  onConfirm,
}: {
  contract: CancellationContract;
  busy: boolean;
  onClose: () => void;
  onConfirm: (
    reason: string,
    reasonCode: "late_payment" | "other",
  ) => Promise<void>;
}) {
  const [reasonCode, setReasonCode] = useState<"late_payment" | "other">(
    "other",
  );
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const terminating = ["active", "suspended"].includes(contract.status);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanReason = reason.trim();
    if (reasonCode === "other" && cleanReason.length < 10) {
      setError("اكتب سببًا واضحًا لا يقل عن 10 أحرف.");
      return;
    }
    setError("");
    await onConfirm(
      reasonCode === "late_payment" ? "" : cleanReason,
      reasonCode,
    );
  }

  return (
    <div className="modal-layer">
      <button
        className="drawer-backdrop"
        aria-label="إغلاق نافذة سبب إلغاء العقد"
        onClick={onClose}
      />
      <section
        className="record-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="contract-cancellation-title"
      >
        <div className="drawer-head">
          <div>
            <span>{contract.referenceCode}</span>
            <h2 id="contract-cancellation-title">
              سبب {terminating ? "إنهاء" : "إلغاء"} العقد
            </h2>
          </div>
          <button type="button" onClick={onClose} aria-label="إغلاق">
            ×
          </button>
        </div>
        <form className="feature-form" onSubmit={submit}>
          <p className="span-two">
            {contract.clientName} — سيُحفظ السبب في سجل التدقيق ويُحال ملف العقد
            إلى الشؤون القانونية والمالية.
          </p>
          <label className="span-two">
            نوع السبب
            <select
              value={reasonCode}
              onChange={(event) => {
                setReasonCode(event.target.value as "late_payment" | "other");
                setError("");
              }}
            >
              <option value="other">سبب تعاقدي أو تشغيلي آخر</option>
              <option value="late_payment">تأخر سداد دفعة مثبتة</option>
            </select>
          </label>
          {reasonCode === "other" ? (
            <label className="span-two">
              تفاصيل السبب
              <textarea
                value={reason}
                onChange={(event) => {
                  setReason(event.target.value);
                  setError("");
                }}
                required
                minLength={10}
                maxLength={1000}
                rows={5}
                placeholder="اكتب سبب الإلغاء أو الإنهاء بوضوح..."
                autoFocus
              />
              <small>{reason.trim().length}/1000 — الحد الأدنى 10 أحرف</small>
            </label>
          ) : (
            <p className="span-two">
              سيحدد النظام أقدم دفعة متأخرة ويصوغ السبب تلقائيًا، مع الحفاظ على
              المطالبة المالية وعدم عكسها.
            </p>
          )}
          {error && (
            <p className="operations-notice span-two" role="alert">
              {error}
            </p>
          )}
          <div className="modal-actions span-two">
            <button type="button" onClick={onClose} disabled={busy}>
              رجوع
            </button>
            <button className="admin-primary cancel-action" disabled={busy}>
              {busy
                ? "جارٍ حفظ القرار..."
                : `تأكيد ${terminating ? "إنهاء" : "إلغاء"} العقد`}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
