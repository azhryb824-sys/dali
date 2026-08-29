"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { readApiJson } from "@/lib/client-api";

type Movement = {
  id: number;
  employeeId: number;
  movementType: string;
  effectiveDate: string;
  amountHalalas: number;
  description: string;
  status: string;
};
type PayrollRun = {
  id: number;
  runNumber: string;
  periodMonth: string;
  status: string;
};
type PayrollItem = {
  id: number;
  payrollRunId: number;
  employeeId: number;
  baseSalaryHalalas: number;
  allowancesHalalas: number;
  bonusHalalas: number;
  deductionsHalalas: number;
  netPayHalalas: number;
};
type Document = {
  id: number;
  employeeId: number;
  documentType: string;
  documentNumber: string | null;
  expiryDate: string | null;
  status: string;
  fileName: string | null;
  storageKey: string | null;
  notes: string | null;
};
type Leave = {
  id: number;
  employeeId: number;
  leaveType: string;
  startDate: string;
  endDate: string;
  days: number;
  status: string;
  reason: string | null;
};
type Attendance = {
  id: number;
  employeeId: number;
  attendanceDate: string;
  status: string;
  lateMinutes: number;
  overtimeMinutes: number;
};
type Review = {
  id: number;
  employeeId: number;
  periodStart: string;
  periodEnd: string;
  status: string;
  overallScore: number;
  acknowledgedAt?: string | null;
  appealText?: string | null;
  employeeComment?: string | null;
};
type Proposal = {
  id: number;
  employeeId: number;
  periodMonth: string;
  missingMinutes: number;
  cappedAmountHalalas: number;
  status: string;
};
type HrData = {
  movements: Movement[];
  runs: PayrollRun[];
  items: PayrollItem[];
  documents: Document[];
  leaves: Leave[];
  attendance: Attendance[];
  profileChanges: ProfileChange[];
};
type ProfileChange = {
  id: number;
  employeeId: number;
  changeType: string;
  effectiveDate: string;
  reason: string;
  status: string;
  requestedBy: string;
  approvedBy: string | null;
};
type GovernanceData = { reviews?: Review[]; proposals?: Proposal[] };
type Termination = {
  id: number;
  employeeId: number;
  requestedLastDay: string;
  reason: string;
  status: string;
  serviceAwardHalalas: number;
  leaveCompensationHalalas: number;
  salaryDueHalalas: number;
  deductionsHalalas: number;
  netSettlementHalalas: number;
  journalEntryId: number | null;
};
type Tab =
  | "overview"
  | "finance"
  | "movements"
  | "leaves"
  | "attendance"
  | "documents"
  | "performance"
  | "termination";
const movementLabels: Record<string, string> = {
  bonus: "مكافأة",
  advance: "سلفة",
  deduction: "خصم",
  allowance: "بدل",
  salary_adjustment: "تعديل راتب",
  leave: "إجازة",
  return_from_leave: "عودة من إجازة",
  suspension: "إيقاف",
  termination: "إنهاء خدمة",
  note: "ملاحظة",
};
const statusLabels: Record<string, string> = {
  draft: "مسودة",
  approved: "معتمد",
  pending: "بانتظار الاعتماد",
  rejected: "مرفوض",
  paid: "مدفوع",
  processing: "قيد الصرف",
  present: "حاضر",
  absent: "غائب",
  remote: "عمل عن بعد",
  leave: "إجازة",
  sick: "مرضي",
  final: "نهائي",
  manager_review: "قيد المراجعة",
  hr_review: "مراجعة الموارد البشرية",
  finance_approved: "معتمد ماليًا",
};
const money = (value: number) =>
  new Intl.NumberFormat("ar-SA", {
    style: "currency",
    currency: "SAR",
    maximumFractionDigits: 2,
  }).format(value / 100);

