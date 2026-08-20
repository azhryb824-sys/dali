const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
const renderSiteUrl = process.env.RENDER_EXTERNAL_HOSTNAME?.trim()
  ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME.trim()}`
  : "";

export const SITE = {
  name: "شركة دالي للتشغيل والصيانة",
  shortName: "دالي للتشغيل والصيانة",
  url: configuredSiteUrl || renderSiteUrl || "https://dali-contracting.cust5467.chatgpt.site",
  locale: "ar_SA",
  language: "ar",
  countryCode: "SA",
  city: "مكة المكرمة",
  district: "حي الرصيفة",
  description: "شركة سعودية تقدم حلول توفير العمالة والفرق الفنية والتشغيلية للمشروعات والمنشآت في مكة المكرمة.",
  logoPath: "/dally-logo.jpg",
  defaultImagePath: "/images/hajj-readiness.webp",
} as const;

export function absoluteUrl(path = "/") {
  return new URL(path, SITE.url).toString();
}
