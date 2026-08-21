import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import PublicPageShell from "@/app/components/PublicPageShell";
import StructuredData from "@/app/components/StructuredData";
import { absoluteUrl, SITE } from "@/lib/site";
import { getWebsiteContent } from "@/lib/website-content";

export const metadata: Metadata = {
  title: "توفير قوى عاملة لموسم الحج في مكة",
  description: "حلول مرنة لتوفير القوى العاملة والفرق التشغيلية والفنية لموسم الحج في مكة، بحسب المواقع والفترات والمهن والورديات.",
  alternates: { canonical: "/hajj" },
  openGraph: { type: "website", locale: SITE.locale, url: "/hajj", title: "حلول القوى العاملة لموسم الحج في مكة", description: "فرق موسمية مرنة تدعم استمرارية الخدمة في أكثر مواسم مكة حيوية." },
};

export default async function HajjPage() {
  const content = await getWebsiteContent();
  if (!content.visibility.hajj) notFound();
  const data = { "@context": "https://schema.org", "@graph": [
    { "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "الرئيسية", item: absoluteUrl("/") }, { "@type": "ListItem", position: 2, name: "رمضان والحج", item: absoluteUrl("/seasons") }, { "@type": "ListItem", position: 3, name: "موسم الحج", item: absoluteUrl("/hajj") }] },
    { "@type": "Service", name: "توفير قوى عاملة لموسم الحج في مكة", description: "حلول قوى عاملة وفرق تشغيل وصيانة للاحتياج الموسمي في مكة بحسب المواقع والفترات والورديات.", url: absoluteUrl("/hajj"), areaServed: { "@type": "City", name: SITE.city }, provider: { "@type": "Organization", "@id": `${SITE.url}/#organization`, name: SITE.name, url: SITE.url } },
  ] };
  return <PublicPageShell>
    <StructuredData data={data}/>
    <section className="inner-hero hajj-inner-hero">
      <nav className="page-breadcrumbs" aria-label="مسار الصفحة"><Link href="/">الرئيسية</Link><span aria-hidden="true">/</span><Link href="/seasons">رمضان والحج</Link><span aria-hidden="true">/</span><span>موسم الحج</span></nav>
      <p className="eyebrow light"><span/>موسم الحج</p>
      <h1>قوى عاملة مرنة،<br/><em>لأداء ثابت طوال الموسم.</em></h1>
      <p>ندعم المنشآت ومواقع الخدمة في مكة بفرق تشغيلية وفنية تناسب مراحل التعبئة والذروة وتعدد المواقع والورديات خلال الحج.</p>
    </section>
    <section className="inner-content">
      <div className="inner-heading"><p className="eyebrow"><span/>مزايا الخدمة الموسمية</p><h2>شريك قريب عندما تتسارع الأعمال</h2><p>نساعد منشأتك على الاستعداد مبكراً والحفاظ على مستوى الخدمة، مع حلول مرنة تتكيف مع طبيعة الموقع وتوقيت الموسم.</p></div>
      <div className="inner-card-grid">
        <article><span>01</span><h3>استجابة أسرع</h3><p>تواصل مباشر لفهم أولويات المواقع والفترات الأكثر ازدحاماً.</p></article>
        <article><span>02</span><h3>تخصصات متنوعة</h3><p>عمالة تشغيلية وفنيون ومشرفون ضمن حل يناسب نطاق عملك.</p></article>
        <article><span>03</span><h3>مرونة في الأعداد</h3><p>خيارات تلائم تغير حجم الطلب بين مراحل الموسم المختلفة.</p></article>
        <article><span>04</span><h3>دعم للمواقع</h3><p>عناية بطبيعة الموقع والوردية ومتطلبات بدء الخدمة.</p></article>
        <article><span>05</span><h3>بدائل عند الحاجة</h3><p>استجابة للمتغيرات التشغيلية بما يدعم استمرارية أعمالك.</p></article>
        <article><span>06</span><h3>متابعة قريبة</h3><p>فريق محلي يبقى إلى جانبك طوال فترة التعاون.</p></article>
      </div>
      <section className="related-content hajj-guide-link"><div><p className="eyebrow"><span/>استعد مبكراً</p><h2>دليل عملي لاحتياج أكثر وضوحاً</h2></div><div className="related-grid"><Link href="/insights/hajj-season-workforce-readiness"><span>دليل</span><strong>كيف تستعد باحتياج القوى العاملة قبل موسم الحج؟</strong><p>نقاط تساعدك على تحديد المواقع والفترات والمهن والورديات قبل طلب العرض.</p><b>قراءة الدليل ←</b></Link><Link href="/services/manpower-supply-makkah"><span>خدمة</span><strong>توفير قوى عاملة في مكة</strong><p>تعرف على حلول دالي للشركات والمنشآت والمشروعات في مكة المكرمة.</p><b>تفاصيل الخدمة ←</b></Link></div></section>
      <Link className="inner-callout" href="/contact#quote"><strong>دعنا نساعدك في الاستعداد للحج</strong><span>شاركنا المواقع والفترات والتخصصات والأعداد المتوقعة ومتطلبات بدء الخدمة.</span><b>طلب عرض للحج ←</b></Link>
    </section>
  </PublicPageShell>;
}
