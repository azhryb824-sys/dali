import { and, eq, gt, isNull, lt, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  companyDocuments,
  legalCaseAttachments,
  legalExternalShareBundleItems,
  legalExternalShareBundles,
  legalRecords,
  portalActivity,
} from "@/db/schema";
import { attachmentHeaders, hashShareToken } from "@/lib/company-documents";
import { getRuntimeEnv } from "@/lib/runtime-env";

const digest = async (bytes: Uint8Array) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes).buffer),
    ),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string; id: string }> },
) {
  const { token, id: value } = await context.params;
  const itemId = Number(value);
  if (!/^[a-f0-9]{64}$/i.test(token) || !Number.isInteger(itemId) || itemId < 1)
    return Response.json({ error: "رابط المرفق غير صالح" }, { status: 404 });
  const db = getDb();
  const tokenHash = await hashShareToken(token);
  const bundle = await db.query.legalExternalShareBundles.findFirst({
    where: eq(legalExternalShareBundles.tokenHash, tokenHash),
  });
  const now = new Date().toISOString();
  if (
    !bundle ||
    bundle.revokedAt ||
    bundle.expiresAt <= now ||
    bundle.downloadCount >= bundle.maxDownloads
  )
    return Response.json(
      { error: "انتهت صلاحية رابط المشاركة" },
      { status: 410 },
    );
  const [matter, item] = await Promise.all([
    db.query.legalRecords.findFirst({
      where: and(
        eq(legalRecords.id, bundle.legalRecordId),
        isNull(legalRecords.deletedAt),
      ),
    }),
    db.query.legalExternalShareBundleItems.findFirst({
      where: and(
        eq(legalExternalShareBundleItems.id, itemId),
        eq(legalExternalShareBundleItems.bundleId, bundle.id),
      ),
    }),
  ]);
  if (!matter)
    return Response.json({ error: "الملف القانوني غير متاح" }, { status: 410 });
  if (!item)
    return Response.json({ error: "المرفق غير متاح" }, { status: 404 });

  const legalAttachment = item.attachmentId
    ? await db.query.legalCaseAttachments.findFirst({
        where: and(
          eq(legalCaseAttachments.id, item.attachmentId),
          eq(legalCaseAttachments.legalRecordId, bundle.legalRecordId),
          isNull(legalCaseAttachments.deletedAt),
        ),
      })
    : null;
  const companyDocument = item.documentId
    ? await db.query.companyDocuments.findFirst({
        where: and(
          eq(companyDocuments.id, item.documentId),
          eq(companyDocuments.status, "active"),
        ),
      })
    : null;
  const file = legalAttachment || companyDocument;
  if (!file)
    return Response.json({ error: "المرفق لم يعد متاحًا" }, { status: 410 });
  const object = await getRuntimeEnv().BUCKET.get(file.storageKey);
  if (!object)
    return Response.json({ error: "محتوى المرفق غير متاح" }, { status: 404 });
  const bytes = new Uint8Array(await object.arrayBuffer());
  if (legalAttachment?.sha256 && legalAttachment.sha256 !== (await digest(bytes)))
    return Response.json(
      { error: "فشل التحقق من سلامة المرفق" },
      { status: 409 },
    );
  const accessedAt = new Date().toISOString();
  const [claimed] = await db
    .update(legalExternalShareBundles)
    .set({
      downloadCount: sql`${legalExternalShareBundles.downloadCount} + 1`,
      lastAccessedAt: accessedAt,
    })
    .where(
      and(
        eq(legalExternalShareBundles.id, bundle.id),
        isNull(legalExternalShareBundles.revokedAt),
        gt(legalExternalShareBundles.expiresAt, accessedAt),
        lt(
          legalExternalShareBundles.downloadCount,
          legalExternalShareBundles.maxDownloads,
        ),
      ),
    )
    .returning();
  if (!claimed)
    return Response.json(
      { error: "انتهت صلاحية رابط المشاركة" },
      { status: 410 },
    );
  await db.insert(portalActivity).values({
    actorEmail: "external-lawyer-share",
    action: "legal-external-bundle-file-downloaded",
    entityType: "legal-record",
    entityId: String(bundle.legalRecordId),
    afterJson: JSON.stringify({
      bundleId: bundle.id,
      lawyerId: bundle.lawyerId,
      itemId: item.id,
      attachmentId: item.attachmentId,
      documentId: item.documentId,
      accessNumber: claimed.downloadCount,
      accessedAt,
    }),
    correlationId: crypto.randomUUID(),
    source: "shared-link",
  });
  const headers = attachmentHeaders(
    file.fileName,
    file.contentType,
    object.httpEtag,
  );
  headers.set("cache-control", "private, no-store, max-age=0");
  headers.set("referrer-policy", "no-referrer");
  return new Response(bytes, { headers });
}
