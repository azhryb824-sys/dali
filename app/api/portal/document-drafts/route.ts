import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { documentDrafts } from "@/db/schema";
import { canManagePortalDocuments, requirePortalApiRole } from "@/lib/portal-access";
import { rejectCrossSiteRequest } from "@/lib/security";

const types = new Set(["workforce_contract", "quotation", "official_letter"]);
function safePayload(value: unknown) {
  const row = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const json = JSON.stringify(row);
  if (json.length > 250_000) throw new Error("DRAFT_TOO_LARGE");
  return json;
}

export async function GET() {
  const access = await requirePortalApiRole(["admin", "manager", "employee"]);
  if (!access || !canManagePortalDocuments(access)) return Response.json({ error: "غير مصرح" }, { status: 403 });
  const drafts = await getDb().select().from(documentDrafts).where(eq(documentDrafts.ownerEmail, access.user.email.toLowerCase())).orderBy(desc(documentDrafts.updatedAt));
  return Response.json({ drafts: drafts.map((draft) => ({ ...draft, payload: JSON.parse(draft.payloadJson) })) });
}

export async function POST(request: Request) {
  if (rejectCrossSiteRequest(request)) return Response.json({ error: "مصدر الطلب غير مسموح" }, { status: 403 });
  const access = await requirePortalApiRole(["admin", "manager", "employee"]);
  if (!access || !canManagePortalDocuments(access)) return Response.json({ error: "غير مصرح" }, { status: 403 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const documentType = String(body.documentType || "");
    if (!types.has(documentType)) return Response.json({ error: "نوع المسودة غير صحيح" }, { status: 400 });
    const title = String(body.title || "مسودة غير مكتملة").trim().slice(0, 180) || "مسودة غير مكتملة";
    const completionPercent = Math.max(0, Math.min(100, Math.round(Number(body.completionPercent || 0))));
    const now = new Date().toISOString();
    const id = Number(body.id || 0);
    if (Number.isInteger(id) && id > 0) {
      const [draft] = await getDb().update(documentDrafts).set({ title, payloadJson: safePayload(body.payload), completionPercent, updatedAt: now }).where(and(eq(documentDrafts.id, id), eq(documentDrafts.ownerEmail, access.user.email.toLowerCase()))).returning();
      if (!draft) return Response.json({ error: "المسودة غير موجودة" }, { status: 404 });
      return Response.json({ draft });
    }
    const [draft] = await getDb().insert(documentDrafts).values({ documentType, title, payloadJson: safePayload(body.payload), completionPercent, ownerEmail: access.user.email.toLowerCase(), updatedAt: now }).returning();
    return Response.json({ draft }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error && error.message === "DRAFT_TOO_LARGE" ? "حجم المسودة يتجاوز الحد الآمن" : "تعذر حفظ المسودة" }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  if (rejectCrossSiteRequest(request)) return Response.json({ error: "مصدر الطلب غير مسموح" }, { status: 403 });
  const access = await requirePortalApiRole(["admin", "manager", "employee"]);
  if (!access || !canManagePortalDocuments(access)) return Response.json({ error: "غير مصرح" }, { status: 403 });
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id < 1) return Response.json({ error: "رقم المسودة غير صحيح" }, { status: 400 });
  await getDb().delete(documentDrafts).where(and(eq(documentDrafts.id, id), eq(documentDrafts.ownerEmail, access.user.email.toLowerCase())));
  return Response.json({ ok: true });
}
