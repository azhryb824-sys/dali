import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PublicPageShell from "@/app/components/PublicPageShell";
import { ManagedCollectionIndex } from "@/app/components/ManagedContentPages";
import { getWebsiteContent, publishedEntries } from "@/lib/website-content";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "خدمات توفير العمالة والتشغيل والصيانة في مكة",
  description: "خدمات توفير عمالة وفنيين وفرق تشغيل وصيانة للمشروعات والمنشآت في مكة المكرمة، مع جاهزية لموسم الحج.",
  alternates: { canonical: "/services" },
  openGraph: { type: "website", url: "/services", title: "خدمات توفير العمالة والتشغيل والصيانة في مكة", description: "حلول قوى عاملة وفرق فنية وتشغيل وصيانة في مكة المكرمة." },
};

export default async function ServicesPage() {
  const content = await getWebsiteContent();
  if (!content.visibility.services) notFound();
  const entries = publishedEntries(content, "services");
  return <PublicPageShell><ManagedCollectionIndex content={content} collectionKey="services" title="حلول عملية تدعم استمرارية أعمالك" description="من توفير القوى العاملة إلى الفرق الفنية والتشغيل والصيانة، نهيئ حلًا مرنًا يناسب منشأتك وموقعك ومدة احتياجك في مكة المكرمة." entries={entries} emptyTitle="نعمل على إضافة حلول جديدة" emptyText="تواصل معنا الآن، وسيقترح فريق دالي الخدمة الأنسب لاحتياج منشأتك."/></PublicPageShell>;
}
