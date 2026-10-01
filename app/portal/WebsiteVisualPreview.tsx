"use client";
import { useEffect, useRef, useState } from "react";
import type { WebsiteContent } from "@/lib/website-content";
export default function WebsiteVisualPreview({ content, section }: { content: WebsiteContent; section: string }) {
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
    function listen(event: MessageEvent) { if (event.origin === window.location.origin && event.source === frame.current?.contentWindow && event.data?.type === "dali-preview-ready") setReady(true); }
    window.addEventListener("message", listen); return () => window.removeEventListener("message", listen);
  }, []);
  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(() => frame.current?.contentWindow?.postMessage({ type: "dali-website-draft", content, view }, window.location.origin), 120);
    return () => window.clearTimeout(timer);
  }, [content, view, ready]);
  return <aside className="website-live-preview" aria-label="المعاينة المرئية للموقع">
    <header><div><span className="preview-status-dot"/><strong>معاينة فورية</strong><small>مسودة قبل النشر</small></div><div className="preview-device-switch" role="group" aria-label="حجم المعاينة"><button type="button" aria-pressed={device === "desktop"} onClick={() => setDevice("desktop")}>كمبيوتر</button><button type="button" aria-pressed={device === "mobile"} onClick={() => setDevice("mobile")}>جوال</button></div></header>
    <label className="preview-page-select">الصفحة المعروضة<select value={page} onChange={event => setPage(event.target.value)}><option value="auto">حسب القسم المحدد</option><option value="home">الصفحة الرئيسية</option><option value="contact">تواصل معنا</option>{Object.keys(content.collections).map(key => <option key={key} value={key}>{({ services: "الخدمات", sectors: "القطاعات", locations: "مناطق الخدمة", projects: "المشروعات", credentials: "التراخيص", articles: "المعرفة", jobs: "الوظائف", partners: "الشركاء", pages: "الصفحات الإضافية" } as Record<string, string>)[key]}</option>)}</select></label>
    <div className={`preview-browser device-${device}`}><div className="preview-browser-bar"><i/><i/><i/><span>dally.info · {view === "contact" ? "contact" : view}</span></div><div className="preview-screen" ref={screen}><iframe style={device === "desktop" ? { width: 1280, height: Math.round(viewport.height * 1280 / Math.max(viewport.width, 1)), transform: `scale(${viewport.width / 1280})`, transformOrigin: "top right", position: "absolute", right: 0, top: 0 } : undefined} ref={frame} title="معاينة مسودة الموقع" src="/portal/website-preview" sandbox="allow-scripts allow-same-origin" onLoad={() => setLoaded(true)}/></div></div>
    {!ready && loaded && <p role="status">تعذّر تشغيل المعاينة. تحقق من جلسة الدخول ثم أعد فتح قسم الموقع.</p>}
    <p className="preview-hint">تظهر تغييرات النصوص والصور والأقسام هنا قبل حفظها. الروابط والنماذج معطلة داخل المعاينة.</p>
  </aside>;
}
