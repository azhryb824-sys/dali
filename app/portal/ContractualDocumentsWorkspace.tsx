"use client";

import { readApiJson } from "@/lib/client-api";
import OperationsWorkspace from "./OperationsWorkspace";

import { FormEvent, useCallback, useEffect, useState } from "react";
type Document = {
  id: number;
  referenceCode: string;
  title: string;
  documentType: string | null;
  status: string;
  createdAt: string;
};
type Contract = {
  id: number;
  referenceCode: string;
  clientName: string;
  title: string;
  status: string;
  documentId: number;
};
type Letter = {
  id: number;
  referenceCode: string;
  subject: string;
  recipient: string;
  body: string;
  status: string;
  cancellationReason: string | null;
  updatedAt: string;
};
type Quote = {
  id: number;
  quoteCode: string;
  versionNumber: number;
  status: string;
  totalHalalas: number;
  updatedAt: string;
};
export default function ContractualDocumentsWorkspace({
  documents,
  contracts,
  canManage,
  canWrite,
  canApprove,
  isAdmin,
  isOwner,
  onCreateContract,
  onCreateQuotation,
}: {
  documents: Document[];
  contracts: Contract[];
  canManage: boolean;
  canWrite: boolean;
  canApprove: boolean;
  isAdmin: boolean;
  isOwner: boolean;
  onCreateContract: (quoteId?: number) => void;
  onCreateQuotation: () => void;
}) {
  const [activeTab, setActiveTab] = useState<
      "contracts" | "quotes" | "letters"
    >("contracts"),
    [letters, setLetters] = useState<Letter[]>([]),
    [quotes, setQuotes] = useState<Quote[]>([]),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(0),
    [editingLetter, setEditingLetter] = useState<Letter | null>(null);
  const load = useCallback(async () => {
    const [letterResponse, operationResponse] = await Promise.all([
      fetch("/api/portal/letters", { cache: "no-store" }),
      fetch("/api/portal/operations?limit=100", { cache: "no-store" }),
    ]);
    const letterData = (await letterResponse.json()) as {
      letters?: Letter[];
      error?: string;
    };
    const operationData = (await operationResponse.json()) as {
      quotes?: Quote[];
    };
    if (!letterResponse.ok)
      throw new Error(letterData.error || "تعذر تحميل الخطابات");
    setLetters(letterData.letters || []);
    if (operationResponse.ok) setQuotes(operationData.quotes || []);
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load().catch((error) =>
        setNotice(error instanceof Error ? error.message : "تعذر التحميل"),
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget,
      fd = new FormData(form);
    setBusy(-1);
    try {
      const response = await fetch("/api/portal/letters", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            subject: fd.get("subject"),
            recipient: fd.get("recipient"),
            body: fd.get("body"),
          }),
        }),
        result = (await readApiJson(response)) as { error?: string };
      if (!response.ok) throw new Error(result.error || "تعذر إنشاء الخطاب");
      form.reset();
      await load();
      setNotice("تم إنشاء مسودة الخطاب.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "تعذر الإنشاء");
    } finally {
      setBusy(0);
    }
  }
  async function action(letter: Letter, action: string) {
    setBusy(letter.id);
    try {
      let payload: Record<string, unknown> = { id: letter.id, action };
      if (action === "status") {
        const status = letter.status === "draft" ? "approved" : "cancelled";
        const reason =
          status === "cancelled"
            ? window.prompt("سبب الإلغاء (10 أحرف على الأقل)") || ""
            : "";
        if (status === "cancelled" && reason.length < 10)
          throw new Error("سبب الإلغاء مطلوب");
        payload = { ...payload, status, reason };
      }
      const response = await fetch("/api/portal/letters", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        }),
        result = (await readApiJson(response)) as { error?: string };
      if (!response.ok) throw new Error(result.error || "تعذر التحديث");
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "تعذر التحديث");
    } finally {
      setBusy(0);
    }
  }
  async function saveLetterEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingLetter) return;
    const form = event.currentTarget,
      fd = new FormData(form);
    setBusy(editingLetter.id);
    try {
      const response = await fetch("/api/portal/letters", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            id: editingLetter.id,
            action: "edit",
            subject: fd.get("subject"),
            recipient: fd.get("recipient"),
            body: fd.get("body"),
          }),
        }),
        result = (await readApiJson(response)) as { error?: string };
      if (!response.ok) throw new Error(result.error || "تعذر تعديل الخطاب");
      setEditingLetter(null);
      await load();
      setNotice("تم حفظ تعديلات الخطاب.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "تعذر تعديل الخطاب");
    } finally {
      setBusy(0);
    }
  }
  async function remove(letter: Letter) {
    if (!window.confirm(`حذف مسودة ${letter.referenceCode}؟`)) return;
    setBusy(letter.id);
    try {
      const response = await fetch(`/api/portal/letters?id=${letter.id}`, {
          method: "DELETE",
        }),
        result = (await readApiJson(response)) as { error?: string };
      if (!response.ok) throw new Error(result.error || "تعذر الحذف");
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "تعذر الحذف");
    } finally {
      setBusy(0);
    }
  }
  const contractualDocs = documents.filter((item) =>
    ["quotation", "workforce_contract", "contract", "letter"].includes(
      item.documentType || "",
    ),
  );
  return (
    <section className="contractual-workspace">
      <header className="feature-heading">
        <div>
          <span>المحررات التعاقدية والرسمية</span>
          <h1>العقود وعروض الأسعار والخطابات</h1>
          <p>
            صفحة مستقلة لدورات التحرير والاعتماد والحذف والإلغاء، مع بقاء مكتبة
            الشركة للمستندات العامة فقط.
          </p>
        </div>
        <b>
          {contracts.length + quotes.length + letters.length}
          <small>سجل تعاقدي ورسمي</small>
        </b>
      </header>
      <nav className="contractual-document-tabs" aria-label="أقسام المحررات">
        <button
          type="button"
          className={activeTab === "contracts" ? "active" : ""}
          onClick={() => setActiveTab("contracts")}
        >
          العقود
        </button>
        <button
          type="button"
          className={activeTab === "quotes" ? "active" : ""}
          onClick={() => setActiveTab("quotes")}
        >
          عروض الأسعار
        </button>
        <button
          type="button"
          className={activeTab === "letters" ? "active" : ""}
          onClick={() => setActiveTab("letters")}
        >
          الخطابات
        </button>
      </nav>
      {activeTab !== "letters" && (
        <OperationsWorkspace
          key={`${activeTab}:${contracts.map((item) => item.id).join(",")}:${documents.length}`}
          canWrite={canWrite}
          isAdmin={isAdmin}
          isOwner={isOwner}
          initialTab={activeTab}
          allowedTabs={[activeTab]}
          embedded
          onCreateContract={onCreateContract}
          onCreateQuotation={onCreateQuotation}
        />
      )}
      {notice && <div className="operations-notice">{notice}</div>}
      {activeTab === "letters" && (
        <>
          <section className="panel">
            <h2>الخطابات الرسمية</h2>
            {canManage && (
              <form className="feature-form letter-form" onSubmit={create}>
                <input name="subject" required placeholder="موضوع الخطاب" />
                <input
                  name="recipient"
                  required
                  placeholder="الجهة المرسل إليها"
                />
                <textarea
                  name="body"
                  required
                  minLength={10}
                  placeholder="نص الخطاب"
                />
                <button disabled={busy === -1}>إنشاء مسودة</button>
              </form>
            )}
            <div className="feature-list">
              {letters.map((letter) => (
                <article key={letter.id}>
                  <div>
                    <strong>
                      {letter.referenceCode} · {letter.subject}
                    </strong>
                    <small>
                      {letter.recipient} · {letter.status}
                      {letter.cancellationReason
                        ? ` · ${letter.cancellationReason}`
                        : ""}
                    </small>
                  </div>
                  <span className={`workflow-status ${letter.status}`}>
                    {letter.status}
                  </span>
                  <span className="pdf-language-actions">
                    <a
                      href={`/api/portal/letters/${letter.id}/pdf?language=ar`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      معاينة PDF
                    </a>
                    <a
                      href={`/api/portal/letters/${letter.id}/pdf?language=bilingual`}
                    >
                      PDF عربي/English
                    </a>
                  </span>
                  <div className="letter-record-actions">
                    {canManage && letter.status === "draft" && (
                      <button
                        aria-label="تعديل الخطاب الرسمي"
                        disabled={busy === letter.id}
                        onClick={() => setEditingLetter(letter)}
                      >
                        تعديل
                      </button>
                    )}
                    {canManage && letter.status === "draft" && (
                      <button
                        className="danger-action"
                        disabled={busy === letter.id}
                        onClick={() => void remove(letter)}
                      >
                        حذف
                      </button>
                    )}
                    {canApprove && (
                      <button
                        className="admin-primary"
                        disabled={
                          busy === letter.id || letter.status === "cancelled"
                        }
                        onClick={() => void action(letter, "status")}
                      >
                        {letter.status === "draft"
                          ? "اعتماد الخطاب"
                          : "إلغاء الخطاب"}
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </section>
        </>
      )}
      {contractualDocs.length > 0 && (
        <section className="panel">
          <h2>ملفات PDF الصادرة</h2>
          <div className="feature-list compact">
            {contractualDocs.map((item) => (
              <article key={item.id}>
                <div>
                  <strong>
                    {item.referenceCode} · {item.title}
                  </strong>
                  <small>{item.documentType}</small>
                </div>
                <a href={`/api/portal/documents/${item.id}?inline=1`}>معاينة</a>
                <a href={`/api/portal/documents/${item.id}`}>تنزيل</a>
              </article>
            ))}
          </div>
        </section>
      )}
      {editingLetter && (
        <div className="modal-layer">
          <button
            className="drawer-backdrop"
            aria-label="إغلاق نموذج تعديل الخطاب"
            onClick={() => setEditingLetter(null)}
          />
          <section
            className="record-modal"
            role="dialog"
            aria-modal="true"
            aria-label="تعديل الخطاب الرسمي"
          >
            <div className="drawer-head">
              <div>
                <span>{editingLetter.referenceCode}</span>
                <h2>تعديل الخطاب الرسمي</h2>
              </div>
              <button
                type="button"
                onClick={() => setEditingLetter(null)}
                aria-label="إغلاق"
              >
                ×
              </button>
            </div>
            <form
              className="feature-form letter-form"
              onSubmit={saveLetterEdit}
            >
              <label>
                موضوع الخطاب
                <input
                  name="subject"
                  required
                  defaultValue={editingLetter.subject}
                />
              </label>
              <label>
                الجهة المرسل إليها
                <input
                  name="recipient"
                  required
                  defaultValue={editingLetter.recipient}
                />
              </label>
              <label className="span-two">
                نص الخطاب
                <textarea
                  name="body"
                  required
                  minLength={10}
                  rows={10}
                  defaultValue={editingLetter.body}
                />
              </label>
              <div className="modal-actions span-two">
                <button type="button" onClick={() => setEditingLetter(null)}>
                  إلغاء
                </button>
                <button
                  className="admin-primary"
                  disabled={busy === editingLetter.id}
                >
                  حفظ التعديلات
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}
