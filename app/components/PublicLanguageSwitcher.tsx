"use client";

import { useState } from "react";
import { usePublicLocale } from "./PublicLocaleProvider";
import { isAppLocale, localeNames, translateUi, type AppLocale } from "@/lib/i18n";
import { localizedPath } from "@/lib/public-locale";

export default function PublicLanguageSwitcher() {
  const locale = usePublicLocale() ?? "ar";
  const [busy, setBusy] = useState(false);
  return <label className="public-header-language" data-dali-no-translate>
    <span>{translateUi("اللغة", locale)}</span>
    <select aria-label={translateUi("اختيار اللغة", locale)} value={locale} disabled={busy} onChange={event => {
      const next = event.target.value;
      if (!isAppLocale(next) || next === locale) return;
      setBusy(true);
      window.location.assign(localizedPath(window.location.pathname, next) + window.location.search + window.location.hash);
    }}>
      {(["ar", "en", "bn"] as AppLocale[]).map(value => <option key={value} value={value}>{localeNames[value]}</option>)}
    </select>
  </label>;
}
