import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PublicPageShell from "@/app/components/PublicPageShell";
import { ManagedCollectionIndex } from "@/app/components/ManagedContentPages";
import { getWebsiteContent, publishedEntries } from "@/lib/website-content";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const content = await getWebsiteContent();
  const hasEntries = publishedEntries(content, "projects").length > 0;
  return { title: "المشروعات وسابقة الأعمال", description: "دراسات حالة ومشروعات موثقة لشركة دالي للتشغيل والصيانة تُنشر بعد اعتماد بيانات العميل ونطاق العمل.", alternates: { canonical: "/projects" }, robots: { index: hasEntries, follow: true } };
}

export default async function ProjectsPage() {
  const content = await getWebsiteContent();
  if (!content.visibility.projects) notFound();
  const entries = publishedEntries(content, "projects");
  return <PublicPageShell><ManagedCollectionIndex content={content} collectionKey="projects" title="خبرات نبني عليها شراكات أطول" description="نشارك هنا نماذج معتمدة من أعمالنا توضح كيف نساعد المنشآت على رفع الجاهزية وتلبية احتياجات القوى العاملة والتشغيل والصيانة." entries={entries} emptyTitle="قريبًا: نماذج من خبراتنا" emptyText="نحترم خصوصية عملائنا، وننشر دراسات الحالة بعد اعتمادها فقط. تواصل معنا للتعرف إلى الحل المناسب لمنشأتك."/></PublicPageShell>;
}
