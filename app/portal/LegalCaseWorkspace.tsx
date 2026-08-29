"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { readApiJson } from "@/lib/client-api";

type Matter = {
  id: number;
  referenceCode: string;
  title: string;
  counterparty: string;
  status: string;
  referralReason: string | null;
  fileSnapshotJson: string | null;
  contractId: number | null;
  assignedLawyerEmail: string | null;
  assignedBy: string | null;
  assignedAt: string | null;
  courtCaseNumber: string | null;
  courtName: string | null;
  circuitName: string | null;
  claimType: string | null;
  companyCapacity: string | null;
  currentHearingNumber: string | null;
  claimAmountHalalas: number | null;
  judgmentAmountHalalas: number | null;
  enforcementInstrumentNumber: string | null;
  opposingCounsel: string | null;
  litigationStage: string | null;
  litigationLevel: string | null;
};
type Activity = {
  id: number;
  legalRecordId: number;
  activityType: string;
  title: string;
  details: string | null;
  priority: string;
  status: string;
  dueAt: string | null;
  assignedTo: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};
type ActionLog = {
  id: number;
  legalRecordId: number;
  activityId: number | null;
  action: string;
  fromStatus: string | null;
  toStatus: string | null;
  details: string | null;
  actorEmail: string;
  actorRole: string;
  createdAt: string;
};
type Attachment = {
  id: number;
  legalRecordId: number;
  title: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
  documentCategory: string;
  versionNumber: number;
  approvalStatus: string;
  sha256: string | null;
};
type Bank = {
  id: number;
  accountCode: string;
  bankName: string;
  accountName: string;
  iban: string;
};
type JudgmentPayment = {
  id: number;
  legalRecordId: number;
  amountHalalas: number;
  description: string;
  status: string;
  requestedBy: string;
  requestedAt: string;
  paidBy: string | null;
  paidAt: string | null;
  bankAccountId: number | null;
  journalEntryId: number | null;
  responseReason: string | null;
};
type Snapshot = {
  contract?: Record<string, unknown>;
  documents?: Array<Record<string, unknown>>;
  payments?: Array<Record<string, unknown>>;
  finances?: Array<Record<string, unknown>>;
  workers?: Array<Record<string, unknown>>;
};
type Data = {
  cases: Matter[];
  activities: Activity[];
  attachments: Attachment[];
  actionLog: ActionLog[];
  judgmentPayments: JudgmentPayment[];
  banks: Bank[];
  currentActorEmail: string;
  currentActorRole: string;
  canWrite: boolean;
  canApprove: boolean;
  canSupervise: boolean;
  canPayJudgments: boolean;
};
type Hearing = {
  id: number;
  legalRecordId: number;
  hearingNumber: string;
  scheduledAt: string;
  attendeesJson: string;
  requestsJson: string;
  decisionText: string | null;
  nextHearingAt: string | null;
  status: string;
};
type Submission = {
  id: number;
  legalRecordId: number;
  submissionType: string;
  title: string;
  versionNumber: number;
  status: string;
  content: string | null;
};
type Settlement = {
  id: number;
  legalRecordId: number;
  amountHalalas: number;
  concessions: string | null;
  paymentScheduleJson: string;
  status: string;
  requestedBy: string;
};
type WorkflowData = {
  hearings: Hearing[];
  submissions: Submission[];
  settlements: Settlement[];
  canSupervise: boolean;
  canApproveSettlement: boolean;
};
const types: Record<string, string> = {
  task: "مهمة",
  deadline: "موعد نظامي",
  note: "ملاحظة",
  communication: "مراسلة",
  hearing: "جلسة",
  settlement: "تسوية",
};
const text = (value: unknown) =>
  value === null || value === undefined || value === ""
    ? "غير مسجل"
    : String(value);
const money = (value: unknown) =>
  new Intl.NumberFormat("ar-SA", { style: "currency", currency: "SAR" }).format(
    Number(value || 0) / 100,
  );

