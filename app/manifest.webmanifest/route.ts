import type { MetadataRoute } from "next";
import { getWebsiteContent } from "@/lib/website-content";

export const dynamic = "force-dynamic";

export async function GET() {
  const content = await getWebsiteContent();
  const manifest: MetadataRoute.Manifest = {
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

  return Response.json(manifest, {
    headers: {
      "cache-control": "public, max-age=0, must-revalidate",
      "content-type": "application/manifest+json; charset=utf-8",
    },
  });
}
