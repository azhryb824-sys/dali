import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { companyAssets, documentStamps, portalActivity } from "@/db/schema";
import { attachmentHeaders, cleanText, objectKey, safeFileName } from "@/lib/company-documents";
import { canAccessCompanyFiles, canManageCompanyAssets, requirePortalApiRole } from "@/lib/portal-access";
import { emitPortalNotification } from "@/lib/portal-notifications";
import { getRuntimeEnv } from "@/lib/runtime-env";
import { rejectCrossSiteRequest, validateUploadedFile } from "@/lib/security";

const IMAGE_TYPES = new Set(["image/png", "image/jpeg"]);
const MAX_ASSET_BYTES = 5 * 1024 * 1024;

export async function GET(request: Request) {
  const access = await requirePortalApiRole(["admin", "manager", "employee"]);
  if (!access || !canAccessCompanyFiles(access)) return Response.json({ error: "غير مصرح بمعاينة الأصل" }, { status: 403 });
  const slot = new URL(request.url).searchParams.get("slot");
  if (slot !== "stamp" && slot !== "signature") return Response.json({ error: "نوع الأصل غير صحيح" }, { status: 400 });
  const asset = await getDb().query.companyAssets.findFirst({ where: eq(companyAssets.slot, slot) });
  if (!asset) return Response.json({ error: "الأصل غير موجود" }, { status: 404 });
  const object = await getRuntimeEnv().BUCKET.get(asset.storageKey);
  if (!object) return Response.json({ error: "ملف الأصل غير متاح" }, { status: 404 });
  return new Response(object.body, { headers: attachmentHeaders(asset.fileName, asset.contentType, object.httpEtag, "inline") });
}

export async function POST(request: Request) {
  if (rejectCrossSiteRequest(request)) return Response.json({ error: "مصدر الطلب غير مسموح" }, { status: 403 });
  const access = await requirePortalApiRole(["admin", "manager", "employee"]);
  if (!access || !canManageCompanyAssets(access)) return Response.json({ error: "رفع الختم والتوقيع متاح للمالك ومشرف النظام فقط" }, { status: 403 });

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

    if (slot === "stamp") {
      await db.insert(documentStamps).values({
        name: "ختم الشركة المعتمد", storageKey: saved.storageKey, fileName: saved.fileName,
        contentType: saved.contentType, sizeBytes: saved.sizeBytes, active: true,
        createdBy: access.user.email, updatedAt: now,
      }).onConflictDoUpdate({
        target: documentStamps.storageKey,
        set: { fileName: saved.fileName, contentType: saved.contentType, sizeBytes: saved.sizeBytes, active: true, updatedAt: now },
      });
    }
    await db.insert(portalActivity).values({ actorEmail: access.user.email, action: `company-${slot}-updated`, entityType: "company-asset", entityId: slot });
    if (previous?.storageKey && previous.storageKey !== storageKey) {
      await getRuntimeEnv().BUCKET.delete(previous.storageKey).catch(() => undefined);
    }
    await emitPortalNotification({ eventType: `company-${slot}-updated`, title: slot === "stamp" ? "تم تحديث ختم الشركة" : "تم تحديث توقيع الشركة", message: `حدّث مدير النظام الأصل الرسمي المستخدم في ملفات PDF.`, severity: "warning", module: "documents", entityType: "company-asset", entityId: slot, actionView: "documents", targetRole: "admin" }).catch(() => undefined);
    return Response.json({ asset: { slot: saved.slot, fileName: saved.fileName, contentType: saved.contentType, sizeBytes: saved.sizeBytes, uploadedBy: saved.uploadedBy, updatedAt: saved.updatedAt } });
  } catch (error) {
    console.error("company-asset-upload-failed", error instanceof Error ? error.message : String(error));
    if (storageKey) await getRuntimeEnv().BUCKET.delete(storageKey).catch(() => undefined);
    const message = error instanceof Error ? error.message : "";
    return Response.json({ error: message === "COMPANY_ASSET_STORAGE_VERIFICATION_FAILED" ? "لم يكتمل حفظ الملف في التخزين الدائم. أعد المحاولة بعد تحديث الصفحة." : "تعذّر حفظ الختم أو التوقيع. تأكد أن الصورة PNG أو JPG وأقل من 5 ميجابايت." }, { status: 500 });
  }
}
