import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PublicPageShell from "@/app/components/PublicPageShell";
import { ManagedCollectionIndex } from "@/app/components/ManagedContentPages";
import { getWebsiteContent, publishedEntries } from "@/lib/website-content";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "القطاعات التي نخدمها في السعودية", description: "حلول توفير العمالة والتشغيل والصيانة والمقاولات للقطاعات والمنشآت والمشروعات في جميع مدن المملكة العربية السعودية.", alternates: { canonical: "/sectors" } };

export default async function SectorsPage() {
  const content = await getWebsiteContent();
  if (!content.visibility.sectors) notFound();
  const entries = publishedEntries(content, "sectors");
  return <PublicPageShell><ManagedCollectionIndex content={content} collectionKey="sectors" title="خبرة مرنة تفهم طبيعة قطاعك" description="نخدم قطاعات متنوعة في مختلف مدن المملكة بحلول قوى عاملة وتشغيل وصيانة ومقاولات تراعي طبيعة الموقع ومتطلبات العمل وأولويات كل منشأة." entries={entries} emptyTitle="قطاعك محل اهتمامنا" emptyText="شاركنا طبيعة نشاطك وموقع المشروع، وسيدرس فريق دالي الحل المناسب لاحتياجك."/></PublicPageShell>;
}
