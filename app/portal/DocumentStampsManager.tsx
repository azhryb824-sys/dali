"use client";
import { FormEvent, useEffect, useState } from "react";
import { readApiJson } from "@/lib/client-api";
type Stamp = {
    id: number;
    name: string;
    fileName: string;
};
export default function DocumentStampsManager() {
    const [stamps, setStamps] = useState<Stamp[]>([]), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false);
    async function load() { const r = await fetch("/api/portal/document-stamps", { cache: "no-store" }); const d = await readApiJson<{
        stamps?: Stamp[];
        error?: string;
    }>(r); if (!r.ok)
        throw new Error(d.error); return d; }
    useEffect(() => { let active = true; void load().then(d => { if (active)
        setStamps(d.stamps || []); }).catch(e => { if (active)
        setNotice(e.message); }); return () => { active = false; }; }, []);
    async function add(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); const form = event.currentTarget; try {
        const r = await fetch("/api/portal/document-stamps", { method: "POST", body: new FormData(form) });
        const d = await readApiJson<{
            error?: string;
        }>(r);
        if (!r.ok)
            throw new Error(d.error);
        form.reset();
        setStamps((await load()).stamps || []);
        setNotice("أضيف الختم إلى مكتبة الأختام");
    }
    catch (e) {
        setNotice(e instanceof Error ? e.message : "تعذر حفظ الختم");
    }
    finally {
        setBusy(false);
    } }
    async function deactivate(id: number) { setBusy(true); try {
        const r = await fetch(`/api/portal/document-stamps?id=${id}`, { method: "DELETE" });
        const d = await readApiJson<{
            error?: string;
        }>(r);
        if (!r.ok)
            throw new Error(d.error);
        setStamps((await load()).stamps || []);
        setNotice("عُطّل الختم للاستخدام الجديد؛ تبقى المستندات السابقة محفوظة");
    }
    catch (e) {
        setNotice(e instanceof Error ? e.message : "تعذر تعطيل الختم");
    }
    finally {
        setBusy(false);
    } }
    return <section><h3>مكتبة الأختام</h3><p>أضف أكثر من ختم باسم مميز، ثم اختر الختم المناسب عند اعتماد العرض أو العقد.</p><div className="stamp-picker-grid">{stamps.map(stamp => <article className="stamp-choice-card" key={stamp.id}><strong>{stamp.name}</strong><a href={`/api/portal/document-stamps?id=${stamp.id}`} target="_blank" rel="noreferrer">معاينة الختم</a><button type="button" disabled={busy} onClick={() => void deactivate(stamp.id)}>تعطيل للاستخدام الجديد</button></article>)}</div><form onSubmit={add}><label>اسم الختم<input name="name" required minLength={2} maxLength={100}/></label><label>صورة الختم<input name="file" type="file" accept="image/png,image/jpeg" required/></label><button className="admin-primary" disabled={busy}>إضافة ختم جديد</button></form>{notice && <p role="status">{notice}</p>}</section>;
}
