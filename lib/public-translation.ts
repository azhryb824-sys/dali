import { translateUi, type AppLocale } from "@/lib/i18n";
export function translatePublicValue<T>(value: T, locale: AppLocale, catalog: Record<string, string> = {}, key = ""): T {
  if (locale === "ar") return value;
  if (typeof value === "string") {
    if (/^(?:id|slug|status|image|imageAltUrl|href|url|phone|email|mapUrl|googleBusinessUrl|updatedAt|publishedAt|updatedBy|commercialRegistration|vatNumber)$/.test(key)) return value;
    return (catalog[value] || translateUi(value, locale)) as T;
  }
  if (Array.isArray(value)) return value.map(item => translatePublicValue(item, locale, catalog, key)) as T;
  if (value && typeof value === "object" && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) return value;
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, k === "translations" ? v : translatePublicValue(v, locale, catalog, k)])) as T;
  return value;
}
