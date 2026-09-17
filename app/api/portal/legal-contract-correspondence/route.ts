import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  companyDocuments,
  legalCaseActionLog,
  legalContractCorrespondence,
  legalRecords,
  legalReferrals,
  portalActivity,
  workforceContracts,
} from "@/db/schema";
import { auditPortalAction } from "@/lib/audit";
import {
  cleanText,
  makeReference,
  objectKey,
  safeFileName,
  uploadContentTypes,
} from "@/lib/company-documents";
import { hasPortalPermission, requirePortalApiRole } from "@/lib/portal-access";
import { emitPortalNotification } from "@/lib/portal-notifications";
import { getRuntimeEnv } from "@/lib/runtime-env";
import {
  jsonNoStore,
  readLimitedJson,
  rejectCrossSiteRequest,
  validateUploadedFile,
} from "@/lib/security";

type Actor = NonNullable<Awaited<ReturnType<typeof requirePortalApiRole>>>;

const returnReasons = new Set([
  "missing_attachment",
  "contract_correction",
  "information_request",
  "other",
]);

function isLegalCoordinator(actor: Actor) {
  return (
    actor.role === "admin" ||
    actor.functionalRoles.some((role) =>
      ["system_owner", "system_admin", "legal_supervisor", "lawyer"].includes(role),
    )
  );
}

function actorRole(actor: Actor) {
  if (actor.functionalRoles.includes("system_owner")) return "system_owner";
  if (actor.functionalRoles.includes("system_admin") || actor.role === "admin") return "system_admin";
  if (actor.functionalRoles.includes("legal_supervisor")) return "legal_supervisor";
  if (actor.functionalRoles.includes("lawyer")) return "lawyer";
  return "contracts_staff";
}

async function permissions(actor: Actor) {
  const [legalRead, legalWrite, contractsRead, contractsWrite] = await Promise.all([
    hasPortalPermission(actor, "legal", "read"),
    hasPortalPermission(actor, "legal", "write"),
    hasPortalPermission(actor, "contracts", "read"),
    hasPortalPermission(actor, "contracts", "write"),
  ]);
  return {
    legalRead,
    legalWrite: legalWrite && isLegalCoordinator(actor),
    contractsRead,
    contractsWrite,
  };
}

function canAccessMatter(actor: Actor, matter: { assignedLawyerEmail: string | null }) {
  return (
    isLegalCoordinator(actor) ||
    matter.assignedLawyerEmail?.toLowerCase() === actor.user.email.toLowerCase()
  );
}

