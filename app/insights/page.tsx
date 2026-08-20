import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PublicPageShell from "@/app/components/PublicPageShell";
import { ManagedCollectionIndex } from "@/app/components/ManagedContentPages";
import { getWebsiteContent, publishedEntries } from "@/lib/website-content";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "مركز المعرفة | العمالة والتشغيل والمقاولات في السعودية", description: "أدلة عملية لتخطيط القوى العاملة والتشغيل والصيانة والمقاولات وإدارة المشروعات في مدن المملكة العربية السعودية.", alternates: { canonical: "/insights" }, openGraph: { type: "website", url: "/insights", title: "مركز معرفة دالي للعمالة والتشغيل والمقاولات", description: "أدلة عملية لمسؤولي المنشآت والمشروعات في المملكة قبل طلب الخدمة." } };

export default async function InsightsPage() {
  const content = await getWebsiteContent();
  if (!content.visibility.articles) notFound();
  const entries = publishedEntries(content, "articles");
  return <PublicPageShell><ManagedCollectionIndex content={content} collectionKey="articles" title="معرفة تساعدك على التخطيط بثقة" description="أدلة عملية لمسؤولي المنشآت والمشروعات حول تخطيط القوى العاملة والورديات والتشغيل والصيانة والمقاولات في مختلف مدن المملكة." entries={entries} emptyTitle="محتوى جديد قيد الإعداد" emptyText="تواصل معنا إذا كان لديك سؤال تشغيلي أو إنشائي، وقد تجد لدى فريق دالي إجابة تساعدك الآن."/></PublicPageShell>;
}
