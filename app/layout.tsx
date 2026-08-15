import type { Metadata } from "next";
import "@fontsource/tajawal/400.css";
import "@fontsource/tajawal/500.css";
import "@fontsource/tajawal/700.css";
import "./globals.css";
import "./enhancements.css";
import { WebsiteContentProvider } from "@/app/components/WebsiteContentProvider";
import { SITE } from "@/lib/site";
import { getWebsiteContent, toPublicWebsiteContent } from "@/lib/website-content";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const content = await getWebsiteContent();
  const keywords = content.seo.focusKeywords.split(/[،,]/).map((item) => item.trim()).filter(Boolean).slice(0, 24);
  return {
    metadataBase: new URL(SITE.url),
    title: { default: content.seo.homeTitle, template: `%s | ${content.site.shortName}` },
    description: content.seo.homeDescription,
    keywords,
    alternates: { canonical: "/", languages: { "ar-SA": "/" } },
    applicationName: content.site.companyName,
    category: "business",
    icons: {
      icon: [{ url: "/dally-logo.jpg", type: "image/jpeg" }],
      shortcut: "/dally-logo.jpg",
      apple: "/dally-logo.jpg",
    },
    manifest: "/manifest.webmanifest",
    openGraph: {
      type: "website",
      locale: "ar_SA",
      url: "/",
      siteName: content.site.companyName,
      title: content.seo.homeTitle,
      description: content.seo.homeDescription,
      images: [{ url: "/images/hajj-readiness.webp", width: 1672, height: 941, alt: `جاهزية ${content.site.companyName} لتوفير العمالة خلال موسم الحج في مكة المكرمة` }],
    },
    twitter: { card: "summary_large_image", title: content.seo.homeTitle, description: content.seo.homeDescription, images: ["/images/hajj-readiness.webp"] },
    robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 } },
    other: { "codex-preview": "development" },
  };
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const content = await getWebsiteContent();
  return <html lang="ar" dir="rtl"><body><WebsiteContentProvider content={toPublicWebsiteContent(content)}>{children}</WebsiteContentProvider></body></html>;
}
