import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { quoteVersions } from "@/db/schema";
import { commercialAttachmentRefs, type CommercialAttachmentKind } from "@/lib/commercial-attachments";
import { CommercialAttachmentError, saveCommercialAttachment, storedQuoteAttachment } from "@/lib/commercial-attachment-storage";
import { attachmentHeaders } from "@/lib/company-documents";
import { canAdministerPortalUsers, hasPortalPermission, requirePortalApiRole } from "@/lib/portal-access";
import { ownRepresentativeQuote } from "@/lib/quote-request-workflow";
import { getRuntimeEnv } from "@/lib/runtime-env";
import { jsonNoStore, rejectCrossSiteRequest } from "@/lib/security";

export async function GET(request: Request) {
  const access = await requirePortalApiRole(["admin", "manager", "employee"]);
  const url = new URL(request.url), id = Number(url.searchParams.get("quoteId"));
  if (!access || !(canAdministerPortalUsers(access) || await hasPortalPermission(access, "contracts", "read") || await ownRepresentativeQuote(access, id))) return jsonNoStore({ error: "غير مصرح" }, { status: 403 });
  if (!Number.isSafeInteger(id) || id < 1) return jsonNoStore({ error: "عرض السعر غير صحيح" }, { status: 400 });
  const quote = await getDb().query.quoteVersions.findFirst({ where: eq(quoteVersions.id, id) });
  if (!quote) return jsonNoStore({ error: "عرض السعر غير موجود" }, { status: 404 });
  const fileId = Number(url.searchParams.get("fileId"));
  if (!fileId) return jsonNoStore({ attachments: commercialAttachmentRefs(quote.commercialTermsJson), recordVersion: quote.recordVersion });
  const attachment = await storedQuoteAttachment(quote, fileId);
  if (!attachment) return jsonNoStore({ error: "المرفق غير موجود" }, { status: 404 });
  const object = await getRuntimeEnv().BUCKET.get(attachment.storageKey);
  if (!object) return jsonNoStore({ error: "ملف المرفق غير متاح" }, { status: 404 });
  return new Response(object.body, { headers: attachmentHeaders(attachment.fileName, attachment.contentType) });
}
export async function POST(request: Request) {
  if (rejectCrossSiteRequest(request)) return jsonNoStore({ error: "مصدر الطلب غير مسموح" }, { status: 403 });
  const access = await requirePortalApiRole(["admin", "manager", "employee"]);
  if (!access || !(canAdministerPortalUsers(access) || await hasPortalPermission(access, "contracts", "write"))) return jsonNoStore({ error: "غير مصرح" }, { status: 403 });
  try {
    if (Number(request.headers.get("content-length")) > 11 * 1024 * 1024) throw new CommercialAttachmentError("حجم المرفق يتجاوز الحد المسموح", 413);
    const form = await request.formData(), quoteId = Number(form.get("quoteId")), file = form.get("file");
    if (!Number.isSafeInteger(quoteId) || quoteId < 1 || !(file instanceof File) || !file.size) throw new CommercialAttachmentError("اختر ملفًا صالحًا وعرض سعر صحيحًا");
    const attachment = await saveCommercialAttachment({ quoteId }, file, String(form.get("kind")) as CommercialAttachmentKind, access.user.email);
    return jsonNoStore({ attachment }, { status: 201 });
  } catch (error) {
    if (!(error instanceof CommercialAttachmentError)) console.error("commercial-attachment-save-failed", error);
    return jsonNoStore({ error: error instanceof CommercialAttachmentError ? error.message : "تعذر حفظ المرفق" }, { status: error instanceof CommercialAttachmentError ? error.status : 500 });
  }
}
