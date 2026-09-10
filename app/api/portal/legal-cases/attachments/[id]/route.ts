import { and, eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import {
  legalCaseActionLog,
  legalCaseAttachments,
  legalEvidenceCustody,
  legalExternalShareBundleItems,
  legalExternalShareBundles,
  legalExternalShares,
  legalRecords,
} from "@/db/schema";
import { auditPortalAction } from "@/lib/audit";
import { attachmentHeaders } from "@/lib/company-documents";
import { emitPortalNotification } from "@/lib/portal-notifications";
import { hasPortalPermission, requirePortalApiRole } from "@/lib/portal-access";
import { getRuntimeEnv } from "@/lib/runtime-env";
import {
  jsonNoStore,
  readLimitedJson,
  rejectCrossSiteRequest,
} from "@/lib/security";

type Actor = NonNullable<Awaited<ReturnType<typeof requirePortalApiRole>>>;
const clean = (value: unknown, max = 1000) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";
const manager = (actor: Actor) =>
  actor.role === "admin" ||
  actor.functionalRoles.some((role) =>
    ["system_owner", "system_admin", "legal_supervisor", "lawyer"].includes(
      role,
    ),
  );
const roleName = (actor: Actor) =>
  actor.functionalRoles.includes("legal_supervisor")
    ? "legal_supervisor"
    : actor.functionalRoles.includes("lawyer")
      ? "lawyer"
      : actor.functionalRoles.includes("legal_lawyer")
        ? "legal_lawyer"
        : actor.role === "admin"
          ? "system_admin"
          : "legal_staff";
async function writableMatter(actor: Actor, legalRecordId: number) {
  if (!(await hasPortalPermission(actor, "legal", "write"))) return null;
  const matter = await getDb().query.legalRecords.findFirst({
    where: and(
      eq(legalRecords.id, legalRecordId),
      isNull(legalRecords.deletedAt),
    ),
  });
  return matter &&
    (manager(actor) ||
      matter.assignedLawyerEmail?.toLowerCase() ===
        actor.user.email.toLowerCase())
    ? matter
    : null;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const actor = await requirePortalApiRole(["admin", "manager", "employee"]);
  if (!actor || !(await hasPortalPermission(actor, "legal", "read")))
    return Response.json(
      { error: "غير مصرح بعرض المرفق القانوني" },
      { status: 403 },
    );
  const { id: value } = await context.params;
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1)
    return Response.json({ error: "المرفق غير صحيح" }, { status: 400 });
  const attachment = await getDb().query.legalCaseAttachments.findFirst({
    where: and(
      eq(legalCaseAttachments.id, id),
      isNull(legalCaseAttachments.deletedAt),
    ),
  });
  if (!attachment)
    return Response.json({ error: "المرفق غير موجود" }, { status: 404 });
  const matter = await getDb().query.legalRecords.findFirst({
    where: and(
      eq(legalRecords.id, attachment.legalRecordId),
      isNull(legalRecords.deletedAt),
    ),
  });
  const supervisor =
    actor.role === "admin" ||
    actor.functionalRoles.some((role) =>
      ["system_owner", "system_admin", "legal_supervisor", "lawyer"].includes(role),
    );
  if (
    !matter ||
    (!supervisor &&
      matter.assignedLawyerEmail?.toLowerCase() !==
        actor.user.email.toLowerCase())
  )
    return Response.json({ error: "القضية غير مسندة إليك" }, { status: 403 });
  const object = await getRuntimeEnv().BUCKET.get(attachment.storageKey);
  if (!object)
    return Response.json({ error: "ملف المرفق غير متاح" }, { status: 404 });
  const bytes = new Uint8Array(await object.arrayBuffer());
  const sha256 = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
  )
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
  if (attachment.sha256 && attachment.sha256 !== sha256)
    return Response.json(
      { error: "فشل التحقق من سلامة الدليل؛ الملف لا يطابق بصمة الرفع" },
      { status: 409 },
    );
  const inline = new URL(request.url).searchParams.get("inline") === "1";
  await getDb()
    .insert(legalEvidenceCustody)
    .values({
      legalRecordId: attachment.legalRecordId,
      attachmentId: attachment.id,
      eventType: inline ? "viewed" : "downloaded",
      actorEmail: actor.user.email,
      fileSha256: sha256,
      details: inline ? "معاينة المرفق" : "تنزيل المرفق",
    });
  return new Response(bytes, {
    headers: attachmentHeaders(
      attachment.fileName,
      attachment.contentType,
      object.httpEtag,
      inline ? "inline" : "attachment",
    ),
  });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (rejectCrossSiteRequest(request))
    return jsonNoStore({ error: "مصدر الطلب غير مسموح" }, { status: 403 });
  const actor = await requirePortalApiRole(["admin", "manager", "employee"]);
  if (!actor)
    return jsonNoStore({ error: "غير مصرح" }, { status: 403 });
  const attachmentId = Number((await context.params).id);
  const parsed = await readLimitedJson(request, 3000);
  if (!parsed.ok) return parsed.response;
  const body = parsed.value as Record<string, unknown>;
  const title = clean(body.title, 180),
    documentCategory = clean(body.documentCategory, 60);
  if (
    !Number.isInteger(attachmentId) ||
    attachmentId < 1 ||
    title.length < 2 ||
    ![
      "general",
      "evidence",
      "judgment",
      "pleading",
      "settlement",
      "correspondence",
    ].includes(documentCategory)
  )
    return jsonNoStore(
      { error: "بيانات المرفق غير مكتملة أو غير صحيحة" },
      { status: 400 },
    );
  const db = getDb();
  const before = await db.query.legalCaseAttachments.findFirst({
    where: and(
      eq(legalCaseAttachments.id, attachmentId),
      isNull(legalCaseAttachments.deletedAt),
    ),
  });
  if (!before)
    return jsonNoStore({ error: "المرفق غير موجود" }, { status: 404 });
  const matter = await writableMatter(actor, before.legalRecordId);
  if (!matter)
    return jsonNoStore(
      { error: "المرفق غير متاح للتعديل" },
      { status: 403 },
    );
  const [attachment] = await db
    .update(legalCaseAttachments)
    .set({ title, documentCategory })
    .where(
      and(
        eq(legalCaseAttachments.id, attachmentId),
        isNull(legalCaseAttachments.deletedAt),
      ),
    )
    .returning();
  if (!attachment)
    return jsonNoStore(
      { error: "تغير المرفق قبل حفظ التعديل؛ حدّث الملف وحاول مجددًا" },
      { status: 409 },
    );
  await Promise.all([
    db.insert(legalEvidenceCustody).values({
      legalRecordId: before.legalRecordId,
      attachmentId,
      eventType: "metadata_updated",
      actorEmail: actor.user.email,
      fileSha256: before.sha256,
      details: `تعديل بيانات المرفق من «${before.title}» إلى «${title}»`,
    }),
    db.insert(legalCaseActionLog).values({
      legalRecordId: before.legalRecordId,
      action: "updated",
      details: `تعديل بيانات المرفق: ${title}`,
      actorEmail: actor.user.email,
      actorRole: roleName(actor),
    }),
    auditPortalAction({
      actorEmail: actor.user.email,
      action: "legal-case-attachment-updated",
      entityType: "legal-case-attachment",
      entityId: attachmentId,
      before,
      after: attachment,
    }),
  ]);
  await emitPortalNotification({
    eventType: "legal-case-attachment-updated",
    title: "عُدّلت بيانات مرفق قانوني",
    message: `${matter.referenceCode} — ${title}.`,
    severity: "info",
    module: "legal",
    entityType: "legal-record",
    entityId: matter.id,
    actionView: "legal",
    targetDepartment: "legal",
  }).catch(() => undefined);
  return jsonNoStore({ attachment });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (rejectCrossSiteRequest(request))
    return jsonNoStore({ error: "مصدر الطلب غير مسموح" }, { status: 403 });
  const actor = await requirePortalApiRole(["admin", "manager", "employee"]);
  if (!actor)
    return jsonNoStore({ error: "غير مصرح" }, { status: 403 });
  const attachmentId = Number((await context.params).id);
  const parsed = await readLimitedJson(request, 2000);
  if (!parsed.ok) return parsed.response;
  const body = parsed.value as Record<string, unknown>;
  const reason = clean(body.reason, 1000);
  if (!Number.isInteger(attachmentId) || attachmentId < 1 || reason.length < 5)
    return jsonNoStore(
      { error: "اكتب سبب حذف المرفق بوضوح" },
      { status: 400 },
    );
  const db = getDb();
  const before = await db.query.legalCaseAttachments.findFirst({
    where: and(
      eq(legalCaseAttachments.id, attachmentId),
      isNull(legalCaseAttachments.deletedAt),
    ),
  });
  if (!before)
    return jsonNoStore(
      { error: "المرفق غير موجود أو محذوف مسبقًا" },
      { status: 404 },
    );
  const matter = await writableMatter(actor, before.legalRecordId);
  if (!matter)
    return jsonNoStore(
      { error: "المرفق غير متاح للحذف" },
      { status: 403 },
    );
  const now = new Date().toISOString();
  const attachment = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(legalCaseAttachments)
      .set({
        deletedAt: now,
        deletedBy: actor.user.email,
        deletionReason: reason,
      })
      .where(
        and(
          eq(legalCaseAttachments.id, attachmentId),
          isNull(legalCaseAttachments.deletedAt),
        ),
      )
      .returning();
    if (!row) return null;
    await tx
      .update(legalExternalShares)
      .set({ revokedAt: now, revokedBy: actor.user.email })
      .where(
        and(
          eq(legalExternalShares.attachmentId, attachmentId),
          isNull(legalExternalShares.revokedAt),
        ),
      );
    const containingBundles = await tx
      .select({ bundleId: legalExternalShareBundleItems.bundleId })
      .from(legalExternalShareBundleItems)
      .where(eq(legalExternalShareBundleItems.attachmentId, attachmentId));
    const bundleIds = [...new Set(containingBundles.map((item) => item.bundleId))];
    if (bundleIds.length)
      await tx
        .update(legalExternalShareBundles)
        .set({ revokedAt: now, revokedBy: actor.user.email })
        .where(
          and(
            inArray(legalExternalShareBundles.id, bundleIds),
            isNull(legalExternalShareBundles.revokedAt),
          ),
        );
    await tx.insert(legalEvidenceCustody).values({
      legalRecordId: before.legalRecordId,
      attachmentId,
      eventType: "deleted",
      actorEmail: actor.user.email,
      fileSha256: before.sha256,
      details: `حذف آمن للمرفق مع إبقاء البصمة والملف لأغراض التدقيق: ${reason}`,
    });
    await tx.insert(legalCaseActionLog).values({
      legalRecordId: before.legalRecordId,
      action: "deleted",
      details: `حذف المرفق «${before.title}»: ${reason}`,
      actorEmail: actor.user.email,
      actorRole: roleName(actor),
    });
    return row;
  });
  if (!attachment)
    return jsonNoStore(
      { error: "حُذف المرفق من مستخدم آخر" },
      { status: 409 },
    );
  await auditPortalAction({
    actorEmail: actor.user.email,
    action: "legal-case-attachment-deleted",
    entityType: "legal-case-attachment",
    entityId: attachmentId,
    before,
    after: attachment,
    reason,
  });
  await emitPortalNotification({
    eventType: "legal-case-attachment-deleted",
    title: "حُذف مرفق قانوني حذفًا آمنًا",
    message: `${matter.referenceCode} — ${before.title}.`,
    severity: "warning",
    module: "legal",
    entityType: "legal-record",
    entityId: matter.id,
    actionView: "legal",
    targetDepartment: "legal",
  }).catch(() => undefined);
  return jsonNoStore({ attachment, archived: true });
}
