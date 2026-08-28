"use client";

import {
  CaseSnapshot,
  CancellationRequest,
  Matter,
  caseStatuses,
  contractStatuses,
  formatDate,
  money,
} from "./legal-case-model";

type Props = {
  matter: Matter;
  snapshot: CaseSnapshot;
  cancellationRequest: CancellationRequest | null;
};

export default function LegalCaseSnapshot({ matter, snapshot, cancellationRequest }: Props) {
  const seen = new Set<number>();
  const documents = (snapshot.documents || []).filter((document) => {
    if (!document.id || seen.has(document.id)) return false;
    seen.add(document.id);
    return true;
  });
  const paymentTotal = (snapshot.payments || []).reduce((sum, item) => sum + Number(item.amountHalalas || 0), 0);
  const financeTotal = (snapshot.finances || []).reduce((sum, item) => sum + Number(item.amountHalalas || 0), 0);
  const contractValue = Number(snapshot.contract?.amountHalalas || snapshot.contract?.totalValueHalalas || 0);

  return (
    <section className="legal-case-snapshot" aria-label="ملف العقد المحال">
      <header>
        <div>
          <span>نسخة الملف وقت الإحالة</span>
          <h4>العقد ومرفقاته والبيانات المرتبطة</h4>
          <p>
            تم تجميد هذه النسخة بتاريخ {formatDate(snapshot.capturedAt || matter.referredAt, true)} لسلامة المراجعة
            القانونية.
          </p>
        </div>
        <strong className={`legal-case-state ${matter.status}`}>{caseStatuses[matter.status] || matter.status}</strong>
      </header>

      {cancellationRequest && (
        <div className="legal-referral-banner">
          <div>
            <span>طلب قرار قانوني</span>
            <strong>{cancellationRequest.requestedStatus === "terminated" ? "إنهاء عقد ساري" : "إلغاء العقد"}</strong>
          </div>
          <p>{cancellationRequest.reason}</p>
          <small>
            مقدم الطلب: {cancellationRequest.requestedBy} · {formatDate(cancellationRequest.requestedAt, true)}
          </small>
        </div>
      )}

      <div className="legal-file-grid">
        <article className="legal-contract-card">
          <header>
            <div>
              <span>العقد محل المراجعة</span>
              <h5>{snapshot.contract?.referenceCode || matter.referenceCode}</h5>
            </div>
            <strong>{contractStatuses[snapshot.contract?.status || ""] || snapshot.contract?.status || "غير محدد"}</strong>
          </header>
          <p>{snapshot.contract?.title || matter.title}</p>
          <dl>
            <div>
              <dt>العميل</dt>
              <dd>{snapshot.contract?.clientName || matter.counterparty}</dd>
            </div>
            <div>
              <dt>قيمة العقد</dt>
              <dd>{contractValue ? money(contractValue) : "غير محددة"}</dd>
            </div>
            <div>
              <dt>بداية العقد</dt>
              <dd>{formatDate(snapshot.contract?.startDate)}</dd>
            </div>
            <div>
              <dt>نهاية العقد</dt>
              <dd>{formatDate(snapshot.contract?.endDate)}</dd>
            </div>
            <div>
              <dt>موقع العمل</dt>
              <dd>{snapshot.contract?.workSite || "غير مسجل"}</dd>
            </div>
            <div>
              <dt>الحالة وقت الإحالة</dt>
              <dd>
                {contractStatuses[cancellationRequest?.contractStatusAtReferral || snapshot.contract?.status || ""] ||
                  cancellationRequest?.contractStatusAtReferral ||
                  snapshot.contract?.status ||
                  "غير محددة"}
              </dd>
            </div>
          </dl>
          {snapshot.contract?.documentId ? (
            <a
              className="legal-open-contract"
              href={`/api/portal/documents/${snapshot.contract.documentId}`}
              target="_blank"
              rel="noreferrer"
            >
              استعراض العقد الأصلي
            </a>
          ) : (
            <small className="legal-document-missing">لا يوجد ملف عقد مرتبط بالسجل.</small>
          )}
        </article>

        <article className="legal-file-metrics">
          <h5>مؤشرات الملف</h5>
          <div>
            <span>المرفقات</span>
            <strong>{documents.length}</strong>
          </div>
          <div>
            <span>الدفعات</span>
            <strong>{snapshot.payments?.length || 0}</strong>
            <small>{paymentTotal ? money(paymentTotal) : "دون مبالغ"}</small>
          </div>
          <div>
            <span>السجلات المالية</span>
            <strong>{snapshot.finances?.length || 0}</strong>
            <small>{financeTotal ? money(financeTotal) : "دون مبالغ"}</small>
          </div>
          <div>
            <span>العمال المرتبطون</span>
            <strong>{snapshot.workers?.length || 0}</strong>
          </div>
        </article>

        <article className="legal-attachments-card">
          <header>
            <div>
              <span>مرفقات الملف</span>
              <h5>العقد ووثائق العميل والمستندات المرتبطة</h5>
            </div>
            <strong>{documents.length}</strong>
          </header>
          <div className="legal-attachment-list">
            {documents.map((document) => (
              <a key={document.id} href={`/api/portal/documents/${document.id}`} target="_blank" rel="noreferrer">
                <span aria-hidden="true">↗</span>
                <p>
                  <strong>{document.title || document.fileName || `المستند رقم ${document.id}`}</strong>
                  <small>
                    {document.referenceCode || "دون رقم مرجعي"} · {document.documentType || document.category || "مرفق"}
                  </small>
                </p>
                <b>استعراض</b>
              </a>
            ))}
            {!documents.length && <p className="legal-empty-inline">لا توجد مرفقات محفوظة في نسخة الملف.</p>}
          </div>
        </article>

        <article className="legal-linked-data-card">
          <header>
            <span>المهن والعمال</span>
            <h5>نطاق التنفيذ المرتبط بالعقد</h5>
          </header>
          <div className="legal-profession-chips">
            {(snapshot.professions || []).map((profession, index) => (
              <span key={profession.id || index}>
                {profession.profession || profession.professionName || "مهنة"}
                {profession.quantity || profession.requiredCount ? ` · ${profession.quantity || profession.requiredCount}` : ""}
              </span>
            ))}
            {!snapshot.professions?.length && <small>لا توجد مهن مسجلة.</small>}
          </div>
          <div className="legal-worker-list">
            {(snapshot.workers || []).slice(0, 8).map((worker, index) => (
              <div key={worker.id || index}>
                <strong>{worker.fullName || worker.name || `عامل رقم ${worker.id || index + 1}`}</strong>
                <small>
                  {worker.nationality || "الجنسية غير مسجلة"} · {worker.status || "الحالة غير مسجلة"}
                </small>
              </div>
            ))}
            {(snapshot.workers?.length || 0) > 8 && (
              <small>ويوجد {(snapshot.workers?.length || 0) - 8} عمال إضافيين في نسخة الملف.</small>
            )}
          </div>
        </article>
      </div>
    </section>
  );
}
