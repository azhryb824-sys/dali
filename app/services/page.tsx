import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PublicPageShell from "@/app/components/PublicPageShell";
import { ManagedCollectionIndex } from "@/app/components/ManagedContentPages";
import { getWebsiteContent, publishedEntries } from "@/lib/website-content";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "خدمات القوى العاملة والتشغيل والمقاولات في السعودية",
  description: "حلول متكاملة للمنشآت والمشروعات في جميع مدن المملكة: توفير القوى العاملة، التشغيل والصيانة، والمقاولات وإدارة المشروعات.",
  alternates: { canonical: "/services" },
  openGraph: { type: "website", url: "/services", title: "خدمات دالي في جميع مدن المملكة", description: "قوى عاملة وتشغيل وصيانة ومقاولات للمشروعات والمنشآت في المملكة العربية السعودية." },
};

export default async function ServicesPage() {
  const content = await getWebsiteContent();
  if (!content.visibility.services) notFound();
  const entries = publishedEntries(content, "services");
  return <PublicPageShell>
    <ManagedCollectionIndex content={content} collectionKey="services" title="حلول متكاملة لأعمالك في جميع مدن المملكة" description="نجمع بين توفير القوى العاملة، والتشغيل والصيانة، والمقاولات وإدارة المشروعات ضمن نطاق واضح يناسب المدينة والموقع والمدة ومتطلبات التنفيذ." entries={entries} emptyTitle="نراجع احتياجك ونبني الحل المناسب" emptyText="شاركنا نوع النشاط والمدينة ونطاق العمل، وسيتولى المختص مراجعة الطلب واقتراح المسار الأنسب."/>
    <section className="inner-content" aria-labelledby="service-paths-title">
      <div className="inner-heading"><p className="eyebrow"><span/>مسارات الخدمة</p><h2 id="service-paths-title">اختر المسار الأقرب إلى احتياج مشروعك</h2><p>لكل نشاط فريق عمل وإجراءات متابعة مستقلة، مع نقطة اتصال واحدة تسهّل التنسيق من الطلب الأول حتى التسليم.</p></div>
      <div className="managed-card-grid">
        <article><span>01</span><p className="managed-card-tags">كوادر تشغيلية · فنية · إشرافية</p><h2>توفير القوى العاملة</h2><p>تحديد المهن والأعداد والورديات ومدة الإسناد، ثم متابعة الجاهزية والأداء بحسب احتياج المنشأة.</p><Link href="/contact#quote">اطلب فريق عمل ←</Link></article>
        <article><span>02</span><p className="managed-card-tags">تشغيل · صيانة · خدمات مساندة</p><h2>التشغيل والصيانة</h2><p>فرق متعددة التخصصات لخدمة المواقع والمنشآت وفق مؤشرات أداء ونطاق مسؤوليات وجدول متابعة واضح.</p><Link href="/contact#quote">اطلب خطة تشغيل ←</Link></article>
        <article><span>03</span><p className="managed-card-tags">دراسة · تنفيذ · جودة · تسليم</p><h2>المقاولات وإدارة المشروعات</h2><p>قسم مستقل يغطي الأعمال الإنشائية والمدنية والكهروميكانيكية والتشطيبات وإدارة التكلفة والبرنامج.</p><Link href="/construction">انتقل إلى قسم المقاولات ←</Link></article>
      </div>
    </section>
  </PublicPageShell>;
}
