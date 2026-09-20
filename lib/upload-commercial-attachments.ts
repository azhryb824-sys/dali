import { commercialAttachmentFields } from "@/lib/commercial-attachments";
import { readApiJson } from "@/lib/client-api";

/** Upload only selected replacements. A saved record must not be created again on upload failure. */
export async function uploadCommercialAttachments(form: FormData, context: { quoteId: number } | { trackingCode: string; email: string }) {
  const failures: string[] = [];
  for (const field of commercialAttachmentFields) {
    const file = form.get(field.name);
    if (!(file instanceof File) || !file.size) continue;
    const body = new FormData();
    body.set("file", file); body.set("kind", field.kind);
    for (const [key, value] of Object.entries(context)) body.set(key, String(value));
    try {
      const response = await fetch("quoteId" in context ? "/api/portal/commercial-attachments" : "/api/quote-requests", { method: "POST", body });
      const result = await readApiJson(response) as { error?: string };
      if (!response.ok) throw new Error(result.error || "تعذر حفظ المرفق");
    } catch (error) { failures.push(`${field.label}: ${error instanceof Error ? error.message : "تعذر حفظ المرفق"}`); }
  }
  return failures;
}
