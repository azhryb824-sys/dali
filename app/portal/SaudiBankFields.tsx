"use client";

import { useEffect, useRef, useState } from "react";
import { bankNameFromSaudiIban, formatSaudiIban } from "@/lib/saudi-banks";

type Props = {
  ibanName?: string;
  bankName?: string;
  required?: boolean;
  value?: string;
  onChange?: (value: string) => void;
};

export default function SaudiBankFields({ ibanName = "iban", bankName = "bankName", required = false, value, onChange }: Props) {
  const [localValue, setLocalValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const raw = value ?? localValue;
  const digits = raw.replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 1632)).replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 1776)).replace(/\D/g, "").slice(0, 22);
  const iban = digits ? `SA${digits}` : "";
  const displayed = formatSaudiIban(iban).slice(2);
  const bank = digits.length === 22 ? bankNameFromSaudiIban(iban) || "" : "";

  useEffect(() => {
    const form = inputRef.current?.form;
    const reset = () => { setLocalValue(""); onChange?.("SA"); };
    form?.addEventListener("reset", reset);
    return () => form?.removeEventListener("reset", reset);
  }, [onChange]);

  useEffect(() => {
    inputRef.current?.setCustomValidity(digits.length === 22 && !bank ? "رمز البنك غير معروف؛ راجع رقم الآيبان" : "");
  }, [digits, bank]);

  return <>
    <label>
      رقم الآيبان السعودي
      <span dir="ltr" style={{ display: "flex", alignItems: "center", border: "1px solid #cbd5e1", borderRadius: 8, background: "#fff", overflow: "hidden", minWidth: 0 }}>
        <span aria-hidden="true" style={{ paddingLeft: 12, fontFamily: "monospace", fontSize: 16, color: "#334155", userSelect: "none" }}>SA</span>
        <input ref={inputRef} aria-label="أرقام الآيبان بعد SA" inputMode="numeric" autoComplete="off"
          required={required} pattern="[0-9]{2}( [0-9]{4}){5}" value={displayed}
          style={{ border: 0, borderRadius: 0, boxShadow: "none", paddingLeft: 0, minWidth: 0, width: "100%", fontFamily: "monospace", fontSize: 16, direction: "ltr" }}
          onChange={event => {
            const target = event.currentTarget;
            const before = target.value.slice(0, target.selectionStart ?? target.value.length).replace(/[^0-9٠-٩۰-۹]/g, "").length;
            const nextDigits = target.value.replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 1632)).replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 1776)).replace(/\D/g, "").slice(0, 22);
            const next = `SA${nextDigits}`;
            setLocalValue(next);
            onChange?.(next);
            requestAnimationFrame(() => {
              let position = 0, count = 0;
              while (position < target.value.length && count < before) {
                if (/\d/.test(target.value[position])) count++;
                position++;
              }
              target.setSelectionRange(position, position);
            });
          }} />
      </span>
      <input type="hidden" name={ibanName} value={iban} />
    </label>
    <label>
      اسم البنك — تلقائي
      <input name={bankName} value={bank} readOnly aria-readonly="true" placeholder="يظهر بعد اكتمال الآيبان" style={{ background: "#f1f5f9", color: "#334155", cursor: "default" }} />
    </label>
  </>;
}
