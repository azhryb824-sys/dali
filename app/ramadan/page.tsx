import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import PublicPageShell from "@/app/components/PublicPageShell";
import StructuredData from "@/app/components/StructuredData";
import { absoluteUrl, SITE } from "@/lib/site";
import { getWebsiteContent } from "@/lib/website-content";

export const metadata: Metadata = {
  title: "توفير قوى عاملة لموسم رمضان في السعودية",
  description: "حلول قوى عاملة وفرق تشغيل وصيانة وضيافة وخدمات مساندة لموسم رمضان والعشر الأواخر في مكة ومدن المملكة.",
  alternates: { canonical: "/ramadan" },
  openGraph: { type: "website", locale: SITE.locale, url: "/ramadan", title: "حلول القوى العاملة لموسم رمضان", description: "فرق مرنة لساعات التشغيل المتغيرة وفترات الذروة والعشر الأواخر." },
};

export default async function RamadanPage() {
  const content = await getWebsiteContent();
  if (!content.visibility.hajj) notFound();
  const data = { "@context": "https://schema.org", "@graph": [
    { "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "الرئيسية", item: absoluteUrl("/") }, { "@type": "ListItem", position: 2, name: "رمضان والحج", item: absoluteUrl("/seasons") }, { "@type": "ListItem", position: 3, name: "موسم رمضان", item: absoluteUrl("/ramadan") }] },
    { "@type": "Service", name: "توفير قوى عاملة لموسم رمضان", description: "فرق تشغيل وصيانة وضيافة وخدمات مساندة لموسم رمضان والعشر الأواخر بحسب المدينة والمواقع والورديات.", areaServed: { "@type": "Country", name: "المملكة العربية السعودية" }, provider: { "@type": "Organization", "@id": `${SITE.url}/#organization` }, url: absoluteUrl("/ramadan") },
  ] };
  return <PublicPageShell><StructuredData data={data}/>
    <section className="inner-hero hajj-inner-hero"><nav className="page-breadcrumbs" aria-label="مسار الصفحة"><Link href="/">الرئيسية</Link><span>/</span><Link href="/seasons">رمضان والحج</Link><span>/</span><span>رمضان</span></nav><p className="eyebrow light"><span/>موسم رمضان</p><h1>فرق جاهزة،<br/><em>لمتطلبات رمضان المتغيّرة.</em></h1><p>نساعد المنشآت على تغطية امتداد ساعات العمل وذروة المساء والعشر الأواخر بفرق تشغيلية وفنية وخدمات مساندة وفق احتياج كل مدينة وموقع.</p></section>
    <section className="inner-content"><div className="inner-heading"><p className="eyebrow"><span/>خطة رمضان</p><h2>لا تجعل العشر الأواخر تفاجئ فريقك</h2><p>أخبرنا بساعات العمل والمواقع ونسبة الإشغال المتوقعة. سنفصل احتياج بداية الشهر عن أيام الذروة، حتى لا تدفع لأعداد لا تحتاجها أو تواجه نقصًا حين يزداد العمل.</p></div>
      <div className="inner-card-grid"><article><span>01</span><h3>الضيافة وخدمة المرافق</h3><p>تغطية مرنة للفنادق ومرافق الضيافة ومواقع الخدمة بحسب ساعات العمل والإشغال.</p></article><article><span>02</span><h3>التشغيل والصيانة</h3><p>فرق فنية وتشغيلية تساعد على استمرارية المرافق خلال الساعات الممتدة.</p></article><article><span>03</span><h3>الخدمات المساندة</h3><p>تنظيم الاحتياج للنظافة والمناولة والمستودعات والدعم التشغيلي حسب الموقع.</p></article><article><span>04</span><h3>العشر الأواخر</h3><p>مراجعة مستقلة للأعداد والورديات والبدائل عندما تبلغ الحركة ذروتها.</p></article><article><span>05</span><h3>ورديات ليلية</h3><p>توزيع يحسب التسليم بين الورديات وأوقات الراحة ونقاط التجمع.</p></article><article><span>06</span><h3>متابعة الفجوات</h3><p>مقارنة المطلوب بالمتاح والمحجوز حتى تبقى قرارات الزيادة واضحة.</p></article></div>
      <section className="related-content"><div><p className="eyebrow"><span/>جهّز طلبك</p><h2>بيانات تجعل العرض أدق</h2></div><div className="related-grid"><Link href="/sectors/hotels-hospitality"><span>قطاع</span><strong>الفنادق والضيافة</strong><p>حلول تلائم تغير الإشغال والورديات وتجربة الضيف.</p><b>تفاصيل القطاع ←</b></Link><Link href="/services/operations-maintenance"><span>خدمة</span><strong>التشغيل والصيانة</strong><p>فرق تدعم استمرارية المرافق طوال ساعات التشغيل.</p><b>تفاصيل الخدمة ←</b></Link></div></section>
      <Link className="inner-callout" href="/contact#quote"><strong>خطط لرمضان والعشر الأواخر</strong><span>شاركنا المدينة والمواقع والمهن والأعداد والورديات وموعد البداية.</span><b>طلب عرض لرمضان ←</b></Link>
    </section>
  </PublicPageShell>;
}
