import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { constructionProjects, constructionRecordAttachments, constructionRecords } from "@/db/schema";
import { getActivePortalScopes, scopeAllowsProject } from "@/lib/access-policy";
import { attachmentHeaders } from "@/lib/company-documents";
import { hasPortalPermission, requirePortalApiRole } from "@/lib/portal-access";
import { getRuntimeEnv } from "@/lib/runtime-env";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const access = await requirePortalApiRole(["admin", "manager", "employee"]);
  if (!access || !Number.isInteger(id)) return Response.json({ error: "غير مصرح" }, { status: 403 });
  const scopes = await getActivePortalScopes(access);
  if (!(await hasPortalPermission(access, "construction", "read")) && !scopes.length) return Response.json({ error: "غير مصرح" }, { status: 403 });
  const db = getDb();
  const file = await db.query.constructionRecordAttachments.findFirst({ where: eq(constructionRecordAttachments.id, id) });
  if (!file) return Response.json({ error: "الملف غير موجود" }, { status: 404 });
  const record = await db.query.constructionRecords.findFirst({ where: eq(constructionRecords.id, file.recordId) });
  const project = record?.projectId ? await db.query.constructionProjects.findFirst({ where: eq(constructionProjects.id, record.projectId) }) : null;
  if (!record || !scopeAllowsProject(access, scopes, record.projectId, project?.cityId ?? null)) return Response.json({ error: "الملف خارج نطاقك" }, { status: 403 });
  const object = await getRuntimeEnv().BUCKET.get(file.storageKey);
  if (!object) return Response.json({ error: "تعذّر العثور على محتوى الملف" }, { status: 404 });
  return new Response(object.body, { headers: attachmentHeaders(file.fileName, file.contentType, object.httpEtag) });
}
