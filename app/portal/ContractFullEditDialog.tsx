"use client";

import { FormEvent, useState } from "react";
import { readApiJson } from "@/lib/client-api";
import { workforceProfessions } from "@/lib/workforce-requirements";

type Contract = {
  id: number;
  referenceCode: string;
  clientName: string;
  clientCr: string | null;
  clientVat: string | null;
  title: string;
  workSite: string;
  issueDate: string;
  startDate: string;
  endDate: string;
  quantityMode: "fixed" | "open";
  seasonType: string;
  vatRateBps: number;
  contractDirection: "dali_supplier" | "dali_purchaser";
  accommodationParty: string | null;
  transportParty: string | null;
  details: string;
  showPaymentSchedule: boolean;
};
type Profession = {
  id?: number;
  contractId: number;
  profession: string;
  requiredCount: number;
  unitSalaryHalalas: number;
  actualSalaryHalalas: number;
  sponsorshipType: string | null;
  sponsorName: string | null;
  ajirContractStatus: string | null;
};
type Payment = {
  id: number;
  contractId: number;
  installmentNumber: number;
  title: string;
  dueDate: string;
  percentageBps: number;
  status: string;
  invoiceDocumentId: number | null;
};

const blank = (contract: Contract): Profession => ({
  contractId: contract.id,
  profession: "",
  requiredCount: contract.quantityMode === "open" ? 0 : 1,
  unitSalaryHalalas: 0,
  actualSalaryHalalas: 0,
  sponsorshipType: "dali",
  sponsorName: null,
  ajirContractStatus: "not_applicable",
});

