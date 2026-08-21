import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import PublicPageShell from "@/app/components/PublicPageShell";
import StructuredData from "@/app/components/StructuredData";
import { absoluteUrl, SITE } from "@/lib/site";
import { getWebsiteContent } from "@/lib/website-content";

export const metadata: Metadata = {
  title: "حلول القوى العاملة لموسمي رمضان والحج في السعودية",
  description: "تخطيط وتوفير القوى العاملة والفرق التشغيلية لموسمي رمضان والحج في مكة ومدن المملكة، بحسب المواقع والورديات وفترات الذروة.",
  alternates: { canonical: "/seasons" },
  openGraph: { type: "website", locale: SITE.locale, url: "/seasons", title: "حلول موسمي رمضان والحج", description: "خطة موسمية تبدأ من تقدير الطلب وتنتهي بمتابعة الفرق في مواقع العمل." },
};

export default async function SeasonsPage() {
  const content = await getWebsiteContent();
  if (!content.visibility.hajj) notFound();
  const data = { "@context": "https://schema.org", "@graph": [
    { "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "الرئيسية", item: absoluteUrl("/") }, { "@type": "ListItem", position: 2, name: "رمضان والحج", item: absoluteUrl("/seasons") }] },
    { "@type": "Service", name: "حلول القوى العاملة لموسمي رمضان والحج", serviceType: "تخطيط وتوفير القوى العاملة الموسمية", areaServed: { "@type": "Country", name: "المملكة العربية السعودية" }, provider: { "@type": "Organization", "@id": `${SITE.url}/#organization` }, url: absoluteUrl("/seasons") },
  ] };
  return <PublicPageShell><StructuredData data={data}/>
    <section className="inner-hero hajj-inner-hero"><nav className="page-breadcrumbs" aria-label="مسار الصفحة"><Link href="/">الرئيسية</Link><span>/</span><span>رمضان والحج</span></nav><p className="eyebrow light"><span/>التشغيل الموسمي</p><h1>استعد مبكرًا،<br/><em>قبل أن يبدأ ضغط الموسم.</em></h1><p>رمضان والحج ليسا موسمًا واحدًا باسمين مختلفين. لكل منهما ساعات عمل ومواقع وذروة خاصة، ولذلك نجهز لكل موسم فريقه وترتيباته.</p></section>
    <section className="inner-content"><div className="inner-heading"><p className="eyebrow"><span/>اختر الموسم</p><h2>ما يصلح لرمضان لا يكفي للحج</h2><p>رمضان يحتاج إلى تغطية أطول في المساء وزيادة محسوبة للعشر الأواخر. أما الحج فيحتاج إلى فرق موزعة بدقة على المواقع والفترات.</p></div>
      <div className="related-grid"><Link href="/ramadan"><span>رمضان</span><strong>فرق مرنة للشهر والعشر الأواخر</strong><p>للضيافة والمرافق والنظافة والتشغيل والصيانة والخدمات المساندة.</p><b>استكشف حلول رمضان ←</b></Link><Link href="/hajj"><span>الحج</span><strong>جاهزية متعددة المواقع والورديات</strong><p>لتخطيط المهن والأعداد والتعبئة والبدائل خلال مراحل الموسم.</p><b>استكشف حلول الحج ←</b></Link></div>
      <div className="inner-card-grid"><article><span>01</span><h3>تقدير الطلب</h3><p>تقسيم الاحتياج حسب المدينة والموقع والمهنة والوردية وفترة الذروة.</p></article><article><span>02</span><h3>خطة تعبئة</h3><p>جدول واضح للبداية والتجهيز والتوزيع قبل ارتفاع الطلب.</p></article><article><span>03</span><h3>تغطية بديلة</h3><p>تحديد الأولويات ومسار التصعيد عند الغياب أو تغير الأعداد.</p></article><article><span>04</span><h3>متابعة تشغيلية</h3><p>قراءة الفجوة بين المطلوب والمتاح والمحجوز طوال الموسم.</p></article></div>
      <Link className="inner-callout" href="/contact#quote"><strong>ابدأ خطة الموسم من الآن</strong><span>اختر رمضان أو الحج أو كليهما وحدد المدينة والمواقع والورديات والأعداد.</span><b>طلب عرض موسمي ←</b></Link>
    </section>
  </PublicPageShell>;
}
