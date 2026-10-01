"use client";
import { readApiJson } from "@/lib/client-api";
import { useEffect, useState } from "react";
import ContractClauseEditor from "@/app/components/ContractClauseEditor";
import { validateContractClauses, type WorkforceContractClause, type WorkforceContractDirection } from "@/lib/workforce-contract-clauses";

export default function ContractClauseDefaults({ canWrite }: { canWrite: boolean }) {
  const [direction, setDirection] = useState<WorkforceContractDirection>("dali_supplier");
  const [snapshot, setSnapshot] = useState<{ clauses: WorkforceContractClause[]; revision: string } | null>(null);
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState(""), [reload, setReload] = useState(0);
  useEffect(() => {
    let current = true;
    fetch(`/api/portal/contracts/default-clauses?direction=${direction}`, { cache: "no-store" }).then(async response => {
      const result = await readApiJson(response) as { clauses: WorkforceContractClause[]; revision: string; error?: string }; if (!response.ok) throw new Error(result.error || "تعذر تحميل البنود الافتراضية");
      if (current) setSnapshot(result);
    }).catch(error => { if (current) setNotice(error.message); });
    return () => { current = false; };
  }, [direction, reload]);
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!snapshot) return;
    const error = validateContractClauses(snapshot.clauses, true); if (error) { setNotice(error); return; }
    setBusy(true); setNotice("");
    try {
      const response = await fetch("/api/portal/contracts/default-clauses", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...snapshot, direction }) });
      const result = await readApiJson(response) as { clauses: WorkforceContractClause[]; revision: string; error?: string }; if (!response.ok) throw new Error(result.error || "تعذر حفظ البنود");
      setSnapshot(result); setNotice("تم حفظ البنود الافتراضية. العقود السابقة تحتفظ ببنودها.");
    } catch (err) { setNotice(err instanceof Error ? err.message : "تعذر الحفظ"); } finally { setBusy(false); }
  }
  return <section className="panel contract-defaults-panel"><div className="panel-head"><div><h3>البنود الافتراضية</h3><p>قوالب مستقلة باللغتين للعقود الجديدة. راجع الصياغة والترجمة قبل الحفظ.</p></div></div>
    <div role="tablist" aria-label="صفة دالي في العقد" className="record-actions">{([['dali_supplier', 'دالي مورد'], ['dali_purchaser', 'دالي مستورد']] as const).map(([value, title]) => <button type="button" role="tab" aria-selected={direction === value} key={value} disabled={busy} onClick={() => { if (direction !== value) { setSnapshot(null); setNotice(""); setDirection(value); } }}>{title}</button>)}</div>
    {notice && <p role="status">{notice}</p>}
    {snapshot ? <form onSubmit={save}><fieldset disabled={busy}><ContractClauseEditor clauses={snapshot.clauses} readOnly={!canWrite} onChange={clauses => setSnapshot(current => current ? { ...current, clauses } : current)}/></fieldset>{canWrite && <div className="record-actions"><button className="admin-primary" type="submit" disabled={busy}>حفظ البنود الافتراضية</button><button type="button" disabled={busy} onClick={() => { setSnapshot(null); setNotice(""); setReload(value => value + 1); }}>إعادة تحميل المحفوظ</button></div>}</form> : <p role="status">جارٍ تحميل البنود...</p>}
  </section>;
}
