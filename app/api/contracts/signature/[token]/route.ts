import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { companyDocuments, contractSignatureRequests, portalActivity, workforceContracts } from "@/db/schema";
import { hashShareToken, objectKey, safeFileName } from "@/lib/company-documents";
import { emitPortalNotification } from "@/lib/portal-notifications";
import { getRuntimeEnv } from "@/lib/runtime-env";
import { jsonNoStore, validateUploadedFile } from "@/lib/security";

const PDF_TYPES = new Set(["application/pdf"]);
const MAX_PDF_BYTES = 25 * 1024 * 1024;

async function resolveRequest(token: string) {
  if (!/^[a-f0-9]{64}$/i.test(token)) return null;
  const db = getDb();
  const tokenHash = await hashShareToken(token);
  const signatureRequest = await db.query.contractSignatureRequests.findFirst({
    where: eq(contractSignatureRequests.tokenHash, tokenHash),
  });
  if (!signatureRequest) return null;
  const contract = await db.query.workforceContracts.findFirst({
    where: eq(workforceContracts.id, signatureRequest.contractId),
  });
  const document = await db.query.companyDocuments.findFirst({
    where: eq(companyDocuments.id, signatureRequest.documentId),
  });
  return { db, signatureRequest, contract, document };
}

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const resolved = await resolveRequest(token);
  if (!resolved) return jsonNoStore({ error: "رابط رفع العقد غير صالح" }, { status: 404 });
  const { signatureRequest, contract, document } = resolved;
  if (!contract || !document) return jsonNoStore({ error: "العقد أو مستنده غير متاح" }, { status: 404 });
  if (signatureRequest.status !== "pending") {
    return jsonNoStore({ error: signatureRequest.status === "uploaded" ? "تم رفع العقد الموقع مسبقًا" : "هذا الرابط لم يعد صالحًا" }, { status: 410 });
  }
  if (new Date(signatureRequest.expiresAt).getTime() <= Date.now()) {
    await resolved.db.update(contractSignatureRequests).set({ status: "expired", updatedAt: new Date().toISOString() })
      .where(and(eq(contractSignatureRequests.id, signatureRequest.id), eq(contractSignatureRequests.status, "pending")));
    return jsonNoStore({ error: "انتهت صلاحية رابط رفع العقد" }, { status: 410 });
  }
  if (!["approved", "sent"].includes(contract.status)) {
    return jsonNoStore({ error: "حالة العقد الحالية لا تسمح برفع النسخة الموقعة" }, { status: 409 });
  }
  return jsonNoStore({
    contract: {
      referenceCode: contract.referenceCode,
      clientName: contract.clientName,
      title: contract.title,
      fileName: document.fileName,
      expiresAt: signatureRequest.expiresAt,
    },
  });
}

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  let signedStorageKey = "";
  try {
    const { token } = await context.params;
    const resolved = await resolveRequest(token);
    if (!resolved) return jsonNoStore({ error: "رابط رفع العقد غير صالح" }, { status: 404 });
    const { db, signatureRequest, contract, document } = resolved;
    const now = new Date().toISOString();
    if (!contract || !document) return jsonNoStore({ error: "العقد أو مستنده غير متاح" }, { status: 404 });
    if (signatureRequest.status !== "pending" || new Date(signatureRequest.expiresAt).getTime() <= Date.now()) {
      return jsonNoStore({ error: signatureRequest.status === "uploaded" ? "تم رفع العقد الموقع مسبقًا" : "انتهت صلاحية رابط رفع العقد" }, { status: 410 });
    }
    if (!["approved", "sent"].includes(contract.status)) return jsonNoStore({ error: "حالة العقد الحالية لا تسمح بالرفع" }, { status: 409 });

    let form: FormData;
    try { form = await request.formData(); }
    catch { return jsonNoStore({ error: "تعذّر قراءة الملف المرفوع" }, { status: 400 }); }
    const file = form.get("file");
    if (!(file instanceof File)) return jsonNoStore({ error: "اختر ملف العقد بصيغة PDF" }, { status: 400 });
    const validation = await validateUploadedFile(file, { contentTypes: PDF_TYPES, maxBytes: MAX_PDF_BYTES });
    if (!validation.valid) return jsonNoStore({ error: validation.error }, { status: 400 });
    if (validation.bytes.byteLength < 5 || new TextDecoder().decode(validation.bytes.slice(0, 5)) !== "%PDF-") {
      return jsonNoStore({ error: "الملف المرفوع ليس ملف PDF صالحًا" }, { status: 400 });
    }

    const fileName = safeFileName(file.name.toLowerCase().endsWith(".pdf") ? file.name : `${file.name}.pdf`);
    signedStorageKey = objectKey("signed-contracts", fileName);
    await getRuntimeEnv().BUCKET.put(signedStorageKey, validation.bytes, {
      httpMetadata: { contentType: "application/pdf" },
      customMetadata: { contractId: String(contract.id), signatureRequestId: signatureRequest.id, validation: validation.validationDetails },
    });
    const stored = await getRuntimeEnv().BUCKET.get(signedStorageKey);
    if (!stored || (await stored.arrayBuffer()).byteLength !== validation.bytes.byteLength) throw new Error("SIGNED_CONTRACT_STORAGE_VERIFICATION_FAILED");

    const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const uploadedSourceHash = await hashShareToken(forwardedFor);
    const metadata = (() => { try { return document.metadataJson ? JSON.parse(document.metadataJson) : {}; } catch { return {}; } })();
    const changed = await db.transaction(async (tx) => {
      const [claimed] = await tx.update(contractSignatureRequests).set({
        status: "uploaded", signedStorageKey, signedFileName: fileName,
        signedSizeBytes: validation.bytes.byteLength, uploadedAt: now, uploadedSourceHash, updatedAt: now,
      }).where(and(eq(contractSignatureRequests.id, signatureRequest.id), eq(contractSignatureRequests.status, "pending"))).returning();
      if (!claimed) return null;
      const [savedDocument] = await tx.update(companyDocuments).set({
        storageKey: signedStorageKey, fileName, contentType: "application/pdf",
        sizeBytes: validation.bytes.byteLength, source: "signed-upload",
        validationStatus: "pdf-signature-validated", validationDetails: validation.validationDetails,
        metadataJson: JSON.stringify({ ...metadata, originalApprovedStorageKey: signatureRequest.originalStorageKey, signatureRequestId: signatureRequest.id, clientSignedUploadedAt: now }),
        updatedAt: now,
      }).where(and(eq(companyDocuments.id, document.id), eq(companyDocuments.storageKey, signatureRequest.originalStorageKey))).returning();
      if (!savedDocument) throw new Error("CONTRACT_DOCUMENT_CHANGED");
      const [savedContract] = await tx.update(workforceContracts).set({ status: "signed", signedAt: now, updatedAt: now })
        .where(and(eq(workforceContracts.id, contract.id), eq(workforceContracts.status, contract.status))).returning();
      if (!savedContract) throw new Error("CONTRACT_STATUS_CHANGED");
      await tx.insert(portalActivity).values({
        actorEmail: "contract-signature-link", action: "signed-contract-uploaded",
        entityType: "workforce-contract", entityId: String(contract.id),
        afterJson: JSON.stringify({ documentId: document.id, signatureRequestId: signatureRequest.id, fileName, sizeBytes: validation.bytes.byteLength }),
        correlationId: crypto.randomUUID(), source: "public-signature-link",
      });
      return savedContract;
    });
    if (!changed) throw new Error("SIGNATURE_LINK_ALREADY_USED");

    await emitPortalNotification({
      eventType: "signed-contract-uploaded", title: "تم استلام العقد الموقع من العميل",
      message: `${contract.referenceCode} — استُبدلت النسخة الحالية بالنسخة الموقعة مع حفظ الأصل المعتمد.`,
      severity: "info", module: "documents", entityType: "workforce-contract", entityId: contract.id,
      actionView: "contract-documents", targetDepartment: "contracts",
    }).catch(() => undefined);
    return jsonNoStore({ status: "ok", referenceCode: contract.referenceCode });
  } catch (error) {
    if (signedStorageKey) await getRuntimeEnv().BUCKET.delete(signedStorageKey).catch(() => undefined);
    console.error("signed-contract-upload-failed", error);
    const code = error instanceof Error ? error.message : "";
    const conflict = ["CONTRACT_DOCUMENT_CHANGED", "CONTRACT_STATUS_CHANGED", "SIGNATURE_LINK_ALREADY_USED"].includes(code);
    return jsonNoStore({ error: conflict ? "تغيّرت بيانات العقد أو استُخدم الرابط؛ حدّث الصفحة وتواصل مع الشركة" : "تعذّر حفظ العقد الموقع. لم يتم تغيير النسخة الحالية." }, { status: conflict ? 409 : 500 });
  }
}
