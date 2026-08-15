import type { MetadataRoute } from "next";
import { getWebsiteContent } from "@/lib/website-content";

export const dynamic = "force-dynamic";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const content = await getWebsiteContent();
  return {
    name: content.site.companyName,
    short_name: content.site.shortName,
    description: content.site.description,
    start_url: "/",
    display: "standalone",
    background_color: "#001d2d",
    theme_color: "#001d2d",
    lang: "ar",
    dir: "rtl",
    icons: [{ src: "/dally-logo.jpg", sizes: "any", type: "image/jpeg", purpose: "any" }],
  };
}