export async function GET(request: Request) {
  const actor = await requirePortalApiRole(["admin", "manager", "employee"]);
  if (!actor) return jsonNoStore({ error: "غير مصرح" }, { status: 403 });
  const ability = await permissions(actor);
  if (!ability.legalRead && !ability.contractsRead)
    return jsonNoStore({ error: "غير مصرح بعرض مراسلات العقود القانونية" }, { status: 403 });

  const url = new URL(request.url);
  const legalRecordId = Number(url.searchParams.get("legalRecordId") || 0);
  const contractId = Number(url.searchParams.get("contractId") || 0);
  if ((!Number.isSafeInteger(legalRecordId) || legalRecordId < 1) && (!Number.isSafeInteger(contractId) || contractId < 1))
    return jsonNoStore({ error: "حدد الملف القانوني أو العقد" }, { status: 400 });

  const db = getDb();
  if (legalRecordId > 0) {
    if (!ability.legalRead)
      return jsonNoStore({ error: "غير مصرح بعرض الملف القانوني" }, { status: 403 });
    const matter = await db.query.legalRecords.findFirst({
      where: and(eq(legalRecords.id, legalRecordId), isNull(legalRecords.deletedAt)),
    });
    if (!matter) return jsonNoStore({ error: "الملف القانوني غير موجود" }, { status: 404 });
    if (!canAccessMatter(actor, matter))
      return jsonNoStore({ error: "القضية غير مسندة إليك" }, { status: 403 });
    const messages = await db
      .select()
      .from(legalContractCorrespondence)
      .where(eq(legalContractCorrespondence.legalRecordId, legalRecordId))
      .orderBy(asc(legalContractCorrespondence.createdAt), asc(legalContractCorrespondence.id));
    const contract = matter.contractId
      ? await db.query.workforceContracts.findFirst({ where: eq(workforceContracts.id, matter.contractId) })
      : null;
    return jsonNoStore({
      matters: [matter],
      contract,
      messages,
      canInitiateLegal: ability.legalWrite && Boolean(matter.contractId),
      canReplyContracts: false,
      canResolveLegal: ability.legalWrite,
    });
  }

  if (!ability.contractsRead)
    return jsonNoStore({ error: "غير مصرح بعرض مراسلات العقد" }, { status: 403 });
  const contract = await db.query.workforceContracts.findFirst({ where: eq(workforceContracts.id, contractId) });
  if (!contract) return jsonNoStore({ error: "العقد غير موجود" }, { status: 404 });
  const matters = await db
    .select()
    .from(legalRecords)
    .where(and(eq(legalRecords.contractId, contractId), isNull(legalRecords.deletedAt)))
    .orderBy(asc(legalRecords.createdAt));
  const matterIds = matters.map((matter) => matter.id);
  const messages = matterIds.length
    ? await db
        .select()
        .from(legalContractCorrespondence)
        .where(and(eq(legalContractCorrespondence.contractId, contractId), inArray(legalContractCorrespondence.legalRecordId, matterIds)))
        .orderBy(asc(legalContractCorrespondence.createdAt), asc(legalContractCorrespondence.id))
    : [];
  return jsonNoStore({
    matters,
    contract,
    messages,
    canInitiateLegal: false,
    canReplyContracts: ability.contractsWrite,
    canResolveLegal: false,
  });
}

