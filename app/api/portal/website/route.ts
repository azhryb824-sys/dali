import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { portalSettings } from "@/db/schema";
import { auditPortalAction } from "@/lib/audit";
import { hasPortalPermission, requirePortalApiRole } from "@/lib/portal-access";
import { emitPortalNotification } from "@/lib/portal-notifications";
import { jsonNoStore, readLimitedJson, rejectCrossSiteRequest } from "@/lib/security";
import { DEFAULT_WEBSITE_CONTENT, sanitizeWebsiteContent, WEBSITE_CONTENT_KEY } from "@/lib/website-content";
import { completeWebsiteTranslations } from "@/lib/website-translation-audit";

function safeHttpsUrl(value: string) {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

export async function GET() {
  const access = await requirePortalApiRole(["admin", "manager", "employee"]);
  if (!access || !(await hasPortalPermission(access, "website", "read"))) return jsonNoStore({ error: "غير مصرح" }, { status: 403 });
  try {
    const row = await getDb().query.portalSettings.findFirst({ where: eq(portalSettings.key, WEBSITE_CONTENT_KEY) });
    const content = row ? sanitizeWebsiteContent(JSON.parse(row.valueJson)) : DEFAULT_WEBSITE_CONTENT;
    return jsonNoStore({ content });
  } catch (error) {
    console.error("website-content-read-failed", error);
    return jsonNoStore({ error: "تعذّر تحميل محتوى الموقع حاليًا" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  if (rejectCrossSiteRequest(request)) return jsonNoStore({ error: "مصدر الطلب غير مسموح" }, { status: 403 });
  const access = await requirePortalApiRole(["admin", "manager", "employee"]);
  if (!access || !(await hasPortalPermission(access, "website", "write"))) return jsonNoStore({ error: "لا تملك صلاحية إدارة الموقع" }, { status: 403 });

  try {
    const parsed = await readLimitedJson(request, 900_000);
    if (!parsed.ok) return parsed.response;
    const payload = parsed.value as { content?: unknown; expectedVersion?: unknown };
    const expectedVersion = Number(payload.expectedVersion);
    if (!Number.isInteger(expectedVersion) || expectedVersion < 1) return jsonNoStore({ error: "نسخة المحتوى غير صحيحة" }, { status: 400 });
    const db = getDb();
    const existing = await db.query.portalSettings.findFirst({ where: eq(portalSettings.key, WEBSITE_CONTENT_KEY) });
    const previous = existing ? sanitizeWebsiteContent(JSON.parse(existing.valueJson)) : DEFAULT_WEBSITE_CONTENT;
    if (expectedVersion !== previous.version) return jsonNoStore({ error: "عدّل مستخدم آخر محتوى الموقع. حدّث الصفحة قبل الحفظ.", currentVersion: previous.version }, { status: 409 });

    const next = sanitizeWebsiteContent(payload.content, previous);
    const translationAudit = completeWebsiteTranslations(next);
    if (!translationAudit.complete) return jsonNoStore({
      error: `لا يمكن نشر الموقع قبل اكتمال الترجمة: ${translationAudit.en.missing.length} نص إنجليزي و${translationAudit.bn.missing.length} نص بنغالي غير مكتمل.`,
      translationAudit: { en: translationAudit.en.missing.length, bn: translationAudit.bn.missing.length },
    }, { status: 422 });
    next.version = previous.version + 1;
    next.updatedAt = new Date().toISOString();
    next.updatedBy = access.user.email.trim().toLowerCase();
    if (next.site.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next.site.email)) return jsonNoStore({ error: "البريد الإلكتروني العام غير صحيح" }, { status: 400 });
    if (next.site.phone && !/^\+?[0-9\s()-]{8,20}$/.test(next.site.phone)) return jsonNoStore({ error: "رقم الهاتف العام غير صحيح" }, { status: 400 });
    if (!safeHttpsUrl(next.site.googleBusinessUrl) || !safeHttpsUrl(next.site.mapUrl)) return jsonNoStore({ error: "روابط الخرائط وملف النشاط يجب أن تبدأ بـ https" }, { status: 400 });
    const valueJson = JSON.stringify(next);
    if (new TextEncoder().encode(valueJson).byteLength > 850_000) return jsonNoStore({ error: "حجم محتوى الموقع تجاوز الحد الآمن. اختصر النصوص أو عدد العناصر." }, { status: 413 });

    if (existing) {
      const updated = await db.update(portalSettings).set({ valueJson, updatedBy: next.updatedBy, updatedAt: next.updatedAt }).where(and(eq(portalSettings.key, WEBSITE_CONTENT_KEY), eq(portalSettings.updatedAt, existing.updatedAt))).returning({ key: portalSettings.key });
      if (!updated.length) return jsonNoStore({ error: "تغيّر المحتوى أثناء الحفظ. حدّث الصفحة وحاول مجددًا." }, { status: 409 });
    } else {
      try {
        await db.insert(portalSettings).values({ key: WEBSITE_CONTENT_KEY, valueJson, updatedBy: next.updatedBy, updatedAt: next.updatedAt });
      } catch {
        return jsonNoStore({ error: "بدأ مستخدم آخر حفظ المحتوى. حدّث الصفحة قبل المحاولة." }, { status: 409 });
      }
    }

    await auditPortalAction({ actorEmail: next.updatedBy, action: "website-content-published", entityType: "website-content", entityId: WEBSITE_CONTENT_KEY, before: previous, after: next, reason: `الإصدار ${next.version}` });
    await emitPortalNotification({ eventType: "website-content-published", title: "نُشر تحديث للموقع الإلكتروني", message: `الإصدار ${next.version} — بواسطة ${access.user.displayName}.`, severity: "success", module: "website", entityType: "website-content", entityId: WEBSITE_CONTENT_KEY, actionView: "website", targetRole: "admin" }).catch(() => undefined);
    return jsonNoStore({ content: next });
  } catch (error) {
    console.error("website-content-save-failed", error);
    return jsonNoStore({ error: "تعذّر حفظ محتوى الموقع حاليًا" }, { status: 500 });
  }
}
