import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { companyDocuments, legalRecords, portalActivity, workforceContracts } from "@/db/schema";
import { attachmentHeaders } from "@/lib/company-documents";
import { canAccessPortalDocuments, hasPortalPermission, requirePortalApiRole } from "@/lib/portal-access";
import { getRuntimeEnv } from "@/lib/runtime-env";
import { regenerateIssuedDocumentPdf } from "@/lib/issued-document-regeneration";

function isCancellationReview(fileSnapshotJson: string | null) {
  if (!fileSnapshotJson) return false;
  try {
    const snapshot = JSON.parse(fileSnapshotJson) as { request?: { type?: string } };
    return snapshot.request?.type === "contract-cancellation";
  } catch {
    return false;
  }
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const access = await requirePortalApiRole(["admin", "manager", "employee"]);
  if (!access || !canAccessPortalDocuments(access)) return Response.json({ error: "غير مصرح بتنزيل المستند" }, { status: 403 });

  const { id: value } = await context.params;
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) return Response.json({ error: "المستند غير صحيح" }, { status: 400 });

  const db = getDb();
  const document = await db.query.companyDocuments.findFirst({ where: eq(companyDocuments.id, id) });
  if (!document || document.status !== "active") return Response.json({ error: "المستند غير موجود" }, { status: 404 });
  const inline = new URL(request.url).searchParams.get("inline") === "1";
  if (document.source === "generated" && document.documentType === "workforce_contract") {
    const contract = await db.query.workforceContracts.findFirst({ where: eq(workforceContracts.documentId, document.id) });
    if (!contract) return Response.json({ error: "العقد المرتبط بالمستند غير موجود" }, { status: 404 });

    const ownerApprovedAccess = Boolean(
      contract.approvedBy &&
        ["approved", "sent", "signed", "active", "suspended", "expired", "terminated", "superseded"].includes(contract.status),
    );
    let legalReviewAccess = false;
    if (!ownerApprovedAccess && (await hasPortalPermission(access, "legal", "read"))) {
      const matters = await db
        .select({ fileSnapshotJson: legalRecords.fileSnapshotJson })
        .from(legalRecords)
        .where(and(eq(legalRecords.contractId, contract.id), eq(legalRecords.status, "reviewing")));
      legalReviewAccess = matters.some((matter) => isCancellationReview(matter.fileSnapshotJson));
    }
    if (!ownerApprovedAccess && !legalReviewAccess) {
      return Response.json({ error: "لا يمكن تنزيل العقد قبل اعتماده من المالك أو إحالته رسميًا للمراجعة القانونية" }, { status: 409 });
    }

    const regenerated = await regenerateIssuedDocumentPdf(id);
    if (!regenerated) return Response.json({ error: "تعذّر إعادة إنشاء العقد" }, { status: 404 });
    await db.insert(portalActivity).values({
      actorEmail: access.user.email,
      action: legalReviewAccess ? "contract-regenerated-for-legal-review" : "contract-regenerated-and-downloaded",
      entityType: "company-document",
      entityId: String(id),
    });
    return new Response(new Uint8Array(regenerated.bytes).buffer, {
      headers: attachmentHeaders(document.fileName, "application/pdf", undefined, inline ? "inline" : "attachment"),
    });
  }
  if (document.source === "generated" && document.contentType === "application/pdf") {
    const regenerated = await regenerateIssuedDocumentPdf(id);
    if (!regenerated) return Response.json({ error: "تعذّر تحديث ملف PDF وفق القالب الحالي" }, { status: 409 });
    await db.insert(portalActivity).values({ actorEmail: access.user.email, action: "issued-pdf-regenerated-and-downloaded", entityType: "company-document", entityId: String(id) });
    return new Response(new Uint8Array(regenerated.bytes).buffer, { headers: attachmentHeaders(document.fileName, "application/pdf", undefined, inline ? "inline" : "attachment") });
  }
  const object = await getRuntimeEnv().BUCKET.get(document.storageKey);
  if (!object) return Response.json({ error: "ملف المستند غير متاح" }, { status: 404 });

  await db.insert(portalActivity).values({ actorEmail: access.user.email, action: "document-downloaded", entityType: "company-document", entityId: String(id) });
  return new Response(object.body, { headers: attachmentHeaders(document.fileName, document.contentType, object.httpEtag, inline ? "inline" : "attachment") });
}
