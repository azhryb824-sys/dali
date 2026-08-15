export const documentCategories = new Set(["license", "contract", "certificate", "finance", "legal", "hr", "other"]);

export const uploadContentTypes = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/png",
  "image/jpeg",
]);

export function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export function cleanDate(value: unknown, optional = false) {
  const date = cleanText(value, 10);
  if (!date && optional) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "";
}

export function makeReference(prefix: string) {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return `${prefix}-${date}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
}

export function safeFileName(value: string) {
  return value.replace(/[\u0000-\u001f\u007f/\\]/g, "-").replace(/\s+/g, " ").trim().slice(0, 180) || "document";
}

export function objectKey(group: string, fileName: string) {
  const extension = safeFileName(fileName).split(".").pop()?.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8).toLowerCase();
  return `${group}/${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}${extension ? `.${extension}` : ""}`;
}

export function attachmentHeaders(fileName: string, contentType: string, etag?: string, disposition: "attachment" | "inline" = "attachment") {
  const safeName = safeFileName(fileName);
  const ascii = safeName.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_");
  const encoded = encodeURIComponent(safeName).replace(/['()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  const headers = new Headers({
    "content-type": contentType || "application/octet-stream",
    "content-disposition": `${disposition}; filename="${ascii}"; filename*=UTF-8''${encoded}`,
    "cache-control": "private, no-store, max-age=0",
    "x-content-type-options": "nosniff",
    "x-robots-tag": "noindex, nofollow, noarchive",
  });
  if (etag) headers.set("etag", etag);
  return headers;
}

export async function hashShareToken(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
