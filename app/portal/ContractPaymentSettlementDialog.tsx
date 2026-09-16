"use client";

import { FormEvent, useMemo, useState } from "react";

export type SettlementDialogAllocation = {
  paymentMethod: "bank_transfer" | "cash" | "cheque";
  amountHalalas: number;
  bankAccountId?: number | null;
  paymentAccountId?: number | null;
  paymentReference?: string | null;
};

type Payment = {
  id: number;
  title: string;
  invoiceAmountHalalas: number;
  paidAmountHalalas: number;
  remainingAmountHalalas: number;
};
type Contract = {
  contractDirection: "dali_supplier" | "dali_purchaser";
  referenceCode: string;
};
type Bank = {
  id: number;
  bankName: string;
  accountName: string;
  iban: string;
};
type PaymentAccount = {
  id: number;
  code: string;
  nameAr: string;
};

const money = (value: number) =>
  new Intl.NumberFormat("ar-SA", {
    style: "currency",
    currency: "SAR",
  }).format(value / 100);

function toHalalas(value: FormDataEntryValue | null) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) : 0;
}

export default function ContractPaymentSettlementDialog({
  payment,
  contract,
  banks,
  paymentAccounts,
  busy,
  onClose,
  onSubmit,
}: {
  payment: Payment;
  contract: Contract;
  banks: Bank[];
  paymentAccounts: PaymentAccount[];
  busy: boolean;
  onClose: () => void;
  onSubmit: (input: {
    paymentDate: string;
    allocations: SettlementDialogAllocation[];
    notes: string;
  }) => Promise<void>;
}) {
  const [mode, setMode] = useState<"bank" | "cash" | "mixed" | "cheque">(
    "bank",
  );
  const [error, setError] = useState("");
  const today = useMemo(
    () => new Date().toISOString().slice(0, 10),
    [],
  );
  const cashAccounts = paymentAccounts.filter(
    (account) => account.code === "1100",
  );
  const remainingRiyals = (payment.remainingAmountHalalas / 100).toFixed(2);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const bankAmountHalalas = ["bank", "mixed", "cheque"].includes(mode)
      ? toHalalas(form.get("bankAmount"))
      : 0;
    const cashAmountHalalas = ["cash", "mixed"].includes(mode)
      ? toHalalas(form.get("cashAmount"))
      : 0;
    const total = bankAmountHalalas + cashAmountHalalas;
    if (total <= 0) {
      setError("أدخل مبلغ السداد.");
      return;
    }
    if (total > payment.remainingAmountHalalas) {
      setError(`إجمالي السداد يتجاوز المتبقي ${money(payment.remainingAmountHalalas)}.`);
      return;
    }
    if (mode === "mixed" && (!bankAmountHalalas || !cashAmountHalalas)) {
      setError("في الدفع المختلط أدخل مبلغ التحويل والمبلغ النقدي معًا.");
      return;
    }
    const allocations: SettlementDialogAllocation[] = [];
    if (bankAmountHalalas) {
      const bankAccountId = Number(form.get("bankAccountId"));
      const paymentReference = String(form.get("paymentReference") || "").trim();
      if (!Number.isInteger(bankAccountId) || bankAccountId < 1) {
        setError("اختر الحساب البنكي.");
        return;
      }
      if (!paymentReference) {
        setError("أدخل مرجع التحويل أو الشيك.");
        return;
      }
      allocations.push({
        paymentMethod: mode === "cheque" ? "cheque" : "bank_transfer",
        amountHalalas: bankAmountHalalas,
        bankAccountId,
        paymentReference,
      });
    }
    if (cashAmountHalalas) {
      const paymentAccountId = Number(form.get("paymentAccountId"));
      if (!Number.isInteger(paymentAccountId) || paymentAccountId < 1) {
        setError("حساب النقدية في الخزينة غير مهيأ.");
        return;
      }
      allocations.push({
        paymentMethod: "cash",
        amountHalalas: cashAmountHalalas,
        paymentAccountId,
      });
    }
    await onSubmit({
      paymentDate: String(form.get("paymentDate") || ""),
      allocations,
      notes: String(form.get("notes") || ""),
    });
  }

  const supplierPayment = contract.contractDirection === "dali_purchaser";
  return (
    <div className="modal-layer">
      <button
        className="drawer-backdrop"
        aria-label="إغلاق نموذج تسجيل السداد"
        onClick={onClose}
      />
      <section
        className="record-modal contract-settlement-modal"
        role="dialog"
        aria-modal="true"
        aria-label={supplierPayment ? "تسجيل سداد المورد" : "تسجيل تحصيل العميل"}
      >
        <div className="drawer-head">
          <div>
            <span>{contract.referenceCode} · {payment.title}</span>
            <h2>{supplierPayment ? "تسجيل سداد المورد" : "تسجيل تحصيل الفاتورة"}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="إغلاق">×</button>
        </div>
        <div className="settlement-balance-grid">
          <span><small>قيمة الفاتورة</small><b>{money(payment.invoiceAmountHalalas)}</b></span>
          <span><small>المسدد سابقًا</small><b>{money(payment.paidAmountHalalas)}</b></span>
          <span><small>المتبقي</small><b>{money(payment.remainingAmountHalalas)}</b></span>
        </div>
        <form className="feature-form" onSubmit={submit}>
          <label className="span-two">
            طريقة السداد
            <select
              value={mode}
              onChange={(event) =>
                setMode(event.target.value as typeof mode)
              }
            >
              <option value="bank">تحويل بنكي</option>
              <option value="cash">نقدي</option>
              <option value="mixed">تحويل بنكي + نقدي</option>
              <option value="cheque">شيك</option>
            </select>
          </label>
          {["bank", "mixed", "cheque"].includes(mode) && (
            <>
              <label>
                {mode === "cheque" ? "مبلغ الشيك" : "مبلغ التحويل بالريال"}
                <input
                  name="bankAmount"
                  type="number"
                  min="0.01"
                  max={remainingRiyals}
                  step="0.01"
                  defaultValue={mode === "mixed" ? "" : remainingRiyals}
                  required
                />
              </label>
              <label>
                الحساب البنكي
                <select name="bankAccountId" required defaultValue="">
                  <option value="" disabled>اختر الحساب البنكي</option>
                  {banks.map((bank) => (
                    <option key={bank.id} value={bank.id}>
                      {bank.bankName} — {bank.accountName} — {bank.iban}
                    </option>
                  ))}
                </select>
              </label>
              <label className="span-two">
                {mode === "cheque" ? "رقم الشيك وتاريخه" : "مرجع التحويل البنكي"}
                <input name="paymentReference" maxLength={180} required />
              </label>
            </>
          )}
          {["cash", "mixed"].includes(mode) && (
            <>
              <label>
                المبلغ النقدي بالريال
                <input
                  name="cashAmount"
                  type="number"
                  min="0.01"
                  max={remainingRiyals}
                  step="0.01"
                  defaultValue={mode === "cash" ? remainingRiyals : ""}
                  required
                />
              </label>
              <label>
                حساب الصندوق
                <select name="paymentAccountId" required defaultValue={cashAccounts[0]?.id || ""}>
                  {!cashAccounts.length && <option value="">غير مهيأ</option>}
                  {cashAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.code} — {account.nameAr}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
          <label>
            تاريخ السداد
            <input name="paymentDate" type="date" max={today} defaultValue={today} required />
          </label>
          <label>
            ملاحظات
            <input name="notes" maxLength={1000} placeholder="بيان اختياري للسداد" />
          </label>
          {error && <p className="form-error span-two" role="alert">{error}</p>}
          {(["bank", "mixed", "cheque"].includes(mode) && !banks.length) && (
            <p className="form-error span-two">لا يوجد حساب بنكي نشط. أضفه من الأستاذ العام أولًا.</p>
          )}
          {(["cash", "mixed"].includes(mode) && !cashAccounts.length) && (
            <p className="form-error span-two">حساب النقدية في الخزينة 1100 غير مهيأ.</p>
          )}
          <p className="form-hint span-two">
            يمكن تسجيل جزء من المتبقي الآن وإضافة الباقي لاحقًا. ينشئ النظام قيدًا متوازنًا مستقلًا لكل عملية ويحفظ توزيع النقد والبنك.
          </p>
          <div className="modal-actions span-two">
            <button type="button" onClick={onClose}>إلغاء</button>
            <button
              className="admin-primary"
              disabled={busy || (["bank", "mixed", "cheque"].includes(mode) && !banks.length) || (["cash", "mixed"].includes(mode) && !cashAccounts.length)}
            >
              {busy ? "جارٍ تسجيل السداد..." : "تسجيل السداد وإنشاء القيد"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
