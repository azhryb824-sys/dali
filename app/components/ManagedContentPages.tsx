import Link from "next/link";
import Image from "next/image";
import StructuredData from "@/app/components/StructuredData";
import { absoluteUrl, SITE } from "@/lib/site";
import { entryPath, type ManagedEntry, type WebsiteCollectionKey, type WebsiteContent } from "@/lib/website-content";

const collectionLabels: Record<WebsiteCollectionKey, { eyebrow: string; singular: string }> = {
  services: { eyebrow: "خدماتنا", singular: "الخدمة" },
  sectors: { eyebrow: "القطاعات", singular: "القطاع" },
  locations: { eyebrow: "مناطق الخدمة", singular: "الموقع" },
  projects: { eyebrow: "المشروعات وسابقة الأعمال", singular: "المشروع" },
  credentials: { eyebrow: "التراخيص والاعتمادات", singular: "الاعتماد" },
  articles: { eyebrow: "مركز المعرفة", singular: "الدليل" },
  jobs: { eyebrow: "الوظائف", singular: "الفرصة" },
  partners: { eyebrow: "الموردون والشركاء", singular: "الشريك" },
  pages: { eyebrow: "صفحات الشركة", singular: "الصفحة" },
};

export function ManagedCollectionIndex({ content, collectionKey, title, description, entries, emptyTitle, emptyText }: {
  content: WebsiteContent;
  collectionKey: WebsiteCollectionKey;
  title: string;
  description: string;
  entries: ManagedEntry[];
  emptyTitle: string;
  emptyText: string;
}) {
  const base = entryPath(collectionKey, { slug: "", } as ManagedEntry).replace(/\/$/, "");
  const data = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: "الرئيسية", item: absoluteUrl("/") },
        { "@type": "ListItem", position: 2, name: collectionLabels[collectionKey].eyebrow, item: absoluteUrl(base) },
      ] },
      { "@type": "CollectionPage", name: title, description, url: absoluteUrl(base), inLanguage: SITE.language, publisher: { "@type": "Organization", "@id": `${SITE.url}/#organization`, name: content.site.companyName }, mainEntity: entries.map((entry) => ({ "@type": "Thing", name: entry.title, description: entry.summary, url: absoluteUrl(entryPath(collectionKey, entry)) })) },
    ],
  };
  return <>
    <StructuredData data={data}/>
    <section className="inner-hero managed-collection-hero"><nav className="page-breadcrumbs" aria-label="مسار الصفحة"><Link href="/">الرئيسية</Link><span aria-hidden="true">/</span><span>{collectionLabels[collectionKey].eyebrow}</span></nav><p className="eyebrow light"><span/>{collectionLabels[collectionKey].eyebrow}</p><h1>{title}</h1><p>{description}</p></section>
    <section className="inner-content managed-collection-index">
      {entries.length ? <div className="managed-card-grid">{entries.map((entry, index) => {
        const href = entryPath(collectionKey, entry);
        const linked = collectionKey !== "credentials" && collectionKey !== "partners";
        return <article key={entry.id}>{collectionKey === "partners" && entry.image && <Image className="partner-card-logo" src={entry.image} alt={entry.imageAlt || `شعار ${entry.shortTitle || entry.title}`} width={220} height={120} unoptimized/>}<span>{String(index + 1).padStart(2, "0")}</span><p className="managed-card-tags">{entry.tags.slice(0, 3).join(" · ")}</p><h2>{linked ? <Link href={href}>{entry.shortTitle || entry.title}</Link> : entry.shortTitle || entry.title}</h2><p>{entry.summary}</p>{linked && <Link href={href}>عرض التفاصيل ←</Link>}</article>;
      })}</div> : <div className="managed-empty-state"><span aria-hidden="true">✓</span><h2>{emptyTitle}</h2><p>{emptyText}</p><Link href="/contact">تواصل مع الشركة ←</Link></div>}
      <Link className="inner-callout" href="/contact#quote"><strong>هل لديك احتياج يحتاج إلى مراجعة؟</strong><span>شاركنا المهن والأعداد والموقع والمدة لنبدأ بنطاق واضح.</span><b>طلب عرض سعر ←</b></Link>
    </section>
  </>;
}

