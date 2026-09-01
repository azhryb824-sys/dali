import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import {
  legalCaseAttachments,
  legalExternalShares,
  legalLawyers,
  legalRecords,
} from "@/db/schema";
import { auditPortalAction } from "@/lib/audit";
import { hashShareToken } from "@/lib/company-documents";
import { emitPortalNotification } from "@/lib/portal-notifications";
import { hasPortalPermission, requirePortalApiRole } from "@/lib/portal-access";
import { externalRequestUrl } from "@/lib/request-origin";
import {
  jsonNoStore,
  readLimitedJson,
  rejectCrossSiteRequest,
} from "@/lib/security";

type Actor = NonNullable<Awaited<ReturnType<typeof requirePortalApiRole>>>;
const clean = (value: unknown, max = 1000) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

function canShareLegalFiles(actor: Actor) {
  return (
    actor.role === "admin" ||
    actor.functionalRoles.some((role) =>
      [
        "system_owner",
        "system_admin",
        "legal_supervisor",
        "lawyer",
      ].includes(role),
    )
  );
}

async function access() {
  const actor = await requirePortalApiRole(["admin", "manager", "employee"]);
  if (
    !actor ||
    !(await hasPortalPermission(actor, "legal", "write")) ||
    !canShareLegalFiles(actor)
  )
    return null;
  return actor;
}

function whatsappPhone(value: string) {
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (/^05\d{8}$/.test(digits)) digits = `966${digits.slice(1)}`;
  else if (/^5\d{8}$/.test(digits)) digits = `966${digits}`;
  return /^\d{8,15}$/.test(digits) ? digits : "";
}

export async function POST(request: Request) {
  if (rejectCrossSiteRequest(request))
    return jsonNoStore({ error: "مصدر الطلب غير مسموح" }, { status: 403 });
  const actor = await access();
  if (!actor)
    return jsonNoStore(
      { error: "المشاركة متاحة للمالك أو المشرف أو مستخدم المحامي فقط" },
      { status: 403 },
    );
  const parsed = await readLimitedJson(request, 4000);
  if (!parsed.ok) return parsed.response;
  const body = parsed.value as Record<string, unknown>;
  const legalRecordId = Number(body.legalRecordId);
  const attachmentId = Number(body.attachmentId);
  const lawyerId = Number(body.lawyerId);
  const expiresInDays = Math.min(
    14,
    Math.max(1, Math.round(Number(body.expiresInDays) || 7)),
  );
  if (
    !Number.isInteger(legalRecordId) ||
    legalRecordId < 1 ||
    !Number.isInteger(attachmentId) ||
    attachmentId < 1 ||
    !Number.isInteger(lawyerId) ||
    lawyerId < 1
  )
    return jsonNoStore(
      { error: "اختر الملف والمحامي الخارجي" },
      { status: 400 },
    );

  const db = getDb();
  const [matter, attachment, lawyer] = await Promise.all([
    db.query.legalRecords.findFirst({
      where: eq(legalRecords.id, legalRecordId),
    }),
    db.query.legalCaseAttachments.findFirst({
      where: and(
        eq(legalCaseAttachments.id, attachmentId),
        eq(legalCaseAttachments.legalRecordId, legalRecordId),
      ),
    }),
    db.query.legalLawyers.findFirst({
      where: and(
        eq(legalLawyers.id, lawyerId),
        eq(legalLawyers.status, "active"),
        isNull(legalLawyers.portalUserEmail),
      ),
    }),
  ]);
  if (!matter || !attachment)
    return jsonNoStore(
      { error: "القضية أو الملف غير موجود" },
      { status: 404 },
    );
  if (!lawyer)
    return jsonNoStore(
      { error: "اختر محاميًا خارجيًا نشطًا" },
      { status: 409 },
    );
  const phone = whatsappPhone(lawyer.mobile || "");
  if (!phone)
    return jsonNoStore(
      { error: "رقم واتساب المحامي الخارجي غير مسجل أو غير صحيح" },
      { status: 409 },
    );

  const token = `${crypto.randomUUID().replaceAll("-", "")}${crypto.randomUUID().replaceAll("-", "")}`;
  const tokenHash = await hashShareToken(token);
  const sharedAt = new Date().toISOString();
  const expiresAt = new Date(
    Date.now() + expiresInDays * 86400000,
  ).toISOString();
  const shareId = crypto.randomUUID();
  const [share] = await db
    .insert(legalExternalShares)
    .values({
      id: shareId,
      legalRecordId,
      attachmentId,
      lawyerId,
      tokenHash,
      expiresAt,
      maxDownloads: 20,
      sharedBy: actor.user.email,
      sharedAt,
    })
    .returning();
  const shareUrl = externalRequestUrl(
    request,
    `/api/legal-shares/${token}`,
  ).toString();
  const message = [
    `الأستاذ/ ${lawyer.fullName}`,
    `تمت مشاركة الملف «${attachment.title}» من القضية ${matter.referenceCode}.`,
    `الرابط صالح لمدة ${expiresInDays} أيام:`,
    shareUrl,
  ].join("\n");
  const whatsappUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;

  await auditPortalAction({
    actorEmail: actor.user.email,
    action: "legal-file-whatsapp-shared",
    entityType: "legal-external-share",
    entityId: share.id,
    after: {
      legalRecordId,
      attachmentId,
      lawyerId,
      channel: "whatsapp",
      sharedAt,
      expiresAt,
      mobile: "[محجوب]",
    },
  });
  await emitPortalNotification({
    eventType: "legal-file-whatsapp-shared",
    title: "تمت مشاركة ملف قانوني عبر واتساب",
    message: `${matter.referenceCode} — ${attachment.title} — ${lawyer.fullName}.`,
    severity: "warning",
    module: "legal",
    entityType: "legal-record",
    entityId: legalRecordId,
    actionView: "legal",
    targetDepartment: "legal",
  }).catch(() => undefined);
  return jsonNoStore({
    share: {
      id: share.id,
      legalRecordId: share.legalRecordId,
      attachmentId: share.attachmentId,
      lawyerId: share.lawyerId,
      channel: share.channel,
      expiresAt: share.expiresAt,
      revokedAt: share.revokedAt,
      maxDownloads: share.maxDownloads,
      downloadCount: share.downloadCount,
      lastAccessedAt: share.lastAccessedAt,
      sharedBy: share.sharedBy,
      sharedAt: share.sharedAt,
    },
    whatsappUrl,
  });
}

