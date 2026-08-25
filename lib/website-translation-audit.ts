import { authoredUiStrings } from "@/lib/i18n-authored-strings";
import { translateUi, type AppLocale } from "@/lib/i18n";
import type { WebsiteContent } from "@/lib/website-content";

export type TranslationTarget = Exclude<AppLocale, "ar">;

export function collectWebsiteArabicStrings(content: WebsiteContent) {
  const values = new Set<string>(authoredUiStrings);
  const visit = (value: unknown, key = "") => {
    if (key === "translations") return;
    if (typeof value === "string") {
      const normalized = value.trim();
      if (/[\u0600-\u06ff]/.test(normalized) && normalized.length <= 6000) values.add(normalized);
      return;
    }
    if (Array.isArray(value)) value.forEach((item) => visit(item));
    else if (value && typeof value === "object") Object.entries(value).forEach(([childKey, child]) => visit(child, childKey));
  };
  visit(content);
  return [...values].filter(Boolean).sort((a, b) => a.localeCompare(b, "ar"));
}

export function translationCoverage(content: WebsiteContent, target: TranslationTarget) {
  const sources = collectWebsiteArabicStrings(content);
  const memory = content.translations[target];
  const missing = sources.filter((source) => {
    const explicit = memory[source]?.trim();
    if (explicit && explicit !== source && !/[\u0600-\u06ff]/.test(explicit)) return false;
    const catalog = translateUi(source, target).trim();
    return !catalog || catalog === source || /[\u0600-\u06ff]/.test(catalog);
  });
  return { total: sources.length, translated: sources.length - missing.length, missing, complete: missing.length === 0 };
}

export function completeWebsiteTranslations(content: WebsiteContent) {
  const en = translationCoverage(content, "en");
  const bn = translationCoverage(content, "bn");
  return { en, bn, complete: en.complete && bn.complete };
}
