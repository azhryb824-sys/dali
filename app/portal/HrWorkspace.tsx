"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type Employee = { id: number; employeeNumber: string; fullName: string; jobTitle: string; status: string; bankName: string | null; iban: string | null; baseSalaryHalalas: number; housingAllowanceHalalas: number; transportAllowanceHalalas: number; otherAllowanceHalalas: number; leaveBalanceDays: number };
type Movement = { id: number; employeeId: number; movementType: string; effectiveDate: string; amountHalalas: number; description: string; status: string };
type PayrollRun = { id: number; runNumber: string; periodMonth: string; paymentDate: string; status: string; totalGrossHalalas: number; totalDeductionsHalalas: number; totalNetHalalas: number; createdBy: string; approvedBy: string | null; journalEntryId: number | null; paymentJournalEntryId: number | null };
type PayrollItem = { id: number; payrollRunId: number; employeeId: number; baseSalaryHalalas: number; allowancesHalalas: number; bonusHalalas: number; deductionsHalalas: number; netPayHalalas: number };
type HrData = { employees: Employee[]; movements: Movement[]; runs: PayrollRun[]; items: PayrollItem[] };

const money = (halalas: number) => new Intl.NumberFormat("ar-SA", { style: "currency", currency: "SAR" }).format(halalas / 100);
const labels: Record<string, string> = { draft: "مسودة", approved: "معتمد", processing: "قيد الصرف", paid: "مدفوع", cancelled: "ملغى", bonus: "مكافأة", advance: "سلفة", deduction: "خصم", allowance: "بدل", salary_adjustment: "تعديل راتب", leave: "إجازة", return_from_leave: "عودة من إجازة", suspension: "إيقاف", termination: "إنهاء خدمة", note: "ملاحظة" };

