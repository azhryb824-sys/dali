import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PublicPageShell from "@/app/components/PublicPageShell";
import { ManagedEntryDetail } from "@/app/components/ManagedContentPages";
import { findPublishedEntry, getWebsiteContent } from "@/lib/website-content";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> { const content = await getWebsiteContent(); const entry = findPublishedEntry(content, "projects", (await params).slug); if (!entry) return {}; return { title: entry.seoTitle, description: entry.seoDescription, alternates: { canonical: `/projects/${entry.slug}` }, openGraph: { type: "article", url: `/projects/${entry.slug}`, title: entry.seoTitle, description: entry.seoDescription, publishedTime: entry.publishedAt, modifiedTime: entry.updatedAt } }; }
export default async function ProjectPage({ params }: Props) { const content = await getWebsiteContent(); const entry = findPublishedEntry(content, "projects", (await params).slug); if (!entry) notFound(); return <PublicPageShell><ManagedEntryDetail content={content} collectionKey="projects" entry={entry}/></PublicPageShell>; }
