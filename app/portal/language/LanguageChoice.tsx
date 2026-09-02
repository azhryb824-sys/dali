"use client";

import { useState } from "react";
import { readApiJson } from "@/lib/client-api";
import { AppLocale, localeCookieName, localeNames } from "@/lib/i18n";

export default function LanguageChoice() {
  const [locale, setLocale] = useState<AppLocale>("ar");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/portal/language", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ locale }),
        cache: "no-store",
        credentials: "same-origin",
      });
      const result = (await readApiJson(response)) as { error?: string };
      if (!response.ok) throw new Error(result.error || "تعذّر حفظ اللغة");

      // Browsers can start the navigation before a response Set-Cookie is visible
      // to the next request. Mirror the non-sensitive locale cookie synchronously
      // so the first portal render cannot loop back to this onboarding page.
      document.cookie = [
        `${localeCookieName}=${encodeURIComponent(locale)}`,
        "Path=/",
        "Max-Age=31536000",
        "SameSite=Lax",
        ...(window.location.protocol === "https:" ? ["Secure"] : []),
      ].join("; ");
      window.location.replace("/portal");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "تعذّر حفظ اللغة");
      setBusy(false);
    }
  }

  return (
    <main className="language-onboarding">
      <section>
        <p>WELCOME · স্বাগতম</p>
        <h1>اختر لغة النظام</h1>
        <span>Choose your system language · সিস্টেমের ভাষা নির্বাচন করুন</span>
        <div>
          {(["ar", "en", "bn"] as AppLocale[]).map((item) => (
            <button key={item} className={locale === item ? "active" : ""} onClick={() => setLocale(item)}>
              <b>{item === "ar" ? "ع" : item === "en" ? "EN" : "বা"}</b>
              <strong>{localeNames[item]}</strong>
              <small>{item === "ar" ? "واجهة عربية" : item === "en" ? "English interface" : "বাংলা ইন্টারফেস"}</small>
            </button>
          ))}
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="language-save" disabled={busy} onClick={() => void save()}>
          {busy ? "جارٍ الحفظ..." : "متابعة وحفظ اللغة"}
        </button>
      </section>
    </main>
  );
}
