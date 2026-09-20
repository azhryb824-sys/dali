"use client";

import { useSyncExternalStore } from "react";
import { isAppLocale, localeCookieName, normalizeAppLocale, type AppLocale } from "@/lib/i18n";
import { readApiJson } from "@/lib/client-api";

const localeEvent = "dali-locale-changed";
let saving = false;

export function readClientLocale(): AppLocale | null {
  if (typeof document === "undefined") return null;
  const value = document.cookie.split(";").map(item => item.trim()).find(item => item.startsWith(`${localeCookieName}=`))?.slice(localeCookieName.length + 1);
  return normalizeAppLocale(value);
}

function subscribe(listener: () => void) {
  window.addEventListener(localeEvent, listener);
  return () => window.removeEventListener(localeEvent, listener);
}

/** Read one locale across the switchers and React-localized portal views. */
export function useAppLocale(initialLocale: AppLocale = "ar") {
  return useSyncExternalStore(subscribe, () => readClientLocale() || initialLocale, () => initialLocale);
}

export function setClientLocale(locale: AppLocale) {
  if (!isAppLocale(locale)) throw new Error("اللغة غير مدعومة");
  document.cookie = [
    `${localeCookieName}=${locale}`, "Path=/", "Max-Age=31536000", "SameSite=Lax",
    ...(window.location.protocol === "https:" ? ["Secure"] : []),
  ].join("; ");
  window.dispatchEvent(new Event(localeEvent));
}

/** Commit the UI preference only after the same-origin endpoint accepts it. */
export async function saveClientLocale(locale: AppLocale, portal: boolean) {
  if (!isAppLocale(locale)) throw new Error("اللغة غير مدعومة");
  if (saving) throw new Error("جارٍ حفظ اللغة...");
  saving = true;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(portal ? "/api/portal/language" : "/api/locale", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      cache: "no-store",
      body: JSON.stringify({ locale }),
      signal: controller.signal,
    });
    const result = await readApiJson(response) as { locale?: unknown; error?: string };
    if (!response.ok || result.locale !== locale) throw new Error(result.error || "تعذّر حفظ اللغة");
    setClientLocale(locale);
  } finally {
    window.clearTimeout(timer);
    saving = false;
  }
}
