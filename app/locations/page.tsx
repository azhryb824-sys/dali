import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PublicPageShell from "@/app/components/PublicPageShell";
import { ManagedCollectionIndex } from "@/app/components/ManagedContentPages";
import { getWebsiteContent, publishedEntries } from "@/lib/website-content";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "مناطق خدمة دالي | مكة المكرمة", description: "معلومات محلية عن خدمات توفير العمالة والتشغيل والصيانة في مكة المكرمة ومقر شركة دالي في حي الرصيفة.", alternates: { canonical: "/locations" } };

export default async function LocationsPage() {
  const content = await getWebsiteContent();
  if (!content.visibility.locations) notFound();
  const entries = publishedEntries(content, "locations");
  return <PublicPageShell><ManagedCollectionIndex content={content} collectionKey="locations" title="من مكة، أقرب إلى احتياج أعمالك" description="ينطلق فريق دالي من حي الرصيفة لخدمة المنشآت والمشروعات داخل مكة بحلول قوى عاملة وتشغيل وصيانة تراعي طبيعة المدينة ومواسمها." entries={entries} emptyTitle="اسألنا عن خدمة موقعك" emptyText="شاركنا موقع العمل وطبيعة الاحتياج، وسيتواصل معك الفريق لتأكيد نطاق الخدمة."/></PublicPageShell>;
}
