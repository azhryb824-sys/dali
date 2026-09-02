import type { Metadata, Viewport } from "next";
import "@fontsource/tajawal/400.css";
import "@fontsource/tajawal/500.css";
import "@fontsource/tajawal/700.css";
import "./globals.css";
import "./enhancements.css";
import { WebsiteContentProvider } from "@/app/components/WebsiteContentProvider";
import { SITE } from "@/lib/site";
import { getWebsiteContent, toPublicWebsiteContent } from "@/lib/website-content";
import { TodayDateDefaults } from "@/app/components/TodayDateDefaults";
import { cookies, headers } from "next/headers";
import LocaleRuntime from "@/app/components/LocaleRuntime";
import { localeCookieName, localeDirection, normalizeAppLocale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#001d2d",
};

export async function generateMetadata(): Promise<Metadata> {
  const content = await getWebsiteContent();
  const requestPathname = (await headers()).get("x-dali-pathname") || "/";
  const isPwaRequest = requestPathname === "/pwa" || requestPathname.startsWith("/pwa/");
  const canonicalPath = isPwaRequest
    ? (requestPathname === "/pwa" ? "/pwa/launch" : requestPathname)
    : "/";
  const keywords = content.seo.focusKeywords.split(/[،,]/).map((item) => item.trim()).filter(Boolean).slice(0, 24);
  return {
    metadataBase: new URL(SITE.url),
    title: { default: content.seo.homeTitle, template: `%s | ${content.site.shortName}` },
    description: content.seo.homeDescription,
    keywords,
    alternates: isPwaRequest
      ? { canonical: canonicalPath }
      : { canonical: "/", languages: { "ar-SA": "/" } },
    applicationName: isPwaRequest ? "نظام دالي الإداري" : content.site.companyName,
    category: "business",
    formatDetection: { telephone: false },
    icons: isPwaRequest
      ? {
          icon: [{ url: "/pwa/icon-192.png", sizes: "192x192", type: "image/png" }],
          apple: [{ url: "/pwa/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
        }
      : {
          icon: [{ url: "/dally-logo.jpg", type: "image/jpeg" }],
          shortcut: "/dally-logo.jpg",
          apple: "/dally-logo.jpg",
        },
    manifest: isPwaRequest ? "/pwa/manifest.webmanifest" : "/manifest.webmanifest",
    openGraph: {
      type: "website",
      locale: "ar_SA",
      url: "/",
      siteName: content.site.companyName,
      title: content.seo.homeTitle,
      description: content.seo.homeDescription,
      images: [{ url: "/images/hajj-readiness.webp", width: 1672, height: 941, alt: `جاهزية ${content.site.companyName} لتوفير العمالة خلال موسمي رمضان والحج` }],
    },
    twitter: { card: "summary_large_image", title: content.seo.homeTitle, description: content.seo.homeDescription, images: ["/images/hajj-readiness.webp"] },
    robots: isPwaRequest
      ? { index: false, follow: false, nocache: true }
      : { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 } },
    other: { "codex-preview": "development" },
  };
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const content = await getWebsiteContent();
  const stored=(await cookies()).get(localeCookieName)?.value;const locale=normalizeAppLocale(stored)??"ar";
  return <html lang={locale} dir={localeDirection(locale)}><body><LocaleRuntime initialLocale={locale} websiteTranslations={locale === "ar" ? {} : content.translations[locale]}/><TodayDateDefaults/><WebsiteContentProvider content={toPublicWebsiteContent(content)}>{children}</WebsiteContentProvider></body></html>;
}