export default function HrWorkspace({ canWrite, isAdmin }: { canWrite: boolean; isAdmin: boolean }) {
  const [data, setData] = useState<HrData>({ employees: [], movements: [], runs: [], items: [] });
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    const response = await fetch("/api/portal/hr", { cache: "no-store" });
    const result = await response.json() as HrData & { error?: string };
    if (!response.ok) throw new Error(result.error || "تعذّر تحميل الموارد البشرية");
    setData(result);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/portal/hr", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const result = await response.json() as HrData & { error?: string };
        if (!response.ok) throw new Error(result.error || "تعذّر تحميل الموارد البشرية");
        setData(result);
      })
      .catch((error) => { if (error instanceof Error && error.name !== "AbortError") setNotice(error.message); });
    return () => controller.abort();
  }, []);

  const activeStaff = data.employees.filter((item) => item.status === "active");
  const currentRun = data.runs[0];
  const totalMonthly = useMemo(() => activeStaff.reduce((sum, item) => sum + item.baseSalaryHalalas + item.housingAllowanceHalalas + item.transportAllowanceHalalas + item.otherAllowanceHalalas, 0), [activeStaff]);

  async function action(method: "POST" | "PATCH", payload: Record<string, unknown>, key: string) {
    setBusy(key); setNotice("");
    try {
      const response = await fetch("/api/portal/hr", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "تعذّر تنفيذ العملية");
      await load(); setNotice("تم حفظ العملية وتوثيقها في سجل التدقيق.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "تعذّر تنفيذ العملية"); }
    finally { setBusy(""); }
  }

  function submitFinance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const fd = new FormData(form);
    void action("POST", { action: "employee-finance", employeeId: fd.get("employeeId"), baseSalary: fd.get("baseSalary"), housingAllowance: fd.get("housingAllowance"), transportAllowance: fd.get("transportAllowance"), otherAllowance: fd.get("otherAllowance"), bankName: fd.get("bankName"), iban: fd.get("iban") }, "finance").then(() => form.reset());
  }
  function submitMovement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const fd = new FormData(form);
    void action("POST", { action: "movement", employeeId: fd.get("employeeId"), movementType: fd.get("movementType"), effectiveDate: fd.get("effectiveDate"), amount: fd.get("amount"), description: fd.get("description") }, "movement").then(() => form.reset());
  }
  function submitPayroll(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const fd = new FormData(form);
    void action("POST", { action: "generate-payroll", periodMonth: fd.get("periodMonth"), paymentDate: fd.get("paymentDate") }, "payroll").then(() => form.reset());
  }

  return <section className="hr-workspace">
    <header className="hr-heading"><div><span>الموارد البشرية والرواتب</span><h2>الملفات الوظيفية ومسير الرواتب</h2><p>الرواتب لا تُصرف مباشرة؛ تمر بالإنشاء والاعتماد وقيد الاستحقاق وقيد الصرف ثم الإغلاق.</p></div><strong>{money(totalMonthly)}<small>التكلفة الشهرية الأساسية</small></strong></header>
    {notice && <div className="operations-notice" role="status">{notice}</div>}
    <div className="hr-metrics"><article><span>على رأس العمل</span><b>{activeStaff.length}</b><small>موظف نشط</small></article><article><span>ملفات بنكية مكتملة</span><b>{activeStaff.filter((item) => item.iban).length}</b><small>جاهزة للتحويل</small></article><article><span>مسيرات مدفوعة</span><b>{data.runs.filter((item) => item.status === "paid").length}</b><small>مغلقة محاسبيًا</small></article><article><span>آخر صافي مسير</span><b>{money(currentRun?.totalNetHalalas || 0)}</b><small>{currentRun ? currentRun.periodMonth : "لا يوجد مسير"}</small></article></div>
    {canWrite && <div className="hr-forms">
      <details><summary>الملف المالي للموظف</summary><form onSubmit={submitFinance}><select name="employeeId" required defaultValue=""><option value="" disabled>اختر الموظف</option>{activeStaff.map((item) => <option key={item.id} value={item.id}>{item.employeeNumber} · {item.fullName}</option>)}</select><input name="baseSalary" type="number" min="0" step="0.01" required placeholder="الراتب الأساسي"/><input name="housingAllowance" type="number" min="0" step="0.01" defaultValue="0" placeholder="بدل السكن"/><input name="transportAllowance" type="number" min="0" step="0.01" defaultValue="0" placeholder="بدل النقل"/><input name="otherAllowance" type="number" min="0" step="0.01" defaultValue="0" placeholder="بدلات أخرى"/><input name="bankName" maxLength={120} placeholder="اسم البنك"/><input name="iban" dir="ltr" pattern="SA[0-9 ]{22,28}" placeholder="SA00 0000 0000 0000 0000 0000"/><button disabled={busy === "finance"}>حفظ الملف المالي</button></form></details>
      <details><summary>إضافة حركة وظيفية أو مالية</summary><form onSubmit={submitMovement}><select name="employeeId" required defaultValue=""><option value="" disabled>اختر الموظف</option>{activeStaff.map((item) => <option key={item.id} value={item.id}>{item.fullName}</option>)}</select><select name="movementType" required defaultValue=""><option value="" disabled>نوع الحركة</option>{["bonus","advance","deduction","allowance","salary_adjustment","leave","return_from_leave","suspension","termination","note"].map((item) => <option value={item} key={item}>{labels[item]}</option>)}</select><input name="effectiveDate" type="date" required/><input name="amount" type="number" min="0" step="0.01" defaultValue="0" placeholder="المبلغ إن وجد"/><input className="wide" name="description" required minLength={3} maxLength={500} placeholder="سبب الحركة وتفاصيلها"/><button disabled={busy === "movement"}>حفظ الحركة</button></form></details>
      <details><summary>إنشاء مسير رواتب شهري</summary><form onSubmit={submitPayroll}><input name="periodMonth" type="month" required/><input name="paymentDate" type="date" required/><button disabled={busy === "payroll"}>إنشاء المسير كمسودة</button></form></details>
    </div>}
    <div className="hr-grid"><section className="panel"><div className="panel-head"><div><h2>مسيرات الرواتب</h2><p>فصل واضح بين الاستحقاق والصرف</p></div></div><div className="hr-table"><table><thead><tr><th>المسير</th><th>الفترة</th><th>الإجمالي</th><th>الخصومات</th><th>الصافي</th><th>الحالة</th><th>الإجراء</th></tr></thead><tbody>{data.runs.map((run) => <tr key={run.id}><td dir="ltr">{run.runNumber}</td><td>{run.periodMonth}</td><td>{money(run.totalGrossHalalas)}</td><td>{money(run.totalDeductionsHalalas)}</td><td><strong>{money(run.totalNetHalalas)}</strong></td><td><span className={`workflow-status ${run.status}`}>{labels[run.status] || run.status}</span></td><td>{canWrite && run.status === "draft" ? <button disabled={busy === `approve-${run.id}`} onClick={() => void action("PATCH", { action: "approve", runId: run.id }, `approve-${run.id}`)}>اعتماد وإنشاء قيد الاستحقاق</button> : canWrite && run.status === "approved" ? <button disabled={busy === `payment-${run.id}`} onClick={() => void action("PATCH", { action: "start-payment", runId: run.id }, `payment-${run.id}`)}>بدء الصرف</button> : isAdmin && run.status === "processing" ? <button disabled={busy === `paid-${run.id}`} onClick={() => void action("PATCH", { action: "mark-paid", runId: run.id }, `paid-${run.id}`)}>إغلاق كمدفوع</button> : "—"}</td></tr>)}</tbody></table>{!data.runs.length && <p className="empty-operational">لم يُنشأ مسير رواتب بعد.</p>}</div></section>
      <section className="panel"><div className="panel-head"><div><h2>أحدث الحركات</h2><p>المكافآت والسلف والخصومات والإجازات</p></div></div><div className="movement-list">{data.movements.slice(0, 12).map((movement) => { const employee = data.employees.find((item) => item.id === movement.employeeId); return <article key={movement.id}><span>{labels[movement.movementType] || movement.movementType}</span><p><strong>{employee?.fullName || `موظف ${movement.employeeId}`}</strong><small>{movement.description}</small></p><b>{movement.amountHalalas ? money(movement.amountHalalas) : movement.effectiveDate}</b></article>; })}{!data.movements.length && <p className="empty-operational">لا توجد حركات وظيفية بعد.</p>}</div></section></div>
  </section>;
}
