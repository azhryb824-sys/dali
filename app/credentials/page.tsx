import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PublicPageShell from "@/app/components/PublicPageShell";
import { ManagedCollectionIndex } from "@/app/components/ManagedContentPages";
import { getWebsiteContent, publishedEntries } from "@/lib/website-content";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> { const content = await getWebsiteContent(); const hasEntries = publishedEntries(content, "credentials").length > 0; return { title: "التراخيص والاعتمادات", description: "التراخيص والاعتمادات وبيانات الامتثال المنشورة والمعتمدة لشركة دالي للتشغيل والصيانة.", alternates: { canonical: "/credentials" }, robots: { index: hasEntries, follow: true } }; }
export default async function CredentialsPage() { const content = await getWebsiteContent(); if (!content.visibility.credentials) notFound(); const entries = publishedEntries(content, "credentials"); return <PublicPageShell><ManagedCollectionIndex content={content} collectionKey="credentials" title="ثقة تستند إلى معلومات واضحة" description="نشارك التراخيص والاعتمادات المعتمدة التي تساعد عملاءنا وشركاءنا على التحقق وبناء قرار تعاون مطمئن." entries={entries} emptyTitle="سيتم عرض الاعتمادات المعتمدة هنا" emptyText="للاستفسار عن بيانات الشركة أو متطلبات التأهيل، تواصل مباشرة مع فريق دالي."/></PublicPageShell>; }
