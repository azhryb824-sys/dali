/** Only the server may add these references to a request or quotation snapshot. */
export const commercialAttachmentFields = [
  { name: "commercialRegistrationFile", kind: "commercial-registration", label: "السجل التجاري" },
  { name: "vatCertificateFile", kind: "vat-certificate", label: "الشهادة الضريبية" },
  { name: "nationalAddressFile", kind: "national-address", label: "العنوان الوطني" },
] as const;
export type CommercialAttachmentKind = typeof commercialAttachmentFields[number]["kind"];
export type CommercialAttachmentRef = { id: number; kind: CommercialAttachmentKind; fileName: string; sizeBytes: number };
export function commercialAttachmentRefs(value: unknown): CommercialAttachmentRef[] {
  let parsed = value;
  if (typeof parsed === "string") { try { parsed = JSON.parse(parsed); } catch { return []; } }
  if (!parsed || typeof parsed !== "object") return [];
  const refs = (parsed as Record<string, unknown>).commercialAttachments;
  if (!Array.isArray(refs)) return [];
  const result: CommercialAttachmentRef[] = [];
  for (const row of refs) {
    if (!row || typeof row !== "object") continue;
    const ref = row as Record<string, unknown>;
    if (!Number.isSafeInteger(ref.id) || Number(ref.id) < 1 || !commercialAttachmentFields.some(field => field.kind === ref.kind) || result.some(item => item.kind === ref.kind)) continue;
    result.push({ id: Number(ref.id), kind: ref.kind as CommercialAttachmentKind, fileName: typeof ref.fileName === "string" ? ref.fileName : "", sizeBytes: Number(ref.sizeBytes) || 0 });
  }
  return result;
}
export function withCommercialAttachments(terms: unknown, refs: CommercialAttachmentRef[]) {
  let parsed = terms;
  if (typeof parsed === "string") { try { parsed = JSON.parse(parsed); } catch { parsed = {}; } }
  const record = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  return JSON.stringify({ ...record, commercialAttachments: refs });
}
