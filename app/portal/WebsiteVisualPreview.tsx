"use client";
import { useEffect, useRef, useState } from "react";
import { readApiJson } from "@/lib/client-api";
import { visualFieldValue, visualFields } from "@/lib/website-visual-fields";
import type { AppLocale } from "@/lib/i18n";
import type { WebsiteContent } from "@/lib/website-content";
export default function WebsiteVisualPreview({ content, section, canManage, onEdit, onUploadStateChange }: { content: WebsiteContent; section: string; canManage: boolean; onEdit: (path: string,value: string, locale: AppLocale) => void; onUploadStateChange: (busy: boolean) => void }) {
  const [locale, setLocale] = useState<AppLocale>("ar");
  const [uploading,setUploading] = useState(false);
  const [uploadError,setUploadError] = useState("");
  async function uploadImage(file: File, path: string) {
    if(!canManage || uploading)return;
    setUploading(true);onUploadStateChange(true);setUploadError("");
    try { const body=new FormData();body.set("file",file);const response=await fetch("/api/portal/website/assets",{method:"POST",body});const result=await readApiJson(response) as {url?:string;error?:string};if(!response.ok || !result.url)throw new Error(result.error || "تعذّر رفع الصورة");onEdit(path,result.url,"ar"); }
    catch(error){setUploadError(error instanceof Error ? error.message : "تعذّر رفع الصورة");}finally{setUploading(false);onUploadStateChange(false);}
  }
  const [search,setSearch] = useState("");
  const [selected, setSelected] = useState("");
  const fields = visualFields(content);
  const active = fields.find(field => field.path === selected);
  const translatedField = active && locale !== "ar" && active.kind === "text" && /[\u0600-\u06ff]/.test(active.value) && !/^(phone|email|mapUrl|googleBusinessUrl|commercialRegistration|vatNumber)$/.test(active.path.split(".").at(-1)!);
  const screen = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ width: 640, height: 700 });
  const frame = useRef<HTMLIFrameElement>(null);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [page, setPage] = useState("auto");
  const [ready, setReady] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const view = page === "auto" ? section === "identity" ? "contact" : section : page;
  useEffect(() => {
    const element = screen.current; if (!element) return;
    const observer = new ResizeObserver(([entry]) => setViewport({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(element); return () => observer.disconnect();
  }, []);
  useEffect(() => {
    function listen(event: MessageEvent) {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow) return;
      if(event.data?.type === "dali-preview-ready") setReady(true);
      if(event.data?.type === "dali-visual-select" && typeof event.data.path === "string") setSelected(event.data.path);
    }
    window.addEventListener("message", listen); return () => window.removeEventListener("message", listen);
  }, []);
  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(() => frame.current?.contentWindow?.postMessage({ type: "dali-website-draft", content, view, canManage, selected, locale }, window.location.origin), 120);
    return () => window.clearTimeout(timer);
  }, [content, view, ready, canManage, selected, locale]);
  return <aside className="website-live-preview" aria-label="المعاينة المرئية للموقع">
    <header><div><span className="preview-status-dot"/><strong>معاينة فورية</strong><small>مسودة قبل النشر</small></div><div className="preview-device-switch" role="group" aria-label="حجم المعاينة"><button type="button" aria-pressed={device === "desktop"} onClick={() => setDevice("desktop")}>كمبيوتر</button><button type="button" aria-pressed={device === "mobile"} onClick={() => setDevice("mobile")}>جوال</button></div></header>
    <label className="preview-page-select">لغة المحتوى والمعاينة<select value={locale} disabled={uploading} onChange={event => setLocale(event.target.value as AppLocale)}><option value="ar">العربية</option><option value="en">English</option><option value="bn">বাংলা</option></select></label>
    <label className="preview-page-select">الصفحة المعروضة<select value={page} onChange={event => setPage(event.target.value)}><option value="auto">حسب القسم المحدد</option><option value="home">الصفحة الرئيسية</option><option value="contact">تواصل معنا</option>{Object.keys(content.collections).map(key => <option key={key} value={key}>{({ services: "الخدمات", sectors: "القطاعات", locations: "مناطق الخدمة", projects: "المشروعات", credentials: "التراخيص", articles: "المعرفة", jobs: "الوظائف", partners: "الشركاء", pages: "الصفحات الإضافية" } as Record<string, string>)[key]}</option>)}</select></label>
    <div className={`preview-browser device-${device}`}><div className="preview-browser-bar"><i/><i/><i/><span>dally.info · {view === "contact" ? "contact" : view}</span></div><div className="preview-screen" ref={screen}><iframe style={device === "desktop" ? { width: 1280, height: Math.round(viewport.height * 1280 / Math.max(viewport.width, 1)), transform: `scale(${viewport.width / 1280})`, transformOrigin: "top right", position: "absolute", right: 0, top: 0 } : undefined} ref={frame} title="معاينة مسودة الموقع" src="/portal/website-preview" sandbox="allow-scripts allow-same-origin" onLoad={() => setLoaded(true)}/></div></div>
    {!ready && loaded && <p role="status">تعذّر تشغيل المعاينة. تحقق من جلسة الدخول ثم أعد فتح قسم الموقع.</p>}
    <div className="visual-field-inspector">
      <h3>تحرير العنصر المحدد</h3>
      <input className="visual-field-search" aria-label="البحث في أدوات التحرير" placeholder="البحث في أدوات التحرير" value={search} onChange={event=>setSearch(event.target.value)}/>
      <select aria-label="اختيار حقل للتحرير" value={active?.path || ""} onChange={event=>setSelected(event.target.value)}><option value="">اختر عنصرًا من الصفحة</option>{fields.filter(field=>field.path===selected || field.label.includes(search.trim())).map(field=><option value={field.path} key={field.path}>{field.label}</option>)}</select>
      {active ? <div>{active.label}{translatedField && <p dir="rtl">{active.value}</p>}<textarea aria-label={active.label} key={active.path} value={translatedField ? visualFieldValue(content,active,locale) : active.value} disabled={!canManage} rows={active.kind === "image" ? 2 : 4} maxLength={translatedField ? 6000 : 8000} dir={locale !== "ar" || active.kind === "image" ? "ltr" : "rtl"} lang={translatedField ? locale : undefined} onChange={event=>onEdit(active.path,event.target.value,translatedField ? locale : "ar")}/>{active.kind === "image" && <label className="visual-image-upload">رفع صورة<input type="file" accept="image/png,image/jpeg" disabled={!canManage || uploading} onChange={event=>{const file=event.target.files?.[0];if(file)void uploadImage(file,active.path);event.target.value="";}}/>{uploading && <small>جارٍ رفع الصورة...</small>}</label>}</div> : <p>اضغط على النص أو الصورة داخل الصفحة لفتح أدوات تحريره.</p>}
      {uploadError && <p role="alert">{uploadError}</p>}
    </div>
    <p className="preview-hint">تظهر تغييرات النصوص والصور والأقسام هنا قبل حفظها. الروابط والنماذج معطلة داخل المعاينة.</p>
  </aside>;
}
