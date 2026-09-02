import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

const manifest: MetadataRoute.Manifest = {
  id: "/dali-portal-pwa",
  name: `نظام ${SITE.shortName} الإداري`,
  short_name: "نظام دالي",
  description: "دخول آمن إلى النظام الإداري الداخلي لشركة دالي للتشغيل والصيانة.",
  start_url: "/pwa/launch",
  scope: "/",
  display: "standalone",
  orientation: "portrait",
  background_color: "#001d2d",
  theme_color: "#001d2d",
  lang: "ar",
  dir: "rtl",
  categories: ["business", "productivity"],
  icons: [
    { src: "/pwa/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/pwa/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "/pwa/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ],
};

export function GET() {
  return Response.json(manifest, {
    headers: {
      "cache-control": "private, no-store, max-age=0",
      "content-type": "application/manifest+json; charset=utf-8",
      "x-robots-tag": "noindex, nofollow, noarchive",
    },
  });
}
