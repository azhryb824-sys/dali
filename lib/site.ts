const configuredSiteUrl = process.env.DALI_PUBLIC_SITE_URL?.trim() || process.env.NEXT_PUBLIC_SITE_URL?.trim();
const renderHost = process.env.RENDER_EXTERNAL_HOSTNAME?.trim();
function siteOrigin() {
  if (configuredSiteUrl) {
    try {
      const url = new URL(configuredSiteUrl);
      if (url.hostname === "www.dally.info" || url.hostname === "dally.info") return "https://dally.info";
      if (url.protocol === "https:" && (renderHost || process.env.NODE_ENV !== "production")) return url.origin;
    } catch { /* Fall back to the verified public domain. */ }
  }
  return renderHost ? `https://${renderHost}` : "https://dally.info";
}
export const SITE = {
  name: "شركة دالي للتشغيل والصيانة", shortName: "دالي للتشغيل والصيانة", url: siteOrigin(),
  locale: "ar_SA", language: "ar", countryCode: "SA", city: "مكة المكرمة", district: "حي الرصيفة",
  description: "شركة سعودية تقدم حلول توفير العمالة والفرق الفنية والتشغيلية للمشروعات والمنشآت في مكة المكرمة.",
  logoPath: "/dally-logo.jpg", defaultImagePath: "/images/hajj-readiness.webp",
} as const;
export function absoluteUrl(path = "/") { return new URL(path, SITE.url).toString(); }
