import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { documentStamps, portalActivity } from "@/db/schema";
import { attachmentHeaders, cleanText, objectKey, safeFileName } from "@/lib/company-documents";
import { canAccessCompanyFiles, canManageCompanyAssets, hasPortalPermission, requirePortalApiRole } from "@/lib/portal-access";
import { getRuntimeEnv } from "@/lib/runtime-env";
import { rejectCrossSiteRequest, validateUploadedFile } from "@/lib/security";

const imageTypes = new Set(["image/png", "image/jpeg"]);

export async function GET(request: Request) {
  const access = await requirePortalApiRole(["admin", "manager", "employee"]);
  if (!access || !(canAccessCompanyFiles(access) || await hasPortalPermission(access, "contracts", "read"))) {
    return Response.json({ error: "غير مصرح" }, { status: 403 });
  }
  const id = Number(new URL(request.url).searchParams.get("id") || 0);
  if (id) {
    const stamp = await getDb().query.documentStamps.findFirst({ where: eq(documentStamps.id, id) });
    if (!stamp?.active) return Response.json({ error: "الختم غير موجود" }, { status: 404 });
    const object = await getRuntimeEnv().BUCKET.get(stamp.storageKey);
    if (!object) return Response.json({ error: "ملف الختم غير متاح" }, { status: 404 });
    return new Response(object.body, { headers: attachmentHeaders(stamp.fileName, stamp.contentType, object.httpEtag, "inline") });
  }
  const stamps = await getDb().select({ id: documentStamps.id, name: documentStamps.name, fileName: documentStamps.fileName, active: documentStamps.active, createdBy: documentStamps.createdBy, updatedAt: documentStamps.updatedAt }).from(documentStamps).where(eq(documentStamps.active, true)).orderBy(desc(documentStamps.updatedAt));
  return Response.json({ stamps });
}

export async function POST(request: Request) {
  if (rejectCrossSiteRequest(request)) return Response.json({ error: "مصدر الطلب غير مسموح" }, { status: 403 });
  const access = await requirePortalApiRole(["admin", "manager", "employee"]);
  if (!access || !canManageCompanyAssets(access)) return Response.json({ error: "إدارة الأختام متاحة للمالك ومشرف النظام فقط" }, { status: 403 });
  let storageKey = "";
  try {
    const form = await request.formData();
    const name = cleanText(form.get("name"), 100);
    const file = form.get("file");
    if (name.length < 2 || !(file instanceof File)) return Response.json({ error: "اسم الختم وصورته مطلوبان" }, { status: 400 });
    const validation = await validateUploadedFile(file, { contentTypes: imageTypes, maxBytes: 5 * 1024 * 1024 });
    if (!validation.valid) return Response.json({ error: validation.error }, { status: 400 });
    const fileName = safeFileName(file.name);
    storageKey = objectKey("document-stamps", fileName);
    await getRuntimeEnv().BUCKET.put(storageKey, validation.bytes, { httpMetadata: { contentType: file.type }, customMetadata: { uploadedBy: access.user.email, stampName: name } });
    const [stamp] = await getDb().insert(documentStamps).values({ name, storageKey, fileName, contentType: file.type, sizeBytes: file.size, createdBy: access.user.email }).returning();
    await getDb().insert(portalActivity).values({ actorEmail: access.user.email, action: "document-stamp-created", entityType: "document-stamp", entityId: String(stamp.id) });
    return Response.json({ stamp }, { status: 201 });
  } catch {
    if (storageKey) await getRuntimeEnv().BUCKET.delete(storageKey).catch(() => undefined);
    return Response.json({ error: "تعذر حفظ الختم" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  if (rejectCrossSiteRequest(request)) return Response.json({ error: "مصدر الطلب غير مسموح" }, { status: 403 });
  const access = await requirePortalApiRole(["admin", "manager", "employee"]);
  if (!access || !canManageCompanyAssets(access)) return Response.json({ error: "إدارة الأختام متاحة للمالك ومشرف النظام فقط" }, { status: 403 });
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id < 1) return Response.json({ error: "رقم الختم غير صحيح" }, { status: 400 });
  await getDb().update(documentStamps).set({ active: false, updatedAt: new Date().toISOString() }).where(eq(documentStamps.id, id));
  return Response.json({ ok: true });
}
