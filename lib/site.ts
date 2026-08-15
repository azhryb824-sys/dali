export const SITE = {
  name: "شركة دالي للتشغيل والصيانة",
  shortName: "دالي للتشغيل والصيانة",
  url: "https://dali-contracting.cust5467.chatgpt.site",
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
