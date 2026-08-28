"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import LegalCancellationDecision from "./LegalCancellationDecision";
import LegalCaseSnapshot from "./LegalCaseSnapshot";
import {
  LegalCaseData,
  activityTypes,
  caseStatuses,
  parseSnapshot,
} from "./legal-case-model";

export default function LegalCaseWorkspace() {
  const [data, setData] = useState<LegalCaseData | null>(null);
  const [selected, setSelected] = useState(0);
  const [notice, setNotice] = useState("");
  const [decisionReason, setDecisionReason] = useState("");
  const [busyDecision, setBusyDecision] = useState<"approve" | "reject" | "">("");

  const load = useCallback(async () => {
    const response = await fetch("/api/portal/legal-cases", { cache: "no-store" });
    const result = (await response.json()) as LegalCaseData & { error?: string };
    if (!response.ok) throw new Error(result.error || "تعذر تحميل القضايا");
    setData(result);
    setSelected((value) => value || result.cases[0]?.id || 0);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load().catch((error) => setNotice(error instanceof Error ? error.message : "تعذر التحميل"));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const matter = data?.cases.find((item) => item.id === selected);
  const activities = useMemo(
    () => data?.activities.filter((item) => item.legalRecordId === selected) || [],
    [data, selected],
  );
  const snapshot = useMemo(() => parseSnapshot(matter?.fileSnapshotJson), [matter?.fileSnapshotJson]);
  const cancellationRequest = snapshot?.request?.type === "contract-cancellation" ? snapshot.request : null;
  const contractId = matter?.contractId || snapshot?.contract?.id || 0;

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const body = Object.fromEntries(new FormData(form).entries());
    const response = await fetch("/api/portal/legal-cases", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...body, legalRecordId: selected }),
    });
    const result = (await response.json()) as { error?: string };
    if (!response.ok) {
      setNotice(result.error || "تعذر حفظ الإجراء");
      return;
    }
    form.reset();
    setNotice("تمت إضافة الإجراء إلى سجل القضية.");
    await load();
  }

  async function update(id: number, status: string) {
    const response = await fetch("/api/portal/legal-cases", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    const result = (await response.json()) as { error?: string };
    if (!response.ok) {
      setNotice(result.error || "تعذر تحديث الإجراء");
      return;
    }
    await load();
  }

  async function decideCancellation(decision: "approve" | "reject") {
    if (!matter || !contractId || !cancellationRequest) return;
    const reason = decisionReason.trim();
    if (reason.length < 10) {
      setNotice("اكتب تسبيبًا قانونيًا واضحًا لا يقل عن 10 أحرف قبل إصدار القرار.");
      return;
    }
    setBusyDecision(decision);
    setNotice("");
    try {
      const response = await fetch(`/api/portal/contracts/${contractId}/status`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "legal-cancellation-decision",
          legalRecordId: matter.id,
          decision,
          reason,
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || "تعذر حفظ القرار القانوني");
      setDecisionReason("");
      await load();
      setNotice(
        decision === "approve"
          ? `تم اعتماد ${cancellationRequest.requestedStatus === "terminated" ? "إنهاء" : "إلغاء"} العقد وتنفيذ القرار وإغلاق الملف.`
          : "تم رفض طلب الإلغاء، وبقي العقد على حالته دون تغيير.",
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "تعذر حفظ القرار القانوني");
    } finally {
      setBusyDecision("");
    }
  }

  if (!data) {
    return (
      <section className="panel legal-matter-workspace">
        <p>{notice || "جارٍ تحميل إدارة القضايا..."}</p>
      </section>
    );
  }

  return (
    <section className="panel legal-matter-workspace">
      <header>
        <div>
          <span>إدارة المسائل القانونية</span>
          <h2>لوحة القضايا والإجراءات والمواعيد</h2>
          <p>مصدر موحد للملف والمستندات والمهام والمراسلات والمواعيد وسجل القرار.</p>
        </div>
        <b>{data.cases.filter((item) => item.status !== "closed").length} ملف مفتوح</b>
      </header>

      {notice && (
        <p className="operations-notice" role="status" aria-live="polite">
          {notice}
        </p>
      )}

      <div className="legal-matter-layout">
        <aside aria-label="الملفات القانونية">
          {data.cases.map((item) => {
            const itemSnapshot = parseSnapshot(item.fileSnapshotJson);
            return (
              <button
                key={item.id}
                className={selected === item.id ? "active" : ""}
                onClick={() => {
                  setSelected(item.id);
                  setDecisionReason("");
                }}
              >
                <strong>{item.referenceCode}</strong>
                <span>{item.counterparty}</span>
                <small>{caseStatuses[item.status] || item.status}</small>
                {itemSnapshot?.request?.type === "contract-cancellation" && <em>قرار إلغاء عقد</em>}
              </button>
            );
          })}
        </aside>

        <main>
          {matter ? (
            <>
              <div className="legal-matter-head">
                <div>
                  <h3>{matter.title}</h3>
                  <p>{matter.referralReason || "ملف قانوني مسجل يدويًا"}</p>
                </div>
                <span>{activities.filter((item) => !["completed", "cancelled"].includes(item.status)).length} إجراءات مفتوحة</span>
              </div>

              {snapshot && (
                <LegalCaseSnapshot
                  matter={matter}
                  snapshot={snapshot}
                  cancellationRequest={cancellationRequest}
                />
              )}

              {cancellationRequest && matter.status === "reviewing" && (
                <LegalCancellationDecision
                  request={cancellationRequest}
                  canApprove={data.canApprove}
                  reason={decisionReason}
                  busy={busyDecision}
                  onReasonChange={setDecisionReason}
                  onDecision={(decision) => void decideCancellation(decision)}
                />
              )}

              {cancellationRequest && matter.status === "closed" && (
                <p className="legal-decision-resolved">
                  تم إصدار القرار وإغلاق طلب الإلغاء. يظهر تسبيب القرار في سجل الإجراءات أدناه.
                </p>
              )}

              {data.canWrite && (
                <form className="legal-activity-form" onSubmit={add}>
                  <select name="activityType" required defaultValue="task">
                    {Object.entries(activityTypes).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <input name="title" required minLength={3} placeholder="عنوان الإجراء" />
                  <select name="priority" defaultValue="medium">
                    <option value="low">منخفض</option>
                    <option value="medium">متوسط</option>
                    <option value="high">عالٍ</option>
                    <option value="critical">عاجل</option>
                  </select>
                  <input name="dueAt" type="datetime-local" />
                  <input name="assignedTo" type="email" placeholder="المسؤول بالبريد" />
                  <textarea name="details" placeholder="الملاحظات والخطوة المطلوبة" />
                  <button>إضافة إلى القضية</button>
                </form>
              )}

              <div className="legal-timeline">
                {activities.map((item) => (
                  <article key={item.id} className={`${item.priority} ${item.status}`}>
                    <i />
                    <div>
                      <header>
                        <strong>
                          {activityTypes[item.activityType] || item.activityType} — {item.title}
                        </strong>
                        <span>{item.priority}</span>
                      </header>
                      <p>{item.details || "دون ملاحظات إضافية"}</p>
                      <small>
                        {item.dueAt ? `الموعد: ${new Date(item.dueAt).toLocaleString("ar-SA")}` : "دون موعد"}
                        {item.assignedTo ? ` · المسؤول: ${item.assignedTo}` : ""}
                      </small>
                    </div>
                    {data.canWrite && !["completed", "cancelled"].includes(item.status) && (
                      <div>
                        <button onClick={() => void update(item.id, "in_progress")}>قيد التنفيذ</button>
                        <button onClick={() => void update(item.id, "completed")}>إكمال</button>
                      </div>
                    )}
                  </article>
                ))}
                {!activities.length && <p className="legal-empty">لا توجد إجراءات مسجلة لهذه القضية.</p>}
              </div>
            </>
          ) : (
            <p className="legal-empty">اختر ملفًا قانونيًا.</p>
          )}
        </main>
      </div>
    </section>
  );
}
