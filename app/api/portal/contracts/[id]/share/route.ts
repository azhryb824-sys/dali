import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  companyDocuments,
  documentShareLinks,
  workforceContracts,
} from "@/db/schema";
import { auditPortalAction } from "@/lib/audit";
import { hashShareToken } from "@/lib/company-documents";
import {
  canSharePortalDocuments,
  hasPortalPermission,
  requirePortalApiRole,
} from "@/lib/portal-access";
import { emitPortalNotification } from "@/lib/portal-notifications";
import { externalRequestUrl } from "@/lib/request-origin";
import {
  jsonNoStore,
  readLimitedJson,
  rejectCrossSiteRequest,
  requestCorrelationId,
} from "@/lib/security";
import { normalizeSaudiWhatsAppNumber } from "@/lib/whatsapp";
import { createWhatsAppLaunchToken } from "@/lib/whatsapp-launch";

type Access = NonNullable<Awaited<ReturnType<typeof requirePortalApiRole>>>;

function canShareApprovedContracts(access: Access) {
  return (
    access.role === "admin" ||
    access.functionalRoles.some((role) =>
      [
        "system_owner",
        "system_admin",
        "administrative_assistant",
      ].includes(role),
    )
  );
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (rejectCrossSiteRequest(request))
    return jsonNoStore(
      { error: "مصدر الطلب غير مسموح" },
      { status: 403 },
    );
  const access = await requirePortalApiRole(["admin", "manager", "employee"]);
  if (
    !access ||
    !canShareApprovedContracts(access) ||
    !(await hasPortalPermission(access, "contracts", "read")) ||
    !canSharePortalDocuments(access)
  )
    return jsonNoStore(
      {
        error:
          "مشاركة العقد المعتمد متاحة للمالك أو مشرف النظام أو المساعد الإداري فقط",
      },
      { status: 403 },
    );

  const contractId = Number((await context.params).id);
  if (!Number.isInteger(contractId) || contractId < 1)
    return jsonNoStore({ error: "العقد غير صحيح" }, { status: 400 });
  const parsed = await readLimitedJson(request, 2000);
  if (!parsed.ok) return parsed.response;
  const body = parsed.value as Record<string, unknown>;
  const phone = normalizeSaudiWhatsAppNumber(
    typeof body.whatsappNumber === "string" ? body.whatsappNumber : "",
  );
  if (!phone)
    return jsonNoStore(
      { error: "اكتب رقم واتساب سعودي صحيحًا عند كل مشاركة" },
      { status: 400 },
    );
  const expiresInDays = Math.min(
    14,
    Math.max(1, Math.round(Number(body.expiresInDays) || 7)),
  );

  const db = getDb();
  const contract = await db.query.workforceContracts.findFirst({
    where: eq(workforceContracts.id, contractId),
  });
  if (!contract)
    return jsonNoStore({ error: "العقد غير موجود" }, { status: 404 });
  if (!contract.approvedBy)
    return jsonNoStore(
      { error: "لا يمكن مشاركة ملف العقد قبل اعتماده" },
      { status: 409 },
    );
  const document = await db.query.companyDocuments.findFirst({
    where: and(
      eq(companyDocuments.id, contract.documentId),
      eq(companyDocuments.status, "active"),
    ),
  });
  if (!document || document.contentType !== "application/pdf")
    return jsonNoStore(
      { error: "ملف PDF الحالي للعقد غير متاح" },
      { status: 409 },
    );

  const token = `${crypto.randomUUID().replaceAll("-", "")}${crypto.randomUUID().replaceAll("-", "")}`;
  const tokenHash = await hashShareToken(token);
  const expiresAt = new Date(
    Date.now() + expiresInDays * 86_400_000,
  ).toISOString();
  const shareId = crypto.randomUUID();
  await db.insert(documentShareLinks).values({
    id: shareId,
    documentId: document.id,
    tokenHash,
    expiresAt,
    maxDownloads: 20,
    createdBy: access.user.email,
  });
  const shareUrl = externalRequestUrl(
    request,
    `/api/shared-documents/${token}`,
  ).toString();
  const message = [
    "السلام عليكم،",
    `نرفق لكم العقد المعتمد ${contract.referenceCode} — ${contract.title}.`,
    `رابط PDF الآمن صالح لمدة ${expiresInDays} أيام:`,
    shareUrl,
  ].join("\n");
  const whatsappUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  const whatsappLaunchToken = createWhatsAppLaunchToken(
    access.user.email,
    phone,
    message,
  );
  const whatsappLaunchUrl = externalRequestUrl(
    request,
    `/api/portal/whatsapp-launch?token=${encodeURIComponent(whatsappLaunchToken)}`,
  ).toString();
  await auditPortalAction({
    actorEmail: access.user.email,
    action: "approved-contract-whatsapp-share-created",
    entityType: "workforce-contract",
    entityId: contract.id,
    after: {
      documentId: document.id,
      shareId,
      expiresAt,
      maxDownloads: 20,
      mobile: "[محجوب]",
    },
    correlationId: requestCorrelationId(request),
  });
  await emitPortalNotification({
    eventType: "approved-contract-whatsapp-share-created",
    title: "جُهز عقد معتمد للمشاركة عبر واتساب",
    message: `${contract.referenceCode} — الرابط صالح لمدة ${expiresInDays} أيام.`,
    severity: "info",
    module: "documents",
    entityType: "workforce-contract",
    entityId: contract.id,
    actionView: "operations",
  }).catch(() => undefined);
  return jsonNoStore({
    whatsappUrl,
    whatsappLaunchUrl,
    shareUrl,
    expiresAt,
  });
}
