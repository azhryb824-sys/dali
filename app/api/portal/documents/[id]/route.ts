import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { companyDocuments, portalActivity } from "@/db/schema";
import { attachmentHeaders } from "@/lib/company-documents";
import { canAccessPortalDocuments, requirePortalApiRole } from "@/lib/portal-access";
import { getRuntimeEnv } from "@/lib/runtime-env";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const access = await requirePortalApiRole(["admin", "manager", "employee"]);
  if (!access || !canAccessPortalDocuments(access)) return Response.json({ error: "غير مصرح بتنزيل المستند" }, { status: 403 });

  const { id: value } = await context.params;
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) return Response.json({ error: "المستند غير صحيح" }, { status: 400 });

  const db = getDb();
  const document = await db.query.companyDocuments.findFirst({ where: eq(companyDocuments.id, id) });
  if (!document || document.status !== "active") return Response.json({ error: "المستند غير موجود" }, { status: 404 });
  const object = await getRuntimeEnv().BUCKET.get(document.storageKey);
  if (!object) return Response.json({ error: "ملف المستند غير متاح" }, { status: 404 });

  await db.insert(portalActivity).values({ actorEmail: access.user.email, action: "document-downloaded", entityType: "company-document", entityId: String(id) });
  return new Response(object.body, { headers: attachmentHeaders(document.fileName, document.contentType, object.httpEtag) });
}
