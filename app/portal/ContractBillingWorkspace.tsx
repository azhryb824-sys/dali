"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type Contract = {
  id: number;
  clientId: number | null;
  referenceCode: string;
  clientName: string;
  title: string;
  amountHalalas: number;
  quantityMode: "fixed" | "open";
  vatRateBps: number;
  startDate: string;
  endDate: string;
  status: string;
  documentId: number | null;
};

type Payment = {
  id: number;
  contractId: number;
  installmentNumber: number;
  title: string;
  dueDate: string;
  percentageBps: number;
  amountHalalas: number;
  status: string;
  invoiceDocumentId: number | null;
};

type CancellationReferral = {
  id: number;
  contractId: number;
  status: string;
  requestedStatus: "cancelled" | "terminated";
  reason: string;
  referredAt: string | null;
};

type BillingData = {
  contracts: Contract[];
  payments: Payment[];
  clientMobiles: Record<string, string>;
  canManageContracts: boolean;
  canApproveContracts: boolean;
  canRefer: boolean;
  canInvoice: boolean;
  canRecordPayment: boolean;
  canReferLegal: boolean;
};

type Data = BillingData & { cancellationReferrals: CancellationReferral[] };

type CancellationDraft = {
  contract: Contract;
  reason: string;
  requestedStatus: "cancelled" | "terminated";
};

const money = (value: number) =>
  new Intl.NumberFormat("ar-SA", {
    style: "currency",
    currency: "SAR",
    maximumFractionDigits: 2,
  }).format(value / 100);

const labels: Record<string, string> = {
  scheduled: "مجدولة",
  due: "مستحقة",
  referred: "محالة للمحاسبة",
  invoiced: "صدرت الفاتورة",
  paid: "مسددة",
  cancelled: "ملغاة",
};

const contractLabels: Record<string, string> = {
  draft: "مسودة",
  internal_review: "مراجعة داخلية",
  legal_review: "مراجعة قانونية",
  approved: "معتمد",
  sent: "مرسل",
  signed: "موقّع",
  active: "ساري",
  suspended: "معلّق",
  expired: "منتهي",
  terminated: "منهى",
  cancelled: "ملغى",
  superseded: "مستبدل",
};

