"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { appPrompt } from "@/app/components/AppDialogProvider";
import { readApiJson } from "@/lib/client-api";

type CorrespondenceMessage = {
  id: number;
  legalRecordId: number;
  contractId: number;
  parentId: number | null;
  senderSide: "legal" | "contracts";
  recipientSide: "legal" | "workforce";
  messageType: "note" | "return_request" | "reply" | "attachment" | "resolution";
  reasonCode: string | null;
  requiredAttachmentName: string | null;
  message: string;
  documentId: number | null;
  requestStatus: "open" | "responded" | "resolved";
  createdBy: string;
  createdAt: string;
  respondedAt: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
};

type Matter = {
  id: number;
  referenceCode: string;
  title: string;
  status: string;
  contractId: number | null;
};

type Contract = {
  id: number;
  referenceCode: string;
  clientName: string;
};

type Data = {
  matters: Matter[];
  contract: Contract | null;
  messages: CorrespondenceMessage[];
  canInitiateLegal: boolean;
  canReplyContracts: boolean;
  canResolveLegal: boolean;
};

const reasonLabels: Record<string, string> = {
  missing_attachment: "مرفق ناقص",
  contract_correction: "تصحيح بيانات أو بنود العقد",
  information_request: "طلب معلومات أو إيضاح",
  other: "سبب آخر",
};

const statusLabels: Record<string, string> = {
  open: "بانتظار الرد",
  responded: "تم الرد",
  resolved: "مكتمل",
};

function exactTime(value: string | null) {
  if (!value) return "غير مسجل";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("ar-SA", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "Asia/Riyadh",
  }).format(parsed);
}