export async function DELETE(request: Request) {
  if (rejectCrossSiteRequest(request))
    return jsonNoStore({ error: "مصدر الطلب غير مسموح" }, { status: 403 });
  const actor = await access();
  if (!actor)
    return jsonNoStore(
      { error: "غير مصرح بإبطال المشاركة" },
      { status: 403 },
    );
  const parsed = await readLimitedJson(request, 2000);
  if (!parsed.ok) return parsed.response;
  const body = parsed.value as Record<string, unknown>;
  const shareId = clean(body.shareId, 80);
  const reason = clean(body.reason, 1000);
  if (!shareId)
    return jsonNoStore({ error: "رابط المشاركة غير محدد" }, { status: 400 });
  const db = getDb();
  const before = await db.query.legalExternalShares.findFirst({
    where: eq(legalExternalShares.id, shareId),
  });
  if (!before)
    return jsonNoStore({ error: "سجل المشاركة غير موجود" }, { status: 404 });
  if (before.revokedAt)
    return jsonNoStore({ share: before, revoked: true });
  const revokedAt = new Date().toISOString();
  const [share] = await db
    .update(legalExternalShares)
    .set({ revokedAt, revokedBy: actor.user.email })
    .where(
      and(
        eq(legalExternalShares.id, shareId),
        isNull(legalExternalShares.revokedAt),
      ),
    )
    .returning();
  if (!share)
    return jsonNoStore(
      { error: "أُبطل الرابط من مستخدم آخر" },
      { status: 409 },
    );
  await auditPortalAction({
    actorEmail: actor.user.email,
    action: "legal-file-share-revoked",
    entityType: "legal-external-share",
    entityId: share.id,
    before,
    after: share,
    reason: reason || null,
  });
  await emitPortalNotification({
    eventType: "legal-file-share-revoked",
    title: "أُبطل رابط مشاركة ملف قانوني",
    message: `القضية #${share.legalRecordId} — المشاركة ${share.id}.`,
    severity: "info",
    module: "legal",
    entityType: "legal-record",
    entityId: share.legalRecordId,
    actionView: "legal",
    targetDepartment: "legal",
  }).catch(() => undefined);
  return jsonNoStore({ share, revoked: true });
}
