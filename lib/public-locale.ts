import type { AppLocale } from "@/lib/i18n";
export const publicLocales = ["ar", "en", "bn"] as const;
export function publicRoute(path: string) {
  const match = path.match(/^\/(ar|en|bn)(?=\/|$)/);
  return { locale: (match?.[1] || "ar") as AppLocale, path: match ? path.slice(match[0].length) || "/" : path, prefixed: Boolean(match) };
}
export function isPublicPath(path: string) {
  try { path = decodeURIComponent(path); } catch { return false; }
  return !/^\/(?:api|portal|login|logout|pwa|mobile|desktop-access|client|worker|forgot-password|reset-password|contracts|_next)(?:\/|$)/.test(path) && !/\.[a-z0-9]+$/i.test(path);
}
export function localizedPath(href: string, locale: AppLocale) {
  if (!href.startsWith("/") || href.startsWith("//")) return href;
  const split = href.search(/[?#]/); const path = split < 0 ? href : href.slice(0, split); const suffix = split < 0 ? "" : href.slice(split);
  const route = publicRoute(path);
  if (!isPublicPath(route.path)) return href;
  return (locale === "ar" ? route.path : `/${locale}${route.path === "/" ? "" : route.path}`) + suffix;
}
export function languageAlternates(path: string) {
  return { "ar-SA": localizedPath(path, "ar"), en: localizedPath(path, "en"), bn: localizedPath(path, "bn"), "x-default": localizedPath(path, "ar") };
}
