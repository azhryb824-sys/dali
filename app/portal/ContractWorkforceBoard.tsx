"use client";
import { useMemo, useState } from "react";
import { contractWorkforceCoverage, eligibleContractWorker } from "@/lib/contract-workforce-coverage";

type Contract = { id: number; status: string; quantityMode?: string };
type Profession = { id: number; profession: string; requiredCount: number; sponsorshipType: string | null; sponsorName: string | null; ajirContractStatus?: string | null };
type Assignment = { id: number; contractProfessionId: number; workerId: number; status: string; assignedAt?: string; releasedAt?: string | null };
type Worker = { id: number; fullName: string; profession: string; nationality?: string; iqamaNumber?: string | null; workerNumber?: string; status: string; archivedAt?: string | null; sponsorshipType?: string; sponsorName?: string | null; iqamaExpiry?: string | null };
const date = (value?: string | null) => value ? new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium", calendar: "gregory", timeZone: "Asia/Riyadh" }).format(new Date(value)) : "—";

export default function ContractWorkforceBoard({ contract, professions, assignments, workers, canManage, busy, onAssign, onRelease }: {
  contract: Contract; professions: Profession[]; assignments: Assignment[]; workers: Worker[]; canManage: boolean; busy: string | null;
  onAssign: (contractId: number, professionId: number, workerId: number) => Promise<void>;
  onRelease: (contractId: number, assignmentId: number) => Promise<void>;
}) {
  const [tab, setTab] = useState<"current" | "history">("current");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [choices, setChoices] = useState<Record<number, string>>({});
  const [confirmRelease, setConfirmRelease] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const open = contract.quantityMode === "open";
  const coverage = useMemo(() => contractWorkforceCoverage(professions, assignments, open), [professions, assignments, open]);
  const workerMap = new Map(workers.map(worker => [worker.id, worker]));
  const matches = (worker?: Worker) => !query.trim() || `${worker?.fullName || ""} ${worker?.iqamaNumber || ""} ${worker?.workerNumber || ""} ${worker?.profession || ""}`.toLowerCase().includes(query.trim().toLowerCase());
  const history = assignments.filter(row => matches(workerMap.get(row.workerId)) && (filter === "all" || row.status === filter)).toSorted((a,b) => (b.releasedAt || b.assignedAt || "").localeCompare(a.releasedAt || a.assignedAt || ""));
  return <section className="contract-workforce-board">
    <header className="workforce-board-heading"><div><h3>التغطية وإسناد العمالة</h3><p>إدارة المهن والعمال المرتبطين بالعقد مع الاحتفاظ بسجل الإسناد.</p></div><span className="status-pill">{open ? "عدد مفتوح" : `التغطية ${coverage.percent ?? 0}%`}</span></header>
    <div className="workforce-board-metrics"><article><span>العمالة الفعلية</span><strong>{coverage.active}</strong></article><article><span>المخطط إسنادها</span><strong>{coverage.planned}</strong></article><article><span>المطلوب</span><strong>{open ? "مفتوح" : coverage.required}</strong></article><article><span>العجز حسب المهنة</span><strong>{open ? "—" : coverage.shortage}</strong></article></div>
    <div className="workforce-board-toolbar"><nav aria-label="عرض عمالة العقد"><button type="button" aria-pressed={tab === "current"} onClick={() => {setTab("current");setFilter("all");setPage(1);}}>الإسناد الحالي</button><button type="button" aria-pressed={tab === "history"} onClick={() => {setTab("history");setFilter("all");setPage(1);}}>سجل الإسناد</button></nav><label><span className="sr-only">البحث في العمالة</span><input type="search" value={query} onChange={event=>{setQuery(event.target.value);setPage(1);}} placeholder="بحث بالاسم أو الإقامة أو المهنة"/></label><label><span className="sr-only">تصفية النتائج</span><select value={filter} onChange={event=>{setFilter(event.target.value);setPage(1);}}><option value="all">جميع الحالات</option>{tab === "current" ? <option value="shortage">مهن بها عجز</option> : <><option value="active">مسند فعليًا</option><option value="planned">مخطط</option><option value="released">منتهي الإسناد</option></>}</select></label></div>
    {tab === "current" && <div className="workforce-profession-grid">{professions.filter(profession=>filter !== "shortage" || (coverage.rows.find(row=>row.professionId === profession.id)?.shortage || 0) > 0).map(profession => {
      const row = coverage.rows.find(item=>item.professionId === profession.id)!;
      const assigned = assignments.filter(item=>item.contractProfessionId === profession.id && ["active", "planned"].includes(item.status) && matches(workerMap.get(item.workerId)));
      const candidates = workers.filter(worker=>eligibleContractWorker(worker, profession, assignments) && matches(worker)).sort((a,b)=>a.fullName.localeCompare(b.fullName,"ar"));
      const canAdd = open || (row.remaining || 0) > 0;
      return <article className="workforce-profession-card" key={profession.id}><header><div><h4>{profession.profession}</h4><p>{profession.sponsorshipType === "other" ? profession.sponsorName || "جهة أخرى" : "على كفالة شركة دالي"} · {profession.ajirContractStatus === "with_ajir" ? "بعقد أجير" : "بدون عقد أجير"}</p></div><b className={row.shortage ? "has-shortage" : "complete"}>{open ? `${row.active} مسند` : `${row.active} / ${row.required}`}</b></header>
        {!open && <progress value={Math.min(row.active, row.required)} max={Math.max(1,row.required)} aria-label={`تغطية ${profession.profession}`}/>}
        <div className="workforce-assignment-cards">{assigned.map(assignment=>{const worker=workerMap.get(assignment.workerId);return <article key={assignment.id}><div className="worker-initial">{(worker?.fullName || "عامل").slice(0,1)}</div><div><strong>{worker?.fullName || `عامل ${assignment.workerId}`}</strong><small>{worker?.iqamaNumber || worker?.workerNumber || "غير مسجل"} · {worker?.nationality || profession.profession}</small><small>{assignment.status === "planned" ? "مخطط عند السريان" : `تاريخ الإسناد: ${date(assignment.assignedAt)}`}</small></div>{canManage && assignment.status === "active" && <div className="workforce-release-actions">{confirmRelease === assignment.id ? <><button type="button" className="danger-action" disabled={Boolean(busy)} onClick={()=>void onRelease(contract.id,assignment.id).then(()=>setConfirmRelease(null))}>تأكيد إنهاء الإسناد</button><button type="button" disabled={Boolean(busy)} onClick={()=>setConfirmRelease(null)}>تراجع</button></> : <button type="button" disabled={Boolean(busy)} onClick={()=>setConfirmRelease(assignment.id)}>إنهاء الإسناد</button>}</div>}</article>})}{!assigned.length && <p className="empty-operational">لا توجد عمالة مطابقة للعرض الحالي.</p>}</div>
        {canManage && contract.status === "active" && canAdd && <div className="workforce-assign-form"><label>إضافة عامل متاح<select value={choices[profession.id] || ""} onChange={event=>setChoices(current=>({...current,[profession.id]:event.target.value}))}><option value="">اختر العامل</option>{candidates.map(worker=><option key={worker.id} value={worker.id}>{worker.fullName} — {worker.iqamaNumber || worker.workerNumber}</option>)}</select></label><button type="button" className="admin-primary" disabled={Boolean(busy) || !candidates.some(worker=>String(worker.id)===choices[profession.id])} onClick={()=>void onAssign(contract.id, profession.id, Number(choices[profession.id])).then(()=>setChoices(current=>({...current,[profession.id]:""})))}>إضافة إلى العقد</button>{!candidates.length && <small>لا توجد عمالة متاحة مطابقة للمهنة والكفالة والبحث.</small>}</div>}
        {contract.status !== "active" && <p className="readonly-note">يُتاح الإسناد اليدوي بعد اعتماد العقد وتوقيعه وتحويله إلى ساري.</p>}
      </article>;
    })}{!professions.length && <p className="empty-operational">لم تُضف مهن لهذا العقد.</p>}</div>}
    {tab === "history" && <><div className="workforce-history-table"><table><thead><tr><th>العامل</th><th>المهنة</th><th>الحالة</th><th>تاريخ الإسناد</th><th>تاريخ الإنهاء</th></tr></thead><tbody>{history.slice((page-1)*25,page*25).map(row=><tr key={row.id}><td><strong>{workerMap.get(row.workerId)?.fullName || `عامل ${row.workerId}`}</strong><small>{workerMap.get(row.workerId)?.iqamaNumber}</small></td><td>{professions.find(item=>item.id===row.contractProfessionId)?.profession || "—"}</td><td>{row.status === "active" ? "مسند فعليًا" : row.status === "planned" ? "مخطط" : "منتهي الإسناد"}</td><td>{date(row.assignedAt)}</td><td>{date(row.releasedAt)}</td></tr>)}</tbody></table>{!history.length && <p className="empty-operational">لا توجد حركات إسناد مطابقة.</p>}</div><div className="workforce-pagination"><button type="button" disabled={page<=1} onClick={()=>setPage(page-1)}>السابق</button><span>{page} / {Math.max(1,Math.ceil(history.length/25))}</span><button type="button" disabled={page*25>=history.length} onClick={()=>setPage(page+1)}>التالي</button></div></>}
  </section>;
}
