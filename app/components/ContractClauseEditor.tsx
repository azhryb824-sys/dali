"use client";
import { readApiJson } from "@/lib/client-api";
import { useState } from "react";
import { contractClauseLabel, type WorkforceContractClause } from "@/lib/workforce-contract-clauses";

type Props = { clauses: WorkforceContractClause[]; onChange: (clauses: WorkforceContractClause[]) => void; readOnly?: boolean; compact?: boolean };
export default function ContractClauseEditor({ clauses, onChange, readOnly = false, compact = false }: Props) {
  const [expanded, setExpanded] = useState<number | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  function update(index: number, patch: Partial<WorkforceContractClause>) { onChange(clauses.map((item, i) => i === index ? { ...item, ...patch } : item)); }
  function move(index: number, offset: number) { const next = [...clauses], target = index + offset; if (target < 0 || target >= next.length || next[index].isPreamble || next[target].isPreamble) return; [next[index], next[target]] = [next[target], next[index]]; setExpanded(target); onChange(next); }
  async function translate() {
    setBusy(true); setError("");
    try {
      // Batch below the translation endpoint's text count and byte limits.
      const values = clauses.flatMap(item => [item.section, item.body, ...(item.subclauses || []).map(sub => sub.body)]);
      if (values.some(value => !value.trim())) throw new Error("أكمل النصوص العربية قبل الترجمة");
      const translated: string[] = [];
      for (let index = 0; index < values.length; index += 4) {
        const response = await fetch("/api/portal/translate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ values: values.slice(index, index + 4) }) });
        const result = await readApiJson(response) as { translated?: string[]; error?: string };
        if (!response.ok || !Array.isArray(result.translated) || result.translated.length !== values.slice(index, index + 4).length) throw new Error(result.error || "تعذرت الترجمة");
        translated.push(...result.translated);
      }
      let cursor = 0;
      onChange(clauses.map(item => ({ ...item, sectionEn: translated[cursor++], bodyEn: translated[cursor++], subclauses: (item.subclauses || []).map(sub => ({ ...sub, bodyEn: translated[cursor++] })) })));
    } catch (err) { setError(err instanceof Error ? err.message : "تعذرت الترجمة"); } finally { setBusy(false); }
  }
  const labels = clauses.map(item => ({ ...item, included: true }));
  return <div className="contract-clause-editor">
    {!readOnly && <div className="record-actions"><button type="button" disabled={busy} onClick={() => void translate()}>{busy ? "جارٍ الترجمة..." : "ترجمة الإنجليزية"}</button><button type="button" disabled={busy || clauses.some(item => item.isPreamble)} onClick={() => { setExpanded(0); onChange([{ section: "الأحكام التمهيدية", sectionEn: "Preliminary Provisions", title: "التمهيد", titleEn: "Preamble", body: "", bodyEn: "", included: true, isPreamble: true, subclauses: [] }, ...clauses]); }}>إضافة تمهيد</button><button type="button" disabled={busy || clauses.length >= 80} onClick={() => { setExpanded(clauses.length); onChange([...clauses, { section: "بنود إضافية", sectionEn: "Additional Terms", title: "بنود إضافية", titleEn: "Additional Terms", body: "", bodyEn: "", included: true, isPreamble: false, subclauses: [] }]); }}>إضافة بند</button></div>}
    {error && <p role="alert">{error}</p>}
    {clauses.map((clause, index) => <details key={index} className={!clause.included ? "excluded" : ""} open={!compact || expanded === index}>
      <summary onClick={event => { event.preventDefault(); if (compact) setExpanded(expanded === index ? null : index); }}><b>{contractClauseLabel(labels, index)} / {contractClauseLabel(labels, index, "en")}</b><span>{clause.body.slice(0, 100)}</span></summary>
      <header><b>{contractClauseLabel(labels, index)} / {contractClauseLabel(labels, index, "en")}</b><label><input type="checkbox" checked={clause.included} disabled={readOnly || busy} onChange={event => update(index, { included: event.target.checked })}/> تضمين في العقد</label>{!readOnly && <><button type="button" disabled={busy || index === 0 || clause.isPreamble || clauses[index - 1]?.isPreamble} onClick={() => move(index, -1)}>نقل لأعلى</button><button type="button" disabled={busy || index === clauses.length - 1 || clause.isPreamble} onClick={() => move(index, 1)}>نقل لأسفل</button><button type="button" disabled={busy} onClick={() => { setExpanded(null); onChange(clauses.filter((_, i) => i !== index)); }}>حذف</button></>}</header>
      <fieldset disabled={readOnly || busy} className="form-grid">
        {([['section', 'القسم بالعربية'], ['sectionEn', 'Section in English'], ['body', 'نص البند بالعربية'], ['bodyEn', 'English clause text']] as const).map(([key, label]) => <label key={key} className={key.startsWith("body") ? "span-two" : undefined}>{label}<textarea dir={key.endsWith("En") ? "ltr" : "rtl"} required={clause.included && !readOnly} rows={key.startsWith("body") ? 3 : 1} maxLength={key === "body" ? 4000 : key === "bodyEn" ? 6000 : key === "sectionEn" ? 160 : 120} value={clause[key] || ""} onChange={event => update(index, { [key]: event.target.value })}/></label>)}
        {(clause.subclauses || []).map((sub, number) => <fieldset key={number} className="span-two form-grid"><legend>الترقيم الفرعي {number + 1} / Subclause {number + 1}</legend>{([['body', 'النص بالعربية'], ['bodyEn', 'English text']] as const).map(([key, label]) => <label key={key}>{label}<textarea dir={key === "bodyEn" ? "ltr" : "rtl"} rows={2} required={clause.included && !readOnly} maxLength={key === "body" ? 4000 : 6000} value={sub[key]} onChange={event => update(index, { subclauses: clause.subclauses?.map((item, i) => i === number ? { ...item, [key]: event.target.value } : item) })}/></label>)}{!readOnly && <button type="button" onClick={() => update(index, { subclauses: clause.subclauses?.filter((_, i) => i !== number) })}>حذف الترقيم</button>}</fieldset>)}
        {!readOnly && <button type="button" disabled={(clause.subclauses?.length || 0) >= 40} onClick={() => update(index, { subclauses: [...(clause.subclauses || []), { body: "", bodyEn: "" }] })}>إضافة ترقيم فرعي</button>}
      </fieldset>
    </details>)}
  </div>;
}
