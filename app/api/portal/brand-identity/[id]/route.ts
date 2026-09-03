import { auditPortalAction } from "@/lib/audit";
import { brandIdentityAssets, isBrandIdentityAssetId } from "@/lib/brand-identity";
import { generateBrandIdentityPdf } from "@/lib/brand-identity-pdf";
import { canAccessCompanyFiles, requirePortalApiRole } from "@/lib/portal-access";
import { attachmentHeaders } from "@/lib/company-documents";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const access = await requirePortalApiRole(["admin", "manager", "employee"]);
  if (!access || !canAccessCompanyFiles(access)) return Response.json({ error: "غير مصرح بتنزيل ملفات الهوية" }, { status: 403 });
  const { id } = await context.params;
  if (!isBrandIdentityAssetId(id)) return Response.json({ error: "ملف الهوية غير موجود" }, { status: 404 });
  const item = brandIdentityAssets.find((asset) => asset.id === id)!;
  const pdf = await generateBrandIdentityPdf(id);
  await auditPortalAction({ actorEmail: access.user.email, action: "brand-identity-downloaded", entityType: "brand-identity-asset", entityId: id, after: { title: item.title, format: "pdf" } });
  return new Response(new Uint8Array(pdf).buffer, { headers: attachmentHeaders(`dali-${id}.pdf`, "application/pdf") });
}
