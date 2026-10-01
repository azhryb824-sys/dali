import { notFound } from "next/navigation";
import { hasPortalPermission, requirePortalApiRole } from "@/lib/portal-access";
import WebsitePreviewCanvas from "./WebsitePreviewCanvas";
export const dynamic = "force-dynamic";
export const metadata = { title: "معاينة الموقع", robots: { index: false, follow: false } };
export default async function WebsitePreviewPage() {
  const access = await requirePortalApiRole(["admin", "manager", "employee"]);
  if (!access || !await hasPortalPermission(access, "website", "read")) notFound();
  return <WebsitePreviewCanvas/>;
}
