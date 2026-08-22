import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { companyAssets, portalActivity } from "@/db/schema";
import { cleanText, objectKey, safeFileName } from "@/lib/company-documents";
import { requirePortalApiRole } from "@/lib/portal-access";
import { emitPortalNotification } from "@/lib/portal-notifications";
import { getRuntimeEnv } from "@/lib/runtime-env";
import { rejectCrossSiteRequest, validateUploadedFile } from "@/lib/security";

const IMAGE_TYPES = new Set(["image/png", "image/jpeg"]);
const MAX_ASSET_BYTES = 5 * 1024 * 1024;

export async function POST(request: Request) {
  if (rejectCrossSiteRequest(request)) return Response.json({ error: "مصدر الطلب غير مسموح" }, { status: 403 });
  const access = await requirePortalApiRole(["admin"]);
  if (!access) return Response.json({ error: "هذه العملية متاحة لمدير النظام فقط" }, { status: 403 });

  let storageKey = "";
  try {
    const form = await request.formData();
    const file = form.get("file");
    const slot = cleanText(form.get("slot"), 20);
    if (slot !== "stamp" && slot !== "signature") return Response.json({ error: "نوع الأصل غير صحيح" }, { status: 400 });
    if (!(file instanceof File)) {
      return Response.json({ error: "استخدم صورة PNG أو JPG لا تتجاوز 5 ميجابايت" }, { status: 400 });
    }
    const validation = await validateUploadedFile(file, { contentTypes: IMAGE_TYPES, maxBytes: MAX_ASSET_BYTES });
    if (!validation.valid) return Response.json({ error: validation.error }, { status: 400 });

    const fileName = safeFileName(file.name);
    storageKey = objectKey("company-assets", fileName);
    await getRuntimeEnv().BUCKET.put(storageKey, validation.bytes, {
      httpMetadata: { contentType: file.type },
      customMetadata: { uploadedBy: access.user.email, assetSlot: slot, validation: validation.validationDetails },
    });
    const storedObject = await getRuntimeEnv().BUCKET.get(storageKey);
    if (!storedObject || (await storedObject.arrayBuffer()).byteLength !== validation.bytes.byteLength) {
      throw new Error("COMPANY_ASSET_STORAGE_VERIFICATION_FAILED");
    }

    const db = getDb();
    const previous = await db.query.companyAssets.findFirst({ where: eq(companyAssets.slot, slot) });
    const now = new Date().toISOString();
    const [saved] = await db.insert(companyAssets).values({
      slot,
      fileName,
      storageKey,
      contentType: file.type,
      sizeBytes: file.size,
      validationStatus: "signature-validated",
      validationDetails: validation.validationDetails,
      uploadedBy: access.user.email,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: companyAssets.slot,
      set: { fileName, storageKey, contentType: file.type, sizeBytes: file.size, validationStatus: "signature-validated", validationDetails: validation.validationDetails, uploadedBy: access.user.email, updatedAt: now },
    }).returning();

    await db.insert(portalActivity).values({ actorEmail: access.user.email, action: `company-${slot}-updated`, entityType: "company-asset", entityId: slot });
    if (previous?.storageKey && previous.storageKey !== storageKey) {
      await getRuntimeEnv().BUCKET.delete(previous.storageKey).catch(() => undefined);
    }
    await emitPortalNotification({ eventType: `company-${slot}-updated`, title: slot === "stamp" ? "تم تحديث ختم الشركة" : "تم تحديث توقيع الشركة", message: `حدّث مدير النظام الأصل الرسمي المستخدم في ملفات PDF.`, severity: "warning", module: "documents", entityType: "company-asset", entityId: slot, actionView: "documents", targetRole: "admin" }).catch(() => undefined);
    return Response.json({ asset: { slot: saved.slot, fileName: saved.fileName, contentType: saved.contentType, sizeBytes: saved.sizeBytes, uploadedBy: saved.uploadedBy, updatedAt: saved.updatedAt } });
  } catch (error) {
    console.error("company-asset-upload-failed", error instanceof Error ? error.message : String(error));
    if (storageKey) await getRuntimeEnv().BUCKET.delete(storageKey).catch(() => undefined);
    return Response.json({ error: "تعذّر حفظ الختم أو التوقيع" }, { status: 500 });
  }
}
