import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PublicPageShell from "@/app/components/PublicPageShell";
import { ManagedCollectionIndex } from "@/app/components/ManagedContentPages";
import { getWebsiteContent, publishedEntries } from "@/lib/website-content";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "مركز المعرفة | توفير العمالة والتشغيل في مكة", description: "أدلة عملية لتخطيط العمالة والتشغيل والصيانة والجاهزية الموسمية والوثائق في مكة المكرمة.", alternates: { canonical: "/insights" }, openGraph: { type: "website", url: "/insights", title: "مركز معرفة دالي للتشغيل والصيانة", description: "أدلة مفيدة لمسؤولي المشروعات والمنشآت قبل طلب الخدمة." } };

export default async function InsightsPage() {
  const content = await getWebsiteContent();
  if (!content.visibility.articles) notFound();
  const entries = publishedEntries(content, "articles");
  return <PublicPageShell><ManagedCollectionIndex content={content} collectionKey="articles" title="معرفة تساعدك على التخطيط بثقة" description="أدلة عملية لمسؤولي المنشآت والمشروعات حول تخطيط القوى العاملة والورديات والجاهزية الموسمية والتشغيل والصيانة في مكة." entries={entries} emptyTitle="محتوى جديد قيد الإعداد" emptyText="تواصل معنا إذا كان لديك سؤال تشغيلي، وقد تجد لدى فريق دالي إجابة تساعدك الآن."/></PublicPageShell>;
}