async function addContractsResponse(request: Request, actor: Actor, suppliedBody?: Record<string, unknown>) {
  const ability = await permissions(actor);
  if (!ability.contractsWrite)
    return jsonNoStore({ error: "الرد وإرفاق الملفات يتطلبان صلاحية تعديل العقود" }, { status: 403 });

  const db = getDb();
  const contentType = request.headers.get("content-type") || "";
  let storageKey = "";
  try {
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const rootId = Number(form.get("rootId"));
      const file = form.get("file");
      const note = cleanText(form.get("message"), 2000);
      const requestedTitle = cleanText(form.get("title"), 180);
      if (!Number.isSafeInteger(rootId) || rootId < 1 || !(file instanceof File))
        return jsonNoStore({ error: "بيانات المرفق غير مكتملة" }, { status: 400 });
      const validation = await validateUploadedFile(file, {
        contentTypes: uploadContentTypes,
        maxBytes: 20 * 1024 * 1024,
      });
      if (!validation.valid) return jsonNoStore({ error: validation.error }, { status: 400 });
      const root = await db.query.legalContractCorrespondence.findFirst({
        where: eq(legalContractCorrespondence.id, rootId),
      });
      if (!root || root.parentId || !["note", "return_request"].includes(root.messageType))
        return jsonNoStore({ error: "طلب المراسلة غير موجود" }, { status: 404 });
      if (root.requestStatus === "resolved")
        return jsonNoStore({ error: "أُغلق الطلب؛ أنشئ مراسلة قانونية جديدة عند الحاجة" }, { status: 409 });
      const [matter, contract] = await Promise.all([
        db.query.legalRecords.findFirst({ where: and(eq(legalRecords.id, root.legalRecordId), isNull(legalRecords.deletedAt)) }),
        db.query.workforceContracts.findFirst({ where: eq(workforceContracts.id, root.contractId) }),
      ]);
      if (!matter || !contract) return jsonNoStore({ error: "العقد أو الملف القانوني غير موجود" }, { status: 404 });
      const fileName = safeFileName(file.name);
      const title = requestedTitle || root.requiredAttachmentName || fileName.replace(/\.[^.]+$/, "") || "مرفق مطلوب";
      storageKey = objectKey(`legal-contract-correspondence/${contract.id}`, fileName);
      await getRuntimeEnv().BUCKET.put(storageKey, validation.bytes, {
        httpMetadata: { contentType: file.type },
        customMetadata: {
          uploadedBy: actor.user.email,
          legalRecordId: String(root.legalRecordId),
          contractId: String(contract.id),
          rootId: String(root.id),
          validation: validation.validationDetails,
        },
      });
      const now = new Date().toISOString();
      const result = await db.transaction(async (tx) => {
        const [document] = await tx.insert(companyDocuments).values({
          referenceCode: makeReference("LEG-SUP"),
          title,
          category: "legal",
          documentType: "legal_requested_attachment",
          counterparty: contract.clientName,
          fileName,
          storageKey,
          contentType: file.type,
          sizeBytes: validation.bytes.byteLength,
          source: "uploaded",
          validationStatus: "signature-validated",
          validationDetails: validation.validationDetails,
          metadataJson: JSON.stringify({ legalRecordId: root.legalRecordId, contractId: contract.id, correspondenceRootId: root.id }),
          createdBy: actor.user.email,
          createdAt: now,
          updatedAt: now,
        }).returning();
        const [message] = await tx.insert(legalContractCorrespondence).values({
          legalRecordId: root.legalRecordId,
          contractId: root.contractId,
          parentId: root.id,
          senderSide: "contracts",
          recipientSide: "legal",
          messageType: "attachment",
          message: note || `إرفاق الملف المطلوب: ${title}`,
          documentId: document.id,
          requestStatus: "responded",
          createdBy: actor.user.email,
          createdAt: now,
          respondedAt: now,
          updatedAt: now,
        }).returning();
        await tx.update(legalContractCorrespondence).set({ requestStatus: "responded", respondedAt: now, updatedAt: now }).where(eq(legalContractCorrespondence.id, root.id));
        if (matter.status === "awaiting_contracts")
          await tx.update(legalRecords).set({ status: "reviewing", updatedAt: now }).where(eq(legalRecords.id, matter.id));
        await tx.insert(legalCaseActionLog).values({
          legalRecordId: matter.id,
          action: "contracts_replied",
          details: `أرفق قسم العقود: ${title}`,
          actorEmail: actor.user.email,
          actorRole: actorRole(actor),
        });
        return { document, message };
      });
      await auditPortalAction({ actorEmail: actor.user.email, action: "legal-contract-attachment-sent", entityType: "legal-record", entityId: matter.id, after: { correspondenceId: result.message.id, documentId: result.document.id, contractId: contract.id } });
      await emitPortalNotification({ eventType: "legal-contract-response-received", title: "وصل مرفق مطلوب من قسم العقود", message: `${matter.referenceCode} — ${title} — أرسله ${actor.user.email}.`, severity: "success", module: "legal", entityType: "legal-record", entityId: matter.id, actionView: "legal", targetDepartment: "legal" }).catch(() => undefined);
      return jsonNoStore(result, { status: 201 });
    }

    let body = suppliedBody;
    if (!body) {
      const parsed = await readLimitedJson(request, 8_000);
      if (!parsed.ok) return parsed.response;
      body = parsed.value as Record<string, unknown>;
    }
    const rootId = Number(body.rootId);
    const messageText = cleanText(body.message, 2000);
    if (!Number.isSafeInteger(rootId) || rootId < 1 || messageText.length < 2)
      return jsonNoStore({ error: "اكتب ردًا واضحًا" }, { status: 400 });
    const root = await db.query.legalContractCorrespondence.findFirst({ where: eq(legalContractCorrespondence.id, rootId) });
    if (!root || root.parentId || !["note", "return_request"].includes(root.messageType))
      return jsonNoStore({ error: "طلب المراسلة غير موجود" }, { status: 404 });
    if (root.requestStatus === "resolved")
      return jsonNoStore({ error: "أُغلق الطلب؛ أنشئ مراسلة قانونية جديدة عند الحاجة" }, { status: 409 });
    const matter = await db.query.legalRecords.findFirst({ where: and(eq(legalRecords.id, root.legalRecordId), isNull(legalRecords.deletedAt)) });
    if (!matter) return jsonNoStore({ error: "الملف القانوني غير موجود" }, { status: 404 });
    const now = new Date().toISOString();
    const [message] = await db.transaction(async (tx) => {
      const inserted = await tx.insert(legalContractCorrespondence).values({
        legalRecordId: root.legalRecordId,
        contractId: root.contractId,
        parentId: root.id,
        senderSide: "contracts",
        recipientSide: "legal",
        messageType: "reply",
        message: messageText,
        requestStatus: "responded",
        createdBy: actor.user.email,
        createdAt: now,
        respondedAt: now,
        updatedAt: now,
      }).returning();
      await tx.update(legalContractCorrespondence).set({ requestStatus: "responded", respondedAt: now, updatedAt: now }).where(eq(legalContractCorrespondence.id, root.id));
      if (matter.status === "awaiting_contracts")
        await tx.update(legalRecords).set({ status: "reviewing", updatedAt: now }).where(eq(legalRecords.id, matter.id));
      await tx.insert(legalCaseActionLog).values({ legalRecordId: matter.id, action: "contracts_replied", details: messageText, actorEmail: actor.user.email, actorRole: actorRole(actor) });
      return inserted;
    });
    await auditPortalAction({ actorEmail: actor.user.email, action: "legal-contract-reply-sent", entityType: "legal-record", entityId: matter.id, after: { correspondenceId: message.id, contractId: root.contractId } });
    await emitPortalNotification({ eventType: "legal-contract-response-received", title: "وصل رد من قسم العقود", message: `${matter.referenceCode} — ${messageText}`.slice(0, 700), severity: "info", module: "legal", entityType: "legal-record", entityId: matter.id, actionView: "legal", targetDepartment: "legal" }).catch(() => undefined);
    return jsonNoStore({ message }, { status: 201 });
  } catch (error) {
    if (storageKey) await getRuntimeEnv().BUCKET.delete(storageKey).catch(() => undefined);
    console.error("legal-contract-response-failed", error);
    return jsonNoStore({ error: "تعذر إرسال الرد إلى الشؤون القانونية" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (rejectCrossSiteRequest(request))
    return jsonNoStore({ error: "مصدر الطلب غير مسموح" }, { status: 403 });
  const actor = await requirePortalApiRole(["admin", "manager", "employee"]);
  if (!actor) return jsonNoStore({ error: "غير مصرح" }, { status: 403 });
  if ((request.headers.get("content-type") || "").includes("multipart/form-data"))
    return addContractsResponse(request, actor);

  const parsed = await readLimitedJson(request, 10_000);
  if (!parsed.ok) return parsed.response;
  const body = parsed.value as Record<string, unknown>;
  const action = cleanText(body.action, 40);
  if (action === "reply") return addContractsResponse(request, actor, body);

  const ability = await permissions(actor);
  if (!ability.legalWrite)
    return jsonNoStore({ error: "الإجراء متاح للمالك ومشرف النظام والمحامي فقط" }, { status: 403 });
  const db = getDb();

  if (action === "resolve") {
    const rootId = Number(body.rootId);
    const resolution = cleanText(body.message, 1000);
    if (!Number.isSafeInteger(rootId) || rootId < 1 || resolution.length < 5)
      return jsonNoStore({ error: "اكتب نتيجة معالجة واضحة لا تقل عن 5 أحرف" }, { status: 400 });
    const root = await db.query.legalContractCorrespondence.findFirst({ where: eq(legalContractCorrespondence.id, rootId) });
    if (!root || root.parentId) return jsonNoStore({ error: "طلب المراسلة غير موجود" }, { status: 404 });
    const matter = await db.query.legalRecords.findFirst({ where: and(eq(legalRecords.id, root.legalRecordId), isNull(legalRecords.deletedAt)) });
    if (!matter || !canAccessMatter(actor, matter)) return jsonNoStore({ error: "الملف القانوني غير متاح" }, { status: 403 });
    if (root.requestStatus === "resolved") return jsonNoStore({ message: root, unchanged: true });
    const now = new Date().toISOString();
    const [message] = await db.transaction(async (tx) => {
      const inserted = await tx.insert(legalContractCorrespondence).values({
        legalRecordId: root.legalRecordId,
        contractId: root.contractId,
        parentId: root.id,
        senderSide: "legal",
        recipientSide: "workforce",
        messageType: "resolution",
        message: resolution,
        requestStatus: "resolved",
        createdBy: actor.user.email,
        createdAt: now,
        resolvedBy: actor.user.email,
        resolvedAt: now,
        updatedAt: now,
      }).returning();
      await tx.update(legalContractCorrespondence).set({ requestStatus: "resolved", resolvedBy: actor.user.email, resolvedAt: now, updatedAt: now }).where(eq(legalContractCorrespondence.id, root.id));
      await tx.insert(legalCaseActionLog).values({ legalRecordId: matter.id, action: "coordination_resolved", details: resolution, actorEmail: actor.user.email, actorRole: actorRole(actor) });
      return inserted;
    });
    await auditPortalAction({ actorEmail: actor.user.email, action: "legal-contract-coordination-resolved", entityType: "legal-record", entityId: matter.id, after: { correspondenceId: root.id, resolution } });
    await emitPortalNotification({ eventType: "legal-contract-coordination-resolved", title: "أُغلقت مراسلة قانونية للعقد", message: `${matter.referenceCode} — ${resolution}`.slice(0, 700), severity: "success", module: "contractual-documents", entityType: "workforce-contract", entityId: root.contractId, actionView: "contractual-documents", targetDepartment: "workforce" }).catch(() => undefined);
    return jsonNoStore({ message });
  }

  if (!['send-note', 'return-contract'].includes(action))
    return jsonNoStore({ error: "الإجراء غير صحيح" }, { status: 400 });
  const legalRecordId = Number(body.legalRecordId);
  const messageText = cleanText(body.message, 2000);
  const reasonCode = cleanText(body.reasonCode, 40);
  const requiredAttachmentName = cleanText(body.requiredAttachmentName, 180);
  if (!Number.isSafeInteger(legalRecordId) || legalRecordId < 1 || messageText.length < (action === "return-contract" ? 10 : 5))
    return jsonNoStore({ error: action === "return-contract" ? "اكتب سبب الإعادة بوضوح بما لا يقل عن 10 أحرف" : "اكتب ملاحظة واضحة لشؤون العمالة" }, { status: 400 });
  if (action === "return-contract" && !returnReasons.has(reasonCode))
    return jsonNoStore({ error: "اختر سبب إعادة العقد" }, { status: 400 });
  if (reasonCode === "missing_attachment" && requiredAttachmentName.length < 2)
    return jsonNoStore({ error: "اكتب اسم المرفق المطلوب بدقة" }, { status: 400 });
  const matter = await db.query.legalRecords.findFirst({ where: and(eq(legalRecords.id, legalRecordId), isNull(legalRecords.deletedAt)) });
  if (!matter) return jsonNoStore({ error: "الملف القانوني غير موجود" }, { status: 404 });
  if (!canAccessMatter(actor, matter)) return jsonNoStore({ error: "القضية غير مسندة إليك" }, { status: 403 });
  if (!matter.contractId) return jsonNoStore({ error: "لا يوجد عقد مرتبط بهذا الملف القانوني" }, { status: 409 });
  if (["closed", "cancelled"].includes(matter.status)) return jsonNoStore({ error: "لا يمكن إرسال مراسلة من ملف قانوني مغلق أو ملغى" }, { status: 409 });
  const contract = await db.query.workforceContracts.findFirst({ where: eq(workforceContracts.id, matter.contractId) });
  if (!contract) return jsonNoStore({ error: "العقد المرتبط غير موجود" }, { status: 404 });
  const now = new Date().toISOString();
  const messageType = action === "return-contract" ? "return_request" : "note";
  const transactionResult = await db.transaction(async (tx) => {
    await tx.execute(sql`select id from legal_records where id = ${legalRecordId} for update`);
    const currentMatter = await tx.query.legalRecords.findFirst({ where: eq(legalRecords.id, legalRecordId) });
    if (!currentMatter || ["closed", "cancelled"].includes(currentMatter.status)) throw new Error("الملف القانوني مغلق");
    if (action === "return-contract" && currentMatter.status === "awaiting_contracts") throw new Error("سبق إرجاع هذا الملف إلى العقود");
    const inserted = await tx.insert(legalContractCorrespondence).values({
      legalRecordId,
      contractId: contract.id,
      senderSide: "legal",
      recipientSide: "workforce",
      messageType,
      reasonCode: action === "return-contract" ? reasonCode : null,
      requiredAttachmentName: reasonCode === "missing_attachment" ? requiredAttachmentName : null,
      message: messageText,
      requestStatus: "open",
      createdBy: actor.user.email,
      createdAt: now,
      updatedAt: now,
    }).returning();
    if (action === "return-contract") {
      await tx.update(legalRecords).set({ status: "awaiting_contracts", updatedAt: now }).where(eq(legalRecords.id, legalRecordId));
      await tx.update(legalReferrals).set({ status: "returned", returnedBy: actor.user.email, returnedAt: now, returnReason: messageText })
        .where(and(eq(legalReferrals.legalRecordId, legalRecordId), eq(legalReferrals.status, "active")));
    }
    await tx.insert(legalCaseActionLog).values({
      legalRecordId,
      action: action === "return-contract" ? "returned_to_contracts" : "note_sent",
      details: `${messageText}${requiredAttachmentName ? ` — المرفق المطلوب: ${requiredAttachmentName}` : ""}`,
      actorEmail: actor.user.email,
      actorRole: actorRole(actor),
    });
    await tx.insert(portalActivity).values({
      actorEmail: actor.user.email,
      action: action === "return-contract" ? "legal-contract-returned" : "legal-workforce-note-sent",
      entityType: "workforce-contract",
      entityId: String(contract.id),
      afterJson: JSON.stringify({ legalRecordId, correspondenceId: inserted[0].id, reasonCode, requiredAttachmentName: requiredAttachmentName || null }),
    });
    return inserted;
  }).catch(error => jsonNoStore({ error: error instanceof Error ? error.message : "تعذر حفظ المراسلة" }, { status: 409 }));
  if (transactionResult instanceof Response) return transactionResult;
  const [message] = transactionResult;
  await auditPortalAction({ actorEmail: actor.user.email, action: action === "return-contract" ? "legal-contract-returned" : "legal-workforce-note-sent", entityType: "workforce-contract", entityId: contract.id, after: { legalRecordId, correspondenceId: message.id, reasonCode, requiredAttachmentName: requiredAttachmentName || null }, reason: messageText });
  await emitPortalNotification({
    eventType: action === "return-contract" ? "legal-contract-returned" : "legal-workforce-note-sent",
    title: action === "return-contract" ? "أعادت القانونية عقدًا لاستكمال إجراء" : "ملاحظة قانونية جديدة لشؤون العمالة",
    message: `${contract.referenceCode} — ${messageText}${requiredAttachmentName ? ` — المطلوب: ${requiredAttachmentName}` : ""}`.slice(0, 700),
    severity: action === "return-contract" ? "warning" : "info",
    module: "contractual-documents",
    entityType: "workforce-contract",
    entityId: contract.id,
    actionView: "contractual-documents",
    targetDepartment: "workforce",
  }).catch(() => undefined);
  return jsonNoStore({ message }, { status: 201 });
}
