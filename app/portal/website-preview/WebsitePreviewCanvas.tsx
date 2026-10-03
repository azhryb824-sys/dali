"use client";
import { visualFieldValue, visualFields } from "@/lib/website-visual-fields";
import { localizedPublicTree } from "@/app/components/LocalizedPublicTree";
import { translatePublicValue } from "@/lib/public-translation";
import type { AppLocale } from "@/lib/i18n";
import { PublicLocaleProvider } from "@/app/components/PublicLocaleProvider";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { WebsiteContent, WebsiteCollectionKey } from "@/lib/website-content";
import { WebsitePreviewMode } from "@/app/components/WebsitePreviewMode";
import PublicHome from "@/app/components/PublicHome";
import PublicHeader from "@/app/components/PublicHeader";
import ContactDetails from "@/app/components/ContactDetails";
import { WebsiteContentProvider } from "@/app/components/WebsiteContentProvider";
export default function WebsitePreviewCanvas() {
  const canvas = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<{ content: WebsiteContent; view: string; canManage: boolean; selected: string; locale: AppLocale } | null>(null);
  useEffect(() => {
    function receive(event: MessageEvent) {
      if (event.source !== window.parent || event.origin !== window.location.origin || event.data?.type !== "dali-website-draft") return;
      const value = event.data.content;
      if (value?.site && value?.home && value?.collections && value?.visibility && typeof event.data.view === "string") setDraft({ content: value, view: event.data.view, canManage: event.data.canManage === true, locale: event.data.locale === "en" || event.data.locale === "bn" ? event.data.locale : "ar", selected: typeof event.data.selected === "string" ? event.data.selected : "" });
    }
    window.addEventListener("message", receive);
    window.parent.postMessage({ type: "dali-preview-ready" }, window.location.origin);
    return () => window.removeEventListener("message", receive);
  }, []);
  useEffect(() => {
    if(!draft || !canvas.current)return;
    const fields=visualFields(draft.content);
    canvas.current.querySelectorAll<HTMLElement>("[data-visual-field]").forEach(element=>{delete element.dataset.visualField;element.classList.remove("visual-selected");element.removeAttribute("tabindex");});
    canvas.current.querySelectorAll<HTMLElement>("h1,h2,h3,h4,p,strong,em,span,li,address,img,[data-visual-source]").forEach(element=>{
      if(element.closest("form,script,style,.preview-form-placeholder") || !element.dataset.visualSource && element.querySelector("h1,h2,h3,p,strong,em,span,li"))return;
      const text=element.textContent?.replace(/\s+/g," ").trim();
      const rawImage=element.tagName==="IMG"?element.getAttribute("src"):null;
      const image=rawImage?.startsWith("/_next/image") ? new URL(rawImage,window.location.origin).searchParams.get("url") : rawImage;
      const match=fields.find(field=>element.dataset.visualSource ? field.path === element.dataset.visualSource : image ? field.kind==="image" && field.value===image : field.kind==="text" && !!text && visualFieldValue(draft.content,field,draft.locale).replace(/\s+/g," ").trim()===text);
      if(!match)return;
      element.dataset.visualField=match.path;element.tabIndex=0;
      element.classList.toggle("visual-selected",match.path===draft.selected);
    });
  }, [draft]);
  function select(element: HTMLElement) {
    const field=element.closest<HTMLElement>("[data-visual-field]")?.dataset.visualField;
    if(field)window.parent.postMessage({type:"dali-visual-select",path:field},window.location.origin);
  }
  if (!draft) return <p style={{ padding: 32 }}>جارٍ إعداد المعاينة...</p>;
  const { view, locale } = draft;
  const content = translatePublicValue(draft.content,locale,locale === "ar" ? {} : draft.content.translations[locale]);
  const entries = content.collections[view as WebsiteCollectionKey];
  return localizedPublicTree(<div ref={canvas} onKeyDown={event=>{if(event.key === "Enter" || event.key === " "){const element=event.target as HTMLElement;if(element.dataset.visualField){event.preventDefault();select(element);}}}} dir={locale === "ar" ? "rtl" : "ltr"} lang={locale} className="website-preview-canvas" onClickCapture={event => { select(event.target as HTMLElement); if ((event.target as HTMLElement).closest("a,button")) { event.preventDefault(); event.stopPropagation(); } }} onSubmitCapture={event => { event.preventDefault(); event.stopPropagation(); }}>
    <style>{`[data-visual-field]{cursor:pointer;outline-offset:4px;transition:outline .15s}[data-visual-field]:hover,[data-visual-field]:focus-visible{outline:2px dashed #b89145}.visual-selected{outline:3px solid #b89145!important;background-color:#f0cd8320!important}.language-switcher,.calendar-trigger{display:none!important}.website-preview-canvas{min-height:100vh}.preview-form-placeholder{padding:3rem;border:1px dashed #c9a45c;border-radius:20px;text-align:center;background:#fff;color:#17313e}.preview-entries{padding:32px;display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:18px}.preview-entries article{padding:24px;border:1px solid #ddd;border-radius:18px;background:#fff}.preview-entries img{width:100%;height:160px;object-fit:cover;border-radius:12px}.preview-entries small{color:#886a31}.preview-entries p{white-space:pre-line}.preview-entries h3{font-size:22px}`}</style>
    <PublicLocaleProvider locale={locale}><WebsitePreviewMode value={true}><WebsiteContentProvider content={content}>
      {view === "contact" ? <main className="public-inner-page"><PublicHeader content={content}/><section className="inner-hero contact-inner-hero"><p className="eyebrow light">تواصل معنا</p><h1>حدّثنا عن احتياجك،<br/><em>ودعنا نقترح الحل الأنسب.</em></h1></section><ContactDetails content={content} locale={locale}/><section className="inner-content"><div className="preview-form-placeholder">طلب عرض سعر</div></section></main>
        : entries ? <main className="public-inner-page"><PublicHeader content={content}/><section className="inner-hero"><p className="eyebrow light">{content.site.companyName}</p><h1 data-visual-source={entries.length ? `collections.${view}.0.shortTitle` : undefined}>{entries[0]?.shortTitle || content.home.servicesTitle}</h1><p>{content.site.tagline}</p></section><section className="preview-entries">{entries.map((entry, index) => <article key={entry.id}>{entry.image && <Image data-visual-source={`collections.${view}.${index}.image`} src={entry.image} alt={entry.imageAlt} width={800} height={450} unoptimized/>}<small>{entry.status === "draft" ? "مسودة" : "منشور"}</small><h3 data-visual-source={`collections.${view}.${index}.title`}>{entry.title}</h3><p data-visual-source={`collections.${view}.${index}.summary`}>{entry.summary}</p><p data-visual-source={`collections.${view}.${index}.body`}>{entry.body}</p>{entry.blocks.map((block, blockIndex) => <section key={blockIndex}><h4 data-visual-source={`collections.${view}.${index}.blocks.${blockIndex}.title`}>{block.title}</h4><p data-visual-source={`collections.${view}.${index}.blocks.${blockIndex}.text`}>{block.text}</p></section>)}</article>)}</section></main>
        : <PublicHome/>}
    </WebsiteContentProvider></WebsitePreviewMode></PublicLocaleProvider>
  </div>, locale, locale === "ar" ? {} : draft.content.translations[locale]);
}
