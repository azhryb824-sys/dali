import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  legalCaseAttachments,
  legalEvidenceCustody,
  legalRecords,
} from "@/db/schema";
import { attachmentHeaders } from "@/lib/company-documents";
import { hasPortalPermission, requirePortalApiRole } from "@/lib/portal-access";
import { getRuntimeEnv } from "@/lib/runtime-env";

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
    where: eq(legalCaseAttachments.id, id),
  });
  if (!attachment)
    return Response.json({ error: "المرفق غير موجود" }, { status: 404 });
  const matter = await getDb().query.legalRecords.findFirst({
    where: eq(legalRecords.id, attachment.legalRecordId),
  });
  const supervisor =
    actor.role === "admin" ||
    actor.functionalRoles.some((role) =>
      ["system_owner", "system_admin", "legal_supervisor"].includes(role),
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
