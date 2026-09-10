import { and, eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import {
  companyDocuments,
  legalCaseActionLog,
  legalCaseAttachments,
  legalExternalShareBundleItems,
  legalExternalShareBundles,
  legalExternalShares,
  legalLawyers,
  legalRecords,
  workforceContracts,
} from "@/db/schema";
import { auditPortalAction } from "@/lib/audit";
import { hashShareToken } from "@/lib/company-documents";
import { emitPortalNotification } from "@/lib/portal-notifications";
import { hasPortalPermission, requirePortalApiRole } from "@/lib/portal-access";
import { externalRequestUrl } from "@/lib/request-origin";
import { normalizeSaudiWhatsAppNumber } from "@/lib/whatsapp";
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

function preciseSaudiTime(value: string) {
  return new Intl.DateTimeFormat("ar-SA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  }).format(new Date(value));
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
  const shareAll = body.shareAll === true || body.shareAll === "true";
  const expiresInDays = Math.min(
    14,
    Math.max(1, Math.round(Number(body.expiresInDays) || 7)),
  );
  if (
    !Number.isInteger(legalRecordId) ||
    legalRecordId < 1 ||
    !Number.isInteger(lawyerId) ||
    lawyerId < 1 ||
    (!shareAll && (!Number.isInteger(attachmentId) || attachmentId < 1))
  )
    return jsonNoStore(
      { error: "اختر الملف والمحامي الخارجي" },
      { status: 400 },
    );

  const db = getDb();
  const [matter, attachment, lawyer] = await Promise.all([
    db.query.legalRecords.findFirst({
      where: and(
        eq(legalRecords.id, legalRecordId),
        isNull(legalRecords.deletedAt),
      ),
    }),
    shareAll
      ? Promise.resolve(null)
      : db.query.legalCaseAttachments.findFirst({
          where: and(
            eq(legalCaseAttachments.id, attachmentId),
            eq(legalCaseAttachments.legalRecordId, legalRecordId),
            isNull(legalCaseAttachments.deletedAt),
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
  if (!matter || (!shareAll && !attachment))
    return jsonNoStore(
      { error: "القضية أو الملف غير موجود" },
      { status: 404 },
    );
  if (!lawyer)
    return jsonNoStore(
      { error: "اختر محاميًا خارجيًا نشطًا" },
      { status: 409 },
    );
  const phone = normalizeSaudiWhatsAppNumber(lawyer.mobile);
  if (!phone)
    return jsonNoStore(
      { error: "رقم واتساب المحامي الخارجي غير مسجل أو غير صحيح" },
      { status: 409 },
    );

  if (shareAll) {
    const legalAttachments = await db
      .select()
      .from(legalCaseAttachments)
      .where(
        and(
          eq(legalCaseAttachments.legalRecordId, legalRecordId),
          isNull(legalCaseAttachments.deletedAt),
        ),
      );
    const snapshotDocumentIds = new Set<number>();
    if (matter.fileSnapshotJson) {
      try {
        const snapshot = JSON.parse(matter.fileSnapshotJson) as {
          documents?: Array<{ id?: unknown }>;
        };
        for (const document of snapshot.documents || []) {
          const documentId = Number(document.id);
          if (Number.isInteger(documentId) && documentId > 0)
            snapshotDocumentIds.add(documentId);
        }
      } catch {
        // Older manually entered files may not contain a valid contract snapshot.
      }
    }
    if (matter.contractId) {
      const contract = await db.query.workforceContracts.findFirst({
        where: eq(workforceContracts.id, matter.contractId),
      });
      if (contract?.documentId) snapshotDocumentIds.add(contract.documentId);
    }
    const referredDocuments = snapshotDocumentIds.size
      ? await db
          .select()
          .from(companyDocuments)
          .where(inArray(companyDocuments.id, [...snapshotDocumentIds]))
      : [];
    const activeDocuments = referredDocuments.filter(
      (document) => document.status === "active",
    );
    const itemCount = legalAttachments.length + activeDocuments.length;
    if (!itemCount)
      return jsonNoStore(
        { error: "لا توجد مرفقات عقد أو مرفقات قانونية متاحة للمشاركة" },
        { status: 409 },
      );
    const token = `${crypto.randomUUID().replaceAll("-", "")}${crypto.randomUUID().replaceAll("-", "")}`;
    const tokenHash = await hashShareToken(token);
    const sharedAt = new Date().toISOString();
    const expiresAt = new Date(
      Date.now() + expiresInDays * 86400000,
    ).toISOString();
    const bundleId = crypto.randomUUID();
    const bundle = await db.transaction(async (tx) => {
      const [saved] = await tx
        .insert(legalExternalShareBundles)
        .values({
          id: bundleId,
          legalRecordId,
          lawyerId,
          tokenHash,
          expiresAt,
          maxDownloads: Math.max(40, itemCount * 20),
          itemCount,
          sharedBy: actor.user.email,
          sharedAt,
        })
        .returning();
      await tx.insert(legalExternalShareBundleItems).values([
        ...legalAttachments.map((item) => ({
          bundleId,
          attachmentId: item.id,
          documentId: null,
          title: item.title,
          fileName: item.fileName,
        })),
        ...activeDocuments.map((item) => ({
          bundleId,
          attachmentId: null,
          documentId: item.id,
          title: item.title,
          fileName: item.fileName,
        })),
      ]);
      await tx.insert(legalCaseActionLog).values({
        legalRecordId,
        action: "shared",
        details: `مشاركة ${itemCount} مرفقًا مع المحامي الخارجي ${lawyer.fullName} عبر واتساب في ${sharedAt}`,
        actorEmail: actor.user.email,
        actorRole: actor.functionalRoles.includes("legal_supervisor")
          ? "legal_supervisor"
          : actor.functionalRoles.includes("lawyer")
            ? "lawyer"
            : actor.role === "admin"
              ? "system_admin"
              : "legal_staff",
      });
      return saved;
    });
    const shareUrl = externalRequestUrl(
      request,
      `/api/legal-share-bundles/${token}`,
    ).toString();
    const message = [
      `الأستاذ/ ${lawyer.fullName}`,
      `تمت مشاركة جميع مرفقات الملف ${matter.referenceCode} (${itemCount} مرفقًا).`,
      `وقت المشاركة: ${preciseSaudiTime(sharedAt)}.`,
      `الرابط المشفر صالح لمدة ${expiresInDays} أيام:`,
      shareUrl,
    ].join("\n");
    const whatsappUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    await auditPortalAction({
      actorEmail: actor.user.email,
      action: "legal-contract-attachments-whatsapp-shared",
      entityType: "legal-external-share-bundle",
      entityId: bundle.id,
      after: {
        legalRecordId,
        lawyerId,
        itemCount,
        legalAttachmentCount: legalAttachments.length,
        contractDocumentCount: activeDocuments.length,
        sharedAt,
        expiresAt,
        mobile: "[محجوب]",
      },
    });
    await emitPortalNotification({
      eventType: "legal-contract-attachments-whatsapp-shared",
      title: "تمت مشاركة جميع مرفقات ملف قانوني",
      message: `${matter.referenceCode} — ${itemCount} مرفقًا — ${lawyer.fullName} — ${preciseSaudiTime(sharedAt)}.`,
      severity: "warning",
      module: "legal",
      entityType: "legal-record",
      entityId: legalRecordId,
      actionView: "legal",
      targetDepartment: "legal",
    }).catch(() => undefined);
    return jsonNoStore({
      bundle: {
        id: bundle.id,
        legalRecordId: bundle.legalRecordId,
        lawyerId: bundle.lawyerId,
        channel: bundle.channel,
        expiresAt: bundle.expiresAt,
        revokedAt: bundle.revokedAt,
        maxDownloads: bundle.maxDownloads,
        downloadCount: bundle.downloadCount,
        lastAccessedAt: bundle.lastAccessedAt,
        itemCount: bundle.itemCount,
        sharedBy: bundle.sharedBy,
        sharedAt: bundle.sharedAt,
      },
      whatsappUrl,
      sharedAt,
    });
  }
  if (!attachment)
    return jsonNoStore({ error: "المرفق غير موجود" }, { status: 404 });

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
    `وقت المشاركة: ${preciseSaudiTime(sharedAt)}.`,
    `الرابط صالح لمدة ${expiresInDays} أيام:`,
    shareUrl,
  ].join("\n");
  const whatsappUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;

  await db.insert(legalCaseActionLog).values({
    legalRecordId,
    action: "shared",
    details: `مشاركة المرفق «${attachment.title}» مع المحامي الخارجي ${lawyer.fullName} عبر واتساب في ${sharedAt}`,
    actorEmail: actor.user.email,
    actorRole: actor.functionalRoles.includes("legal_supervisor")
      ? "legal_supervisor"
      : actor.functionalRoles.includes("lawyer")
        ? "lawyer"
        : actor.role === "admin"
          ? "system_admin"
          : "legal_staff",
  });
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
    message: `${matter.referenceCode} — ${attachment.title} — ${lawyer.fullName} — ${preciseSaudiTime(sharedAt)}.`,
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
  const bundleId = clean(body.bundleId, 80);
  const reason = clean(body.reason, 1000);
  if (reason.length < 5)
    return jsonNoStore(
      { error: "اكتب سبب إبطال الرابط بوضوح لحفظه في سجل التدقيق" },
      { status: 400 },
    );
  if (bundleId) {
    const db = getDb();
    const before = await db.query.legalExternalShareBundles.findFirst({
      where: eq(legalExternalShareBundles.id, bundleId),
    });
    if (!before)
      return jsonNoStore(
        { error: "سجل مشاركة المرفقات غير موجود" },
        { status: 404 },
      );
    if (before.revokedAt)
      return jsonNoStore({ bundle: before, revoked: true });
    const revokedAt = new Date().toISOString();
    const [bundle] = await db
      .update(legalExternalShareBundles)
      .set({ revokedAt, revokedBy: actor.user.email })
      .where(
        and(
          eq(legalExternalShareBundles.id, bundleId),
          isNull(legalExternalShareBundles.revokedAt),
        ),
      )
      .returning();
    if (!bundle)
      return jsonNoStore(
        { error: "أُبطل الرابط من مستخدم آخر" },
        { status: 409 },
      );
    await auditPortalAction({
      actorEmail: actor.user.email,
      action: "legal-file-bundle-share-revoked",
      entityType: "legal-external-share-bundle",
      entityId: bundle.id,
      before,
      after: bundle,
      reason: reason || null,
    });
    await db.insert(legalCaseActionLog).values({
      legalRecordId: bundle.legalRecordId,
      action: "share_revoked",
      details: `إبطال رابط مشاركة جميع المرفقات: ${reason}`,
      actorEmail: actor.user.email,
      actorRole: actor.functionalRoles.includes("legal_supervisor")
        ? "legal_supervisor"
        : actor.functionalRoles.includes("lawyer")
          ? "lawyer"
          : actor.role === "admin"
            ? "system_admin"
            : "legal_staff",
    });
    await emitPortalNotification({
      eventType: "legal-file-bundle-share-revoked",
      title: "أُبطل رابط مشاركة جميع مرفقات ملف قانوني",
      message: `القضية #${bundle.legalRecordId} — ${bundle.itemCount} مرفقًا.`,
      severity: "info",
      module: "legal",
      entityType: "legal-record",
      entityId: bundle.legalRecordId,
      actionView: "legal",
      targetDepartment: "legal",
    }).catch(() => undefined);
    return jsonNoStore({ bundle, revoked: true });
  }
  const shareId = clean(body.shareId, 80);
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
  await db.insert(legalCaseActionLog).values({
    legalRecordId: share.legalRecordId,
    action: "share_revoked",
    details: `إبطال رابط مشاركة المرفق #${share.attachmentId}: ${reason}`,
    actorEmail: actor.user.email,
    actorRole: actor.functionalRoles.includes("legal_supervisor")
      ? "legal_supervisor"
      : actor.functionalRoles.includes("lawyer")
        ? "lawyer"
        : actor.role === "admin"
          ? "system_admin"
          : "legal_staff",
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
