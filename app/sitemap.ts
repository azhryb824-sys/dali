import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/site";
import { collectionBasePath, entryPath, getWebsiteContent, publishedEntries, type WebsiteCollectionKey } from "@/lib/website-content";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const content = await getWebsiteContent();
  const lastModified = content.updatedAt.slice(0, 10) || "2026-08-14";
  const publicPages = [
    { path: "/", updatedAt: lastModified },
    { path: "/about", updatedAt: lastModified },
    { path: "/contact", updatedAt: lastModified },
    { path: "/construction", updatedAt: lastModified },
    ...(content.visibility.faq ? [{ path: "/faq", updatedAt: lastModified }] : []),
    { path: "/privacy", updatedAt: lastModified },
    { path: "/terms", updatedAt: lastModified },
    ...(content.visibility.hajj ? [{ path: "/hajj", updatedAt: lastModified }] : []),
    ...(content.visibility.partners ? [{ path: "/partners", updatedAt: lastModified }] : []),
  ];
  const keys: WebsiteCollectionKey[] = ["services", "sectors", "locations", "projects", "credentials", "articles", "jobs"];
  const collections = keys.flatMap((key) => {
    const entries = publishedEntries(content, key);
    if (!entries.length) return [];
    return [
      { url: absoluteUrl(collectionBasePath(key)), lastModified },
      ...entries.filter(() => key !== "credentials").map((entry) => ({ url: absoluteUrl(entryPath(key, entry)), lastModified: entry.updatedAt })),
    ];
  });
  return [
    ...publicPages.map(({ path, updatedAt }) => ({ url: absoluteUrl(path), lastModified: updatedAt })),
    ...collections,
  ];
}
