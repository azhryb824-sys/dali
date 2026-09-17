import { ownRepresentativeQuote } from "@/lib/quote-request-workflow";
import { canAccessPortalDocuments, canSharePortalDocuments, hasPortalPermission, requirePortalApiRole } from "@/lib/portal-access";
import { resolveShareRecipient } from "@/lib/share-recipient";
import { jsonNoStore } from "@/lib/security";

export async function GET(request: Request) {
  const access = await requirePortalApiRole(["admin", "manager", "employee"]);
  if (!access) return jsonNoStore({ error: "غير مصرح بمشاركة المستندات" }, { status: 403 });
  const params = new URL(request.url).searchParams;
  const source: { documentId?: number; quoteId?: number; contractId?: number } = {};
  for (const key of ["documentId", "quoteId", "contractId"] as const) {
    if (!params.has(key)) continue;
    const id = Number(params.get(key));
    if (!Number.isSafeInteger(id) || id < 1) return jsonNoStore({ error: "السجل غير صحيح" }, { status: 400 });
    source[key] = id;
  }
  if (Object.keys(source).length !== 1) return jsonNoStore({ error: "اختر سجلًا واحدًا للمشاركة" }, { status: 400 });
  const ownQuote = source.quoteId ? await ownRepresentativeQuote(access, source.quoteId) : false;
  if (!ownQuote && (!canAccessPortalDocuments(access) || !canSharePortalDocuments(access))) return jsonNoStore({error:"غير مصرح"},{status:403});
  if (!ownQuote && (source.quoteId || source.contractId) && !await hasPortalPermission(access, "contracts", "read")) return jsonNoStore({ error: "غير مصرح بعرض بيانات العميل" }, { status: 403 });
  try { return jsonNoStore(await resolveShareRecipient(source)); }
  catch { return jsonNoStore({ error: "تعذّر جلب رقم العميل؛ أدخله يدويًا" }, { status: 404 }); }
}
