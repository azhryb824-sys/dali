"use client";
import { defaultWorkforceContractClauses } from "@/lib/workforce-contract-clauses";
import { useState } from "react";
import { commercialTextFields, readCommercialTerms } from "@/lib/commercial-terms";

export default function CommercialDetailsFields({ omit = [], defaults, publicRequest = false }: { omit?: string[]; defaults?: unknown; publicRequest?: boolean }) {
  const initial = readCommercialTerms(defaults);
  const [clauses, setClauses] = useState(initial.contractClauses.length ? initial.contractClauses : defaultWorkforceContractClauses(initial.contractDirection));
  return <>
    {commercialTextFields.filter(field => !omit.includes(field.name)).map(field => <label key={field.name} className={"multiline" in field ? "span-two" : undefined}>{field.label}{"multiline" in field ? <textarea name={field.name} rows={3} maxLength={field.max} defaultValue={initial[field.name] || ""}/> : <input name={field.name} type={"type" in field ? field.type : "text"} maxLength={field.max} defaultValue={initial[field.name] || ""}/>}</label>)}
    <input type="hidden" name="contractDirection" value={publicRequest ? "dali_supplier" : initial.contractDirection}/>
    <label>إظهار جدول الدفعات في المستند<select name="showPaymentSchedule" defaultValue={String(initial.showPaymentSchedule)}><option value="true">نعم</option><option value="false">لا</option></select></label>
    <details className="span-two"><summary>بنود التعاقد المقترحة</summary><p>تُحفظ البنود مع الطلب والعرض وتنتقل إلى العقد. تبقى بنود العقد الأساسية كاملة إذا لم تضف بنودًا مقترحة.</p><input name="contractClauses" type="hidden" value={JSON.stringify(clauses)}/>{clauses.map((clause, index) => <fieldset key={index}><legend>البند {index + 1}</legend>{([['section', 'القسم بالعربية'], ['sectionEn', 'Section in English'], ['title', 'عنوان البند بالعربية'], ['titleEn', 'Clause title in English'], ['body', 'نص البند بالعربية'], ['bodyEn', 'English clause text']] as const).map(([key, label]) => <label key={key}>{label}<textarea rows={key.startsWith("body") ? 3 : 1} maxLength={key.startsWith("body") ? 4000 : 160} value={clause[key] || ""} onChange={event => setClauses(current => current.map((item, i) => i === index ? { ...item, [key]: event.target.value } : item))}/></label>)}<button type="button" onClick={() => setClauses(current => current.filter((_, i) => i !== index))}>حذف البند المقترح</button></fieldset>)}<button type="button" onClick={() => setClauses(current => [...current, { section: "شروط إضافية", title: "", body: "", included: true }])}>إضافة بند مقترح</button></details>
  </>;
}
