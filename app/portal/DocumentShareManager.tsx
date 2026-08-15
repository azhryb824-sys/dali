"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type DocumentOption = { id: number; referenceCode: string; title: string };
type ShareLink = { id: string; documentId: number; expiresAt: string; revokedAt: string | null; maxDownloads: number; downloadCount: number; lastAccessedAt: string | null; createdBy: string; createdAt: string; document: DocumentOption | null };

const formatDate = (value: string) => new Intl.DateTimeFormat("ar-SA", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));

export default function DocumentShareManager({ documents }: { documents: DocumentOption[] }) {
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const response = await fetch("/api/portal/documents/share", { cache: "no-store" });
    const result = await response.json() as { links?: ShareLink[]; error?: string };
    if (!response.ok || !result.links) throw new Error(result.error || "تعذّر تحميل روابط المشاركة");
    setLinks(result.links);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load().catch((error) => setNotice(error instanceof Error ? error.message : "تعذّر التحميل")), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy("create"); setNotice("");
    try {
      const data = Object.fromEntries(new FormData(form).entries());
      const response = await fetch("/api/portal/documents/share", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
      const result = await response.json() as { shareUrl?: string; error?: string };
      if (!response.ok || !result.shareUrl) throw new Error(result.error || "تعذّر إنشاء الرابط");
      try { await navigator.clipboard.writeText(result.shareUrl); setNotice("أُنشئ الرابط ونُسخ. لن يظهر رمزه السري مرة أخرى."); }
      catch { window.prompt("انسخ الرابط؛ لن يظهر رمزه السري مرة أخرى", result.shareUrl); setNotice("أُنشئ الرابط بنجاح."); }
      await load();
    } catch (error) { setNotice(error instanceof Error ? error.message : "تعذّر إنشاء الرابط"); }
    finally { setBusy(""); }
  }

  async function revoke(link: ShareLink) {
    const reason = window.prompt("سبب إبطال الرابط")?.trim() || "";
    if (!reason) return;
    setBusy(link.id); setNotice("");
    try {
      const response = await fetch("/api/portal/documents/share", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ shareId: link.id, reason }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "تعذّر إبطال الرابط");
      setNotice("أُبطل الرابط وسُجل السبب في سجل التدقيق.");
      await load();
    } catch (error) { setNotice(error instanceof Error ? error.message : "تعذّر إبطال الرابط"); }
    finally { setBusy(""); }
  }

  const now = new Date().toISOString();
  return <section className="panel share-manager"><div className="panel-head"><div><h2>حوكمة روابط المشاركة</h2><p>مدة محددة، حد للتنزيل، وإبطال فوري مع سجل تدقيق.</p></div><span className="panel-count">{links.filter((item) => !item.revokedAt && item.expiresAt > now && item.downloadCount < item.maxDownloads).length} نشط</span></div><form onSubmit={create}><select name="documentId" required defaultValue=""><option value="" disabled>اختر المستند</option>{documents.map((item) => <option value={item.id} key={item.id}>{item.referenceCode} · {item.title}</option>)}</select><label>مدة الرابط بالأيام<input name="expiresInDays" type="number" min="1" max="30" defaultValue="7"/></label><label>حد التنزيل<input name="maxDownloads" type="number" min="1" max="200" defaultValue="20"/></label><button className="admin-primary" disabled={busy === "create"}>{busy === "create" ? "جارٍ الإنشاء" : "إنشاء ونسخ الرابط"}</button></form>{notice && <p className="share-manager-notice" role="status">{notice}</p>}<div className="share-link-list">{links.slice(0, 30).map((item) => { const active = !item.revokedAt && item.expiresAt > now && item.downloadCount < item.maxDownloads; return <article key={item.id}><span className={active ? "active" : "inactive"}>{active ? "نشط" : item.revokedAt ? "مُبطل" : item.downloadCount >= item.maxDownloads ? "اكتمل الحد" : "منتهٍ"}</span><p><strong>{item.document?.title || `مستند ${item.documentId}`}</strong><small>{item.document?.referenceCode || "—"} · أُنشئ {formatDate(item.createdAt)} · ينتهي {formatDate(item.expiresAt)}</small></p><b>{item.downloadCount}/{item.maxDownloads} تنزيل</b>{active && <button disabled={busy === item.id} onClick={() => void revoke(item)}>إبطال</button>}</article>; })}</div></section>;
}
