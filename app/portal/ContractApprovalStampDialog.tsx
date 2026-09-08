"use client";

/* eslint-disable @next/next/no-img-element -- stamp previews come from an authenticated API route */

export type ContractApprovalStamp = {
  id: number;
  name: string;
  fileName?: string;
};

export default function ContractApprovalStampDialog({
  stamps,
  busy,
  onClose,
  onSelect,
}: {
  stamps: ContractApprovalStamp[];
  busy: boolean;
  onClose: () => void;
  onSelect: (stampId: number) => void;
}) {
  return (
    <div className="stamp-picker-backdrop" role="presentation">
      <section
        className="stamp-picker-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="contract-approval-stamp-title"
      >
        <header>
          <div>
            <span>اعتماد رسمي</span>
            <h2 id="contract-approval-stamp-title">اختيار ختم الاعتماد</h2>
            <p>
              سيثبت الختم المختار في سجل الاعتماد، ولن ينشأ أي أثر رسمي قبل
              التأكيد.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="إغلاق">
            ×
          </button>
        </header>
        <div className="stamp-picker-grid">
          {stamps.map((stamp) => (
            <button
              type="button"
              className="stamp-choice-card"
              key={stamp.id}
              disabled={busy}
              onClick={() => onSelect(stamp.id)}
            >
              <img
                src={`/api/portal/document-stamps?id=${stamp.id}`}
                alt={stamp.name}
              />
              <strong>{stamp.name}</strong>
              {stamp.fileName && <small>{stamp.fileName}</small>}
            </button>
          ))}
        </div>
        {!stamps.length && (
          <p className="empty-operational">
            لا يوجد ختم نشط. أضف ختمًا من مكتبة الأختام أولاً.
          </p>
        )}
      </section>
    </div>
  );
}
