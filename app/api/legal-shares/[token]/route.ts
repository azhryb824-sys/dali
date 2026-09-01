import { and, eq, gt, isNull, lt, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  legalCaseAttachments,
  legalExternalShares,
  portalActivity,
} from "@/db/schema";
import { attachmentHeaders, hashShareToken } from "@/lib/company-documents";
import { getRuntimeEnv } from "@/lib/runtime-env";

const digest = async (bytes: Uint8Array) => {
  const value = await crypto.subtle.digest(
    "SHA-256",
    Uint8Array.from(bytes).buffer,
  );
  return Array.from(new Uint8Array(value), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  if (!/^[a-f0-9]{64}$/i.test(token))
    return Response.json({ error: "رابط المشاركة غير صالح" }, { status: 404 });
  const db = getDb();
  const tokenHash = await hashShareToken(token);
  const share = await db.query.legalExternalShares.findFirst({
    where: eq(legalExternalShares.tokenHash, tokenHash),
  });
  if (
    !share ||
    share.revokedAt ||
    new Date(share.expiresAt).getTime() <= Date.now() ||
    share.downloadCount >= share.maxDownloads
  )
    return Response.json(
      { error: "انتهت صلاحية رابط المشاركة" },
      { status: 410 },
    );
  const attachment = await db.query.legalCaseAttachments.findFirst({
    where: and(
      eq(legalCaseAttachments.id, share.attachmentId),
      eq(legalCaseAttachments.legalRecordId, share.legalRecordId),
    ),
  });
  if (!attachment)
    return Response.json({ error: "الملف غير متاح" }, { status: 404 });
  const object = await getRuntimeEnv().BUCKET.get(attachment.storageKey);
  if (!object)
    return Response.json({ error: "محتوى الملف غير متاح" }, { status: 404 });
  const bytes = new Uint8Array(await object.arrayBuffer());
  const sha256 = await digest(bytes);
  if (attachment.sha256 && attachment.sha256 !== sha256)
    return Response.json(
      { error: "فشل التحقق من سلامة الملف" },
      { status: 409 },
    );

  const accessedAt = new Date().toISOString();
  const [claimed] = await db
    .update(legalExternalShares)
    .set({
      downloadCount: sql`${legalExternalShares.downloadCount} + 1`,
      lastAccessedAt: accessedAt,
    })
    .where(
      and(
        eq(legalExternalShares.id, share.id),
        isNull(legalExternalShares.revokedAt),
        gt(legalExternalShares.expiresAt, accessedAt),
        lt(
          legalExternalShares.downloadCount,
          legalExternalShares.maxDownloads,
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
    action: "legal-external-file-downloaded",
    entityType: "legal-record",
    entityId: String(share.legalRecordId),
    afterJson: JSON.stringify({
      shareId: share.id,
      lawyerId: share.lawyerId,
      attachmentId: share.attachmentId,
      accessNumber: claimed.downloadCount,
      accessedAt,
    }),
    correlationId: crypto.randomUUID(),
    source: "shared-link",
  });
  const headers = attachmentHeaders(
    attachment.fileName,
    attachment.contentType,
    object.httpEtag,
  );
  headers.set("cache-control", "private, no-store, max-age=0");
  return new Response(bytes, { headers });
}
