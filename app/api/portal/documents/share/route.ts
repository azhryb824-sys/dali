import { desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { companyDocuments, documentShareLinks } from "@/db/schema";
import { hashShareToken } from "@/lib/company-documents";
import { requirePortalApiRole } from "@/lib/portal-access";
import { emitPortalNotification } from "@/lib/portal-notifications";
import { auditPortalAction } from "@/lib/audit";
import { rejectCrossSiteRequest } from "@/lib/security";

export async function GET() {
  const access = await requirePortalApiRole(["admin", "manager"]);
  if (!access) return Response.json({ error: "غير مصرح بعرض روابط المشاركة" }, { status: 403 });
  try {
    const db = getDb();
    const rows = await db.select({ id: documentShareLinks.id, documentId: documentShareLinks.documentId, expiresAt: documentShareLinks.expiresAt, revokedAt: documentShareLinks.revokedAt, maxDownloads: documentShareLinks.maxDownloads, downloadCount: documentShareLinks.downloadCount, lastAccessedAt: documentShareLinks.lastAccessedAt, createdBy: documentShareLinks.createdBy, createdAt: documentShareLinks.createdAt }).from(documentShareLinks).orderBy(desc(documentShareLinks.createdAt)).limit(200);
    const documentIds = Array.from(new Set(rows.map((item) => item.documentId)));
    const documents = documentIds.length ? await db.select({ id: companyDocuments.id, title: companyDocuments.title, referenceCode: companyDocuments.referenceCode }).from(companyDocuments).where(inArray(companyDocuments.id, documentIds)) : [];
    return Response.json({ links: rows.map((item) => ({ ...item, document: documents.find((document) => document.id === item.documentId) || null })) }, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ error: "تعذّر تحميل روابط المشاركة" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (rejectCrossSiteRequest(request)) return Response.json({ error: "مصدر الطلب غير مسموح" }, { status: 403 });
  const access = await requirePortalApiRole(["admin", "manager"]);
  if (!access) return Response.json({ error: "غير مصرح بمشاركة المستندات" }, { status: 403 });

  try {
    const payload = await request.json() as { documentId?: unknown; expiresInDays?: unknown; maxDownloads?: unknown };
    const documentId = Number(payload.documentId);
    if (!Number.isInteger(documentId) || documentId < 1) return Response.json({ error: "المستند غير صحيح" }, { status: 400 });

    const db = getDb();
    const document = await db.query.companyDocuments.findFirst({ where: eq(companyDocuments.id, documentId) });
    if (!document || document.status !== "active") return Response.json({ error: "المستند غير موجود" }, { status: 404 });

    const token = `${crypto.randomUUID().replaceAll("-", "")}${crypto.randomUUID().replaceAll("-", "")}`;
    const tokenHash = await hashShareToken(token);
    const expiresInDays = Math.min(30, Math.max(1, Number(payload.expiresInDays) || 7));
    const maxDownloads = Math.min(200, Math.max(1, Number(payload.maxDownloads) || 20));
    const expiresAt = new Date(Date.now() + expiresInDays * 86400000).toISOString();
    const shareId = crypto.randomUUID();
    await db.insert(documentShareLinks).values({ id: shareId, documentId, tokenHash, expiresAt, maxDownloads, createdBy: access.user.email });
    await auditPortalAction({ actorEmail: access.user.email, action: "document-share-created", entityType: "document-share-link", entityId: shareId, after: { documentId, expiresAt, maxDownloads } });
    await emitPortalNotification({ eventType: "document-share-created", title: "أُنشئ رابط مشاركة لمستند", message: `${document.referenceCode} — ${document.title} — الرابط صالح لمدة ${expiresInDays} أيام وبحد ${maxDownloads} تنزيلاً.`, severity: "warning", module: "documents", entityType: "company-document", entityId: document.id, actionView: "documents" }).catch(() => undefined);

    return Response.json({ shareId, shareUrl: `${new URL(request.url).origin}/api/shared-documents/${token}`, expiresAt, maxDownloads });
  } catch {
    return Response.json({ error: "تعذّر إنشاء رابط المشاركة" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  if (rejectCrossSiteRequest(request)) return Response.json({ error: "مصدر الطلب غير مسموح" }, { status: 403 });
  const access = await requirePortalApiRole(["admin", "manager"]);
  if (!access) return Response.json({ error: "غير مصرح بإبطال روابط المشاركة" }, { status: 403 });
  try {
    const payload = await request.json() as { shareId?: unknown; reason?: unknown };
    const shareId = typeof payload.shareId === "string" ? payload.shareId.trim().slice(0, 80) : "";
    if (!shareId) return Response.json({ error: "رابط المشاركة غير محدد" }, { status: 400 });
    const db = getDb();
    const existing = await db.query.documentShareLinks.findFirst({ where: eq(documentShareLinks.id, shareId) });
    if (!existing) return Response.json({ error: "الرابط غير موجود" }, { status: 404 });
    const revokedAt = new Date().toISOString();
    await db.update(documentShareLinks).set({ revokedAt }).where(eq(documentShareLinks.id, shareId));
    await auditPortalAction({ actorEmail: access.user.email, action: "document-share-revoked", entityType: "document-share-link", entityId: shareId, before: existing, after: { ...existing, revokedAt }, reason: typeof payload.reason === "string" ? payload.reason : null });
    await emitPortalNotification({ eventType: "document-share-revoked", title: "أُبطل رابط مشاركة مستند", message: `أبطل ${access.user.displayName} رابط مشاركة مستند.`, severity: "info", module: "documents", entityType: "company-document", entityId: existing.documentId, actionView: "documents" }).catch(() => undefined);
    return Response.json({ revoked: true, revokedAt });
  } catch {
    return Response.json({ error: "تعذّر إبطال رابط المشاركة" }, { status: 500 });
  }
}
