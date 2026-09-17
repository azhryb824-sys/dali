"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { readApiJson } from "@/lib/client-api";
import { normalizeSaudiWhatsAppNumber } from "@/lib/whatsapp";
import { openDaliWhatsApp, type DaliWhatsAppLinks } from "@/lib/whatsapp-runtime";
import { daliDesktopFileShareError, downloadDaliShareFiles, prepareDaliShareFiles, shareDaliFilesNatively, shareDaliFilesOnDesktop, sharePreparedDaliFiles, supportsDaliDesktopFileShare, supportsDaliNativeFileShare, supportsDaliWebFileShare, type DaliPreparedShareFiles, type DaliShareFileDescriptor } from "@/lib/file-share-runtime";

type ShareResult = DaliWhatsAppLinks & { files: DaliShareFileDescriptor[]; message: string; mobile: string };

export default function WhatsAppFileShareDialog({ title, endpoint, source, onClose }: {
  title: string; endpoint: string; source: { quoteId?: number; documentId?: number; contractId?: number }; onClose: () => void;
}) {
  const [mobile, setMobile] = useState("");
  const [candidates, setCandidates] = useState<Array<{ mobile: string; label: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [loadingNumber, setLoadingNumber] = useState(true);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<ShareResult | null>(null);
  const [prepared, setPrepared] = useState<DaliPreparedShareFiles | null>(null);
  const edited = useRef(false);
  const query = new URLSearchParams(Object.entries(source).map(([key, value]) => [key, String(value)])).toString();
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/portal/share-recipient?${query}`, { cache: "no-store", signal: controller.signal }).then(async response => {
      const body = await readApiJson(response) as { mobile?: string; candidates?: Array<{ mobile: string; label: string }> };
      if (controller.signal.aborted) return;
      setCandidates(body.candidates || []);
      if (!edited.current && body.mobile) setMobile(body.mobile);
    }).catch(() => undefined).finally(() => { if (!controller.signal.aborted) setLoadingNumber(false); });
    return () => controller.abort();
  }, [query]);

  async function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = normalizeSaudiWhatsAppNumber(mobile);
    if (!normalized) { setError("اكتب رقم واتساب سعودي صحيحًا"); return; }
    setMobile(normalized); setBusy(true); setError(""); setResult(null); setPrepared(null);
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...source, whatsappNumber: normalized, expiresInDays: 7, maxDownloads: 20 }) });
      const data = await readApiJson(response) as { error?: string; files?: DaliShareFileDescriptor[]; shareMessage?: string; whatsappUrl?: string; whatsappAppUrl?: string; whatsappWebUrl?: string; whatsappLaunchUrl?: string };
      if (!response.ok || !data.files?.length || !data.shareMessage || !data.whatsappUrl || !data.whatsappAppUrl || !data.whatsappWebUrl || !data.whatsappLaunchUrl) throw new Error(data.error || "تعذر تجهيز الملفات للمشاركة");
      // Fetch before the share-button gesture: navigator.share must run during user activation.
      if (!supportsDaliNativeFileShare() && !supportsDaliDesktopFileShare() && supportsDaliWebFileShare()) setPrepared(await prepareDaliShareFiles(data.files));
      setResult({ appUrl: data.whatsappAppUrl, universalUrl: data.whatsappUrl, webUrl: data.whatsappWebUrl, secureLaunchUrl: data.whatsappLaunchUrl, message: data.shareMessage, files: data.files, mobile: normalized });
      setNotice("الملفات جاهزة. اضغط مشاركة الملفات، ثم اختر واتساب والمستلم وأكد الإرسال داخله.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "تعذر تجهيز الملفات للمشاركة"); }
    finally { setBusy(false); }
  }

  async function shareFiles() {
    if (!result) return;
    const options = { title, text: result.message };
    setError(""); setBusy(true);
    try {
      if (supportsDaliNativeFileShare()) {
        await shareDaliFilesNatively(result.files, options);
      } else if (supportsDaliDesktopFileShare()) {
        const response = await shareDaliFilesOnDesktop(result.files, options);
        if (!response.opened) throw new Error(daliDesktopFileShareError(response.reason));
      } else if (prepared) {
        const outcome = await sharePreparedDaliFiles(prepared, options);
        if (outcome === "cancelled") { setNotice("أُلغيت المشاركة. لم يؤكد النظام إرسال الملفات."); return; }
        if (outcome === "unsupported") throw new Error("المشاركة المباشرة غير متاحة؛ نزّل الملفات ثم أرفقها في محادثة العميل.");
      } else {
        throw new Error("المشاركة المباشرة غير متاحة؛ نزّل الملفات ثم أرفقها في محادثة العميل.");
      }
      setNotice("سُلّمت الملفات إلى نافذة المشاركة. أكّد المستلم والإرسال داخل واتساب.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "تعذرت مشاركة الملفات"); }
    finally { setBusy(false); }
  }
  return <div className="modal-layer"><button className="drawer-backdrop" onClick={onClose} aria-label="إغلاق"/><section className="record-modal" role="dialog" aria-modal="true" aria-label="مشاركة الملفات عبر واتساب"><div className="drawer-head"><div><span>{title}</span><h2>مشاركة الملفات عبر واتساب</h2></div><button onClick={onClose} aria-label="إغلاق">×</button></div><form className="feature-form" onSubmit={prepare}>
    <label className="span-two">رقم واتساب العميل<input type="tel" dir="ltr" required maxLength={30} value={mobile} disabled={busy} onChange={event => { edited.current = true; setMobile(event.target.value); setResult(null); setPrepared(null); }} placeholder="05xxxxxxxx"/><small>{loadingNumber ? "جارٍ البحث عن رقم العميل…" : "يمكنك تعديل الرقم قبل تجهيز المشاركة."}</small></label>
    {candidates.length > 1 && <label className="span-two">أرقام العميل المسجلة<select value={candidates.some(item => item.mobile === mobile) ? mobile : ""} onChange={event => { edited.current = true; setMobile(event.target.value); setResult(null); setPrepared(null); }}><option value="" disabled>اختر رقم العميل</option>{candidates.map(item => <option key={item.mobile} value={item.mobile}>{item.label} — {item.mobile}</option>)}</select></label>}
    {!result && <button className="admin-primary span-two" disabled={busy || loadingNumber}>{busy ? "جارٍ تجهيز الملفات…" : "تجهيز الملفات للمشاركة"}</button>}
    {error && <p className="whatsapp-share-feedback error span-two" role="alert">{error}</p>}
    {result && <div className="span-two"><ul>{result.files.map(file => <li key={file.url}>{file.fileName}</li>)}</ul><div className="record-actions"><button type="button" className="admin-primary" disabled={busy} onClick={() => void shareFiles()}>مشاركة الملفات في واتساب</button><button type="button" onClick={() => openDaliWhatsApp("app", result)}>فتح محادثة العميل في التطبيق</button><button type="button" onClick={() => openDaliWhatsApp("web", result)}>فتح واتساب ويب</button><button type="button" onClick={() => downloadDaliShareFiles(result.files)}>تنزيل الملفات</button></div><p>زر فتح المحادثة يجهّز الرسالة والرابط. لإرفاق الملفات استخدم زر مشاركة الملفات، أو نزّلها وأرفقها داخل المحادثة.</p></div>}
    {notice && <p className="span-two" role="status">{notice}</p>}
  </form></section></div>;
}
