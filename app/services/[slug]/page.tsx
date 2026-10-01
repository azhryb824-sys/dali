import { getLocalizedWebsiteContent } from "@/lib/public-content";
import { localizedMetadata } from "@/lib/public-content";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PublicPageShell from "@/app/components/PublicPageShell";
import { ManagedEntryDetail } from "@/app/components/ManagedContentPages";
import { findPublishedEntry } from "@/lib/website-content";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const content = await getLocalizedWebsiteContent();
  const entry = findPublishedEntry(content, "services", (await params).slug);
  if (!entry) return localizedMetadata({});
  return localizedMetadata({ title: entry.seoTitle, description: entry.seoDescription, alternates: { canonical: `/services/${entry.slug}` }, openGraph: { type: "website", url: `/services/${entry.slug}`, title: entry.seoTitle, description: entry.seoDescription, images: [{ url: entry.image, alt: entry.imageAlt }] } });
}

export default async function ServicePage({ params }: Props) {
  const content = await getLocalizedWebsiteContent();
  const entry = findPublishedEntry(content, "services", (await params).slug);
  if (!entry) notFound();
  return <PublicPageShell><ManagedEntryDetail content={content} collectionKey="services" entry={entry}/></PublicPageShell>;
}
