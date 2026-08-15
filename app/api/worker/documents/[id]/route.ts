import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { workerAttachments } from "@/db/schema";
import { requireWorkerApiAccess } from "@/lib/client-access";
import { attachmentHeaders } from "@/lib/company-documents";
import { getRuntimeEnv } from "@/lib/runtime-env";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const access = await requireWorkerApiAccess();
  if (!access) return Response.json({ error: "غير مصرح" }, { status: 403 });
  const id = Number((await context.params).id);
  if (!Number.isInteger(id) || id < 1) return Response.json({ error: "المستند غير صحيح" }, { status: 400 });
  const attachment = await getDb().query.workerAttachments.findFirst({ where: and(eq(workerAttachments.id, id), eq(workerAttachments.workerId, access.workerId)) });
  if (!attachment) return Response.json({ error: "المستند غير متاح" }, { status: 404 });
  const object = await getRuntimeEnv().BUCKET.get(attachment.storageKey);
  if (!object) return Response.json({ error: "الملف غير متاح" }, { status: 404 });
  return new Response(object.body, { headers: attachmentHeaders(attachment.fileName, attachment.contentType, object.httpEtag) });
}
