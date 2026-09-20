"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { isAppLocale, localeDirection, localeNames, translateUi, type AppLocale } from "@/lib/i18n";
import { readClientLocale, saveClientLocale, setClientLocale, useAppLocale } from "@/lib/client-locale";
import { observeLocaleTree } from "@/lib/locale-dom";

type TranslationCatalogs = Partial<Record<"en" | "bn", Record<string, string>>>;
const emptyTranslations: Record<string, string> = {};

export default function LocaleRuntime({ initialLocale, portal = false, showSwitcher = true, translationCatalogs = {} }: {
  initialLocale: AppLocale;
  portal?: boolean;
  showSwitcher?: boolean;
  translationCatalogs?: TranslationCatalogs;
}) {
  const locale = useAppLocale(initialLocale);
  const pathname = usePathname() || "";
  const portalPage = pathname === "/portal" || pathname.startsWith("/portal/");
  const host = useRef<HTMLLabelElement>(null);
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const translations = locale === "ar" ? emptyTranslations : translationCatalogs[locale] || emptyTranslations;

  useEffect(() => {
    if (portal && !readClientLocale()) setClientLocale(initialLocale);
  }, [initialLocale, portal]);

  useEffect(() => {
    // The root-layout runtime must not translate the portal's streamed HTML
    // before PortalDashboard hydrates. Only its own mounted runtime owns it.
    document.documentElement.lang = locale;
    document.documentElement.dir = localeDirection(locale);
    document.body.dir = localeDirection(locale);
    if (!portal && portalPage) return;
    const root = portal ? host.current?.closest(".admin-shell") : document.body;
    if (!root) return;
    return observeLocaleTree(root, locale, translations, !portal);
  }, [locale, portal, portalPage, translations]);

  async function change(value: string) {
    if (!isAppLocale(value) || value === locale || pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await saveClientLocale(value, portal || portalPage);
    } catch {
      setError("تعذّر حفظ اللغة. بقيت اللغة الحالية دون تغيير؛ أعد المحاولة.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return <label ref={host} hidden={!showSwitcher} data-dali-no-translate className={`language-switcher ${portal ? "portal-language-switcher" : ""}`}>
    <span>{translateUi("اللغة", locale)}</span>
    <select value={locale} disabled={busy} aria-busy={busy} onChange={event => void change(event.target.value)} aria-label={translateUi("اختيار اللغة", locale)}>
      {(["ar", "en", "bn"] as AppLocale[]).map(item => <option key={item} value={item}>{localeNames[item]}</option>)}
    </select>
    {error && <small role="alert">{translateUi(error, locale)}</small>}
  </label>;
}
