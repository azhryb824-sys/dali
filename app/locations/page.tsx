import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PublicPageShell from "@/app/components/PublicPageShell";
import { ManagedCollectionIndex } from "@/app/components/ManagedContentPages";
import { getWebsiteContent, publishedEntries } from "@/lib/website-content";
import Link from "next/link";
import { saudiRegions } from "@/lib/construction-content";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "مناطق الخدمة في جميع مدن المملكة العربية السعودية", description: "تقدم دالي خدمات القوى العاملة والتشغيل والصيانة والمقاولات في مدن ومحافظات مناطق المملكة الثلاث عشرة بحسب نطاق الطلب وخطة التعبئة والتنفيذ.", alternates: { canonical: "/locations" }, openGraph: { type: "website", url: "/locations", title: "خدمات دالي في جميع مدن المملكة", description: "تغطية تشغيلية للمشروعات والمنشآت في مناطق المملكة العربية السعودية الثلاث عشرة." } };

export default async function LocationsPage() {
  const content = await getWebsiteContent();
  if (!content.visibility.locations) notFound();
  const entries = publishedEntries(content, "locations");
  return <PublicPageShell>
    <ManagedCollectionIndex content={content} collectionKey="locations" title="نخدم أعمالك في جميع مدن المملكة" description="نستقبل طلبات المنشآت والمشروعات من مناطق المملكة الثلاث عشرة، ونبني خطة التعبئة أو التنفيذ بحسب المدينة وطبيعة الموقع والمدة والموارد المطلوبة." entries={entries} emptyTitle="خدمتك لا تتوقف على مدينة بعينها" emptyText="أرسل موقع العمل ونطاق الاحتياج، وسيتواصل معك المختص لتأكيد الجاهزية والبرنامج المناسب."/>
    <section className="inner-content" aria-labelledby="national-coverage-title">
      <div className="inner-heading"><p className="eyebrow"><span/>تغطية على مستوى المملكة</p><h2 id="national-coverage-title">ثلاث عشرة منطقة، وخدمة تمتد إلى مدنها ومحافظاتها</h2><p>وجود مقرنا في مكة المكرمة لا يحصر نطاق أعمالنا فيها. نخطط لكل طلب وفق موقع المشروع، وسهولة الوصول، وحجم الفريق أو نطاق المقاولة، ومتطلبات السلامة والبدء.</p></div>
      <div className="profession-grid" aria-label="مناطق المملكة التي تشملها الخدمة">{saudiRegions.map((region, index) => <article key={region}><span>{String(index + 1).padStart(2, "0")}</span><strong>{region}</strong></article>)}</div>
      <div className="request-checklist"><div><p className="eyebrow"><span/>كيف نؤكد الجاهزية؟</p><h2>خطة خدمة مرتبطة بموقعك الفعلي</h2><p>نؤكد تفاصيل التنفيذ بعد مراجعة بيانات الطلب، ولا نفترض وجود فرع أو فريق ثابت في كل مدينة.</p></div><ul><li>المدينة والعنوان أو إحداثيات الموقع</li><li>نوع الخدمة وحجم النطاق</li><li>تاريخ البدء والمدة والورديات</li><li>متطلبات الدخول والسلامة والسكن والنقل</li></ul></div>
      <Link className="inner-callout" href="/contact#quote"><strong>أين يقع مشروعك؟</strong><span>شاركنا المدينة ونطاق العمل لنراجع خطة التعبئة أو التنفيذ المناسبة.</span><b>اطلب دراسة احتياجك ←</b></Link>
    </section>
  </PublicPageShell>;
}