export default function ContractFullEditDialog({
  contract,
  professions,
  payments,
  busy,
  onClose,
  onSaved,
}: {
  contract: Contract;
  professions: Profession[];
  payments: Payment[];
  busy: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [step, setStep] = useState(1);
  const [rows, setRows] = useState(() =>
    professions.length
      ? professions.map((item) => ({ ...item }))
      : [blank(contract)],
  );
  const [schedule, setSchedule] = useState(() =>
    payments.map((item) => ({ ...item })),
  );
  const [showSchedule, setShowSchedule] = useState(
    contract.showPaymentSchedule,
  );
  const [accommodation, setAccommodation] = useState(
    contract.accommodationParty || "توفره دالي",
  );
  const [transport, setTransport] = useState(
    contract.transportParty || "توفره دالي",
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const update = (index: number, changes: Partial<Profession>) =>
    setRows((current) =>
      current.map((item, i) => (i === index ? { ...item, ...changes } : item)),
    );
  const go = (next: number) => {
    if (
      next > step &&
      step === 2 &&
      rows.some(
        (row) =>
          !row.profession ||
          row.unitSalaryHalalas < 1 ||
          (contract.quantityMode === "fixed" && row.requiredCount < 1),
      )
    ) {
      setError("أكمل المهنة والعدد وسعر العامل قبل المتابعة.");
      return;
    }
    setError("");
    setStep(next);
    document
      .querySelector(".contract-edit-issue-modal")
      ?.scrollTo({ top: 0, behavior: "smooth" });
  };
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step < 4) {
      go(step + 1);
      return;
    }
    const total = schedule.reduce((sum, item) => sum + item.percentageBps, 0);
    if (contract.seasonType !== "regular" && total !== 10000) {
      setError("يجب أن يكون مجموع نسب الدفعات الموسمية 100%.");
      return;
    }
    setSaving(true);
    setError("");
    const fd = new FormData(event.currentTarget);
    const payload = {
      clientName: fd.get("clientName"),
      clientCr: fd.get("clientCr"),
      clientVat: fd.get("clientVat"),
      title: fd.get("title"),
      workSite: fd.get("workSite"),
      issueDate: fd.get("issueDate"),
      startDate: fd.get("startDate"),
      ...(contract.seasonType !== "regular"
        ? { endDate: fd.get("endDate") }
        : {}),
      contractDirection: fd.get("contractDirection"),
      vatRateBps: Math.round(Number(fd.get("vatRate") || 0) * 100),
      accommodationParty: accommodation,
      transportParty: transport,
      details: fd.get("details"),
      showPaymentSchedule: showSchedule,
      paymentSchedule:
        contract.seasonType === "regular"
          ? undefined
          : schedule.map(({ id, title, dueDate, percentageBps }) => ({
              id,
              title,
              dueDate,
              percentageBps,
            })),
      professions: rows.map((item) => ({
        profession: item.profession,
        requiredCount:
          contract.quantityMode === "open" ? 0 : item.requiredCount,
        unitSalaryHalalas: item.unitSalaryHalalas,
        actualSalaryHalalas: item.actualSalaryHalalas,
        sponsorshipType: item.sponsorshipType,
        sponsorName: item.sponsorshipType === "other" ? item.sponsorName : null,
        ajirContractStatus: item.ajirContractStatus || "not_applicable",
      })),
    };
    try {
      const response = await fetch(`/api/portal/contracts/${contract.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await readApiJson(response)) as { error?: string };
      if (!response.ok) throw new Error(result.error || "تعذر تعديل العقد");
      await onSaved();
      onClose();
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "تعذر تعديل العقد");
    } finally {
      setSaving(false);
    }
  }
  const steps = [
    "بيانات العقد",
    "المهن والأعداد",
    "التفاصيل والتجهيز",
    "الدفعات والمراجعة",
  ];
  return (
    <div className="modal-layer">
      <button
        className="drawer-backdrop"
        aria-label="إغلاق تعديل العقد"
        onClick={onClose}
      />
      <section
        className="record-modal document-modal issue-modal contract-edit-issue-modal"
        role="dialog"
        aria-modal="true"
      >
        <div className="drawer-head">
          <div>
            <span>{contract.referenceCode}</span>
            <h2>تعديل عقد توفير العمالة</h2>
          </div>
          <button type="button" onClick={onClose}>
            ×
          </button>
        </div>
        <form
          className={`contract-quantity-${contract.quantityMode}`}
          onSubmit={submit}
          noValidate
        >
          <div className="contract-wizard-steps span-two">
            {steps.map((label, index) => (
              <button
                type="button"
                key={label}
                className={
                  step === index + 1 ? "active" : step > index + 1 ? "done" : ""
                }
                onClick={() => go(index + 1)}
              >
                {index + 1} {label}
              </button>
            ))}
          </div>
          {error && (
            <div className="contract-save-error span-two">
              <strong>تعذّر حفظ التعديل</strong>
              <span>{error}</span>
            </div>
          )}
          <div
            className={`issue-form-step span-two ${step === 1 ? "visible" : ""}`}
          >
            <div className="contract-billing-controls span-two">
              <label>
                نوع التعاقد
                <select value={contract.seasonType} disabled>
                  <option value="regular">عقود سنوية بدفعات شهرية</option>
                  <option value="ramadan">موسم رمضان — دفعات بالنسب</option>
                  <option value="hajj">موسم الحج — دفعات بالنسب</option>
                </select>
              </label>
              <div className="billing-mode-summary success">
                <b>
                  {contract.quantityMode === "open"
                    ? "العقد مفتوح العدد"
                    : "العقد محدد العدد"}
                </b>
                <span>تُحفظ آلية العقد الأصلية.</span>
              </div>
            </div>
            <label>
              العميل أو الجهة
              <input
                name="clientName"
                required
                defaultValue={contract.clientName}
              />
            </label>
            <label>
              عنوان العقد
              <input name="title" required defaultValue={contract.title} />
            </label>
            <label>
              السجل التجاري
              <input name="clientCr" defaultValue={contract.clientCr || ""} />
            </label>
            <label>
              الرقم الضريبي
              <input name="clientVat" defaultValue={contract.clientVat || ""} />
            </label>
            <label>
              موقع العمل
              <input
                name="workSite"
                required
                defaultValue={contract.workSite}
              />
            </label>
            <label>
              اتجاه العقد
              <select
                name="contractDirection"
                defaultValue={contract.contractDirection}
              >
                <option value="dali_supplier">دالي مورّد للعمالة</option>
                <option value="dali_purchaser">دالي مشتري للعمالة</option>
              </select>
            </label>
            <label>
              تاريخ الإصدار
              <input
                name="issueDate"
                type="date"
                required
                defaultValue={contract.issueDate}
              />
            </label>
            <label>
              تاريخ البداية
              <input
                name="startDate"
                type="date"
                required
                defaultValue={contract.startDate}
              />
            </label>
            {contract.seasonType !== "regular" && (
              <label>
                تاريخ النهاية
                <input
                  name="endDate"
                  type="date"
                  required
                  defaultValue={contract.endDate}
                />
              </label>
            )}
            <label>
              الضريبة %
              <input
                name="vatRate"
                type="number"
                min="0"
                max="100"
                step="0.01"
                defaultValue={contract.vatRateBps / 100}
              />
            </label>
          </div>
          <div
            className={`issue-form-step span-two ${step === 2 ? "visible" : ""}`}
          >
            <div className="profession-builder-head">
              <div>
                <strong>المهن والأعداد والأسعار</strong>
                <small>بنفس تنسيق إنشاء العقد.</small>
              </div>
              <button
                type="button"
                onClick={() =>
                  setRows((current) => [...current, blank(contract)])
                }
              >
                + إضافة مهنة
              </button>
            </div>
            <div className="profession-builder">
              {rows.map((row, index) => (
                <article key={`${row.id || "new"}-${index}`}>
                  <label>
                    المهنة
                    <select
                      required
                      value={row.profession}
                      onChange={(e) =>
                        update(index, { profession: e.target.value })
                      }
                    >
                      <option value="" disabled>
                        اختر المهنة
                      </option>
                      {row.profession &&
                        !workforceProfessions.some(
                          (item) => item.label === row.profession,
                        ) && <option>{row.profession}</option>}
                      {workforceProfessions.map((item) => (
                        <option key={item.label}>{item.label}</option>
                      ))}
                    </select>
                  </label>
                  {contract.quantityMode === "fixed" && (
                    <label>
                      العدد المطلوب
                      <input
                        type="number"
                        min="1"
                        value={row.requiredCount}
                        onChange={(e) =>
                          update(index, {
                            requiredCount: Number(e.target.value),
                          })
                        }
                      />
                    </label>
                  )}
                  <label>
                    سعر العامل على العميل شهريًا (ريال)
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={row.unitSalaryHalalas / 100 || ""}
                      onChange={(e) =>
                        update(index, {
                          unitSalaryHalalas: Math.round(
                            Number(e.target.value) * 100,
                          ),
                        })
                      }
                    />
                  </label>
                  <label>
                    الراتب الفعلي للعامل شهريًا (اختياري)
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={row.actualSalaryHalalas / 100 || ""}
                      onChange={(e) =>
                        update(index, {
                          actualSalaryHalalas: Math.round(
                            Number(e.target.value) * 100,
                          ),
                        })
                      }
                    />
                  </label>
                  <label>
                    جهة الكفالة
                    <select
                      value={row.sponsorshipType || "dali"}
                      onChange={(e) =>
                        update(index, {
                          sponsorshipType: e.target.value,
                          sponsorName:
                            e.target.value === "dali" ? null : row.sponsorName,
                        })
                      }
                    >
                      <option value="dali">على كفالة شركة دالي</option>
                      <option value="other">على كفالة جهة أخرى</option>
                    </select>
                  </label>
                  <label>
                    حالة عقد أجير
                    <select
                      value={row.ajirContractStatus || "not_applicable"}
                      onChange={(e) =>
                        update(index, { ajirContractStatus: e.target.value })
                      }
                    >
                      <option value="not_applicable">لا ينطبق</option>
                      <option value="with_ajir">بعقد أجير</option>
                      <option value="without_ajir">بدون عقد أجير</option>
                    </select>
                  </label>
                  {rows.length > 1 && (
                    <button
                      className="remove-profession"
                      type="button"
                      onClick={() =>
                        setRows((current) =>
                          current.filter((_, i) => i !== index),
                        )
                      }
                    >
                      حذف المهنة
                    </button>
                  )}
                </article>
              ))}
            </div>
            <p className="form-hint">
              اسم الكفيل يؤخذ تلقائيًا من ملف العامل عند الإسناد.
            </p>
          </div>
          <div
            className={`issue-form-step span-two ${step === 3 ? "visible" : ""}`}
          >
            <div className="profession-builder-head">
              <div>
                <strong>التجهيزات ونطاق العمل</strong>
                <small>حدّد مسؤولية السكن والنقل وتفاصيل الخدمة.</small>
              </div>
            </div>
            <div className="contract-tax-fields">
              <label>
                السكن
                <select
                  value={accommodation}
                  onChange={(e) => setAccommodation(e.target.value)}
                >
                  <option>توفره دالي</option>
                  <option>يوفره الطرف الثاني</option>
                </select>
              </label>
              <label>
                النقل
                <select
                  value={transport}
                  onChange={(e) => setTransport(e.target.value)}
                >
                  <option>توفره دالي</option>
                  <option>يوفره الطرف الآخر</option>
                </select>
              </label>
            </div>
            <label className="span-two">
              التفاصيل والشروط
              <textarea
                name="details"
                required
                rows={8}
                defaultValue={contract.details}
              />
            </label>
          </div>
          <div
            className={`issue-form-step contract-final-step span-two ${step === 4 ? "visible" : ""}`}
          >
            <section className="contract-final-card payment-plan-card">
              <header className="contract-final-heading">
                <div>
                  <strong>خطة الفوترة والدفعات</strong>
                  <p>
                    {contract.seasonType === "regular"
                      ? "يعيد النظام احتساب 12 دفعة شهرية تلقائيًا من تاريخ البداية."
                      : "راجع الدفعات الموسمية ومجموع نسبها."}
                  </p>
                </div>
              </header>
              <div className="contract-tax-fields">
                <label>
                  إظهار جدول الدفعات في PDF
                  <select
                    value={showSchedule ? "true" : "false"}
                    onChange={(e) => setShowSchedule(e.target.value === "true")}
                  >
                    <option value="true">نعم، إظهار الجدول</option>
                    <option value="false">لا، إخفاء الجدول</option>
                  </select>
                </label>
              </div>
              {contract.seasonType !== "regular" && (
                <div className="payment-schedule-builder">
                  {schedule.map((payment, index) => (
                    <article key={payment.id}>
                      <label>
                        عنوان الدفعة
                        <input
                          value={payment.title}
                          onChange={(e) =>
                            setSchedule((items) =>
                              items.map((item, i) =>
                                i === index
                                  ? { ...item, title: e.target.value }
                                  : item,
                              ),
                            )
                          }
                        />
                      </label>
                      <label>
                        تاريخ الاستحقاق
                        <input
                          type="date"
                          value={payment.dueDate}
                          onChange={(e) =>
                            setSchedule((items) =>
                              items.map((item, i) =>
                                i === index
                                  ? { ...item, dueDate: e.target.value }
                                  : item,
                              ),
                            )
                          }
                        />
                      </label>
                      <label>
                        النسبة %
                        <input
                          type="number"
                          min="0.01"
                          max="100"
                          step="0.01"
                          value={payment.percentageBps / 100}
                          onChange={(e) =>
                            setSchedule((items) =>
                              items.map((item, i) =>
                                i === index
                                  ? {
                                      ...item,
                                      percentageBps: Math.round(
                                        Number(e.target.value) * 100,
                                      ),
                                    }
                                  : item,
                              ),
                            )
                          }
                        />
                      </label>
                    </article>
                  ))}
                </div>
              )}
            </section>
            <section className="contract-final-card">
              <header className="contract-final-heading">
                <div>
                  <strong>ملخص التعديل</strong>
                  <p>
                    {rows.length} توزيع مهني ·{" "}
                    {contract.quantityMode === "open"
                      ? "عدد مفتوح"
                      : `${rows.reduce((sum, row) => sum + row.requiredCount, 0)} عامل`}{" "}
                    · {contract.clientName}
                  </p>
                </div>
              </header>
            </section>
          </div>
          <div className="contract-wizard-actions span-two">
            <button
              type="button"
              onClick={step === 1 ? onClose : () => go(step - 1)}
            >
              {step === 1 ? "إلغاء" : "السابق"}
            </button>
            {step < 4 ? (
              <button
                type="button"
                className="admin-primary"
                onClick={() => go(step + 1)}
              >
                التالي
              </button>
            ) : (
              <button className="admin-primary" disabled={busy || saving}>
                {busy || saving ? "جارٍ الحفظ..." : "حفظ كل التعديلات"}
              </button>
            )}
          </div>
        </form>
      </section>
    </div>
  );
}