export default function LegalCaseWorkspace() {
  const [data, setData] = useState<Data | null>(null),
    [selected, setSelected] = useState(0),
    [notice, setNotice] = useState(""),
    [uploading, setUploading] = useState(false),
    [payingJudgment, setPayingJudgment] = useState<JudgmentPayment | null>(
      null,
    );
  const [workflows, setWorkflows] = useState<WorkflowData>({
    hearings: [],
    submissions: [],
    settlements: [],
    canSupervise: false,
    canApproveSettlement: false,
  });
  const load = useCallback(async () => {
    const [response, workflowResponse] = await Promise.all([
      fetch("/api/portal/legal-cases", { cache: "no-store" }),
      fetch("/api/portal/legal-cases/workflows", { cache: "no-store" }),
    ]);
    const result = (await readApiJson(response)) as Data & { error?: string };
    if (!response.ok) throw new Error(result.error || "تعذر تحميل القضايا");
    setData(result);
    if (workflowResponse.ok)
      setWorkflows((await readApiJson(workflowResponse)) as WorkflowData);
    setSelected((value) => value || result.cases[0]?.id || 0);
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(
      () =>
        void load().catch((error) =>
          setNotice(error instanceof Error ? error.message : "تعذر التحميل"),
        ),
      0,
    );
    return () => window.clearTimeout(timer);
  }, [load]);
  const matter = data?.cases.find((item) => item.id === selected);
  const activities = useMemo(
    () =>
      data?.activities.filter((item) => item.legalRecordId === selected) || [],
    [data, selected],
  );
  const attachments = useMemo(
    () =>
      data?.attachments.filter((item) => item.legalRecordId === selected) || [],
    [data, selected],
  );
  const actionLog = useMemo(
    () =>
      data?.actionLog
        .filter((item) => item.legalRecordId === selected)
        .slice()
        .reverse() || [],
    [data, selected],
  );
  const judgmentPayments = useMemo(
    () =>
      data?.judgmentPayments.filter(
        (item) => item.legalRecordId === selected,
      ) || [],
    [data, selected],
  );
  const snapshot = useMemo(() => {
    if (!matter?.fileSnapshotJson) return null;
    try {
      return JSON.parse(matter.fileSnapshotJson) as Snapshot;
    } catch {
      return null;
    }
  }, [matter]);
  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const body = Object.fromEntries(new FormData(form).entries());
    const response = await fetch("/api/portal/legal-cases", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...body, legalRecordId: selected }),
    });
    const result = (await readApiJson(response)) as { error?: string };
    if (!response.ok) {
      setNotice(result.error || "تعذر حفظ الإجراء");
      return;
    }
    form.reset();
    setNotice("تمت إضافة الإجراء إلى سجل القضية.");
    await load();
  }
  async function requestJudgmentPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget,
      fd = new FormData(form);
    const response = await fetch("/api/portal/legal-cases", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "request-judgment-payment",
        legalRecordId: selected,
        amount: fd.get("amount"),
        description: fd.get("description"),
      }),
    });
    const result = (await readApiJson(response)) as { error?: string };
    if (!response.ok) {
      setNotice(result.error || "تعذر إرسال طلب السداد");
      return;
    }
    form.reset();
    setNotice("أُرسل طلب سداد المحكوم به للمالك.");
    await load();
  }
  async function payJudgment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!payingJudgment) return;
    const fd = new FormData(event.currentTarget);
    const response = await fetch("/api/portal/legal-cases", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "pay-judgment",
        paymentId: payingJudgment.id,
        bankAccountId: fd.get("bankAccountId"),
        paymentReference: fd.get("paymentReference"),
      }),
    });
    const result = (await readApiJson(response)) as { error?: string };
    if (!response.ok) {
      setNotice(result.error || "تعذر تسجيل سداد المحكوم به");
      return;
    }
    setPayingJudgment(null);
    setNotice(
      "تم تسجيل السداد وإنشاء قيد الأحكام القانونية بانتظار الاعتماد والترحيل.",
    );
    await load();
  }
  async function assignCase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget,
      assignedLawyerEmail = String(
        new FormData(form).get("assignedLawyerEmail") || "",
      );
    const response = await fetch("/api/portal/legal-cases", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "assign-case",
        legalRecordId: selected,
        assignedLawyerEmail,
      }),
    });
    const result = (await readApiJson(response)) as { error?: string };
    if (!response.ok) {
      setNotice(result.error || "تعذر إسناد القضية");
      return;
    }
    form.reset();
    setNotice("تم تحديد المحامي المستلم للقضية وتسجيل الإسناد.");
    await load();
  }
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget,
      body = new FormData(form);
    body.set("legalRecordId", String(selected));
    setUploading(true);
    const response = await fetch("/api/portal/legal-cases/attachments", {
      method: "POST",
      body,
    });
    const result = (await readApiJson(response)) as { error?: string };
    setUploading(false);
    if (!response.ok) {
      setNotice(result.error || "تعذر رفع المرفق");
      return;
    }
    form.reset();
    setNotice("تم حفظ المرفق داخل الملف القانوني.");
    await load();
  }
  async function update(id: number, status: string) {
    const response = await fetch("/api/portal/legal-cases", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    const result = (await readApiJson(response)) as { error?: string };
    if (!response.ok) {
      setNotice(result.error || "تعذر تحديث الإجراء");
      return;
    }
    await load();
  }
  async function legalDecision(
    action: string,
    payload: Record<string, unknown>,
  ) {
    const response = await fetch("/api/portal/legal-cases", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, ...payload }),
    });
    const result = (await readApiJson(response)) as { error?: string };
    if (!response.ok) {
      setNotice(result.error || "تعذر تنفيذ القرار");
      return;
    }
    setNotice("تم حفظ القرار في سجل القضية.");
    await load();
  }
  async function updateCaseStatus(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    await legalDecision("update-case-status", {
      legalRecordId: selected,
      ...values,
    });
  }
  async function updateCaseDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await legalDecision("update-case-details", {
      legalRecordId: selected,
      ...Object.fromEntries(new FormData(event.currentTarget)),
    });
  }
  async function workflowAction(
    method: "POST" | "PATCH",
    payload: Record<string, unknown>,
    form?: HTMLFormElement,
  ) {
    const response = await fetch("/api/portal/legal-cases/workflows", {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = (await readApiJson(response)) as { error?: string };
    if (!response.ok) {
      setNotice(result.error || "تعذر حفظ الدورة القانونية");
      return;
    }
    form?.reset();
    setNotice("تم تحديث الدورة القانونية وتوثيقها.");
    await load();
  }
  if (!data)
    return (
      <section className="panel legal-matter-workspace">
        <p>{notice || "جارٍ تحميل إدارة القضايا..."}</p>
      </section>
    );
  return (
    <section className="panel legal-matter-workspace">
      <header>
        <div>
          <span>إدارة المسائل القانونية</span>
          <h2>ملف قانوني مترابط بالعقد والعميل</h2>
          <p>
            العقد ومرفقاته ودفعاته وسجله المالي والعمالة والإجراءات في موضع
            واحد.
          </p>
        </div>
        <b>
          {data.cases.filter((item) => item.status !== "closed").length} ملف
          مفتوح
        </b>
      </header>
      {notice && <p className="operations-notice">{notice}</p>}
      <div className="legal-matter-layout">
        <aside>
          {data.cases.map((item) => (
            <button
              type="button"
              key={item.id}
              className={selected === item.id ? "active" : ""}
              onClick={() => setSelected(item.id)}
            >
              <strong>{item.referenceCode}</strong>
              <span>{item.counterparty}</span>
              <small>{item.status}</small>
            </button>
          ))}
        </aside>
        <main>
          {matter ? (
            <>
              <div className="legal-matter-head">
                <div>
                  <h3>{matter.title}</h3>
                  <p>{matter.referralReason || "ملف قانوني مسجل يدويًا"}</p>
                  <p>
                    <strong>المحامي المستلم للقضية:</strong>{" "}
                    {matter.assignedLawyerEmail || "لم يُسند بعد"}
                    {matter.assignedBy && (
                      <small>
                        {" "}
                        · أسندها {matter.assignedBy}
                        {matter.assignedAt
                          ? ` في ${new Date(matter.assignedAt).toLocaleString("ar-SA")}`
                          : ""}
                      </small>
                    )}
                  </p>
                  {data.canSupervise && (
                    <>
                      <form onSubmit={assignCase}>
                        <input
                          name="assignedLawyerEmail"
                          type="email"
                          required
                          placeholder="بريد المحامي الفرعي المستلم"
                        />
                        <button>إسناد القضية</button>
                      </form>
                      <form onSubmit={updateCaseStatus}>
                        <select name="status" defaultValue={matter.status}>
                          <option value="reviewing">قيد المراجعة</option>
                          <option value="active">مفتوح</option>
                          <option value="in_progress">قيد العمل</option>
                          <option value="closed">مغلق</option>
                          <option value="cancelled">ملغى</option>
                        </select>
                        <input
                          name="reason"
                          placeholder="سبب الإغلاق أو تغيير الحالة"
                        />
                        <button>تحديث حالة الملف</button>
                      </form>
                    </>
                  )}
                </div>
                <span>
                  {
                    activities.filter(
                      (item) =>
                        !["completed", "cancelled"].includes(item.status),
                    ).length
                  }{" "}
                  إجراءات مفتوحة
                </span>
              </div>
              {snapshot && (
                <section className="legal-linked-file">
                  <h3>العقد والملف المحال</h3>
                  <dl>
                    <div>
                      <dt>مرجع العقد</dt>
                      <dd>{text(snapshot.contract?.referenceCode)}</dd>
                    </div>
                    <div>
                      <dt>العميل</dt>
                      <dd>
                        {text(
                          snapshot.contract?.clientName || matter.counterparty,
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>حالة العقد</dt>
                      <dd>{text(snapshot.contract?.status)}</dd>
                    </div>
                    <div>
                      <dt>قيمة العقد</dt>
                      <dd>{money(snapshot.contract?.amountHalalas)}</dd>
                    </div>
                  </dl>
                  <div className="legal-related-counts">
                    <span>
                      المستندات <b>{snapshot.documents?.length || 0}</b>
                    </span>
                    <span>
                      الدفعات <b>{snapshot.payments?.length || 0}</b>
                    </span>
                    <span>
                      السجلات المالية <b>{snapshot.finances?.length || 0}</b>
                    </span>
                    <span>
                      العمالة <b>{snapshot.workers?.length || 0}</b>
                    </span>
                  </div>
                  {snapshot.documents?.map((item, index) => (
                    <article key={index}>
                      <strong>{text(item.title || item.referenceCode)}</strong>
                      <small>{text(item.fileName || item.status)}</small>
                      {Boolean(item.id) && (
                        <a
                          href={`/api/portal/documents/${item.id}?inline=1`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          فتح المستند
                        </a>
                      )}
                    </article>
                  ))}
                </section>
              )}
              {data.canSupervise && (
                <details className="legal-linked-file">
                  <summary>بيانات القضية والمحكمة</summary>
                  <form
                    className="legal-activity-form"
                    onSubmit={updateCaseDetails}
                  >
                    <input
                      name="courtCaseNumber"
                      defaultValue={matter.courtCaseNumber || ""}
                      placeholder="رقم القضية لدى المحكمة"
                    />
                    <input
                      name="courtName"
                      defaultValue={matter.courtName || ""}
                      placeholder="المحكمة"
                    />
                    <input
                      name="circuitName"
                      defaultValue={matter.circuitName || ""}
                      placeholder="الدائرة"
                    />
                    <input
                      name="claimType"
                      defaultValue={matter.claimType || ""}
                      placeholder="نوع الدعوى"
                    />
                    <input
                      name="companyCapacity"
                      defaultValue={matter.companyCapacity || ""}
                      placeholder="صفة الشركة"
                    />
                    <input
                      name="currentHearingNumber"
                      defaultValue={matter.currentHearingNumber || ""}
                      placeholder="رقم الجلسة"
                    />
                    <input
                      name="claimAmount"
                      type="number"
                      min="0"
                      step="0.01"
                      defaultValue={(matter.claimAmountHalalas || 0) / 100}
                      placeholder="قيمة المطالبة"
                    />
                    <input
                      name="judgmentAmount"
                      type="number"
                      min="0"
                      step="0.01"
                      defaultValue={(matter.judgmentAmountHalalas || 0) / 100}
                      placeholder="قيمة الحكم"
                    />
                    <input
                      name="enforcementInstrumentNumber"
                      defaultValue={matter.enforcementInstrumentNumber || ""}
                      placeholder="رقم السند التنفيذي"
                    />
                    <input
                      name="opposingCounsel"
                      defaultValue={matter.opposingCounsel || ""}
                      placeholder="محامي الخصم"
                    />
                    <input
                      name="litigationStage"
                      defaultValue={matter.litigationStage || ""}
                      placeholder="المرحلة القضائية"
                    />
                    <input
                      name="litigationLevel"
                      defaultValue={matter.litigationLevel || ""}
                      placeholder="درجة التقاضي"
                    />
                    <button>حفظ بيانات القضية</button>
                  </form>
                </details>
              )}
              <details className="legal-linked-file">
                <summary>الجلسات القضائية</summary>
                {data.canWrite && (
                  <form
                    className="legal-activity-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const form = event.currentTarget;
                      void workflowAction(
                        "POST",
                        {
                          action: "hearing",
                          legalRecordId: selected,
                          ...Object.fromEntries(new FormData(form)),
                        },
                        form,
                      );
                    }}
                  >
                    <input
                      name="hearingNumber"
                      required
                      placeholder="رقم الجلسة"
                    />
                    <input name="scheduledAt" type="datetime-local" required />
                    <input name="courtName" placeholder="المحكمة" />
                    <input name="circuitName" placeholder="الدائرة" />
                    <textarea
                      name="attendees"
                      placeholder="الحضور؛ كل اسم في سطر"
                    />
                    <textarea
                      name="requests"
                      placeholder="الطلبات؛ كل طلب في سطر"
                    />
                    <textarea name="decisionText" placeholder="قرار الجلسة" />
                    <input name="nextHearingAt" type="datetime-local" />
                    <select name="status">
                      <option value="scheduled">مجدولة</option>
                      <option value="held">انعقدت</option>
                      <option value="postponed">مؤجلة</option>
                      <option value="cancelled">ملغاة</option>
                    </select>
                    <button>حفظ بطاقة الجلسة</button>
                  </form>
                )}
                <div className="employee-related-list">
                  {workflows.hearings
                    .filter((item) => item.legalRecordId === selected)
                    .map((item) => (
                      <article key={item.id}>
                        <div>
                          <strong>جلسة {item.hearingNumber}</strong>
                          <small>
                            {new Date(item.scheduledAt).toLocaleString("ar-SA")}{" "}
                            · {item.status}
                          </small>
                        </div>
                        <span>{item.decisionText || "لم يسجل قرار بعد"}</span>
                      </article>
                    ))}
                </div>
              </details>
              <details className="legal-linked-file">
                <summary>المذكرات واللوائح وإصداراتها</summary>
                {data.canWrite && (
                  <form
                    className="legal-activity-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const form = event.currentTarget;
                      void workflowAction(
                        "POST",
                        {
                          action: "submission",
                          legalRecordId: selected,
                          ...Object.fromEntries(new FormData(form)),
                        },
                        form,
                      );
                    }}
                  >
                    <select name="submissionType">
                      <option value="memorandum">مذكرة</option>
                      <option value="pleading">لائحة</option>
                      <option value="response">رد</option>
                      <option value="appeal">استئناف</option>
                    </select>
                    <input
                      name="title"
                      required
                      minLength={3}
                      placeholder="عنوان المذكرة"
                    />
                    <select name="parentId" defaultValue="">
                      <option value="">إصدار أول</option>
                      {workflows.submissions
                        .filter((item) => item.legalRecordId === selected)
                        .map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.title} · إصدار {item.versionNumber}
                          </option>
                        ))}
                    </select>
                    <textarea name="content" placeholder="محتوى المسودة" />
                    <button>حفظ المسودة</button>
                  </form>
                )}
                <div className="employee-related-list">
                  {workflows.submissions
                    .filter((item) => item.legalRecordId === selected)
                    .map((item) => (
                      <article key={item.id}>
                        <div>
                          <strong>
                            {item.title} · إصدار {item.versionNumber}
                          </strong>
                          <small>
                            {item.submissionType} · {item.status}
                          </small>
                        </div>
                        {data.canWrite && item.status === "draft" && (
                          <button
                            onClick={() =>
                              void workflowAction("PATCH", {
                                action: "submission-status",
                                submissionId: item.id,
                                status: "review",
                              })
                            }
                          >
                            إرسال للمراجعة
                          </button>
                        )}
                        {workflows.canSupervise && item.status === "review" && (
                          <button
                            onClick={() =>
                              void workflowAction("PATCH", {
                                action: "submission-status",
                                submissionId: item.id,
                                status: "approved",
                              })
                            }
                          >
                            اعتماد
                          </button>
                        )}
                        {workflows.canSupervise &&
                          item.status === "approved" && (
                            <button
                              onClick={() =>
                                void workflowAction("PATCH", {
                                  action: "submission-status",
                                  submissionId: item.id,
                                  status: "issued",
                                })
                              }
                            >
                              إصدار نهائي
                            </button>
                          )}
                      </article>
                    ))}
                </div>
              </details>
              <details className="legal-linked-file">
                <summary>التسويات القانونية</summary>
                {data.canWrite && (
                  <form
                    className="legal-activity-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const form = event.currentTarget;
                      void workflowAction(
                        "POST",
                        {
                          action: "settlement",
                          legalRecordId: selected,
                          ...Object.fromEntries(new FormData(form)),
                        },
                        form,
                      );
                    }}
                  >
                    <input
                      name="amount"
                      type="number"
                      min="0.01"
                      step="0.01"
                      required
                      placeholder="قيمة التسوية"
                    />
                    <textarea
                      name="paymentSchedule"
                      placeholder="جدول السداد؛ كل دفعة في سطر"
                    />
                    <textarea
                      name="concessions"
                      placeholder="التنازلات والشروط"
                    />
                    <button>إرسال التسوية للاعتماد</button>
                  </form>
                )}
                <div className="employee-related-list">
                  {workflows.settlements
                    .filter((item) => item.legalRecordId === selected)
                    .map((item) => (
                      <article key={item.id}>
                        <div>
                          <strong>{money(item.amountHalalas)}</strong>
                          <small>
                            {item.status} · طلبها {item.requestedBy}
                          </small>
                        </div>
                        <span>{item.concessions || "دون تنازلات"}</span>
                        {workflows.canApproveSettlement &&
                          item.status === "pending_approval" && (
                            <>
                              <button
                                onClick={() =>
                                  void workflowAction("PATCH", {
                                    action: "settlement-decision",
                                    settlementId: item.id,
                                    decision: "approved",
                                  })
                                }
                              >
                                اعتماد التسوية
                              </button>
                              <button
                                className="danger"
                                onClick={() =>
                                  void workflowAction("PATCH", {
                                    action: "settlement-decision",
                                    settlementId: item.id,
                                    decision: "rejected",
                                  })
                                }
                              >
                                رفض
                              </button>
                            </>
                          )}
                      </article>
                    ))}
                </div>
              </details>
              <section className="legal-judgment-payments">
                <h3>طلبات سداد المحكوم به</h3>
                {data.canWrite && (
                  <form
                    className="legal-activity-form"
                    onSubmit={requestJudgmentPayment}
                  >
                    <input
                      name="amount"
                      type="number"
                      min="0.01"
                      step="0.01"
                      required
                      placeholder="المبلغ بالريال"
                    />
                    <textarea
                      name="description"
                      required
                      minLength={5}
                      placeholder="وصف الحكم وسبب السداد"
                    />
                    <button>إرسال طلب السداد للمالك</button>
                  </form>
                )}
                {judgmentPayments.map((item) => (
                  <article key={item.id}>
                    <div>
                      <strong>{money(item.amountHalalas)}</strong>
                      <p>{item.description}</p>
                      <small>
                        طلبه {item.requestedBy} في{" "}
                        {new Date(item.requestedAt).toLocaleString("ar-SA")}
                        {item.paidBy ? ` · سدده ${item.paidBy}` : ""}
                      </small>
                      {item.responseReason && (
                        <small>سبب القرار: {item.responseReason}</small>
                      )}
                    </div>
                    <span className={`workflow-status ${item.status}`}>
                      {item.status === "requested"
                        ? "بانتظار المالك"
                        : item.status === "paid"
                          ? "تم السداد"
                          : item.status}
                    </span>
                    {data.canPayJudgments && item.status === "requested" && (
                      <>
                        <button onClick={() => setPayingJudgment(item)}>
                          تم السداد
                        </button>
                        <button
                          onClick={() => {
                            const reason = window.prompt("سبب طلب التعديل");
                            if (reason)
                              void legalDecision("request-judgment-changes", {
                                paymentId: item.id,
                                reason,
                              });
                          }}
                        >
                          طلب تعديل
                        </button>
                        <button
                          className="danger"
                          onClick={() => {
                            const reason = window.prompt("سبب الرفض");
                            if (reason)
                              void legalDecision("reject-judgment", {
                                paymentId: item.id,
                                reason,
                              });
                          }}
                        >
                          رفض
                        </button>
                      </>
                    )}
                    {["requested", "changes_requested"].includes(item.status) &&
                      item.requestedBy === data.currentActorEmail && (
                        <button
                          className="danger"
                          onClick={() => {
                            const reason = window.prompt("سبب إلغاء الطلب");
                            if (reason)
                              void legalDecision("cancel-judgment", {
                                paymentId: item.id,
                                reason,
                              });
                          }}
                        >
                          إلغاء الطلب
                        </button>
                      )}
                    {item.journalEntryId && (
                      <small>قيد مالي #{item.journalEntryId}</small>
                    )}
                  </article>
                ))}
                {!judgmentPayments.length && (
                  <p className="legal-empty">لا توجد طلبات سداد محكوم به.</p>
                )}
              </section>
              <section className="legal-case-files">
                <h3>مرفقات الشؤون القانونية</h3>
                {attachments.map((item) => (
                  <a
                    key={item.id}
                    href={`/api/portal/legal-cases/attachments/${item.id}?inline=1`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <strong>{item.title}</strong>
                    <small>
                      {item.fileName} ·{" "}
                      {(item.sizeBytes / 1024 / 1024).toFixed(2)} م.ب
                    </small>
                  </a>
                ))}
                {!attachments.length && (
                  <p className="legal-empty">لا توجد مرفقات قانونية إضافية.</p>
                )}
                {data.canWrite && (
                  <form onSubmit={upload}>
                    <input
                      name="title"
                      maxLength={180}
                      placeholder="اسم المرفق"
                    />
                    <select name="documentCategory">
                      <option value="general">عام</option>
                      <option value="evidence">دليل</option>
                      <option value="judgment">حكم</option>
                      <option value="pleading">مذكرة أو لائحة</option>
                      <option value="settlement">اتفاق تسوية</option>
                      <option value="correspondence">مراسلات</option>
                    </select>
                    <input
                      name="file"
                      type="file"
                      required
                      accept="application/pdf,image/png,image/jpeg"
                    />
                    <button disabled={uploading}>
                      {uploading ? "جارٍ الرفع..." : "إرفاق ملف قانوني"}
                    </button>
                  </form>
                )}
              </section>
              {data.canWrite && (
                <form className="legal-activity-form" onSubmit={add}>
                  <select name="activityType" required defaultValue="task">
                    {Object.entries(types).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <input
                    name="title"
                    required
                    minLength={3}
                    placeholder="عنوان الإجراء"
                  />
                  <select name="priority" defaultValue="medium">
                    <option value="low">منخفض</option>
                    <option value="medium">متوسط</option>
                    <option value="high">عالٍ</option>
                    <option value="critical">عاجل</option>
                  </select>
                  <input name="dueAt" type="datetime-local" />
                  <input
                    name="assignedTo"
                    type="email"
                    placeholder="المسؤول بالبريد"
                  />
                  <textarea
                    name="details"
                    placeholder="الملاحظات والخطوة المطلوبة"
                  />
                  <button>إضافة إلى القضية</button>
                </form>
              )}
              <div className="legal-timeline">
                {activities.map((item) => (
                  <article
                    key={item.id}
                    className={`${item.priority} ${item.status}`}
                  >
                    <i />
                    <div>
                      <header>
                        <strong>
                          {types[item.activityType] || item.activityType} —{" "}
                          {item.title}
                        </strong>
                        <span>{item.priority}</span>
                      </header>
                      <p>{item.details || "دون ملاحظات إضافية"}</p>
                      <small>
                        {item.dueAt
                          ? `الموعد: ${new Date(item.dueAt).toLocaleString("ar-SA")}`
                          : "دون موعد"}
                        {item.assignedTo
                          ? ` · المسؤول: ${item.assignedTo}`
                          : ""}{" "}
                        · أنشأه: {item.createdBy}
                        {item.completedAt
                          ? ` · أُكمل: ${new Date(item.completedAt).toLocaleString("ar-SA")}`
                          : ""}
                      </small>
                    </div>
                    {data.canWrite &&
                      !["completed", "cancelled"].includes(item.status) && (
                        <div>
                          <button
                            onClick={() => void update(item.id, "in_progress")}
                          >
                            قيد التنفيذ
                          </button>
                          <button
                            onClick={() => void update(item.id, "completed")}
                          >
                            إكمال
                          </button>
                        </div>
                      )}
                  </article>
                ))}
                {!activities.length && (
                  <p className="legal-empty">
                    لا توجد إجراءات مسجلة لهذه القضية.
                  </p>
                )}
              </div>
              <section className="legal-action-audit">
                <h3>سجل منفذي الإجراءات</h3>
                {actionLog.map((log) => (
                  <article key={log.id}>
                    <strong>{log.actorEmail}</strong>
                    <span>
                      {log.actorRole === "legal_supervisor"
                        ? "محامي مشرف"
                        : log.actorRole === "legal_lawyer" ||
                            log.actorRole === "lawyer"
                          ? "محامي فرعي"
                          : log.actorRole}
                    </span>
                    <p>{log.details || log.action}</p>
                    <small>
                      {new Date(log.createdAt).toLocaleString("ar-SA")}
                    </small>
                  </article>
                ))}
                {!actionLog.length && (
                  <p className="legal-empty">لا توجد حركات موثقة بعد.</p>
                )}
              </section>
            </>
          ) : (
            <p className="legal-empty">اختر ملفًا قانونيًا.</p>
          )}
        </main>
      </div>
      {payingJudgment && (
        <div className="modal-layer">
          <button
            className="drawer-backdrop"
            aria-label="إغلاق نموذج سداد المحكوم به"
            onClick={() => setPayingJudgment(null)}
          />
          <section className="record-modal" role="dialog" aria-modal="true">
            <div className="drawer-head">
              <div>
                <span>طلب #{payingJudgment.id}</span>
                <h2>تأكيد سداد المحكوم به</h2>
              </div>
              <button type="button" onClick={() => setPayingJudgment(null)}>
                ×
              </button>
            </div>
            <form className="feature-form" onSubmit={payJudgment}>
              <p className="span-two">
                {money(payingJudgment.amountHalalas)} —{" "}
                {payingJudgment.description}
              </p>
              <label>
                الحساب البنكي
                <select name="bankAccountId" required defaultValue="">
                  <option value="" disabled>
                    اختر الحساب البنكي
                  </option>
                  {data.banks.map((bank) => (
                    <option key={bank.id} value={bank.id}>
                      {bank.bankName} — {bank.accountName} — {bank.iban}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                مرجع العملية
                <input
                  name="paymentReference"
                  maxLength={180}
                  placeholder="رقم العملية البنكية"
                />
              </label>
              <p className="span-two">
                القيد مستقل: مدين مصروفات وأحكام قانونية، ودائن البنك المختار.
              </p>
              <div className="modal-actions span-two">
                <button type="button" onClick={() => setPayingJudgment(null)}>
                  إلغاء
                </button>
                <button
                  className="admin-primary"
                  disabled={data.banks.length === 0}
                >
                  تم السداد وإنشاء القيد
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}
