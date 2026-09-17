"use client";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { readApiJson } from "@/lib/client-api";
type Incident = {
    id: number;
    referenceCode: string;
    workerId: number;
    contractId: number;
    incidentType: string;
    reasonCode: string;
    reason: string;
    startDate: string;
    endDate: string;
    status: string;
    fileName: string | null;
    warning: boolean;
    deduct: boolean;
    releaseWorker: boolean;
    archiveWorker: boolean;
    decisionReason: string | null;
    deductionHalalas: number | null;
    chargeableDays: number;
    version: number;
};
type Data = {
    incidents: Incident[];
    canReport: boolean;
    canReview: boolean;
    workers: Array<{
        id: number;
        fullName: string;
    }>;
    contracts: Array<{
        id: number;
        referenceCode: string;
    }>;
    assignments: Array<{
        id: number;
        workerId: number;
        contractId: number;
        status: string;
        assignedAt: string;
        releasedAt: string | null;
    }>;
};
const types: Record<string, string> = { absence: "غياب", abandonment: "ترك العمل", work_injury: "إصابة عمل", sick_leave: "إجازة مرضية", other: "حالة أخرى" };
export default function WorkerIncidentsPanel({ workerId, selectedIncidentId }: {
    workerId?: number;
    selectedIncidentId?: number | null;
}) {
    const [data, setData] = useState<Data | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false), [open, setOpen] = useState(false), [selectedWorker, setSelectedWorker] = useState(String(workerId || "")), [reasonCode, setReasonCode] = useState("unexplained"), [type, setType] = useState("absence"), [review, setReview] = useState<Incident | null>(null), [decision, setDecision] = useState("accepted");
    const load = useCallback(async () => { const r = await fetch(`/api/portal/worker-incidents${workerId ? `?workerId=${workerId}` : ""}`, { cache: "no-store" }); const d = await readApiJson<Data & {
        error?: string;
    }>(r); if (!r.ok)
        throw new Error(d.error); return d; }, [workerId]);
    useEffect(() => { let active = true; void load().then(d => { if (active)
        setData(d); }).catch(e => { if (active)
        setError(e.message); }); return () => { active = false; }; }, [load]);
    useEffect(() => { if (selectedIncidentId && data)
        document.getElementById(`worker-incident-${selectedIncidentId}`)?.scrollIntoView({ block: "center" }); }, [selectedIncidentId, data]);
    async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); setError(""); try {
        const response = await fetch("/api/portal/worker-incidents", { method: "POST", body: new FormData(event.currentTarget) });
        const body = await readApiJson<{
            error?: string;
        }>(response);
        if (!response.ok)
            throw new Error(body.error);
        setOpen(false);
        setData(await load());
    }
    catch (e) {
        setError(e instanceof Error ? e.message : "تعذر تسجيل الحالة");
    }
    finally {
        setBusy(false);
    } }
    async function decide(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (!review)
        return; const fd = new FormData(event.currentTarget); setBusy(true); setError(""); try {
        const response = await fetch("/api/portal/worker-incidents", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: review.id, version: review.version, status: decision, reason: fd.get("reason"), ...Object.fromEntries(["warning", "deduct", "releaseWorker", "archiveWorker"].map(key => [key, fd.get(key) === "on"])) }) });
        const body = await readApiJson<{
            error?: string;
        }>(response);
        if (!response.ok)
            throw new Error(body.error);
        setReview(null);
        setData(await load());
    }
    catch (e) {
        setError(e instanceof Error ? e.message : "تعذر حفظ القرار");
    }
    finally {
        setBusy(false);
    } }
    return <section className="panel worker-incidents"><div className="panel-head"><div><h2>{workerId ? "حالات العامل والإنذارات" : "حالات العمالة والغياب والإنذارات"}</h2><p>تُراجع الأسباب والمرفقات قبل القرار. تُحسب أيام الخصم من راتب العقد، دون الجمعة.</p></div>{data?.canReport && <button className="admin-primary" onClick={() => setOpen(!open)}>تسجيل حالة عمالية</button>}</div>{error && <p role="alert">{error}</p>}{open && data && <form onSubmit={submit} className="feature-form"><label>العامل<select name="workerId" required value={selectedWorker} onChange={e => setSelectedWorker(e.target.value)}><option value="">اختر العامل</option>{data.workers.filter(w => !workerId || w.id === workerId).map(w => <option key={w.id} value={w.id}>{w.fullName}</option>)}</select></label><label>إسناد العقد<select key={selectedWorker} name="assignmentId" required defaultValue=""><option value="" disabled>اختر العقد والفترة</option>{data.assignments.filter(a => a.workerId === Number(selectedWorker)).map(a => <option key={a.id} value={a.id}>{data.contracts.find(c => c.id === a.contractId)?.referenceCode} — {a.assignedAt.slice(0, 10)} إلى {a.releasedAt?.slice(0, 10) || "مستمر"}</option>)}</select></label><label>نوع الحالة<select name="incidentType" value={type} onChange={e => setType(e.target.value)}>{Object.entries(types).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label><label>تصنيف السبب<select name="reasonCode" value={reasonCode} onChange={e => setReasonCode(e.target.value)}><option value="unexplained">غياب دون إفادة</option><option value="personal">ظرف شخصي</option><option value="medical">سبب طبي</option><option value="transport">تعذر الوصول للموقع</option><option value="site">ظرف في موقع العمل</option><option value="other">سبب آخر</option></select></label><label>من تاريخ<input type="date" name="startDate" required max={new Date().toISOString().slice(0, 10)}/></label><label>إلى تاريخ<input type="date" name="endDate" required max={new Date().toISOString().slice(0, 10)}/></label><label>تفاصيل السبب<textarea name="reason" required={reasonCode === "other"} minLength={3} maxLength={2000}/></label><label>{["work_injury", "sick_leave"].includes(type) ? "التقرير الطبي — إلزامي" : "مرفق اختياري"}<input name="file" type="file" required={["work_injury", "sick_leave"].includes(type)} accept="application/pdf,image/png,image/jpeg"/></label><button disabled={busy} className="admin-primary">إرسال للمالك أو المشرف</button></form>}
 <div className="operations-list">{data?.incidents.map(item => <article key={item.id} id={`worker-incident-${item.id}`} className="panel"><strong>{item.referenceCode} — {types[item.incidentType]} — {data.workers.find(w => w.id === item.workerId)?.fullName || `عامل #${item.workerId}`}</strong><p>{item.startDate} — {item.endDate} · {item.reason}</p><p>{({ pending: "بانتظار القرار", accepted: "سبب معتمد — دون إجراء جزائي", rejected: "سبب مرفوض" })[item.status]}</p>{item.warning && <strong className="date-alert">إنذار مسجل في بطاقة العامل</strong>}{item.deduct && <p>خصم {item.chargeableDays} يوم دون الجمعة {item.deductionHalalas !== null ? `— ${(item.deductionHalalas / 100).toFixed(2)} ريال` : ""}</p>}{item.releaseWorker && <p>{item.archiveWorker ? "استبعاد مع أرشفة العامل وحفظ تاريخه" : "استبعاد من العقد"}</p>}{item.decisionReason && <p>قرار المراجعة: {item.decisionReason}</p>}{item.fileName && data.canReport && <a href={`/api/portal/worker-incidents?file=${item.id}`} target="_blank" rel="noreferrer">{item.fileName}</a>}{item.status === "pending" && data.canReview && <button disabled={busy} onClick={() => { setReview(item); setDecision("accepted"); }}>مراجعة الحالة واتخاذ القرار</button>}{review?.id === item.id && <form onSubmit={decide}><label>القرار<select value={decision} onChange={e => setDecision(e.target.value)}><option value="accepted">اعتماد السبب</option><option value="rejected">رفض السبب وتحديد الإجراء</option></select></label><label>سبب القرار<textarea name="reason" required minLength={3} maxLength={2000}/></label>{decision === "rejected" && <fieldset><legend>الإجراءات — يمكن الجمع بينها</legend><label><input type="checkbox" name="warning"/>إنذار يضاف إلى بطاقة العامل</label><label><input type="checkbox" name="deduct"/>خصم أيام الفترة عدا الجمعة من راتب العقد</label><label><input type="checkbox" name="releaseWorker"/>استبعاد نهائي من هذا الإسناد</label><label><input type="checkbox" name="archiveWorker"/>أرشفة العامل بعد الاستبعاد مع حفظ السجلات</label><p>يُرحّل الخصم إلى أول راتب غير مسوّى، ويُحفظ أي رصيد يتجاوز الراتب للشهر التالي.</p></fieldset>}<button disabled={busy} className="admin-primary">حفظ القرار</button><button type="button" onClick={() => setReview(null)}>إلغاء</button></form>}</article>)}</div>{data && !data.incidents.length && <p>لا توجد حالات مسجلة.</p>}</section>;
}
