import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { workerAttachments } from "@/db/schema";
import { attachmentHeaders } from "@/lib/company-documents";
import { canAccessPortalDepartment, requirePortalApiRole } from "@/lib/portal-access";
import { getRuntimeEnv } from "@/lib/runtime-env";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const access = await requirePortalApiRole(["admin", "manager", "employee"]);
  if (!access || !canAccessPortalDepartment(access, "workforce")) return Response.json({ error: "غير مصرح بعرض مرفقات العامل" }, { status: 403 });

  const { id: value } = await context.params;
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) return Response.json({ error: "المرفق غير صحيح" }, { status: 400 });
  const attachment = await getDb().query.workerAttachments.findFirst({ where: eq(workerAttachments.id, id) });
  if (!attachment) return Response.json({ error: "المرفق غير موجود" }, { status: 404 });
  const object = await getRuntimeEnv().BUCKET.get(attachment.storageKey);
  if (!object) return Response.json({ error: "ملف المرفق غير متاح" }, { status: 404 });

  const inlineRequested = new URL(request.url).searchParams.get("inline") === "1" && (attachment.contentType.startsWith("image/") || attachment.contentType === "application/pdf");
  return new Response(object.body, { headers: attachmentHeaders(attachment.fileName, attachment.contentType, object.httpEtag, inlineRequested ? "inline" : "attachment") });
}
