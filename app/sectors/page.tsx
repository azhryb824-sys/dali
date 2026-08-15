import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PublicPageShell from "@/app/components/PublicPageShell";
import { ManagedCollectionIndex } from "@/app/components/ManagedContentPages";
import { getWebsiteContent, publishedEntries } from "@/lib/website-content";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "القطاعات التي نخدمها في مكة", description: "حلول توفير العمالة والتشغيل والصيانة للفنادق والمنشآت التجارية والمستودعات والمشروعات ومواقع الخدمة الموسمية في مكة.", alternates: { canonical: "/sectors" } };

export default async function SectorsPage() {
  const content = await getWebsiteContent();
  if (!content.visibility.sectors) notFound();
  const entries = publishedEntries(content, "sectors");
  return <PublicPageShell><ManagedCollectionIndex content={content} collectionKey="sectors" title="خبرة مرنة تفهم طبيعة قطاعك" description="نخدم قطاعات متنوعة في مكة بحلول قوى عاملة وتشغيل وصيانة تراعي إيقاع العمل والورديات والمواسم وأولويات كل منشأة." entries={entries} emptyTitle="قطاعك محل اهتمامنا" emptyText="شاركنا طبيعة نشاطك، وسيدرس فريق دالي الحل المناسب لاحتياجك."/></PublicPageShell>;
}
