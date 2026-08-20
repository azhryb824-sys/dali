import { and, eq, gt, isNull, lt, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { companyDocuments, documentShareLinks, portalActivity } from "@/db/schema";
import { attachmentHeaders, hashShareToken } from "@/lib/company-documents";
import { getRuntimeEnv } from "@/lib/runtime-env";

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  if (!/^[a-f0-9]{64}$/i.test(token)) return Response.json({ error: "رابط المشاركة غير صالح" }, { status: 404 });

  const db = getDb();
  const tokenHash = await hashShareToken(token);
  const share = await db.query.documentShareLinks.findFirst({ where: eq(documentShareLinks.tokenHash, tokenHash) });
  if (!share || share.revokedAt || new Date(share.expiresAt).getTime() <= Date.now() || share.downloadCount >= share.maxDownloads) {
    return Response.json({ error: "انتهت صلاحية رابط المشاركة" }, { status: 410 });
  }

  const document = await db.query.companyDocuments.findFirst({ where: eq(companyDocuments.id, share.documentId) });
  if (!document || document.status !== "active") return Response.json({ error: "المستند غير متاح" }, { status: 404 });
  const object = await getRuntimeEnv().BUCKET.get(document.storageKey);
  if (!object) return Response.json({ error: "ملف المستند غير متاح" }, { status: 404 });

  const accessedAt = new Date().toISOString();
  const [claimed] = await db.update(documentShareLinks).set({ downloadCount: sql`${documentShareLinks.downloadCount} + 1`, lastAccessedAt: accessedAt }).where(and(
    eq(documentShareLinks.id, share.id), isNull(documentShareLinks.revokedAt), gt(documentShareLinks.expiresAt, accessedAt), lt(documentShareLinks.downloadCount, documentShareLinks.maxDownloads),
  )).returning();
  if (!claimed) return Response.json({ error: "انتهت صلاحية رابط المشاركة" }, { status: 410 });
  await db.insert(portalActivity).values({ actorEmail: "shared-link", action: "shared-document-downloaded", entityType: "company-document", entityId: String(document.id), afterJson: JSON.stringify({ shareId: share.id, accessNumber: claimed.downloadCount }), correlationId: crypto.randomUUID(), source: "shared-link" });
  const headers = attachmentHeaders(document.fileName, document.contentType, object.httpEtag);
  headers.set("cache-control", "no-store, max-age=0");
  return new Response(object.body, { headers });
}
