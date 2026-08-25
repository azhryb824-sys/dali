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
    { path: "/construction/services", updatedAt: lastModified },
    { path: "/construction/methodology", updatedAt: lastModified },
    { path: "/construction/quality-safety", updatedAt: lastModified },
    { path: "/construction/projects", updatedAt: lastModified },
    { path: "/construction/regions", updatedAt: lastModified },
    { path: "/construction/request", updatedAt: lastModified },
    ...(content.visibility.faq ? [{ path: "/faq", updatedAt: lastModified }] : []),
    { path: "/privacy", updatedAt: lastModified },
    { path: "/terms", updatedAt: lastModified },
    ...(content.visibility.hajj ? [{ path: "/seasons", updatedAt: lastModified }, { path: "/ramadan", updatedAt: lastModified }, { path: "/hajj", updatedAt: lastModified }] : []),
    ...(content.visibility.partners ? [{ path: "/partners", updatedAt: lastModified }] : []),
  ];
  const keys: WebsiteCollectionKey[] = ["services", "sectors", "locations", "projects", "credentials", "articles", "jobs", "pages"];
  const collections = keys.flatMap((key) => {
    const entries = publishedEntries(content, key);
    if (!entries.length) return [];
    return [
      ...(key === "pages" ? [] : [{ url: absoluteUrl(collectionBasePath(key)), lastModified }]),
      ...entries.filter(() => key !== "credentials").map((entry) => ({ url: absoluteUrl(entryPath(key, entry)), lastModified: entry.updatedAt })),
    ];
  });
  return [
    ...publicPages.map(({ path, updatedAt }) => ({ url: absoluteUrl(path), lastModified: updatedAt })),
    ...collections,
  ];
}
