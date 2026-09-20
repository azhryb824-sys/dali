"use client";

import { useEffect } from "react";
import { localeDirection, translateUi } from "@/lib/i18n";
import { setClientLocale, useAppLocale } from "@/lib/client-locale";

export default function PortalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const locale = useAppLocale();
  const t = (text: string) => translateUi(text, locale);
  useEffect(() => { console.error("portal-render-failed", error); }, [error]);
  return <main className="portal-gate" data-dali-no-translate dir={localeDirection(locale)}>
    <section className="gate-card secure-gate-card">
      <p className="gate-kicker">{t("النظام الإداري الداخلي")}</p>
      <h1>{t("تعذّر تحميل مساحة العمل")}</h1>
      <p className="gate-copy">{t("حدث خطأ أثناء عرض البوابة. أعد المحاولة، أو عد إلى العربية ثم حاول مجددًا.")}</p>
      {error.digest && <div className="gate-account"><span>{t("رقم المتابعة")}</span><strong dir="ltr">{error.digest}</strong></div>}
      <div className="portal-error-actions">
        <button type="button" className="language-save" onClick={reset}>{t("إعادة المحاولة")}</button>
        {locale !== "ar" && <button type="button" className="language-save" onClick={() => { setClientLocale("ar"); reset(); }}>{t("العودة للعربية وإعادة المحاولة")}</button>}
      </div>
      <a className="gate-signout" href="/api/portal/session/end?returnTo=%2Fportal">{t("بدء جلسة جديدة")}</a>
    </section>
  </main>;
}
