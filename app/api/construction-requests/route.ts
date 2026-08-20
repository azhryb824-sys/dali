import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { constructionOpportunities, serviceCities } from "@/db/schema";
import { emitPortalNotification } from "@/lib/portal-notifications";
import { enforcePublicRateLimit, jsonNoStore, rateLimitResponse, readLimitedJson, rejectCrossSiteRequest } from "@/lib/security";

const projectTypes = new Set(["مبانٍ", "تشطيبات", "أعمال مدنية", "ترميم وتأهيل", "بنية تحتية", "أعمال كهروميكانيكية", "أخرى"]);
const text = (value: unknown, limit: number) => typeof value === "string" ? value.trim().slice(0, limit) : "";

export async function POST(request: Request) {
  try {
    if (rejectCrossSiteRequest(request)) return jsonNoStore({ error: "مصدر الطلب غير مسموح." }, { status: 403 });
    const parsed = await readLimitedJson(request, 24_000);
    if (!parsed.ok) return parsed.response;
    const rateLimit = await enforcePublicRateLimit(request, { scope: "construction-request", limit: 6, windowSeconds: 900, blockSeconds: 1800 });
    if (!rateLimit.allowed) return rateLimitResponse(rateLimit.retryAfterSeconds);
    const payload = parsed.value as Record<string, unknown>;
    if (text(payload.website, 200)) return jsonNoStore({ accepted: true }, { status: 202 });

    const contactName = text(payload.contactName, 100);
    const clientName = text(payload.clientName, 160);
    const contactMobile = text(payload.contactMobile, 20);
    const contactEmail = text(payload.contactEmail, 160).toLowerCase();
    const cityCode = text(payload.cityCode, 80);
    const projectType = text(payload.projectType, 80);
    const title = text(payload.title, 180);
    const scopeSummary = text(payload.scopeSummary, 2000);
    const expectedStartDate = text(payload.expectedStartDate, 10);
    if (contactName.length < 2 || clientName.length < 2 || !/^\+?[0-9\s()-]{8,20}$/.test(contactMobile) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail) || !cityCode || !projectTypes.has(projectType) || title.length < 3 || scopeSummary.length < 20 || (expectedStartDate && !/^\d{4}-\d{2}-\d{2}$/.test(expectedStartDate))) {
      return jsonNoStore({ error: "بيانات الطلب غير مكتملة أو غير صحيحة." }, { status: 400 });
    }

    const db = getDb();
    const city = await db.query.serviceCities.findFirst({ where: eq(serviceCities.code, cityCode) });
    if (!city) return jsonNoStore({ error: "المدينة المختارة غير متاحة في دليل الخدمة." }, { status: 400 });
    const code = `CON-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`;
    const [saved] = await db.insert(constructionOpportunities).values({
      opportunityCode: code, clientName, contactName, contactMobile, contactEmail, title, cityId: city.id,
      projectType, scopeSummary, expectedStartDate: expectedStartDate || null, stage: "new", probabilityBps: 1000,
      ownerEmail: "unassigned@dali.sa", source: "public-website", createdBy: contactEmail,
    }).returning({ id: constructionOpportunities.id, opportunityCode: constructionOpportunities.opportunityCode });
    await emitPortalNotification({ eventType: "construction-request-received", title: "طلب مقاولات جديد من الموقع", message: `${saved.opportunityCode} — ${clientName} — ${projectType} في ${city.nameAr}.`, severity: "critical", module: "construction", entityType: "construction-opportunity", entityId: saved.id, actionView: "construction", targetRole: "manager" }).catch(() => undefined);
    return jsonNoStore({ accepted: true, trackingCode: saved.opportunityCode }, { status: 201 });
  } catch (error) {
    console.error("construction-request-failed", error);
    return jsonNoStore({ error: "تعذّر حفظ طلب المقاولات حالياً." }, { status: 500 });
  }
}