export default function LegalContractCorrespondence({
  mode,
  legalRecordId,
  contractId,
}: {
  mode: "legal" | "contracts";
  legalRecordId?: number;
  contractId?: number;
}) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [returnReason, setReturnReason] = useState("missing_attachment");

  const load = useCallback(async () => {
    const query = mode === "legal" ? `legalRecordId=${legalRecordId || 0}` : `contractId=${contractId || 0}`;
    const response = await fetch(`/api/portal/legal-contract-correspondence?${query}`, { cache: "no-store" });
    const result = (await readApiJson(response)) as Data & { error?: string };
    if (!response.ok) throw new Error(result.error || "تعذر تحميل مراسلات العقد");
    setData(result);
    setError("");
  }, [contractId, legalRecordId, mode]);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      void load().catch((problem) => {
        if (active) setError(problem instanceof Error ? problem.message : "تعذر تحميل مراسلات العقد");
      });
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [load]);

  const roots = useMemo(
    () => (data?.messages || []).filter((message) => !message.parentId).reverse(),
    [data],
  );

  async function sendLegal(event: FormEvent<HTMLFormElement>, action: "send-note" | "return-contract") {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(action);
    setNotice("");
    try {
      const values = Object.fromEntries(new FormData(form));
      const response = await fetch("/api/portal/legal-contract-correspondence", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...values, action, legalRecordId }),
      });
      const result = (await readApiJson(response)) as { error?: string };
      if (!response.ok) throw new Error(result.error || "تعذر إرسال المراسلة");
      form.reset();
      setReturnReason("missing_attachment");
      setNotice(action === "return-contract" ? "أُعيد العقد إلى قسم العقود مع توثيق السبب وإرسال التنبيه." : "أُرسلت الملاحظة إلى شؤون العمالة وسُجل توقيتها.");
      await load();
    } catch (problem) {
      setNotice(problem instanceof Error ? problem.message : "تعذر إرسال المراسلة");
    } finally {
      setBusy("");
    }
  }

  async function reply(event: FormEvent<HTMLFormElement>, rootId: number) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(`reply-${rootId}`);
    setNotice("");
    try {
      const message = String(new FormData(form).get("message") || "");
      const response = await fetch("/api/portal/legal-contract-correspondence", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "reply", rootId, message }),
      });
      const result = (await readApiJson(response)) as { error?: string };
      if (!response.ok) throw new Error(result.error || "تعذر إرسال الرد");
      form.reset();
      setNotice("أُرسل الرد إلى الشؤون القانونية وسُجل ضمن العقد.");
      await load();
    } catch (problem) {
      setNotice(problem instanceof Error ? problem.message : "تعذر إرسال الرد");
    } finally {
      setBusy("");
    }
  }

  async function upload(event: FormEvent<HTMLFormElement>, rootId: number) {
    event.preventDefault();
    const form = event.currentTarget;
    const body = new FormData(form);
    body.set("rootId", String(rootId));
    setBusy(`upload-${rootId}`);
    setNotice("");
    try {
      const response = await fetch("/api/portal/legal-contract-correspondence", { method: "POST", body });
      const result = (await readApiJson(response)) as { error?: string };
      if (!response.ok) throw new Error(result.error || "تعذر رفع المرفق");
      form.reset();
      setNotice("رُفع المرفق وربط بالعقد والملف القانوني وأُبلغت الشؤون القانونية.");
      await load();
    } catch (problem) {
      setNotice(problem instanceof Error ? problem.message : "تعذر رفع المرفق");
    } finally {
      setBusy("");
    }
  }

  async function resolve(root: CorrespondenceMessage) {
    const message = await appPrompt("اكتب نتيجة معالجة المراسلة", {
      title: "إغلاق المراسلة القانونية",
      multiline: true,
    });
    if (!message?.trim()) return;
    setBusy(`resolve-${root.id}`);
    try {
      const response = await fetch("/api/portal/legal-contract-correspondence", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "resolve", rootId: root.id, message }),
      });
      const result = (await readApiJson(response)) as { error?: string };
      if (!response.ok) throw new Error(result.error || "تعذر إغلاق المراسلة");
      setNotice("أُغلقت المراسلة مع حفظ النتيجة في سجل الملف والعقد.");
      await load();
    } catch (problem) {
      setNotice(problem instanceof Error ? problem.message : "تعذر إغلاق المراسلة");
    } finally {
      setBusy("");
    }
  }

  if (error)
    return (
      <section className="legal-contract-correspondence error" role="alert">
        <strong>تعذر فتح قناة التواصل بين القانونية والعقود</strong>
        <span>{error}</span>
        <button type="button" onClick={() => void load()}>إعادة المحاولة</button>
      </section>
    );
  if (!data) return <section className="legal-contract-correspondence loading">جارٍ تحميل مراسلات العقد...</section>;
  if (mode === "contracts" && !roots.length) return null;

  const noLinkedContract = mode === "legal" && !data.contract;
  return (
    <section className={`legal-contract-correspondence ${mode}`}>
      <header>
        <div>
          <span>قناة موثقة بين القانونية والعقود</span>
          <h3>{mode === "legal" ? "مراسلات شؤون العمالة وإعادة العقد" : "طلبات وملاحظات الشؤون القانونية"}</h3>
          <p>
            {data.contract
              ? `${data.contract.referenceCode} — ${data.contract.clientName}`
              : "لا يوجد عقد مرتبط بهذا الملف القانوني."}
          </p>
        </div>
        <b>{roots.filter((root) => root.requestStatus !== "resolved").length} مفتوحة</b>
      </header>

      {notice && <p className="correspondence-notice" role="status">{notice}</p>}

      {mode === "legal" && data.canInitiateLegal && !noLinkedContract && (
        <div className="correspondence-compose-grid">
          <details>
            <summary>إرسال ملاحظة إلى شؤون العمالة</summary>
            <form onSubmit={(event) => void sendLegal(event, "send-note")}>
              <textarea name="message" required minLength={5} maxLength={2000} rows={4} placeholder="اكتب الملاحظة المرتبطة بالعقد بوضوح" />
              <button className="admin-secondary" disabled={Boolean(busy)}>{busy === "send-note" ? "جارٍ الإرسال..." : "إرسال الملاحظة"}</button>
            </form>
          </details>
          <details>
            <summary>إعادة العقد إلى قسم العقود</summary>
            <form onSubmit={(event) => void sendLegal(event, "return-contract")}>
              <label>
                سبب الإعادة
                <select name="reasonCode" value={returnReason} onChange={(event) => setReturnReason(event.target.value)}>
                  <option value="missing_attachment">مرفق ناقص</option>
                  <option value="contract_correction">تصحيح بيانات أو بنود العقد</option>
                  <option value="information_request">طلب معلومات أو إيضاح</option>
                  <option value="other">سبب آخر</option>
                </select>
              </label>
              {returnReason === "missing_attachment" && (
                <label>
                  اسم المرفق المطلوب
                  <input name="requiredAttachmentName" required minLength={2} maxLength={180} placeholder="مثال: نسخة السجل التجاري للعميل" />
                </label>
              )}
              <textarea name="message" required minLength={10} maxLength={2000} rows={4} placeholder="اشرح سبب الإعادة والإجراء المطلوب" />
              <button className="admin-primary" disabled={Boolean(busy)}>{busy === "return-contract" ? "جارٍ إعادة العقد..." : "إعادة العقد وتسجيل السبب"}</button>
            </form>
          </details>
        </div>
      )}

      {noLinkedContract && <p className="correspondence-empty">هذه الوظائف تظهر للملفات المحالة من عقد مرتبط فقط.</p>}

      <div className="correspondence-thread-list">
        {roots.map((root) => {
          const replies = data.messages.filter((message) => message.parentId === root.id);
          const matter = data.matters.find((item) => item.id === root.legalRecordId);
          return (
            <article key={root.id} className={`correspondence-thread ${root.requestStatus}`}>
              <div className="correspondence-thread-head">
                <div>
                  <span>{root.messageType === "return_request" ? "إعادة عقد" : "ملاحظة قانونية"}</span>
                  <strong>{matter?.referenceCode || `ملف #${root.legalRecordId}`}</strong>
                </div>
                <span className={`correspondence-status ${root.requestStatus}`}>{statusLabels[root.requestStatus]}</span>
              </div>
              {root.reasonCode && <p className="correspondence-reason"><b>السبب:</b> {reasonLabels[root.reasonCode] || root.reasonCode}</p>}
              {root.requiredAttachmentName && <p className="required-attachment"><b>المرفق المطلوب:</b> {root.requiredAttachmentName}</p>}
              <p className="correspondence-message">{root.message}</p>
              <small>أرسلها {root.createdBy} · {exactTime(root.createdAt)}</small>

              {replies.length > 0 && (
                <div className="correspondence-replies">
                  {replies.map((replyItem) => (
                    <div key={replyItem.id} className={replyItem.senderSide}>
                      <div>
                        <strong>{replyItem.messageType === "attachment" ? "مرفق من قسم العقود" : replyItem.messageType === "resolution" ? "نتيجة المعالجة" : "رد قسم العقود"}</strong>
                        <small>{replyItem.createdBy} · {exactTime(replyItem.createdAt)}</small>
                      </div>
                      <p>{replyItem.message}</p>
                      {replyItem.documentId && <a href={`/api/portal/documents/${replyItem.documentId}?inline=1`} target="_blank" rel="noreferrer">فتح المرفق</a>}
                    </div>
                  ))}
                </div>
              )}

              {mode === "contracts" && data.canReplyContracts && root.requestStatus !== "resolved" && (
                <div className="correspondence-response-grid">
                  <form onSubmit={(event) => void reply(event, root.id)}>
                    <label>
                      إرسال رد إلى القانونية
                      <textarea name="message" required minLength={2} maxLength={2000} rows={3} placeholder="اكتب الرد أو ما تم تنفيذه" />
                    </label>
                    <button className="admin-secondary" disabled={Boolean(busy)}>{busy === `reply-${root.id}` ? "جارٍ الإرسال..." : "إرسال الرد"}</button>
                  </form>
                  <form onSubmit={(event) => void upload(event, root.id)}>
                    <label>
                      اسم المرفق
                      <input name="title" maxLength={180} defaultValue={root.requiredAttachmentName || ""} />
                    </label>
                    <label>
                      الملف المطلوب
                      <input name="file" type="file" required accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg" />
                    </label>
                    <label>
                      توضيح اختياري
                      <input name="message" maxLength={2000} placeholder="وصف النسخة أو الإجراء" />
                    </label>
                    <button className="admin-primary" disabled={Boolean(busy)}>{busy === `upload-${root.id}` ? "جارٍ الرفع..." : "إرفاق وإرسال للقانونية"}</button>
                  </form>
                </div>
              )}

              {mode === "legal" && data.canResolveLegal && root.requestStatus !== "resolved" && replies.length > 0 && (
                <button type="button" className="correspondence-resolve" disabled={Boolean(busy)} onClick={() => void resolve(root)}>
                  {busy === `resolve-${root.id}` ? "جارٍ الإغلاق..." : "اعتماد الاستجابة وإغلاق المراسلة"}
                </button>
              )}
            </article>
          );
        })}
        {!roots.length && !noLinkedContract && <p className="correspondence-empty">لا توجد مراسلات مسجلة لهذا العقد بعد.</p>}
      </div>
    </section>
  );
}
