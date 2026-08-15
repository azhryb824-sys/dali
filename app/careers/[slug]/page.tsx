import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PublicPageShell from "@/app/components/PublicPageShell";
import { ManagedEntryDetail } from "@/app/components/ManagedContentPages";
import PublicRequestForm from "@/app/components/PublicRequestForm";
import { findPublishedEntry, getWebsiteContent } from "@/lib/website-content";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> { const content = await getWebsiteContent(); const entry = findPublishedEntry(content, "jobs", (await params).slug); if (!entry) return {}; return { title: entry.seoTitle, description: entry.seoDescription, alternates: { canonical: `/careers/${entry.slug}` } }; }
export default async function CareerPage({ params }: Props) { const content = await getWebsiteContent(); const entry = findPublishedEntry(content, "jobs", (await params).slug); if (!entry) notFound(); return <PublicPageShell><ManagedEntryDetail content={content} collectionKey="jobs" entry={entry}/><section className="inner-content public-request-section"><PublicRequestForm specialization="طلب توظيف" submitLabel="التقديم على الفرصة" detailsLabel="ملخص الخبرة" detailsPlaceholder={`أرغب في التقديم على: ${entry.title}. اذكر خبرتك ومؤهلاتك بإيجاز.`}/></section></PublicPageShell>; }
