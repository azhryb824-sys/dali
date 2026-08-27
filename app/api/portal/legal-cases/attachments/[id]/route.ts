import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { legalCaseAttachments } from "@/db/schema";
import { attachmentHeaders } from "@/lib/company-documents";
import { hasPortalPermission, requirePortalApiRole } from "@/lib/portal-access";
import { getRuntimeEnv } from "@/lib/runtime-env";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const actor = await requirePortalApiRole(["admin", "manager", "employee"]);
  if (!actor || !(await hasPortalPermission(actor, "legal", "read"))) return Response.json({ error: "غير مصرح بعرض المرفق القانوني" }, { status: 403 });
  const { id: value } = await context.params;
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) return Response.json({ error: "المرفق غير صحيح" }, { status: 400 });
  const attachment = await getDb().query.legalCaseAttachments.findFirst({ where: eq(legalCaseAttachments.id, id) });
  if (!attachment) return Response.json({ error: "المرفق غير موجود" }, { status: 404 });
  const object = await getRuntimeEnv().BUCKET.get(attachment.storageKey);
  if (!object) return Response.json({ error: "ملف المرفق غير متاح" }, { status: 404 });
  const inline = new URL(request.url).searchParams.get("inline") === "1";
  return new Response(object.body, { headers: attachmentHeaders(attachment.fileName, attachment.contentType, object.httpEtag, inline ? "inline" : "attachment") });
}