export function ManagedEntryDetail({ content, collectionKey, entry }: { content: WebsiteContent; collectionKey: WebsiteCollectionKey; entry: ManagedEntry }) {
  const basePath = entryPath(collectionKey, { slug: "", } as ManagedEntry).replace(/\/$/, "");
  const canonical = entryPath(collectionKey, entry);
  const label = collectionLabels[collectionKey];
  const primaryType = collectionKey === "articles" || collectionKey === "projects" ? "Article" : collectionKey === "services" || collectionKey === "sectors" || collectionKey === "locations" ? "Service" : "WebPage";
  const primary = primaryType === "Article" ? {
    "@type": "Article", headline: entry.title, description: entry.seoDescription, datePublished: entry.publishedAt, dateModified: entry.updatedAt,
    author: { "@type": "Organization", "@id": `${SITE.url}/#organization`, name: content.site.companyName }, publisher: { "@id": `${SITE.url}/#organization` }, mainEntityOfPage: absoluteUrl(canonical), inLanguage: SITE.language,
  } : primaryType === "Service" ? {
    "@type": "Service", name: entry.title, description: entry.seoDescription, url: absoluteUrl(canonical), serviceType: entry.shortTitle,
    areaServed: collectionKey === "locations" ? { "@type": "City", name: entry.shortTitle || entry.title } : { "@type": "Country", name: "المملكة العربية السعودية" }, provider: { "@type": "Organization", "@id": `${SITE.url}/#organization`, name: content.site.companyName, url: SITE.url },
  } : { "@type": "WebPage", name: entry.title, description: entry.seoDescription, url: absoluteUrl(canonical), inLanguage: SITE.language };
  const data = { "@context": "https://schema.org", "@graph": [
    { "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "الرئيسية", item: absoluteUrl("/") },
      { "@type": "ListItem", position: 2, name: label.eyebrow, item: absoluteUrl(basePath) },
      { "@type": "ListItem", position: 3, name: entry.shortTitle || entry.title, item: absoluteUrl(canonical) },
    ] },
    primary,
    ...(entry.faqs.length ? [{ "@type": "FAQPage", mainEntity: entry.faqs.map((faq) => ({ "@type": "Question", name: faq.question, acceptedAnswer: { "@type": "Answer", text: faq.answer } })) }] : []),
  ] };
  return <>
    <StructuredData data={data}/>
    <section className="service-detail-hero managed-entry-hero" style={{ "--service-image": `url(${entry.image})` } as React.CSSProperties}>
      <nav className="page-breadcrumbs" aria-label="مسار الصفحة"><Link href="/">الرئيسية</Link><span aria-hidden="true">/</span><Link href={basePath}>{label.eyebrow}</Link><span aria-hidden="true">/</span><span>{entry.shortTitle || entry.title}</span></nav>
      <p className="eyebrow light"><span/>{label.eyebrow} · {collectionKey === "locations" ? (entry.shortTitle || entry.title) : "جميع مدن المملكة"}</p><h1>{entry.title}</h1><p>{entry.body || entry.summary}</p><div className="detail-actions"><Link className="btn primary" href="/contact#quote">اطلب عرض سعر <span aria-hidden="true">←</span></Link><a className="text-link" href="#details">عرض التفاصيل <span aria-hidden="true">↓</span></a></div>
    </section>
    <article className="service-detail inner-content" id="details">
      <section className="detail-overview"><div><p className="eyebrow"><span/>نطاق واضح</p><h2>{entry.shortTitle || label.singular}</h2><p>{entry.summary}</p></div><ul aria-label="المجالات المرتبطة">{entry.tags.map((tag) => <li key={tag}>{tag}</li>)}</ul></section>
      {entry.blocks.length > 0 && <div className="scope-grid">{entry.blocks.map((block, index) => <section key={`${block.title}-${index}`}><span>{String(index + 1).padStart(2, "0")}</span><h2>{block.title}</h2>{block.text.split(/\n{2,}/).map((paragraph) => <p key={paragraph}>{paragraph}</p>)}{block.checklist.length > 0 && <ul>{block.checklist.map((item) => <li key={item}>{item}</li>)}</ul>}</section>)}</div>}
      {entry.checklist.length > 0 && <section className="request-checklist"><div><p className="eyebrow"><span/>قبل التواصل</p><h2>بيانات تساعد على مراجعة أدق</h2><p>كلما كان نطاق الطلب محددًا، قلّت الافتراضات وأصبح العرض أوضح.</p></div><ul>{entry.checklist.map((item) => <li key={item}>{item}</li>)}</ul></section>}
      {entry.faqs.length > 0 && <section className="detail-faq"><div><p className="eyebrow"><span/>أسئلة شائعة</p><h2>إجابات مرتبطة بهذه الصفحة</h2></div><div>{entry.faqs.map((faq) => <details key={faq.question}><summary>{faq.question}<span aria-hidden="true">+</span></summary><p>{faq.answer}</p></details>)}</div></section>}
      <Link className="inner-callout" href="/contact#quote"><strong>حوّل المعلومات إلى طلب واضح</strong><span>أرسل المهن والأعداد والموقع والمدة ومتطلبات التشغيل.</span><b>اطلب عرض سعر ←</b></Link>
    </article>
  </>;
}
