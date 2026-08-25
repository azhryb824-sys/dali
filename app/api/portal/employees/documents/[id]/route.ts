import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { employeeDocuments } from "@/db/schema";
import { canAccessPortalDepartment, requirePortalApiRole } from "@/lib/portal-access";
import { getRuntimeEnv } from "@/lib/runtime-env";

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const access = await requirePortalApiRole(["admin", "manager", "employee"]);
  if (!access || !canAccessPortalDepartment(access, "employees")) return Response.json({ error: "غير مصرح" }, { status: 403 });
  const id = Number((await context.params).id);
  const document = await getDb().query.employeeDocuments.findFirst({ where: eq(employeeDocuments.id, id) });
  if (!document?.storageKey) return Response.json({ error: "المستند غير موجود" }, { status: 404 });
  const object = await getRuntimeEnv().BUCKET.get(document.storageKey);
  if (!object) return Response.json({ error: "الملف غير موجود" }, { status: 404 });
  return new Response(object.body, { headers: { "content-type": object.httpMetadata?.contentType || "application/octet-stream", "content-disposition": `inline; filename="employee-document-${id}"`, "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
}
