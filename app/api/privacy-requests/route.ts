import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { dataSubjectRequests } from "@/db/schema";
import { emitPortalNotification } from "@/lib/portal-notifications";
import { enforcePublicRateLimit, jsonNoStore, rateLimitResponse, readLimitedJson, rejectCrossSiteRequest } from "@/lib/security";

const requestTypes = new Set(["access", "correction", "deletion", "withdraw_consent", "complaint"]);
const text = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";

export async function GET(request: Request) {
  try {
    const limit = await enforcePublicRateLimit(request, { scope: "privacy-status", limit: 10, windowSeconds: 3600, blockSeconds: 3600 });
    if (!limit.allowed) return rateLimitResponse(limit.retryAfterSeconds);
    const params = new URL(request.url).searchParams;
    const trackingCode = text(params.get("trackingCode"), 40).toUpperCase();
    const email = text(params.get("email"), 160).toLowerCase();
    if (!/^PDR-[A-Z0-9-]{8,35}$/.test(trackingCode) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return jsonNoStore({ error: "رقم المتابعة أو البريد غير صحيح." }, { status: 400 });
    const item = await getDb().query.dataSubjectRequests.findFirst({ where: and(eq(dataSubjectRequests.trackingCode, trackingCode), eq(dataSubjectRequests.email, email)) });
    if (!item) return jsonNoStore({ error: "لم نعثر على طلب مطابق للبيانات المدخلة." }, { status: 404 });
    return jsonNoStore({ request: { trackingCode: item.trackingCode, requestType: item.requestType, status: item.status, dueAt: item.dueAt, completedAt: item.completedAt, createdAt: item.createdAt } });
  } catch {
    return jsonNoStore({ error: "تعذّر التحقق من حالة الطلب حالياً." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    if (rejectCrossSiteRequest(request)) return jsonNoStore({ error: "مصدر الطلب غير مسموح." }, { status: 403 });
    const parsed = await readLimitedJson(request, 24_000);
    if (!parsed.ok) return parsed.response;
    const limit = await enforcePublicRateLimit(request, { scope: "privacy-request", limit: 5, windowSeconds: 3600, blockSeconds: 3600 });
    if (!limit.allowed) return rateLimitResponse(limit.retryAfterSeconds);
    const payload = parsed.value as Record<string, unknown>;
    if (text(payload.website, 200)) return jsonNoStore({ accepted: true }, { status: 202 });
    const requestType = text(payload.requestType, 30);
    const fullName = text(payload.fullName, 120);
    const email = text(payload.email, 160).toLowerCase();
    const mobile = text(payload.mobile, 20);
    const details = text(payload.details, 2000);
    if (!requestTypes.has(requestType) || fullName.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || (mobile && !/^\+?[0-9\s()-]{8,20}$/.test(mobile))) {
      return jsonNoStore({ error: "بيانات الطلب غير مكتملة أو غير صحيحة." }, { status: 400 });
    }
    const trackingCode = `PDR-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0, 5).toUpperCase()}`;
    const [saved] = await getDb().insert(dataSubjectRequests).values({ trackingCode, requestType, fullName, email, mobile: mobile || null, details: details || null, dueAt: new Date(Date.now() + 30 * 86400000).toISOString() }).returning();
    await emitPortalNotification({ eventType: "privacy-request-received", title: "طلب جديد متعلق بالبيانات الشخصية", message: `${trackingCode} — ${fullName} — ${requestType}.`, severity: "critical", module: "privacy", entityType: "data-subject-request", entityId: saved.id, actionView: "operations", targetRole: "admin" }).catch(() => undefined);
    return jsonNoStore({ accepted: true, trackingCode }, { status: 201 });
  } catch (error) {
    console.error("privacy-request-create-failed", error);
    return jsonNoStore({ error: "تعذّر تسجيل الطلب حالياً." }, { status: 500 });
  }
}
