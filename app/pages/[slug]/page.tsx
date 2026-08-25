import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PublicPageShell from "@/app/components/PublicPageShell";
import { ManagedEntryDetail } from "@/app/components/ManagedContentPages";
import { findPublishedEntry, getWebsiteContent } from "@/lib/website-content";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const content = await getWebsiteContent();
  const entry = findPublishedEntry(content, "pages", slug);
  if (!entry) return {};
  return { title: entry.seoTitle, description: entry.seoDescription, alternates: { canonical: `/pages/${entry.slug}` } };
}

export default async function ManagedCompanyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const content = await getWebsiteContent();
  const entry = findPublishedEntry(content, "pages", slug);
  if (!entry) notFound();
  return <PublicPageShell><ManagedEntryDetail content={content} collectionKey="pages" entry={entry}/></PublicPageShell>;
}
