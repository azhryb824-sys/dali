import type { WebsiteContent } from "@/lib/website-content";
import { absoluteUrl, SITE } from "@/lib/site";
export function safeMapUrl(value: string) {
  try { const url = new URL(value); return url.protocol === "https:" && /^(?:(?:www|maps)\.)?google\.(?:com|com\.sa|sa)$|^maps\.app\.goo\.gl$|^goo\.gl$/.test(url.hostname) ? url.toString() : ""; } catch { return ""; }
}
export function companyMapUrl(site: WebsiteContent["site"]) {
  return safeMapUrl(site.mapUrl) || safeMapUrl(site.googleBusinessUrl) || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([site.companyName, site.address || [site.district, site.city].filter(Boolean).join("، ")].filter(Boolean).join("، "))}`;
}
export function localBusinessSchema(content: WebsiteContent) {
  const site = content.site; const businessUrl = safeMapUrl(site.googleBusinessUrl);
  return { "@context": "https://schema.org", "@type": "ProfessionalService", "@id": `${SITE.url}/#organization`, name: site.companyName, url: SITE.url, logo: absoluteUrl(SITE.logoPath), description: content.seo.organizationDescription,
    address: { "@type": "PostalAddress", streetAddress: site.address || site.district, addressLocality: site.city, addressCountry: "SA" },
    ...(site.phone ? { telephone: site.phone } : {}), ...(site.email ? { email: site.email } : {}),
    ...(safeMapUrl(site.mapUrl) || businessUrl ? { hasMap: safeMapUrl(site.mapUrl) || businessUrl } : {}), ...(businessUrl ? { sameAs: [businessUrl] } : {}),
    areaServed: { "@type": "Country", name: "المملكة العربية السعودية" } };
}
