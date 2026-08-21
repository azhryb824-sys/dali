import type { Metadata } from "next";
import PublicPageShell from "@/app/components/PublicPageShell";
import { getPublicSearchIndex } from "@/lib/site-content";

export const metadata: Metadata = { title: "البحث في الموقع", alternates: { canonical: "/search" }, robots: { index: false, follow: true } };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const query = (await searchParams).q?.trim().slice(0, 80) || "";
  const tokens = query.toLowerCase().split(/\s+/).filter((item) => item.length > 1);
  const publicSearchIndex = await getPublicSearchIndex();
  const results = query.length >= 2 ? publicSearchIndex.filter((item) => tokens.every((token) => `${item.title} ${item.excerpt} ${item.keywords}`.toLowerCase().includes(token))) : [];
  return <PublicPageShell><section className="inner-hero search-inner-hero"><p className="eyebrow light"><span/>البحث الشامل</p><h1>ابحث في موقع دالي</h1><form action="/search" className="public-search-form"><input name="q" defaultValue={query} minLength={2} maxLength={80} autoFocus placeholder="مثال: عمالة موسم رمضان"/><button>بحث</button></form></section><section className="inner-content search-results-page"><h2>{query ? `نتائج البحث عن «${query}»` : "اكتب كلمتين على الأقل"}</h2>{results.length ? <div>{results.map((item) => <a href={item.href} key={item.href}><strong>{item.title}</strong><span>{item.excerpt}</span><b>فتح الصفحة ←</b></a>)}</div> : query.length >= 2 ? <p>لا توجد نتائج مطابقة. جرّب عبارة أقصر أو انتقل إلى <a href="/contact">صفحة التواصل</a>.</p> : null}</section></PublicPageShell>;
}