export default function ContractBillingWorkspace() {
  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState(0);
  const [notice, setNotice] = useState("");
  const [cancellation, setCancellation] = useState<CancellationDraft | null>(null);
  const cancellationId = cancellation?.contract.id || 0;

  const load = useCallback(async () => {
    const [billingResponse, referralsResponse] = await Promise.all([
      fetch("/api/portal/contract-payments", { cache: "no-store" }),
      fetch("/api/portal/contracts/cancellation-referrals", { cache: "no-store" }),
    ]);
    const billingResult = (await billingResponse.json()) as BillingData & { error?: string };
    const referralsResult = (await referralsResponse.json()) as {
      referrals?: CancellationReferral[];
      error?: string;
    };
    if (!billingResponse.ok) throw new Error(billingResult.error || "تعذر تحميل العقود والدفعات");
    if (!referralsResponse.ok) throw new Error(referralsResult.error || "تعذر تحميل طلبات الإلغاء");
    setData({ ...billingResult, cancellationReferrals: referralsResult.referrals || [] });
  }, []);

  useEffect(() => {
    void load().catch((error) => setNotice(error instanceof Error ? error.message : "تعذر التحميل"));
  }, [load]);

  useEffect(() => {
    if (!cancellationId) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && busy !== -cancellationId) {
        setCancellation((current) => (current?.contract.id === cancellationId ? null : current));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [busy, cancellationId]);

  async function patch(payment: Payment, action: string) {
    let reason = "";
    if (action === "refer-legal") {
      reason = window.prompt("سبب إحالة ملف العميل للشؤون القانونية (10 أحرف على الأقل)") || "";
      if (!reason) return;
    }
    setBusy(payment.id);
    setNotice("");
    try {
      const response = await fetch("/api/portal/contract-payments", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ paymentId: payment.id, action, reason }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || "تعذر تنفيذ الإجراء");
      await load();
      setNotice(
        action === "refer-accounting"
          ? "أُحيلت الدفعة للمحاسبة."
          : action === "mark-paid"
            ? "تم تسجيل السداد وربطه بالسجل المالي."
            : "أُحيل ملف العميل والعقد للشؤون القانونية.",
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "تعذر التنفيذ");
    } finally {
      setBusy(0);
    }
  }

  async function approveContract(contract: Contract) {
    setBusy(-contract.id);
    setNotice("");
    try {
      const response = await fetch(`/api/portal/contracts/${contract.id}/status`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "approved", reason: "اعتماد مباشر من صفحة العقود والدفعات" }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || "تعذر اعتماد العقد");
      await load();
      setNotice(`تم اعتماد العقد ${contract.referenceCode} بنجاح، وأصبح جاهزاً للتفعيل والتنزيل.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "تعذر اعتماد العقد");
    } finally {
      setBusy(0);
    }
  }

  async function editContract(contract: Contract) {
    const clientName = window.prompt("اسم العميل", contract.clientName);
    if (clientName === null) return;
    const title = window.prompt("عنوان العقد", contract.title);
    if (title === null) return;
    const startDate = window.prompt("تاريخ بداية العقد (YYYY-MM-DD)", contract.startDate);
    if (startDate === null) return;
    const endDate = window.prompt("تاريخ نهاية العقد (YYYY-MM-DD)", contract.endDate);
    if (endDate === null) return;
    setBusy(-contract.id);
    setNotice("");
    try {
      const response = await fetch(`/api/portal/contracts/${contract.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientName, title, startDate, endDate }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || "تعذر تعديل العقد");
      await load();
      setNotice(`تم تعديل العقد ${contract.referenceCode} وإعادته للمسودة للاعتماد مجددًا.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "تعذر تعديل العقد");
    } finally {
      setBusy(0);
    }
  }

  async function deleteContract(contract: Contract) {
    if (!window.confirm(`حذف مسودة العقد ${contract.referenceCode} نهائيًا؟`)) return;
    setBusy(-contract.id);
    setNotice("");
    try {
      const response = await fetch(`/api/portal/contracts/${contract.id}`, { method: "DELETE" });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || "تعذر حذف العقد");
      await load();
      setNotice(`تم حذف مسودة العقد ${contract.referenceCode}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "تعذر حذف العقد");
    } finally {
      setBusy(0);
    }
  }

  function openCancellation(contract: Contract) {
    const requestedStatus: "cancelled" | "terminated" = ["active", "suspended"].includes(contract.status)
      ? "terminated"
      : "cancelled";
    setNotice("");
    setCancellation({ contract, reason: "", requestedStatus });
  }

  async function submitCancellation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!cancellation) return;
    const reason = cancellation.reason.trim();
    if (reason.length < 10) {
      setNotice("سبب الإلغاء يجب ألا يقل عن 10 أحرف.");
      return;
    }
    const { contract, requestedStatus } = cancellation;
    setBusy(-contract.id);
    setNotice("");
    try {
      const response = await fetch(`/api/portal/contracts/${contract.id}/status`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "request-cancellation",
          requestedStatus,
          reason,
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || "تعذر إحالة طلب الإلغاء");
      setCancellation(null);
      await load();
      setNotice(
        `تمت إحالة طلب ${requestedStatus === "terminated" ? "إنهاء" : "إلغاء"} العقد ${contract.referenceCode} إلى القانونية. سيبقى العقد على حالته الحالية حتى صدور القرار القانوني.`,
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "تعذر إحالة طلب الإلغاء");
    } finally {
      setBusy(0);
    }
  }

  async function invoice(payment: Payment) {
    setBusy(payment.id);
    setNotice("");
    try {
      const response = await fetch("/api/portal/contract-payments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ paymentId: payment.id }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || "تعذر إصدار الفاتورة");
      await load();
      setNotice("أُنشئت الفاتورة المالية وملف PDF وأصبحت جاهزة للتنزيل والمشاركة.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "تعذر إصدار الفاتورة");
    } finally {
      setBusy(0);
    }
  }

  async function share(documentId: number) {
    const payment = data?.payments.find((item) => item.invoiceDocumentId === documentId);
    const contract = payment ? data?.contracts.find((item) => item.id === payment.contractId) : null;
    if (payment && contract && contract.clientId && data?.clientMobiles[String(contract.clientId)]) {
      return shareWhatsApp(documentId, contract, payment);
    }
    try {
      const response = await fetch("/api/portal/documents/share", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ documentId, expiresInDays: 7, maxDownloads: 20 }),
      });
      const result = (await response.json()) as { shareUrl?: string; error?: string };
      if (!response.ok || !result.shareUrl) throw new Error(result.error || "تعذر إنشاء الرابط");
      await navigator.clipboard.writeText(result.shareUrl);
      setNotice("لا يوجد جوال للعميل؛ تم نسخ رابط PDF الآمن للمشاركة يدويًا.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "تعذر إنشاء رابط المشاركة");
    }
  }

  async function shareWhatsApp(documentId: number, contract: Contract, payment: Payment) {
    const raw = contract.clientId ? data?.clientMobiles[String(contract.clientId)] || "" : "";
    const digits = raw.replace(/\D/g, "");
    const mobile = digits.startsWith("966")
      ? digits
      : digits.startsWith("0")
        ? `966${digits.slice(1)}`
        : digits.length === 9
          ? `966${digits}`
          : digits;
    if (!/^9665\d{8}$/.test(mobile)) {
      setNotice("لا يوجد رقم جوال سعودي صحيح لجهة اتصال العميل.");
      return;
    }
    try {
      const response = await fetch("/api/portal/documents/share", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ documentId, expiresInDays: 7, maxDownloads: 20 }),
      });
      const result = (await response.json()) as { shareUrl?: string; error?: string };
      if (!response.ok || !result.shareUrl) throw new Error(result.error || "تعذر إنشاء الرابط");
      const message = `السلام عليكم، نرفق لكم فاتورة ${payment.title} للعقد ${contract.referenceCode}. رابط PDF الآمن: ${result.shareUrl}`;
      window.open(`https://wa.me/${mobile}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
      setNotice("فُتحت محادثة واتساب مع رسالة الفاتورة ورابط PDF الآمن.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "تعذر مشاركة الفاتورة عبر واتساب");
    }
  }

  if (!data) {
    return (
      <section className="panel">
        <p>{notice || "جارٍ تحميل العقود والدفعات..."}</p>
      </section>
    );
  }

  return (
    <>
      {notice && (
        <div className="operations-notice" role="status" aria-live="polite">
          {notice}
        </div>
      )}
      <section className="panel contract-billing">
        <header>
          <div>
            <h2>العقود وجدول الدفعات</h2>
            <p>إحالة الدفعات المستحقة، إصدار الفواتير، تسجيل السداد، والإحالة القانونية عند التأخر.</p>
          </div>
          <b>{data.contracts.length} عقد</b>
        </header>
        <div className="contract-billing-list">
          {data.contracts.map((contract) => {
            const payments = data.payments.filter((item) => item.contractId === contract.id);
            const needsApproval = ["draft", "internal_review", "legal_review"].includes(contract.status);
            const canEdit = !["active", "suspended", "expired", "terminated", "cancelled", "superseded"].includes(
              contract.status,
            );
            const canCancel = !["expired", "terminated", "cancelled", "superseded"].includes(contract.status);
            const pendingReferral = data.cancellationReferrals.find(
              (item) => item.contractId === contract.id && item.status === "reviewing",
            );
            return (
              <article key={contract.id}>
                <header>
                  <div>
                    <strong>{contract.referenceCode}</strong>
                    <h3>{contract.clientName}</h3>
                    <p>
                      {contract.title} · {contract.quantityMode === "open" ? `عدد مفتوح · الضريبة ${(contract.vatRateBps / 100).toFixed(2)}%` : money(contract.amountHalalas)}
                    </p>
                    {pendingReferral && (
                      <small className="contract-legal-status">
                        طلب {pendingReferral.requestedStatus === "terminated" ? "إنهاء" : "إلغاء"} محال للقانونية
                        {pendingReferral.referredAt
                          ? ` · ${new Date(pendingReferral.referredAt).toLocaleDateString("ar-SA")}`
                          : ""}
                      </small>
                    )}
                  </div>
                  <div className="contract-card-actions">
                    <span className={`workflow-status ${contract.status}`}>
                      {contractLabels[contract.status] || contract.status}
                    </span>
                    {data.canApproveContracts && needsApproval && (
                      <button
                        className="contract-card-approve"
                        disabled={busy === -contract.id}
                        onClick={() => void approveContract(contract)}
                      >
                        {busy === -contract.id ? "جارٍ الاعتماد..." : "اعتماد العقد"}
                      </button>
                    )}
                    {data.canManageContracts && canEdit && (
                      <button
                        className="contract-card-action"
                        disabled={busy === -contract.id}
                        onClick={() => void editContract(contract)}
                      >
                        تعديل
                      </button>
                    )}
                    {data.canManageContracts && contract.status === "draft" && (
                      <button
                        className="contract-card-action danger-action"
                        disabled={busy === -contract.id}
                        onClick={() => void deleteContract(contract)}
                      >
                        حذف
                      </button>
                    )}
                    {data.canApproveContracts && canCancel &&
                      (pendingReferral ? (
                        <button className="contract-card-action pending-legal-action" disabled title={pendingReferral.reason}>
                          قيد المراجعة القانونية
                        </button>
                      ) : (
                        <button
                          className="contract-card-action cancel-action"
                          disabled={busy === -contract.id}
                          onClick={() => openCancellation(contract)}
                        >
                          {["active", "suspended"].includes(contract.status) ? "إنهاء العقد" : "إلغاء العقد"}
                        </button>
                      ))}
                  </div>
                </header>
                <div className="payment-schedule-list">
                  {payments.map((payment) => (
                    <div key={payment.id}>
                      <p>
                        <strong>
                          {payment.installmentNumber}. {payment.title}
                        </strong>
                        <small>
                          الاستحقاق {payment.dueDate} · {(payment.percentageBps / 100).toFixed(2)}%
                        </small>
                      </p>
                      <b>{money(payment.amountHalalas)}</b>
                      <span className={`workflow-status ${payment.status}`}>{labels[payment.status] || payment.status}</span>
                      <div className="payment-actions">
                        {data.canRefer &&
                          ["scheduled", "due"].includes(payment.status) &&
                          payment.dueDate <= new Date().toISOString().slice(0, 10) && (
                            <button disabled={busy === payment.id} onClick={() => void patch(payment, "refer-accounting")}>
                              تحويل للمحاسب
                            </button>
                          )}
                        {data.canInvoice && payment.status === "referred" && (
                          <button disabled={busy === payment.id} onClick={() => void invoice(payment)}>
                            إصدار الفاتورة
                          </button>
                        )}
                        {payment.invoiceDocumentId && (
                          <a href={`/api/portal/documents/${payment.invoiceDocumentId}`}>تنزيل PDF</a>
                        )}
                        {payment.invoiceDocumentId && (
                          <button onClick={() => void share(payment.invoiceDocumentId!)}>مشاركة</button>
                        )}
                        {data.canRecordPayment && payment.status === "invoiced" && (
                          <button disabled={busy === payment.id} onClick={() => void patch(payment, "mark-paid")}>
                            تسجيل السداد
                          </button>
                        )}
                        {data.canReferLegal &&
                          payment.status !== "paid" &&
                          payment.dueDate < new Date().toISOString().slice(0, 10) && (
                            <button
                              className="legal-referral"
                              disabled={busy === payment.id}
                              onClick={() => void patch(payment, "refer-legal")}
                            >
                              إحالة الملف للقانونية
                            </button>
                          )}
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {cancellation && (
        <div
          className="contract-cancellation-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target && busy !== -cancellation.contract.id) setCancellation(null);
          }}
        >
          <section
            className="contract-cancellation-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="contract-cancellation-title"
            aria-describedby="contract-cancellation-description"
          >
            <header>
              <div className="contract-cancellation-icon" aria-hidden="true">
                !
              </div>
              <div>
                <span>إجراء محكوم بمراجعة قانونية</span>
                <h2 id="contract-cancellation-title">
                  طلب {cancellation.requestedStatus === "terminated" ? "إنهاء" : "إلغاء"} العقد
                </h2>
                <p id="contract-cancellation-description">
                  لن تتغير حالة العقد الآن. سيُنشأ ملف كامل لدى القانونية لاتخاذ قرار الاعتماد أو الرفض.
                </p>
              </div>
              <button
                type="button"
                className="contract-cancellation-close"
                aria-label="إغلاق النافذة"
                disabled={busy === -cancellation.contract.id}
                onClick={() => setCancellation(null)}
              >
                ×
              </button>
            </header>

            <form onSubmit={submitCancellation}>
              <div className="contract-cancellation-summary">
                <div>
                  <span>رقم العقد</span>
                  <strong>{cancellation.contract.referenceCode}</strong>
                </div>
                <div>
                  <span>العميل</span>
                  <strong>{cancellation.contract.clientName}</strong>
                </div>
                <div>
                  <span>الحالة الحالية</span>
                  <strong>{contractLabels[cancellation.contract.status] || cancellation.contract.status}</strong>
                </div>
                <div>
                  <span>القرار المطلوب</span>
                  <strong>{cancellation.requestedStatus === "terminated" ? "إنهاء عقد ساري" : "إلغاء العقد"}</strong>
                </div>
              </div>

              <div className="contract-cancellation-warning">
                <strong>ما الذي سيُحال إلى القانونية؟</strong>
                <p>نسخة العقد، مرفقات العميل، الدفعات والسجلات المالية، المهن، إسنادات العمال، وسبب الطلب.</p>
              </div>

              <label className="contract-cancellation-reason">
                <span>
                  سبب {cancellation.requestedStatus === "terminated" ? "الإنهاء" : "الإلغاء"} والتفاصيل الداعمة
                </span>
                <textarea
                  autoFocus
                  required
                  minLength={10}
                  maxLength={1000}
                  value={cancellation.reason}
                  onChange={(event) =>
                    setCancellation((current) => (current ? { ...current, reason: event.target.value } : current))
                  }
                  placeholder="اكتب سببًا واضحًا يساعد القانونية على مراجعة الالتزامات والبنود والمبالغ والمراسلات ذات الصلة..."
                />
                <small>{cancellation.reason.trim().length}/1000 · الحد الأدنى 10 أحرف</small>
              </label>

              <div className="contract-cancellation-assurance">
                <span>✓ يبقى العقد فعالًا حتى القرار</span>
                <span>✓ يُسجل مقدم الطلب ووقت الإحالة</span>
                <span>✓ لا يُنفذ الإلغاء إلا بصلاحية قانونية</span>
              </div>

              <footer>
                <button
                  type="button"
                  className="contract-cancellation-secondary"
                  disabled={busy === -cancellation.contract.id}
                  onClick={() => setCancellation(null)}
                >
                  تراجع
                </button>
                <button
                  type="submit"
                  className="contract-cancellation-primary"
                  disabled={busy === -cancellation.contract.id || cancellation.reason.trim().length < 10}
                >
                  {busy === -cancellation.contract.id ? "جارٍ إنشاء الملف القانوني..." : "إحالة الطلب إلى القانونية"}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
