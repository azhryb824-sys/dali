import type { MetadataRoute } from "next";
import { absoluteUrl, SITE } from "@/lib/site";

export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/portal", "/client", "/worker", "/api", "/login", "/pwa", "/desktop-access", "/contracts/signature"],
    },
    sitemap: absoluteUrl("/sitemap.xml"),
    host: SITE.url,
  };
}
