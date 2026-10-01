"use client";
import { readApiJson } from "@/lib/client-api";
import { defaultWorkforceContractClauses } from "@/lib/workforce-contract-clauses";
import ContractClauseEditor from "./ContractClauseEditor";
import { useEffect, useRef, useState } from "react";
import { commercialTextFields, readCommercialTerms } from "@/lib/commercial-terms";

export default function CommercialDetailsFields({ omit = [], defaults, publicRequest = false }: { omit?: string[]; defaults?: unknown; publicRequest?: boolean }) {
  const initial = readCommercialTerms(defaults);
  const [direction, setDirection] = useState(initial.contractDirection);
  const [clauses, setClauses] = useState(initial.contractClauses.length ? initial.contractClauses : defaultWorkforceContractClauses(initial.contractDirection));
  const edited = useRef(false);
  const [defaultsError, setDefaultsError] = useState("");
  useEffect(() => {
    if (publicRequest || initial.contractClauses.length || edited.current) return;
    let current = true;
    fetch(`/api/portal/contracts/default-clauses?direction=${direction}`, { cache: "no-store" }).then(async response => {
      const data = await readApiJson(response) as { clauses: typeof clauses; error?: string }; if (!response.ok) throw new Error(data.error || "تعذر تحميل البنود الافتراضية");
      if (current && !edited.current) setClauses(data.clauses);
    }).catch(error => { if (current) setDefaultsError(error.message); });
    return () => { current = false; };
    // Initial saved terms must remain a snapshot; direction changes do not replace edited clauses.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [direction, publicRequest]);
  return <>
    {commercialTextFields.filter(field => !omit.includes(field.name)).map(field => <label key={field.name} className={"multiline" in field ? "span-two" : undefined}>{field.label}{"multiline" in field ? <textarea name={field.name} rows={3} maxLength={field.max} defaultValue={initial[field.name] || ""}/> : <input name={field.name} type={"type" in field ? field.type : "text"} maxLength={field.max} defaultValue={initial[field.name] || ""}/>}</label>)}
    {publicRequest ? <input type="hidden" name="contractDirection" value="dali_supplier"/> : <label>اتجاه التعاقد<select name="contractDirection" value={direction} onChange={event => setDirection(event.target.value as typeof direction)}><option value="dali_supplier">دالي مورّد العمالة</option><option value="dali_purchaser">دالي مستورد العمالة</option></select><small>تغيير الاتجاه لا يحذف البنود التي أدخلتها؛ راجع صياغتها قبل الاعتماد.</small></label>}
    <label>إظهار جدول الدفعات في المستند<select name="showPaymentSchedule" defaultValue={String(initial.showPaymentSchedule)}><option value="true">نعم</option><option value="false">لا</option></select></label>
    <details className="span-two commercial-clauses"><summary>بنود التعاقد المقترحة</summary><p>التمهيد ثم البند الأول والثاني، مع ترقيمات فرعية ونص عربي وإنجليزي لكل بند. تنتقل إلى العرض والعقد كما حفظت.</p>{defaultsError && <p role="alert">{defaultsError}</p>}<input name="contractClauses" type="hidden" value={JSON.stringify(clauses)}/><ContractClauseEditor clauses={clauses} onChange={items => { edited.current = true; setClauses(items); }}/></details>
  </>;
}