export default function EmployeeProfileWorkspace({
  employeeId,
  leaveBalanceDays,
  canWrite,
}: {
  employeeId: number;
  leaveBalanceDays: number;
  canWrite: boolean;
}) {
  const [data, setData] = useState<HrData>({
    movements: [],
    runs: [],
    items: [],
    documents: [],
    leaves: [],
    attendance: [],
    profileChanges: [],
  });
  const [governance, setGovernance] = useState<GovernanceData>({
    reviews: [],
    proposals: [],
  });
  const [terminations, setTerminations] = useState<Termination[]>([]);
  const [tab, setTab] = useState<Tab>("overview");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    const [hrResponse, governanceResponse, terminationResponse] =
      await Promise.all([
        fetch("/api/portal/hr", { cache: "no-store" }),
        fetch("/api/portal/people-governance", { cache: "no-store" }),
        fetch("/api/portal/hr/terminations", { cache: "no-store" }),
      ]);
    const hr = (await readApiJson(hrResponse)) as HrData & { error?: string };
    if (!hrResponse.ok) throw new Error(hr.error || "تعذر تحميل الملف الوظيفي");
    setData(hr);
    if (governanceResponse.ok)
      setGovernance((await readApiJson(governanceResponse)) as GovernanceData);
    if (terminationResponse.ok) {
      const result = (await readApiJson(terminationResponse)) as {
        terminations?: Termination[];
      };
      setTerminations(result.terminations || []);
    }
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(
      () =>
        void load().catch((error) =>
          setNotice(
            error instanceof Error ? error.message : "تعذر تحميل الملف",
          ),
        ),
      0,
    );
    return () => window.clearTimeout(timer);
  }, [load]);
  const movements = useMemo(
    () => data.movements.filter((item) => item.employeeId === employeeId),
    [data.movements, employeeId],
  );
  const documents = useMemo(
    () => data.documents.filter((item) => item.employeeId === employeeId),
    [data.documents, employeeId],
  );
  const leaves = useMemo(
    () => data.leaves.filter((item) => item.employeeId === employeeId),
    [data.leaves, employeeId],
  );
  const attendance = useMemo(
    () => data.attendance.filter((item) => item.employeeId === employeeId),
    [data.attendance, employeeId],
  );
  const payroll = useMemo(
    () =>
      data.items
        .filter((item) => item.employeeId === employeeId)
        .map((item) => ({
          ...item,
          run: data.runs.find((run) => run.id === item.payrollRunId),
        })),
    [data.items, data.runs, employeeId],
  );
  const reviews = (governance.reviews || []).filter(
    (item) => item.employeeId === employeeId,
  );
  const proposals = (governance.proposals || []).filter(
    (item) => item.employeeId === employeeId,
  );
  const profileChanges = (data.profileChanges || []).filter(
    (item) => item.employeeId === employeeId && item.changeType === "financial",
  );
  async function action(
    payload: Record<string, unknown>,
    key: string,
    form?: HTMLFormElement,
  ) {
    setBusy(key);
    setNotice("");
    try {
      const response = await fetch("/api/portal/hr", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...payload, employeeId }),
      });
      const result = (await readApiJson(response)) as { error?: string };
      if (!response.ok) throw new Error(result.error || "تعذر حفظ الإجراء");
      form?.reset();
      await load();
      setNotice("تم حفظ الإجراء داخل ملف الموظف وتسجيله في سجل التدقيق.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "تعذر تنفيذ الإجراء");
    } finally {
      setBusy("");
    }
  }
  function submit(event: FormEvent<HTMLFormElement>, actionName: string) {
    event.preventDefault();
    const form = event.currentTarget;
    void action(
      { action: actionName, ...Object.fromEntries(new FormData(form)) },
      actionName,
      form,
    );
  }
  async function uploadDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget,
      data = new FormData(form);
    data.set("employeeId", String(employeeId));
    setBusy("document");
    setNotice("");
    try {
      const response = await fetch("/api/portal/employees/documents", {
        method: "POST",
        body: data,
      });
      const result = (await readApiJson(response)) as { error?: string };
      if (!response.ok) throw new Error(result.error || "تعذر رفع الوثيقة");
      form.reset();
      await load();
      setNotice("تم رفع ملف الوثيقة وربطه ببطاقة الموظف.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "تعذر رفع الوثيقة");
    } finally {
      setBusy("");
    }
  }
  async function terminationAction(
    method: "POST" | "PATCH",
    payload: Record<string, unknown>,
    form?: HTMLFormElement,
  ) {
    setBusy("termination");
    setNotice("");
    try {
      const response = await fetch("/api/portal/hr/terminations", {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await readApiJson(response)) as { error?: string };
      if (!response.ok)
        throw new Error(result.error || "تعذر معالجة إنهاء الخدمة");
      form?.reset();
      await load();
      setNotice("تم تحديث دورة إنهاء الخدمة وتوثيقها.");
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "تعذر معالجة إنهاء الخدمة",
      );
    } finally {
      setBusy("");
    }
  }
  async function performanceAction(
    event: FormEvent<HTMLFormElement>,
    actionName: string,
    reviewId: number,
  ) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(`performance-${reviewId}`);
    setNotice("");
    try {
      const response = await fetch("/api/portal/people-governance", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: actionName,
          id: reviewId,
          ...Object.fromEntries(new FormData(form)),
        }),
      });
      const result = (await readApiJson(response)) as { error?: string };
      if (!response.ok) throw new Error(result.error || "تعذر تحديث التقييم");
      form.reset();
      await load();
      setNotice("تم توثيق الإجراء على تقييم الأداء.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "تعذر تحديث التقييم");
    } finally {
      setBusy("");
    }
  }
  return (
    <section className="employee-profile-workspace">
      {notice && (
        <p className="operations-notice" role="status">
          {notice}
        </p>
      )}
      <nav>
        {(
          [
            ["overview", "نظرة شاملة"],
            ["finance", "الراتب والرواتب"],
            ["movements", "الحركات"],
            ["leaves", "الإجازات"],
            ["attendance", "الحضور"],
            ["documents", "الوثائق"],
            ["performance", "الأداء والخصومات"],
            ["termination", "إنهاء الخدمة"],
          ] as const
        ).map(([value, label]) => (
          <button
            type="button"
            key={value}
            className={tab === value ? "active" : ""}
            onClick={() => setTab(value)}
          >
            {label}
          </button>
        ))}
      </nav>
      {tab === "overview" && (
        <div className="employee-related-summary">
          <article>
            <span>الحركات</span>
            <b>{movements.length}</b>
          </article>
          <article>
            <span>الوثائق</span>
            <b>{documents.length}</b>
          </article>
          <article>
            <span>الإجازات</span>
            <b>{leaves.length}</b>
          </article>
          <article>
            <span>سجلات الحضور</span>
            <b>{attendance.length}</b>
          </article>
          <article>
            <span>مسيرات مرتبطة</span>
            <b>{payroll.length}</b>
          </article>
          <article>
            <span>تقييمات الأداء</span>
            <b>{reviews.length}</b>
          </article>
        </div>
      )}
      {tab === "finance" && (
        <div className="employee-profile-section">
          {canWrite && (
            <form
              className="employee-inline-form"
              onSubmit={(event) => submit(event, "employee-finance")}
            >
              <input
                name="baseSalary"
                type="number"
                min="0"
                step="0.01"
                required
                placeholder="الراتب الأساسي"
              />
              <input
                name="housingAllowance"
                type="number"
                min="0"
                step="0.01"
                defaultValue="0"
                placeholder="بدل السكن"
              />
              <input
                name="transportAllowance"
                type="number"
                min="0"
                step="0.01"
                defaultValue="0"
                placeholder="بدل النقل"
              />
              <input
                name="otherAllowance"
                type="number"
                min="0"
                step="0.01"
                defaultValue="0"
                placeholder="بدلات أخرى"
              />
              <input name="bankName" placeholder="اسم البنك" />
              <input
                name="iban"
                dir="ltr"
                pattern="SA[0-9 ]{22,28}"
                placeholder="SA00 0000 0000 0000 0000 0000"
              />
              <input name="effectiveDate" type="date" required />
              <textarea
                name="reason"
                minLength={10}
                required
                placeholder="سبب طلب تعديل البيانات المالية"
              />
              <button disabled={busy === "employee-finance"}>
                إرسال طلب التعديل المالي
              </button>
            </form>
          )}
          <div className="employee-related-list">
            {profileChanges.map((change) => (
              <article key={`financial-change-${change.id}`}>
                <div>
                  <strong>طلب تعديل مالي #{change.id}</strong>
                  <small>
                    النفاذ: {change.effectiveDate} · {change.reason}
                  </small>
                </div>
                <span>{statusLabels[change.status] || change.status}</span>
                <small>مقدم الطلب: {change.requestedBy}</small>
                {canWrite && change.status === "pending" && (
                  <form
                    onSubmit={(event) =>
                      submit(event, "employee-finance-change-decision")
                    }
                  >
                    <input type="hidden" name="changeId" value={change.id} />
                    <select name="decision" required defaultValue="">
                      <option value="" disabled>
                        اختر القرار
                      </option>
                      <option value="approved">اعتماد</option>
                      <option value="rejected">رفض</option>
                    </select>
                    <textarea
                      name="decisionReason"
                      minLength={10}
                      required
                      placeholder="سبب قرار الاعتماد أو الرفض"
                    />
                    <button>حفظ القرار</button>
                  </form>
                )}
              </article>
            ))}
          </div>
          <div className="employee-related-list">
            {payroll.map((item) => (
              <article key={item.id}>
                <div>
                  <strong>
                    {item.run?.runNumber || `مسير #${item.payrollRunId}`}
                  </strong>
                  <small>
                    {item.run?.periodMonth || "—"} ·{" "}
                    {statusLabels[item.run?.status || ""] || item.run?.status}
                  </small>
                </div>
                <span>
                  استحقاق{" "}
                  {money(
                    item.baseSalaryHalalas +
                      item.allowancesHalalas +
                      item.bonusHalalas,
                  )}{" "}
                  · خصم {money(item.deductionsHalalas)}
                </span>
                <b>{money(item.netPayHalalas)}</b>
                <a
                  href={`/api/portal/hr/payroll-items/${item.id}/payslip`}
                  target="_blank"
                  rel="noreferrer"
                >
                  تنزيل قسيمة الراتب PDF
                </a>
              </article>
            ))}
            {!payroll.length && <p>لا توجد بنود رواتب مرتبطة بهذا الموظف.</p>}
          </div>
        </div>
      )}
      {tab === "movements" && (
        <div className="employee-profile-section">
          {canWrite && (
            <form
              className="employee-inline-form"
              onSubmit={(event) => submit(event, "movement")}
            >
              <select name="movementType" required defaultValue="">
                <option value="" disabled>
                  نوع الحركة
                </option>
                {Object.entries(movementLabels).map(([value, label]) => (
                  <option value={value} key={value}>
                    {label}
                  </option>
                ))}
              </select>
              <input name="effectiveDate" type="date" required />
              <input
                name="amount"
                type="number"
                min="0"
                step="0.01"
                defaultValue="0"
                placeholder="المبلغ إن وجد"
              />
              <input
                name="description"
                required
                minLength={3}
                maxLength={500}
                placeholder="سبب الحركة وتفاصيلها"
              />
              <button disabled={busy === "movement"}>إضافة حركة</button>
            </form>
          )}
          <div className="employee-related-list">
            {movements.map((item) => (
              <article key={item.id}>
                <div>
                  <strong>
                    {movementLabels[item.movementType] || item.movementType}
                  </strong>
                  <small>
                    {item.effectiveDate} ·{" "}
                    {statusLabels[item.status] || item.status}
                  </small>
                </div>
                <span>{item.description}</span>
                <b>{item.amountHalalas ? money(item.amountHalalas) : "—"}</b>
              </article>
            ))}
            {!movements.length && <p>لا توجد حركات مسجلة لهذا الموظف.</p>}
          </div>
        </div>
      )}
      {tab === "leaves" && (
        <div className="employee-profile-section">
          <div className="employee-leave-head">
            <div>
              <span>الرصيد الحالي</span>
              <strong>{leaveBalanceDays} يوم</strong>
              <small>
                يُحدّث بعد اعتماد الإجازات المستحقة للخصم من الرصيد.
              </small>
            </div>
            <div>
              <span>طلبات معلّقة</span>
              <strong>
                {leaves.filter((item) => item.status === "pending").length}
              </strong>
              <small>تظهر أيضًا في مركز الموافقات العام.</small>
            </div>
            <div>
              <span>إجازات معتمدة</span>
              <strong>
                {leaves.filter((item) => item.status === "approved").length}
              </strong>
              <small>محفوظة في السجل الوظيفي.</small>
            </div>
          </div>
          {canWrite && (
            <form
              className="employee-inline-form employee-leave-form"
              onSubmit={(event) => submit(event, "leave-request")}
            >
              <select name="leaveType">
                <option value="annual">سنوية</option>
                <option value="sick">مرضية</option>
                <option value="unpaid">بدون راتب</option>
                <option value="emergency">اضطرارية</option>
              </select>
              <input name="startDate" type="date" required />
              <input name="endDate" type="date" required />
              <input
                name="reason"
                required
                minLength={3}
                placeholder="سبب طلب الإجازة"
              />
              <button disabled={busy === "leave-request"}>
                إرسال طلب الإجازة للاعتماد
              </button>
            </form>
          )}
          <div className="employee-related-list employee-leave-history">
            {leaves.map((item) => (
              <article
                key={`leave-${item.id}`}
                className={`leave-${item.status}`}
              >
                <div>
                  <strong>إجازة {item.leaveType}</strong>
                  <small>
                    {item.startDate} — {item.endDate} · {item.days} أيام
                  </small>
                </div>
                <span>{item.reason || "دون ملاحظات"}</span>
                <b>{statusLabels[item.status] || item.status}</b>
              </article>
            ))}
            {!leaves.length && (
              <p>لا توجد طلبات أو إجازات سابقة لهذا الموظف.</p>
            )}
          </div>
        </div>
      )}
      {tab === "attendance" && (
        <div className="employee-profile-section">
          {canWrite && (
            <form
              className="employee-inline-form"
              onSubmit={(event) => submit(event, "attendance")}
            >
              <input name="attendanceDate" type="date" required />
              <select name="status">
                <option value="present">حاضر</option>
                <option value="absent">غائب</option>
                <option value="remote">عمل عن بعد</option>
                <option value="leave">إجازة</option>
                <option value="sick">مرضي</option>
              </select>
              <input name="checkInAt" type="time" />
              <input name="checkOutAt" type="time" />
              <input
                name="lateMinutes"
                type="number"
                min="0"
                placeholder="دقائق التأخير"
              />
              <input
                name="overtimeMinutes"
                type="number"
                min="0"
                placeholder="دقائق إضافية"
              />
              <button disabled={busy === "attendance"}>حفظ الحضور</button>
            </form>
          )}
          <div className="employee-related-list">
            {attendance.map((item) => (
              <article key={item.id}>
                <div>
                  <strong>{item.attendanceDate}</strong>
                  <small>{statusLabels[item.status] || item.status}</small>
                </div>
                <span>
                  تأخير {item.lateMinutes} دقيقة · إضافي {item.overtimeMinutes}{" "}
                  دقيقة
                </span>
              </article>
            ))}
            {!attendance.length && <p>لا توجد سجلات حضور لهذا الموظف.</p>}
          </div>
        </div>
      )}
      {tab === "documents" && (
        <div className="employee-profile-section">
          {canWrite && (
            <form
              className="employee-inline-form"
              encType="multipart/form-data"
              onSubmit={uploadDocument}
            >
              <select name="documentType">
                <option value="employment_contract">عقد العمل</option>
                <option value="national_id">الهوية / الإقامة</option>
                <option value="insurance">التأمين الطبي</option>
                <option value="certificate">شهادة مهنية</option>
              </select>
              <input name="documentNumber" placeholder="رقم الوثيقة" />
              <input name="expiryDate" type="date" />
              <input name="notes" placeholder="اسم الوثيقة أو الملاحظات" />
              <input
                name="file"
                type="file"
                accept="application/pdf,image/png,image/jpeg"
                required
              />
              <button disabled={busy === "document"}>رفع الوثيقة وحفظها</button>
            </form>
          )}
          <div className="employee-related-list">
            {documents.map((item) => (
              <article key={item.id}>
                <div>
                  <strong>{item.notes || item.documentType}</strong>
                  <small>
                    {item.documentNumber || "دون رقم"}
                    {item.expiryDate ? ` · ينتهي ${item.expiryDate}` : ""}
                  </small>
                </div>
                <span>
                  {item.fileName || statusLabels[item.status] || item.status}
                </span>
                {item.storageKey && (
                  <a
                    href={`/api/portal/employees/documents/${item.id}?inline=1`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    معاينة
                  </a>
                )}
              </article>
            ))}
            {!documents.length && <p>لا توجد وثائق مرتبطة بهذا الموظف.</p>}
          </div>
        </div>
      )}
      {tab === "performance" && (
        <div className="employee-profile-section">
          <div className="employee-related-list">
            {reviews.map((item) => (
              <article key={`review-${item.id}`}>
                <div>
                  <strong>تقييم الأداء</strong>
                  <small>
                    {item.periodStart} — {item.periodEnd}
                  </small>
                </div>
                <span>{statusLabels[item.status] || item.status}</span>
                <b>{item.overallScore}%</b>
                {item.acknowledgedAt && (
                  <small>
                    تم الإقرار بالاطلاع في {item.acknowledgedAt.slice(0, 10)}
                  </small>
                )}
                {item.appealText && <small>التظلم: {item.appealText}</small>}
                {!canWrite &&
                  item.status === "final" &&
                  !item.acknowledgedAt && (
                    <form
                      onSubmit={(event) =>
                        void performanceAction(
                          event,
                          "acknowledge_performance_review",
                          item.id,
                        )
                      }
                    >
                      <input
                        name="comment"
                        placeholder="تعليق الموظف عند الاطلاع (اختياري)"
                      />
                      <button disabled={busy === `performance-${item.id}`}>
                        إقرار بالاطلاع
                      </button>
                    </form>
                  )}
                {!canWrite && item.status === "final" && (
                  <form
                    onSubmit={(event) =>
                      void performanceAction(
                        event,
                        "appeal_performance_review",
                        item.id,
                      )
                    }
                  >
                    <textarea
                      name="comment"
                      minLength={20}
                      required
                      placeholder="أسباب التظلم مدعومة بالتفاصيل"
                    />
                    <button disabled={busy === `performance-${item.id}`}>
                      تقديم تظلم
                    </button>
                  </form>
                )}
                {canWrite && item.status === "appealed" && (
                  <form
                    onSubmit={(event) =>
                      void performanceAction(
                        event,
                        "resolve_performance_appeal",
                        item.id,
                      )
                    }
                  >
                    <textarea
                      name="comment"
                      minLength={20}
                      required
                      placeholder="قرار البت في التظلم وأسبابه"
                    />
                    <button disabled={busy === `performance-${item.id}`}>
                      اعتماد قرار التظلم
                    </button>
                  </form>
                )}
              </article>
            ))}
            {proposals.map((item) => (
              <article key={`proposal-${item.id}`}>
                <div>
                  <strong>نقص الدوام {item.periodMonth}</strong>
                  <small>{statusLabels[item.status] || item.status}</small>
                </div>
                <span>{item.missingMinutes} دقيقة ناقصة</span>
                <b>{money(item.cappedAmountHalalas)}</b>
              </article>
            ))}
            {!reviews.length && !proposals.length && (
              <p>لا توجد تقييمات أو مقترحات خصم لهذا الموظف.</p>
            )}
          </div>
        </div>
      )}
      {tab === "termination" && (
        <div className="employee-profile-section">
          {canWrite && (
            <form
              className="employee-inline-form"
              onSubmit={(event) => {
                event.preventDefault();
                const form = event.currentTarget;
                void terminationAction(
                  "POST",
                  { employeeId, ...Object.fromEntries(new FormData(form)) },
                  form,
                );
              }}
            >
              <input name="requestedLastDay" type="date" required />
              <input
                name="serviceAward"
                type="number"
                min="0"
                step="0.01"
                defaultValue="0"
                placeholder="مكافأة نهاية الخدمة"
              />
              <input
                name="leaveCompensation"
                type="number"
                min="0"
                step="0.01"
                defaultValue="0"
                placeholder="بدل رصيد الإجازات"
              />
              <input
                name="salaryDue"
                type="number"
                min="0"
                step="0.01"
                defaultValue="0"
                placeholder="الراتب المستحق"
              />
              <input
                name="deductions"
                type="number"
                min="0"
                step="0.01"
                defaultValue="0"
                placeholder="السلف والخصومات"
              />
              <input
                name="reason"
                required
                minLength={5}
                placeholder="سبب إنهاء الخدمة"
              />
              <button disabled={busy === "termination"}>
                إرسال طلب إنهاء الخدمة
              </button>
            </form>
          )}
          <div className="employee-related-list">
            {terminations
              .filter((item) => item.employeeId === employeeId)
              .map((item) => (
                <article key={item.id}>
                  <div>
                    <strong>آخر يوم: {item.requestedLastDay}</strong>
                    <small>
                      {item.reason} · {item.status}
                    </small>
                  </div>
                  <span>
                    التسوية الصافية {money(item.netSettlementHalalas)}
                  </span>
                  {canWrite && item.status === "pending_approval" && (
                    <button
                      onClick={() =>
                        void terminationAction("PATCH", {
                          action: "approve",
                          terminationId: item.id,
                        })
                      }
                    >
                      اعتماد وإنشاء قيد التسوية
                    </button>
                  )}
                  {canWrite && item.status === "clearance" && (
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        void terminationAction("PATCH", {
                          action: "complete-clearance",
                          terminationId: item.id,
                          ...Object.fromEntries(
                            new FormData(event.currentTarget),
                          ),
                        });
                      }}
                    >
                      <label>
                        <input
                          name="assets"
                          type="checkbox"
                          value="1"
                          required
                        />
                        تسليم العهد
                      </label>
                      <label>
                        <input
                          name="finance"
                          type="checkbox"
                          value="1"
                          required
                        />
                        التسوية المالية
                      </label>
                      <label>
                        <input
                          name="documents"
                          type="checkbox"
                          value="1"
                          required
                        />
                        تسليم الوثائق
                      </label>
                      <label>
                        <input
                          name="systems"
                          type="checkbox"
                          value="1"
                          required
                        />
                        إيقاف الأنظمة
                      </label>
                      <button>إكمال إخلاء الطرف وإنهاء الخدمة</button>
                    </form>
                  )}
                </article>
              ))}
          </div>
        </div>
      )}
    </section>
  );
}
