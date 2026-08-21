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
    <ManagedCollectionIndex content={content} collectionKey="locations" title="نصل بخدماتنا إلى جميع مدن المملكة" description="من مكة إلى الرياض وجدة والدمام، نستقبل طلبات القوى العاملة والتشغيل والمقاولات ونرتب بدء العمل بما يناسب موقع المشروع." entries={entries} emptyTitle="مدينتك ضمن نطاق خدمتنا" emptyText="أرسل موقع العمل والخدمة المطلوبة، وسيتواصل معك الفريق لتحديد موعد البدء والترتيبات اللازمة."/>
    <section className="inner-content" aria-labelledby="national-coverage-title">
      <div className="inner-heading"><p className="eyebrow"><span/>تغطية على مستوى المملكة</p><h2 id="national-coverage-title">ثلاث عشرة منطقة، ومدن ومحافظات نخدمها</h2><p>مقرنا في مكة المكرمة، لكن عملنا لا يتوقف عند حدودها. نرتب الفرق والمواد والتنقل من واقع موقع المشروع وحجمه وموعد بدايته.</p></div>
      <div className="profession-grid" aria-label="مناطق المملكة التي تشملها الخدمة">{saudiRegions.map((region, index) => <article key={region}><span>{String(index + 1).padStart(2, "0")}</span><strong>{region}</strong></article>)}</div>
      <div className="request-checklist"><div><p className="eyebrow"><span/>قبل أن نحدد موعد البدء</p><h2>نحتاج إلى معرفة موقع العمل بدقة</h2><p>عنوان الموقع وحجم العمل والموعد المطلوب هي ما يحدد ترتيبات الفريق، لا اسم المدينة وحده.</p></div><ul><li>المدينة والعنوان أو إحداثيات الموقع</li><li>نوع الخدمة وحجم النطاق</li><li>تاريخ البدء والمدة والورديات</li><li>متطلبات الدخول والسلامة والسكن والنقل</li></ul></div>
      <Link className="inner-callout" href="/contact#quote"><strong>أين يقع مشروعك؟</strong><span>أرسل المدينة وموقع العمل والخدمة المطلوبة، ودع الباقي لفريق دالي.</span><b>اطلب عرض سعر ←</b></Link>
    </section>
  </PublicPageShell>;
}
