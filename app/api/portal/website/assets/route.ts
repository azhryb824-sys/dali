import { objectKey, safeFileName } from "@/lib/company-documents";
import { hasPortalPermission, requirePortalApiRole } from "@/lib/portal-access";
import { getRuntimeEnv } from "@/lib/runtime-env";
import { rejectCrossSiteRequest, validateUploadedFile } from "@/lib/security";

const IMAGE_TYPES = new Set(["image/png", "image/jpeg"]);

export async function POST(request: Request) {
  if (rejectCrossSiteRequest(request)) return Response.json({ error: "مصدر الطلب غير مسموح" }, { status: 403 });
  const access = await requirePortalApiRole(["admin", "manager", "employee"]);
  if (!access || !(await hasPortalPermission(access, "website", "write"))) return Response.json({ error: "لا تملك صلاحية إدارة الموقع" }, { status: 403 });
  let storageKey = "";
  try {
    const file = (await request.formData()).get("file");
    if (!(file instanceof File)) return Response.json({ error: "اختر صورة شعار PNG أو JPG" }, { status: 400 });
    const validation = await validateUploadedFile(file, { contentTypes: IMAGE_TYPES, maxBytes: 3 * 1024 * 1024 });
    if (!validation.valid) return Response.json({ error: validation.error }, { status: 400 });
    const extension = file.type === "image/png" ? "png" : "jpg";
    const publicName = `${crypto.randomUUID()}.${extension}`;
    storageKey = objectKey("website-assets", safeFileName(publicName));
    await getRuntimeEnv().BUCKET.put(storageKey, validation.bytes, { httpMetadata: { contentType: file.type }, customMetadata: { uploadedBy: access.user.email, usage: "partner-logo" } });
    const stored = await getRuntimeEnv().BUCKET.get(storageKey);
    if (!stored || (await stored.arrayBuffer()).byteLength !== validation.bytes.byteLength) throw new Error("WEBSITE_ASSET_STORAGE_VERIFICATION_FAILED");
    return Response.json({ url: `/api/website-assets/${publicName}` });
  } catch (error) {
    console.error("website-asset-upload-failed", error instanceof Error ? error.message : String(error));
    if (storageKey) await getRuntimeEnv().BUCKET.delete(storageKey).catch(() => undefined);
    return Response.json({ error: "تعذّر حفظ شعار الشريك" }, { status: 500 });
  }
}
