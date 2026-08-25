"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import type { WebsiteContent } from "@/lib/website-content";

export default function PublicHeader({ content }: { content: WebsiteContent }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchItems = useMemo(() => {
    const base = [
      { title: "من نحن", text: content.site.description, href: "/about", keywords: `${content.site.companyName} ${content.site.city} ${content.site.district}` },
      { title: "المقاولات وإدارة المشروعات", text: "تنفيذ المباني والتشطيبات والترميم والأعمال المدنية والكهروميكانيكية في مدن المملكة", href: "/construction", keywords: "شركة مقاولات السعودية مقاول عام تشطيبات ترميم أعمال مدنية إدارة مشاريع" },
      { title: "تخصصات المقاولات", text: "المباني والتشطيبات والترميم والأعمال المدنية والكهروميكانيكية", href: "/construction/services", keywords: "خدمات تخصصات مقاولات" },
      { title: "منهج تنفيذ المشروعات", text: "التأهيل والمعاينة والتقدير والتعاقد والتنفيذ والتسليم", href: "/construction/methodology", keywords: "إدارة تنفيذ مشروع" },
      { title: "الجودة والسلامة", text: "الفحوص واعتماد المواد وعدم المطابقة ومخاطر الموقع", href: "/construction/quality-safety", keywords: "جودة سلامة مقاولات" },
      { title: "مناطق خدمة المقاولات", text: "دراسة طلبات المشروعات من جميع مناطق المملكة", href: "/construction/regions", keywords: "مقاولات مناطق السعودية" },
      ...(content.visibility.hajj ? [
        { title: "حلول موسمي رمضان والحج", text: "تخطيط القوى العاملة والفرق التشغيلية لمواسم الذروة في مكة ومدن المملكة", href: "/seasons", keywords: "رمضان الحج عمرة موسم موسمي جاهزية تشغيل" },
        { title: "حلول موسم رمضان", text: "فرق مرنة للضيافة والتشغيل والصيانة والخدمات المساندة خلال رمضان", href: "/ramadan", keywords: "رمضان عمرة العشر الأواخر ضيافة تشغيل عمالة موسمية" },
        { title: "حلول موسم الحج", text: "فرق تشغيل وقوى عاملة للاحتياج الموسمي في مكة", href: "/hajj", keywords: "الحج موسم مشاعر مقدسة جاهزية تشغيل" },
      ] : []),
      { title: "طلب عرض سعر", text: "شاركنا احتياجك ليقترح فريق دالي الحل المناسب", href: "/contact", keywords: "تواصل استفسار سعر طلب شراكة" },
      ...(content.visibility.faq ? [{ title: "الأسئلة الشائعة", text: "إجابات عن الخدمات والتعاقد والعمالة", href: "/faq", keywords: "معلومات أسئلة" }] : []),
    ];
    const paths = { services: "/services", sectors: "/sectors", locations: "/locations", projects: "/projects", credentials: "/credentials", articles: "/insights", jobs: "/careers", partners: "/partners", pages: "/pages" } as const;
    const managed = Object.entries(content.collections).flatMap(([key, entries]) => entries
      .filter((item) => item.status === "published")
      .map((item) => ({
        title: item.shortTitle || item.title,
        text: item.summary,
        href: `${paths[key as keyof typeof paths]}${["credentials", "partners"].includes(key) ? "" : `/${item.slug}`}`,
        keywords: `${item.focusKeywords} ${item.tags.join(" ")}`,
      })));
    return [...base, ...managed];
  }, [content]);
  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle.length < 2) return [];
    return searchItems.filter((item) => `${item.title} ${item.text} ${item.keywords}`.toLowerCase().includes(needle)).slice(0, 6);
  }, [query, searchItems]);

  return <>
    <div className="location-bar"><span>{content.site.tagline}</span><span>{content.site.city} · {content.site.district}</span></div>
    <header className="site-header">
      <Link className="brand" href="/" aria-label={`${content.site.companyName} - الرئيسية`}><Image src="/dally-logo.jpg" alt={`شعار ${content.site.companyName}`} width={545} height={280} sizes="180px"/></Link>
      <button className="menu-btn" type="button" onClick={() => setMenuOpen((open) => !open)} aria-label={menuOpen ? "إغلاق القائمة" : "فتح القائمة"} aria-expanded={menuOpen}>☰</button>
      <nav className={menuOpen ? "open" : ""} onClick={() => setMenuOpen(false)} aria-label="التنقل الرئيسي">
        <Link href="/about">من نحن</Link>
        {content.visibility.services && <Link href="/services">خدماتنا</Link>}
        <Link href="/construction">المقاولات</Link>
        {content.visibility.sectors && <Link href="/sectors">القطاعات</Link>}
        {content.visibility.locations && <Link href="/locations">مناطق الخدمة</Link>}
        {content.visibility.hajj && <Link href="/seasons">رمضان والحج</Link>}
        {content.visibility.articles && <Link href="/insights">المعرفة</Link>}
        {content.visibility.pages && content.collections.pages.filter((item) => item.status === "published" && item.featured).slice(0, 2).map((item) => <Link href={`/pages/${item.slug}`} key={item.id}>{item.shortTitle || item.title}</Link>)}
      </nav>
      <div className="site-search">
        <label><span aria-hidden="true">⌕</span><input value={query} role="combobox" aria-controls="site-search-results" aria-autocomplete="list" onFocus={() => setSearchOpen(true)} onBlur={() => window.setTimeout(() => setSearchOpen(false), 120)} onChange={(event) => { setQuery(event.target.value); setSearchOpen(true); }} onKeyDown={(event) => { if (event.key === "Escape") setSearchOpen(false); if (event.key === "Enter" && results[0]) { event.preventDefault(); window.location.href = results[0].href; } }} placeholder="ابحث في الموقع" aria-label="البحث في جميع أقسام الموقع" aria-expanded={searchOpen && query.trim().length >= 2}/></label>
        {searchOpen && query.trim().length >= 2 && <div className="site-search-results" id="site-search-results" role="listbox">{results.length ? results.map((item) => <Link href={item.href} role="option" aria-selected="false" key={item.href} onMouseDown={(event) => event.preventDefault()} onClick={() => { setQuery(""); setSearchOpen(false); }}><strong>{item.title}</strong><span>{item.text}</span></Link>) : <p>لا توجد نتائج مطابقة. <Link href={`/search?q=${encodeURIComponent(query)}`}>البحث الموسع</Link></p>}</div>}
      </div>
      <Link className="header-cta" href="/contact#quote">اطلب عرض سعر <span aria-hidden="true">←</span></Link>
    </header>
  </>;
}
