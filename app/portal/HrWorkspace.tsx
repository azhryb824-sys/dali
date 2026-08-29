"use client";

import { readApiJson } from "@/lib/client-api";
import { useDesktopLiveRefresh } from "@/lib/use-desktop-live-refresh";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type Employee = {
  id: number;
  employeeNumber: string;
  fullName: string;
  jobTitle: string;
  status: string;
  department: string;
  email: string | null;
  portalUserEmail: string | null;
  managerId: number | null;
  workLocation: string | null;
  employmentType: string;
  contractType: string;
  gosiNumber: string | null;
  sponsorshipType: string;
  sponsorName: string | null;
  iqamaExpiry: string | null;
  contractEndDate: string | null;
  workPermitExpiry: string | null;
  bankName: string | null;
  iban: string | null;
  baseSalaryHalalas: number;
  housingAllowanceHalalas: number;
  transportAllowanceHalalas: number;
  otherAllowanceHalalas: number;
  leaveBalanceDays: number;
};
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
  paymentDate: string;
  status: string;
  totalGrossHalalas: number;
  totalDeductionsHalalas: number;
  totalNetHalalas: number;
  createdBy: string;
  approvedBy: string | null;
  journalEntryId: number | null;
  paymentJournalEntryId: number | null;
  bankAccountId: number | null;
  payrollType: string;
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
  employeeNameSnapshot: string | null;
  ibanSnapshot: string | null;
  paymentStatus: string;
  paidAmountHalalas: number;
  pendingPaymentAmountHalalas: number;
  paymentReference: string | null;
  paymentFailureReason: string | null;
};
type Bank = { id: number; bankName: string; accountName: string; iban: string };
type HrDocument = {
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
type PortalUser = { email: string; displayName: string; status: string };
type ProfileChange = {
  id: number;
  employeeId: number;
  changeType: string;
  effectiveDate: string;
  reason: string;
  status: string;
  requestedBy: string;
};
type HrData = {
  employees: Employee[];
  movements: Movement[];
  runs: PayrollRun[];
  items: PayrollItem[];
  documents: HrDocument[];
  leaves: Leave[];
  attendance: Attendance[];
  users: PortalUser[];
  banks: Bank[];
  profileChanges: ProfileChange[];
};

const money = (halalas: number) =>
  new Intl.NumberFormat("ar-SA", { style: "currency", currency: "SAR" }).format(
    halalas / 100,
  );
const labels: Record<string, string> = {
  draft: "مسودة",
  approved: "معتمد",
  processing: "قيد الصرف",
  paid: "مدفوع",
  cancelled: "ملغى",
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
const isCurrentEmployee = (employee: Employee) =>
  !["ended", "suspended"].includes(employee.status.trim().toLowerCase());

export default function HrWorkspace({
  canWrite,
  isAdmin,
  generalOnly = false,
}: {
  canWrite: boolean;
  isAdmin: boolean;
  generalOnly?: boolean;
}) {
  const [data, setData] = useState<HrData>({
    employees: [],
    movements: [],
    runs: [],
    items: [],
    documents: [],
    leaves: [],
    attendance: [],
    users: [],
    banks: [],
    profileChanges: [],
  });
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    const response = await fetch("/api/portal/hr", { cache: "no-store" });
    const result = (await readApiJson(response)) as HrData & { error?: string };
    if (!response.ok)
      throw new Error(result.error || "تعذّر تحميل الموارد البشرية");
    setData(result);
  }, []);
  useDesktopLiveRefresh(load);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/portal/hr", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const result = (await readApiJson(response)) as HrData & {
          error?: string;
        };
        if (!response.ok)
          throw new Error(result.error || "تعذّر تحميل الموارد البشرية");
        setData(result);
      })
      .catch((error) => {
        if (error instanceof Error && error.name !== "AbortError")
          setNotice(error.message);
      });
    return () => controller.abort();
  }, []);

  const activeStaff = data.employees.filter(isCurrentEmployee);
  const totalMonthly = useMemo(
    () =>
      activeStaff.reduce(
        (sum, item) =>
          sum +
          item.baseSalaryHalalas +
          item.housingAllowanceHalalas +
          item.transportAllowanceHalalas +
          item.otherAllowanceHalalas,
        0,
      ),
    [activeStaff],
  );

  async function action(
    method: "POST" | "PATCH",
    payload: Record<string, unknown>,
    key: string,
  ) {
    setBusy(key);
    setNotice("");
    try {
      const response = await fetch("/api/portal/hr", {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await readApiJson(response)) as { error?: string };
      if (!response.ok) throw new Error(result.error || "تعذّر تنفيذ العملية");
      await load();
      setNotice("تم حفظ العملية وتوثيقها في سجل التدقيق.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "تعذّر تنفيذ العملية");
    } finally {
      setBusy("");
    }
  }

  function submitFinance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fd = new FormData(form);
    void action(
      "POST",
      {
        action: "employee-finance",
        employeeId: fd.get("employeeId"),
        baseSalary: fd.get("baseSalary"),
        housingAllowance: fd.get("housingAllowance"),
        transportAllowance: fd.get("transportAllowance"),
        otherAllowance: fd.get("otherAllowance"),
        bankName: fd.get("bankName"),
        iban: fd.get("iban"),
        effectiveDate: fd.get("effectiveDate"),
        reason: fd.get("reason"),
      },
      "finance",
    ).then(() => form.reset());
  }
  function submitMovement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fd = new FormData(form);
    void action(
      "POST",
      {
        action: "movement",
        employeeId: fd.get("employeeId"),
        movementType: fd.get("movementType"),
        effectiveDate: fd.get("effectiveDate"),
        amount: fd.get("amount"),
        description: fd.get("description"),
      },
      "movement",
    ).then(() => form.reset());
  }
  function submitPayroll(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fd = new FormData(form);
    void action(
      "POST",
      {
        action: "generate-payroll",
        periodMonth: fd.get("periodMonth"),
        paymentDate: fd.get("paymentDate"),
        bankAccountId: fd.get("bankAccountId"),
        payrollType: fd.get("payrollType"),
        gosiEmployeeBps: fd.get("gosiEmployeeBps"),
        gosiEmployerBps: fd.get("gosiEmployerBps"),
      },
      "payroll",
    ).then(() => form.reset());
  }
  function submitExtended(
    event: FormEvent<HTMLFormElement>,
    actionName: string,
  ) {
    event.preventDefault();
    const form = event.currentTarget;
    const payload = Object.fromEntries(new FormData(form));
    void action("POST", { action: actionName, ...payload }, actionName).then(
      () => form.reset(),
    );
  }
  async function uploadEmployeeDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy("document");
    setNotice("");
    try {
      const response = await fetch("/api/portal/employees/documents", {
        method: "POST",
        body: new FormData(form),
      });
      const result = (await readApiJson(response)) as { error?: string };
      if (!response.ok) throw new Error(result.error || "تعذر رفع الوثيقة");
      form.reset();
      await load();
      setNotice("تم رفع الوثيقة الفعلية وربطها بالموظف.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "تعذر رفع الوثيقة");
    } finally {
      setBusy("");
    }
  }
  function payPayrollItem(run: PayrollRun, item: PayrollItem) {
    const remaining = (item.netPayHalalas - item.paidAmountHalalas) / 100;
    const amountValue = window.prompt("مبلغ التحويل", String(remaining));
    if (amountValue === null) return;
    const reference = window.prompt(
      "مرجع التحويل البنكي",
      item.paymentReference || "",
    );
    if (reference === null) return;
    void action(
      "PATCH",
      {
        action: item.paymentStatus === "failed" ? "retry-item" : "pay-item",
        runId: run.id,
        itemId: item.id,
        amount: amountValue,
        reference,
      },
      `item-${item.id}`,
    );
  }
  const [today] = useState(() => new Date().toISOString().slice(0, 10));
  const [thirtyDaysFromToday] = useState(() =>
    new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
  );
  const expiringDocuments = data.documents.filter(
    (item) =>
      item.expiryDate &&
      item.expiryDate <= thirtyDaysFromToday &&
      item.expiryDate >= today,
  );
  const pendingLeaves = data.leaves.filter((item) => item.status === "pending");
  const pendingProfileChanges = (data.profileChanges || []).filter(
    (item) => item.status === "pending",
  );
  const todayAttendance = data.attendance.filter(
    (item) => item.attendanceDate === today,
  );

  return (
    <section className={`hr-workspace ${generalOnly ? "hr-general-only" : ""}`}>
      <header className="hr-heading">
        <div>
          <span>الموارد البشرية والرواتب</span>
          <h2>الملفات الوظيفية ومسير الرواتب</h2>
          <p>
            الرواتب لا تُصرف مباشرة؛ تمر بالإنشاء والاعتماد وقيد الاستحقاق وقيد
            الصرف ثم الإغلاق.
          </p>
        </div>
        <strong>
          {money(totalMonthly)}
          <small>التكلفة الشهرية الأساسية</small>
        </strong>
      </header>
      {notice && (
        <div className="operations-notice" role="status">
          {notice}
        </div>
      )}
      <div className="hr-metrics">
        <article>
          <span>على رأس العمل</span>
          <b>{activeStaff.length}</b>
          <small>موظف نشط</small>
        </article>
        <article>
          <span>مرتبطون بحسابات النظام</span>
          <b>{activeStaff.filter((item) => item.portalUserEmail).length}</b>
          <small>هوية وظيفية موحّدة</small>
        </article>
        <article>
          <span>طلبات تنتظر الاعتماد</span>
          <b>{pendingLeaves.length}</b>
          <small>إجازات معلّقة</small>
        </article>
        <article>
          <span>وثائق تنتهي خلال 30 يوماً</span>
          <b>{expiringDocuments.length}</b>
          <small>تحتاج متابعة</small>
        </article>
        <article>
          <span>حضور اليوم</span>
          <b>
            {todayAttendance.filter((item) => item.status === "present").length}
            /{activeStaff.length}
          </b>
          <small>سجل يومي</small>
        </article>
        <article>
          <span>ملفات بنكية مكتملة</span>
          <b>{activeStaff.filter((item) => item.iban).length}</b>
          <small>جاهزة للتحويل</small>
        </article>
      </div>
      {canWrite && (
        <div className="hr-forms">
          <details>
            <summary>الملف المالي للموظف</summary>
            <form onSubmit={submitFinance}>
              <select name="employeeId" required defaultValue="">
                <option value="" disabled>
                  اختر الموظف
                </option>
                {activeStaff.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.employeeNumber} · {item.fullName}
                  </option>
                ))}
              </select>
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
              <input name="bankName" maxLength={120} placeholder="اسم البنك" />
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
                placeholder="سبب طلب التعديل المالي"
              />
              <button disabled={busy === "finance"}>إرسال طلب التعديل</button>
            </form>
          </details>
          <details>
            <summary>إضافة حركة وظيفية أو مالية</summary>
            <form onSubmit={submitMovement}>
              <select name="employeeId" required defaultValue="">
                <option value="" disabled>
                  اختر الموظف
                </option>
                {activeStaff.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.fullName}
                  </option>
                ))}
              </select>
              <select name="movementType" required defaultValue="">
                <option value="" disabled>
                  نوع الحركة
                </option>
                {[
                  "bonus",
                  "advance",
                  "deduction",
                  "allowance",
                  "salary_adjustment",
                  "leave",
                  "return_from_leave",
                  "suspension",
                  "termination",
                  "note",
                ].map((item) => (
                  <option value={item} key={item}>
                    {labels[item]}
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
                className="wide"
                name="description"
                required
                minLength={3}
                maxLength={500}
                placeholder="سبب الحركة وتفاصيلها"
              />
              <button disabled={busy === "movement"}>حفظ الحركة</button>
            </form>
          </details>
          <details>
            <summary>إنشاء مسير رواتب شهري</summary>
            <form onSubmit={submitPayroll}>
              <input name="periodMonth" type="month" required />
              <input name="paymentDate" type="date" required />
              <select name="bankAccountId" required defaultValue="">
                <option value="" disabled>
                  اختر حساب الصرف البنكي الفعلي
                </option>
                {data.banks.map((bank) => (
                  <option key={bank.id} value={bank.id}>
                    {bank.bankName} · {bank.accountName} · {bank.iban}
                  </option>
                ))}
              </select>
              <select name="payrollType" defaultValue="monthly">
                <option value="monthly">راتب شهري</option>
                <option value="bonus">مسير مكافآت</option>
                <option value="leave_compensation">بدل إجازة</option>
                <option value="retroactive">فروقات رجعية</option>
              </select>
              <input
                name="gosiEmployeeBps"
                type="number"
                min="0"
                max="10000"
                defaultValue="0"
                placeholder="نسبة الموظف بالتأمينات (نقطة أساس)"
              />
              <input
                name="gosiEmployerBps"
                type="number"
                min="0"
                max="10000"
                defaultValue="0"
                placeholder="نسبة المنشأة بالتأمينات (نقطة أساس)"
              />
              <button disabled={busy === "payroll"}>إنشاء المسير كمسودة</button>
            </form>
          </details>
          <details>
            <summary>ربط الملف الوظيفي والمستخدم</summary>
            <form
              onSubmit={(event) => submitExtended(event, "employee-profile")}
            >
              <select name="employeeId" required defaultValue="">
                <option value="" disabled>
                  اختر الموظف
                </option>
                {activeStaff.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.fullName}
                  </option>
                ))}
              </select>
              <select name="portalUserEmail" defaultValue="">
                <option value="">بدون حساب مستخدم</option>
                {data.users
                  .filter((user) => user.status === "active")
                  .map((user) => (
                    <option key={user.email} value={user.email}>
                      {user.displayName} · {user.email}
                    </option>
                  ))}
              </select>
              <select name="managerId" defaultValue="">
                <option value="">بدون مدير مباشر</option>
                {activeStaff.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.fullName}
                  </option>
                ))}
              </select>
              <input name="workLocation" placeholder="موقع العمل" />
              <select name="employmentType">
                <option value="full_time">دوام كامل</option>
                <option value="part_time">دوام جزئي</option>
                <option value="temporary">مؤقت</option>
              </select>
              <select name="contractType">
                <option value="fixed_term">محدد المدة</option>
                <option value="indefinite">غير محدد المدة</option>
              </select>
              <input name="gosiNumber" placeholder="رقم التأمينات" />
              <button>حفظ وربط الملف</button>
            </form>
          </details>
          <details>
            <summary>ترقية أو تغيير تنظيمي بتاريخ نفاذ</summary>
            <form
              onSubmit={(event) =>
                submitExtended(event, "employee-organizational-change")
              }
            >
              <select name="employeeId" required defaultValue="">
                <option value="" disabled>
                  اختر الموظف
                </option>
                {activeStaff.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.fullName}
                  </option>
                ))}
              </select>
              <input
                name="jobTitle"
                required
                placeholder="المسمى الوظيفي الجديد"
              />
              <input name="department" required placeholder="القسم الجديد" />
              <select name="managerId" defaultValue="">
                <option value="">بدون مدير مباشر</option>
                {activeStaff.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.fullName}
                  </option>
                ))}
              </select>
              <input name="effectiveDate" type="date" required />
              <textarea
                name="reason"
                minLength={10}
                required
                placeholder="سبب الترقية أو التغيير التنظيمي"
              />
              <button>إرسال طلب التغيير</button>
            </form>
          </details>
          {pendingProfileChanges.length > 0 && (
            <details>
              <summary>
                اعتماد التغييرات الحساسة ({pendingProfileChanges.length})
              </summary>
              <div className="employee-related-list">
                {pendingProfileChanges.map((change) => (
                  <article key={change.id}>
                    <div>
                      <strong>
                        {change.changeType === "financial"
                          ? "تعديل مالي"
                          : "تغيير تنظيمي"}{" "}
                        ·{" "}
                        {
                          data.employees.find(
                            (item) => item.id === change.employeeId,
                          )?.fullName
                        }
                      </strong>
                      <small>
                        النفاذ {change.effectiveDate} · {change.reason}
                      </small>
                    </div>
                    <form
                      onSubmit={(event) =>
                        submitExtended(
                          event,
                          change.changeType === "financial"
                            ? "employee-finance-change-decision"
                            : "employee-organizational-change-decision",
                        )
                      }
                    >
                      <input type="hidden" name="changeId" value={change.id} />
                      <select name="decision" required defaultValue="">
                        <option value="" disabled>
                          القرار
                        </option>
                        <option value="approved">اعتماد</option>
                        <option value="rejected">رفض</option>
                      </select>
                      <textarea
                        name="decisionReason"
                        minLength={10}
                        required
                        placeholder="سبب القرار"
                      />
                      <button>حفظ القرار</button>
                    </form>
                  </article>
                ))}
              </div>
            </details>
          )}
          <details>
            <summary>طلب إجازة</summary>
            <form onSubmit={(event) => submitExtended(event, "leave-request")}>
              <select name="employeeId" required>
                {activeStaff.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.fullName}
                  </option>
                ))}
              </select>
              <select name="leaveType">
                <option value="annual">سنوية</option>
                <option value="sick">مرضية</option>
                <option value="unpaid">بدون راتب</option>
                <option value="emergency">اضطرارية</option>
              </select>
              <input name="startDate" type="date" required />
              <input name="endDate" type="date" required />
              <input className="wide" name="reason" placeholder="سبب الطلب" />
              <button>إرسال للاعتماد</button>
            </form>
          </details>
          <details>
            <summary>وثيقة موظف</summary>
            <form
              encType="multipart/form-data"
              onSubmit={uploadEmployeeDocument}
            >
              <select name="employeeId" required>
                {activeStaff.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.fullName}
                  </option>
                ))}
              </select>
              <select name="documentType">
                <option value="employment_contract">عقد العمل</option>
                <option value="national_id">الهوية / الإقامة</option>
                <option value="insurance">التأمين الطبي</option>
                <option value="certificate">شهادة مهنية</option>
              </select>
              <input name="documentNumber" placeholder="رقم الوثيقة" />
              <input name="expiryDate" type="date" />
              <input className="wide" name="notes" placeholder="ملاحظات" />
              <input
                name="file"
                type="file"
                accept="application/pdf,image/png,image/jpeg"
                required
              />
              <button disabled={busy === "document"}>رفع الوثيقة وحفظها</button>
            </form>
          </details>
          <details>
            <summary>الحضور والانصراف</summary>
            <form onSubmit={(event) => submitExtended(event, "attendance")}>
              <select name="employeeId" required>
                {activeStaff.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.fullName}
                  </option>
                ))}
              </select>
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
              <button>حفظ سجل اليوم</button>
            </form>
          </details>
        </div>
      )}
      <section className="hr-people-grid">
        <article className="panel">
          <div className="panel-head">
            <div>
              <h2>دليل الموظفين الموحّد</h2>
              <p>
                الهيكل الإداري والحساب والكفالة والاستحقاقات والبيانات المالية
                في ملف واحد
              </p>
            </div>
          </div>
          {data.employees.map((item) => (
            <div className="employee-profile-row" key={item.id}>
              <b>
                {item.fullName}
                <small>
                  {item.employeeNumber} · {item.jobTitle}
                </small>
              </b>
              <span>
                {item.sponsorshipType === "dali"
                  ? "على كفالة دالي"
                  : item.sponsorName || "كفالة أخرى"}
                <small>الإقامة: {item.iqamaExpiry || "غير محدد"}</small>
              </span>
              <span>
                {item.portalUserEmail ? "مرتبط بالنظام" : "غير مرتبط"}
                <small>
                  {item.sponsorshipType === "dali"
                    ? `العقد ${item.contractEndDate || "—"} · الرخصة ${item.workPermitExpiry || "—"}`
                    : item.employmentType}
                </small>
              </span>
              <strong>
                {money(
                  item.baseSalaryHalalas +
                    item.housingAllowanceHalalas +
                    item.transportAllowanceHalalas +
                    item.otherAllowanceHalalas,
                )}
              </strong>
            </div>
          ))}
        </article>
        <article className="panel">
          <div className="panel-head">
            <div>
              <h2>مركز الموافقات والتنبيهات</h2>
              <p>لا تُخصم الإجازة إلا بعد الاعتماد</p>
            </div>
          </div>
          {pendingLeaves.map((leave) => {
            const employee = data.employees.find(
              (item) => item.id === leave.employeeId,
            );
            return (
              <div className="leave-approval" key={leave.id}>
                <b>
                  {employee?.fullName}
                  <small>
                    {leave.startDate} — {leave.endDate} · {leave.days} أيام
                  </small>
                </b>
                {canWrite && (
                  <span>
                    <button
                      onClick={() =>
                        void action(
                          "PATCH",
                          {
                            action: "leave-decision",
                            leaveId: leave.id,
                            decision: "approved",
                          },
                          `leave-${leave.id}`,
                        )
                      }
                    >
                      اعتماد
                    </button>
                    <button
                      className="danger"
                      onClick={() =>
                        void action(
                          "PATCH",
                          {
                            action: "leave-decision",
                            leaveId: leave.id,
                            decision: "rejected",
                          },
                          `leave-${leave.id}`,
                        )
                      }
                    >
                      رفض
                    </button>
                  </span>
                )}
              </div>
            );
          })}
          {!pendingLeaves.length && (
            <p className="empty-operational">لا توجد طلبات معلّقة.</p>
          )}
        </article>
      </section>
      <section className="panel employee-document-library">
        <div className="panel-head">
          <div>
            <h2>مرفقات الملفات الوظيفية</h2>
            <p>
              صورة الإقامة وعقد العمل والصورة الشخصية محفوظة لكل موظف ومحمية
              بالصلاحيات.
            </p>
          </div>
        </div>
        <div className="feature-list">
          {data.documents
            .filter((document) => document.storageKey)
            .map((document) => {
              const employee = data.employees.find(
                (item) => item.id === document.employeeId,
              );
              return (
                <article key={document.id}>
                  <div>
                    <strong>
                      {document.notes || document.documentType} —{" "}
                      {employee?.fullName || `موظف ${document.employeeId}`}
                    </strong>
                    <small>
                      {document.fileName || "ملف محفوظ"}
                      {document.expiryDate
                        ? ` · ينتهي ${document.expiryDate}`
                        : ""}
                    </small>
                  </div>
                  <a
                    href={`/api/portal/employees/documents/${document.id}?inline=1`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    معاينة الملف
                  </a>
                </article>
              );
            })}
          {!data.documents.some((document) => document.storageKey) && (
            <p className="empty-operational">لا توجد مرفقات محفوظة بعد.</p>
          )}
        </div>
      </section>
      <div className="hr-grid">
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>مسيرات الرواتب</h2>
              <p>فصل واضح بين الاستحقاق والصرف</p>
            </div>
          </div>
          <div className="hr-table">
            <table>
              <thead>
                <tr>
                  <th>المسير</th>
                  <th>الفترة</th>
                  <th>الإجمالي</th>
                  <th>الخصومات</th>
                  <th>الصافي</th>
                  <th>الحالة</th>
                  <th>الإجراء</th>
                </tr>
              </thead>
              <tbody>
                {data.runs.map((run) => (
                  <tr key={run.id}>
                    <td dir="ltr">
                      {run.runNumber}
                      <a href={`/api/portal/hr/payroll-runs/${run.id}/wps`}>
                        ملف حماية الأجور
                      </a>
                    </td>
                    <td>{run.periodMonth}</td>
                    <td>{money(run.totalGrossHalalas)}</td>
                    <td>{money(run.totalDeductionsHalalas)}</td>
                    <td>
                      <strong>{money(run.totalNetHalalas)}</strong>
                    </td>
                    <td>
                      <span className={`workflow-status ${run.status}`}>
                        {labels[run.status] || run.status}
                      </span>
                    </td>
                    <td>
                      {canWrite && run.status === "draft" ? (
                        <button
                          disabled={busy === `approve-${run.id}`}
                          onClick={() =>
                            void action(
                              "PATCH",
                              { action: "approve", runId: run.id },
                              `approve-${run.id}`,
                            )
                          }
                        >
                          اعتماد وإنشاء قيد الاستحقاق
                        </button>
                      ) : canWrite && run.status === "approved" ? (
                        <button
                          disabled={busy === `payment-${run.id}`}
                          onClick={() =>
                            void action(
                              "PATCH",
                              { action: "start-payment", runId: run.id },
                              `payment-${run.id}`,
                            )
                          }
                        >
                          بدء الصرف
                        </button>
                      ) : isAdmin && run.status === "processing" ? (
                        <button
                          disabled={busy === `paid-${run.id}`}
                          onClick={() =>
                            void action(
                              "PATCH",
                              { action: "mark-paid", runId: run.id },
                              `paid-${run.id}`,
                            )
                          }
                        >
                          إغلاق كمدفوع
                        </button>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!data.runs.length && (
              <p className="empty-operational">لم يُنشأ مسير رواتب بعد.</p>
            )}
          </div>
          {data.runs
            .filter((run) => run.status === "processing")
            .map((run) => (
              <details
                key={`payments-${run.id}`}
                className="payroll-payment-details"
              >
                <summary>تحويلات {run.runNumber}</summary>
                {data.items
                  .filter((item) => item.payrollRunId === run.id)
                  .map((item) => (
                    <article key={item.id}>
                      <div>
                        <b>
                          {item.employeeNameSnapshot ||
                            data.employees.find(
                              (employee) => employee.id === item.employeeId,
                            )?.fullName}
                        </b>
                        <small>
                          {item.ibanSnapshot || "لا يوجد آيبان محفوظ"} ·{" "}
                          {item.paymentReference || "دون مرجع"}
                        </small>
                      </div>
                      <span>
                        {money(item.paidAmountHalalas)} /{" "}
                        {money(item.netPayHalalas)} · {item.paymentStatus}
                      </span>
                      {canWrite && (
                        <div>
                          <button
                            disabled={busy === `item-${item.id}`}
                            onClick={() => payPayrollItem(run, item)}
                          >
                            تحويل / إعادة محاولة
                          </button>
                          {item.paymentStatus === "awaiting_post" && (
                            <button
                              onClick={() =>
                                void action(
                                  "PATCH",
                                  {
                                    action: "payment-item-result",
                                    runId: run.id,
                                    itemId: item.id,
                                    result: "paid",
                                  },
                                  `item-${item.id}`,
                                )
                              }
                            >
                              تأكيد بعد ترحيل القيد
                            </button>
                          )}
                          {!["paid", "excluded"].includes(
                            item.paymentStatus,
                          ) && (
                            <button
                              className="danger"
                              onClick={() => {
                                const reason = window.prompt(
                                  "سبب فشل التحويل أو الاستثناء",
                                );
                                if (reason)
                                  void action(
                                    "PATCH",
                                    {
                                      action: "payment-item-result",
                                      runId: run.id,
                                      itemId: item.id,
                                      result: "failed",
                                      reason,
                                    },
                                    `item-${item.id}`,
                                  );
                              }}
                            >
                              تسجيل فشل
                            </button>
                          )}
                        </div>
                      )}
                    </article>
                  ))}
              </details>
            ))}
        </section>
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>أحدث الحركات</h2>
              <p>المكافآت والسلف والخصومات والإجازات</p>
            </div>
          </div>
          <div className="movement-list">
            {data.movements.slice(0, 12).map((movement) => {
              const employee = data.employees.find(
                (item) => item.id === movement.employeeId,
              );
              return (
                <article key={movement.id}>
                  <span>
                    {labels[movement.movementType] || movement.movementType}
                  </span>
                  <p>
                    <strong>
                      {employee?.fullName || `موظف ${movement.employeeId}`}
                    </strong>
                    <small>{movement.description}</small>
                  </p>
                  <b>
                    {movement.amountHalalas
                      ? money(movement.amountHalalas)
                      : movement.effectiveDate}
                  </b>
                </article>
              );
            })}
            {!data.movements.length && (
              <p className="empty-operational">لا توجد حركات وظيفية بعد.</p>
            )}
          </div>
        </section>
      </div>
    </section>
  );
}
