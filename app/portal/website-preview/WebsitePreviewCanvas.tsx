"use client";
import Image from "next/image";
import { useEffect, useState } from "react";
import type { WebsiteContent, WebsiteCollectionKey } from "@/lib/website-content";
import { WebsitePreviewMode } from "@/app/components/WebsitePreviewMode";
import PublicHome from "@/app/components/PublicHome";
import PublicHeader from "@/app/components/PublicHeader";
import ContactDetails from "@/app/components/ContactDetails";
import { WebsiteContentProvider } from "@/app/components/WebsiteContentProvider";
export default function WebsitePreviewCanvas() {
  const [draft, setDraft] = useState<{ content: WebsiteContent; view: string } | null>(null);
  useEffect(() => {
    function receive(event: MessageEvent) {
      if (event.source !== window.parent || event.origin !== window.location.origin || event.data?.type !== "dali-website-draft") return;
      const value = event.data.content;
      if (value?.site && value?.home && value?.collections && value?.visibility && typeof event.data.view === "string") setDraft({ content: value, view: event.data.view });
    }
    window.addEventListener("message", receive);
    window.parent.postMessage({ type: "dali-preview-ready" }, window.location.origin);
    return () => window.removeEventListener("message", receive);
  }, []);
  if (!draft) return <p style={{ padding: 32 }}>جارٍ إعداد المعاينة...</p>;
  const { content, view } = draft;
  const entries = content.collections[view as WebsiteCollectionKey];
  return <div dir="rtl" lang="ar" className="website-preview-canvas" onClickCapture={event => { if ((event.target as HTMLElement).closest("a,button")) { event.preventDefault(); event.stopPropagation(); } }} onSubmitCapture={event => { event.preventDefault(); event.stopPropagation(); }}>
    <style>{`.language-switcher,.calendar-trigger{display:none!important}.website-preview-canvas{min-height:100vh}.preview-form-placeholder{padding:3rem;border:1px dashed #c9a45c;border-radius:20px;text-align:center;background:#fff;color:#17313e}.preview-entries{padding:32px;display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:18px}.preview-entries article{padding:24px;border:1px solid #ddd;border-radius:18px;background:#fff}.preview-entries img{width:100%;height:160px;object-fit:cover;border-radius:12px}.preview-entries small{color:#886a31}.preview-entries p{white-space:pre-line}.preview-entries h3{font-size:22px}`}</style>
    <WebsitePreviewMode value={true}><WebsiteContentProvider content={content}>
      {view === "contact" ? <main className="public-inner-page"><PublicHeader content={content}/><section className="inner-hero contact-inner-hero"><p className="eyebrow light">تواصل معنا</p><h1>حدّثنا عن احتياجك،<br/><em>ودعنا نقترح الحل الأنسب.</em></h1></section><ContactDetails content={content}/><section className="inner-content"><div className="preview-form-placeholder">طلب عرض سعر</div></section></main>
        : entries ? <main className="public-inner-page"><PublicHeader content={content}/><section className="inner-hero"><p className="eyebrow light">{content.site.companyName}</p><h1>{entries[0]?.shortTitle || content.home.servicesTitle}</h1><p>{content.site.tagline}</p></section><section className="preview-entries">{entries.map(entry => <article key={entry.id}>{entry.image && <Image src={entry.image} alt={entry.imageAlt} width={800} height={450} unoptimized/>}<small>{entry.status === "draft" ? "مسودة" : "منشور"}</small><h3>{entry.title}</h3><p>{entry.summary}</p><p>{entry.body}</p>{entry.blocks.map((block, index) => <section key={index}><h4>{block.title}</h4><p>{block.text}</p></section>)}</article>)}</section></main>
        : <PublicHome/>}
    </WebsiteContentProvider></WebsitePreviewMode>
  </div>;
}
