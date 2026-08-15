import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { companyDocuments, quoteVersions, salesOpportunities, workforceContracts } from "@/db/schema";
import { attachmentHeaders } from "@/lib/company-documents";
import { requireClientApiAccess } from "@/lib/client-access";
import { getRuntimeEnv } from "@/lib/runtime-env";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const access = await requireClientApiAccess();
  if (!access) return Response.json({ error: "غير مصرح" }, { status: 403 });
  const id = Number((await context.params).id);
  if (!Number.isInteger(id) || id < 1) return Response.json({ error: "المستند غير صحيح" }, { status: 400 });
  const db = getDb();
  const opportunities = await db.select({ id: salesOpportunities.id }).from(salesOpportunities).where(eq(salesOpportunities.clientId, access.clientId)).limit(1000);
  const opportunityIds = opportunities.map((item) => item.id);
  const [contract, quote] = await Promise.all([
    db.query.workforceContracts.findFirst({ where: and(eq(workforceContracts.clientId, access.clientId), eq(workforceContracts.documentId, id)) }),
    opportunityIds.length ? db.query.quoteVersions.findFirst({ where: and(inArray(quoteVersions.opportunityId, opportunityIds), eq(quoteVersions.documentId, id)) }) : Promise.resolve(undefined),
  ]);
  if (!contract && !quote) return Response.json({ error: "المستند غير مرتبط بحسابك" }, { status: 403 });
  const document = await db.query.companyDocuments.findFirst({ where: eq(companyDocuments.id, id) });
  if (!document || document.status !== "active") return Response.json({ error: "المستند غير متاح" }, { status: 404 });
  const object = await getRuntimeEnv().BUCKET.get(document.storageKey);
  if (!object) return Response.json({ error: "الملف غير متاح" }, { status: 404 });
  return new Response(object.body, { headers: attachmentHeaders(document.fileName, document.contentType, object.httpEtag) });
}
