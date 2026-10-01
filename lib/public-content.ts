import { headers } from "next/headers";
import type { Metadata } from "next";
import { getWebsiteContent } from "@/lib/website-content";
import type { AppLocale } from "@/lib/i18n";
import { translatePublicValue } from "@/lib/public-translation";
import { isPublicPath, languageAlternates, localizedPath, publicRoute } from "@/lib/public-locale";
export async function publicRequestLocale(): Promise<AppLocale> { return publicRoute((await headers()).get("x-dali-pathname") || "/").locale; }
export async function getLocalizedWebsiteContent() {
  const content = await getWebsiteContent(); const locale = await publicRequestLocale();
  return translatePublicValue(content, locale, locale === "ar" ? {} : content.translations[locale]);
}
export async function localizedMetadata(metadata: Metadata): Promise<Metadata> {
  const pathname = (await headers()).get("x-dali-pathname") || "/";
  const route = publicRoute(pathname); if (!isPublicPath(route.path)) return metadata;
  const content = await getWebsiteContent(); const catalog = route.locale === "ar" ? {} : content.translations[route.locale];
  const result = translatePublicValue(metadata, route.locale, catalog);
  const canonical = typeof metadata.alternates?.canonical === "string" ? metadata.alternates.canonical : route.path;
  result.alternates = { ...metadata.alternates, canonical: localizedPath(canonical, route.locale), languages: languageAlternates(canonical) };
  if (result.openGraph) result.openGraph = { ...result.openGraph, url: localizedPath(canonical, route.locale), locale: { ar: "ar_SA", en: "en_US", bn: "bn_BD" }[route.locale] };
  return result;
}
