"use client";

import { CancellationRequest } from "./legal-case-model";

type Props = {
  request: CancellationRequest;
  canApprove: boolean;
  reason: string;
  busy: "approve" | "reject" | "";
  onReasonChange: (value: string) => void;
  onDecision: (decision: "approve" | "reject") => void;
};

export default function LegalCancellationDecision({
  request,
  canApprove,
  reason,
  busy,
  onReasonChange,
  onDecision,
}: Props) {
  const question = request.requestedStatus === "terminated" ? "هل تريد إنهاء العقد؟" : "هل تريد إلغاء العقد؟";
  return (
    <section className="legal-cancellation-decision" aria-labelledby="legal-cancellation-question">
      <header>
        <div>
          <span>قرار قانوني ملزم</span>
          <h4 id="legal-cancellation-question">{question}</h4>
          <p>
            الاعتماد ينفذ القرار على العقد، يلغي الدفعات غير المفوترة، يحرر إسنادات العمال، ويسجل كامل الأثر في سجل
            التدقيق. الرفض يبقي العقد دون تغيير.
          </p>
        </div>
        <strong>{request.requestedStatus === "terminated" ? "إنهاء" : "إلغاء"}</strong>
      </header>

      {canApprove ? (
        <div className="legal-decision-form">
          <label>
            <span>التسبيب القانوني للقرار</span>
            <textarea
              value={reason}
              minLength={10}
              maxLength={1000}
              onChange={(event) => onReasonChange(event.target.value)}
              placeholder="اكتب نتيجة مراجعة البنود والمرفقات والالتزامات والإشعارات، ثم سبب اعتماد الطلب أو رفضه..."
            />
            <small>{reason.trim().length}/1000 · الحد الأدنى 10 أحرف</small>
          </label>
          <div>
            <button
              type="button"
              className="legal-decision-reject"
              disabled={Boolean(busy) || reason.trim().length < 10}
              onClick={() => onDecision("reject")}
            >
              {busy === "reject" ? "جارٍ حفظ الرفض..." : "رفض الطلب والإبقاء على العقد"}
            </button>
            <button
              type="button"
              className="legal-decision-approve"
              disabled={Boolean(busy) || reason.trim().length < 10}
              onClick={() => onDecision("approve")}
            >
              {busy === "approve"
                ? "جارٍ تنفيذ القرار..."
                : `اعتماد ${request.requestedStatus === "terminated" ? "إنهاء" : "إلغاء"} العقد`}
            </button>
          </div>
        </div>
      ) : (
        <p className="legal-decision-readonly">
          يمكنك استعراض الملف كاملًا، لكن إصدار القرار يتطلب صلاحية «اعتماد» في الشؤون القانونية.
        </p>
      )}
    </section>
  );
}
