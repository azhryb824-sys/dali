import type { MetadataRoute } from "next";
import { languageAlternates, localizedPath, publicLocales } from "@/lib/public-locale";
import { absoluteUrl } from "@/lib/site";
import { collectionBasePath, entryPath, getWebsiteContent, publishedEntries, type WebsiteCollectionKey } from "@/lib/website-content";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const content = await getWebsiteContent();
  const lastModified = content.updatedAt && Number.isFinite(Date.parse(content.updatedAt)) ? content.updatedAt : undefined;
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
    if (!entries.length || key in content.visibility && !content.visibility[key as keyof typeof content.visibility]) return [];
    return [
      ...(key === "pages" ? [] : [{ url: absoluteUrl(collectionBasePath(key)), lastModified }]),
      ...entries.filter(() => key !== "credentials" && key !== "partners").map((entry) => ({ url: absoluteUrl(entryPath(key, entry)), lastModified: entry.updatedAt })),
    ];
  });
  const canonicalPages = [
    ...publicPages.map(({ path, updatedAt }) => ({ url: absoluteUrl(path), lastModified: updatedAt })),
    ...collections,
  ];
  return [...new Map(canonicalPages.map(page => [page.url, page])).values()].flatMap(page => {
    const path = new URL(page.url).pathname;
    const languages = Object.fromEntries(Object.entries(languageAlternates(path)).map(([locale, href]) => [locale, absoluteUrl(href)]));
    return publicLocales.map(locale => ({ ...page, url: absoluteUrl(localizedPath(path, locale)), alternates: { languages } }));
  });
}
