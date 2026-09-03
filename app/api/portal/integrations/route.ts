import { and, asc, desc, eq, inArray, lt, lte } from "drizzle-orm";
import { getDb } from "@/db";
import { integrationOutbox, operationRequests, portalSessions, publicRateLimits } from "@/db/schema";
import { auditPortalAction } from "@/lib/audit";
import { hasPortalPermission, requirePortalApiRole } from "@/lib/portal-access";
import { emitPortalNotification } from "@/lib/portal-notifications";
import { getRuntimeEnv } from "@/lib/runtime-env";
import { jsonNoStore, readLimitedJson, rejectCrossSiteRequest, requestCorrelationId } from "@/lib/security";

const hex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");

async function sign(secret: string, value: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
}

function integrationConfig() {
  const runtime = getRuntimeEnv();
  const url = runtime.INTEGRATION_WEBHOOK_URL?.trim() || "";
  const secret = runtime.INTEGRATION_WEBHOOK_SECRET?.trim() || "";
  const valid = Boolean(url && secret && /^https:\/\//i.test(url));
  return { url, secret, valid };
}

async function requireIntegrationAccess() {
  const access = await requirePortalApiRole(["admin", "manager", "employee"]);
  if (!access || !(await hasPortalPermission(access, "integrations", "administer"))) return null;
  return access;
}

export async function GET() {
  const access = await requireIntegrationAccess();
  if (!access) return jsonNoStore({ error: "غير مصرح بإدارة التكاملات" }, { status: 403 });
  try {
    const rows = await getDb().select({ id: integrationOutbox.id, eventType: integrationOutbox.eventType, aggregateType: integrationOutbox.aggregateType, aggregateId: integrationOutbox.aggregateId, status: integrationOutbox.status, attempts: integrationOutbox.attempts, availableAt: integrationOutbox.availableAt, processedAt: integrationOutbox.processedAt, lastError: integrationOutbox.lastError, createdAt: integrationOutbox.createdAt }).from(integrationOutbox).orderBy(desc(integrationOutbox.createdAt)).limit(150);
    return jsonNoStore({ configured: integrationConfig().valid, events: rows });
  } catch {
    return jsonNoStore({ error: "تعذّر تحميل أحداث التكامل" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (rejectCrossSiteRequest(request)) return jsonNoStore({ error: "مصدر الطلب غير مسموح" }, { status: 403 });
  const access = await requireIntegrationAccess();
  if (!access) return jsonNoStore({ error: "غير مصرح بإدارة التكاملات" }, { status: 403 });
  try {
    const parsed = await readLimitedJson(request, 4_000);
    if (!parsed.ok) return parsed.response;
    const payload = parsed.value as { action?: unknown; id?: unknown };
    const action = typeof payload.action === "string" ? payload.action : "";
    const db = getDb();
    const correlationId = requestCorrelationId(request);

    if (action === "retry") {
      const id = typeof payload.id === "string" ? payload.id.trim().slice(0, 80) : "";
      const existing = id ? await db.query.integrationOutbox.findFirst({ where: eq(integrationOutbox.id, id) }) : null;
      if (!existing || !["failed", "pending"].includes(existing.status)) return jsonNoStore({ error: "الحدث غير قابل لإعادة المحاولة" }, { status: 409 });
      const [updated] = await db.update(integrationOutbox).set({ status: "pending", attempts: 0, lastError: null, availableAt: new Date().toISOString(), processedAt: null }).where(eq(integrationOutbox.id, id)).returning();
      await auditPortalAction({ actorEmail: access.user.email, action: "integration-event-retried", entityType: "integration-outbox", entityId: id, before: existing, after: updated, correlationId });
      await emitPortalNotification({ eventType: "integration-event-retried", title: "أُعيد حدث تكامل إلى الطابور", message: `${existing.eventType} — سيُعاد إرساله عند تشغيل المعالجة.`, severity: "info", module: "users", entityType: "integration-outbox", entityId: id, actionView: "operations", targetRole: "admin" }).catch(() => undefined);
      return jsonNoStore({ event: updated });
    }

    if (action === "cleanup-transient") {
      const now = new Date();
      const rateLimitCutoff = new Date(now.getTime() - 7 * 86400000).toISOString();
      const processedCutoff = new Date(now.getTime() - 90 * 86400000).toISOString();
      const [rateLimits, operations, events, sessions] = await Promise.all([
        db.delete(publicRateLimits).where(lt(publicRateLimits.updatedAt, rateLimitCutoff)).returning({ key: publicRateLimits.key }),
        db.delete(operationRequests).where(lt(operationRequests.expiresAt, now.toISOString())).returning({ key: operationRequests.key }),
        db.delete(integrationOutbox).where(and(eq(integrationOutbox.status, "processed"), lt(integrationOutbox.processedAt, processedCutoff))).returning({ id: integrationOutbox.id }),
        db.delete(portalSessions).where(lt(portalSessions.absoluteExpiresAt, now.toISOString())).returning({ id: portalSessions.id }),
      ]);
      const result = { rateLimits: rateLimits.length, operations: operations.length, processedEvents: events.length, expiredSessions: sessions.length };
      await auditPortalAction({ actorEmail: access.user.email, action: "transient-data-cleaned", entityType: "system-maintenance", entityId: correlationId, after: result, correlationId });
      await emitPortalNotification({ eventType: "transient-data-cleaned", title: "اكتملت صيانة البيانات المؤقتة", message: `حُذفت ${result.rateLimits} نافذة تقييد و${result.operations} عملية منتهية و${result.processedEvents} حدثاً قديماً و${result.expiredSessions} جلسة منتهية.`, severity: "success", module: "users", entityType: "system-maintenance", entityId: correlationId, actionView: "operations", targetRole: "admin" }).catch(() => undefined);
      return jsonNoStore({ cleaned: result });
    }

    if (action !== "dispatch") return jsonNoStore({ error: "إجراء التكامل غير صحيح" }, { status: 400 });
    const config = integrationConfig();
    if (!config.valid) return jsonNoStore({ error: "أضف رابط HTTPS وسر توقيع للتكامل قبل تشغيل الإرسال" }, { status: 409 });
    const now = new Date().toISOString();
    const candidates = await db.select().from(integrationOutbox).where(and(inArray(integrationOutbox.status, ["pending", "failed"]), lte(integrationOutbox.availableAt, now), lt(integrationOutbox.attempts, 5))).orderBy(asc(integrationOutbox.createdAt)).limit(20);
    const outcomes: Array<{ id: string; status: "processed" | "pending" | "failed"; error?: string }> = [];
    for (const event of candidates) {
      const [claimed] = await db.update(integrationOutbox).set({ status: "processing", attempts: event.attempts + 1, lastError: null }).where(and(eq(integrationOutbox.id, event.id), eq(integrationOutbox.status, event.status))).returning();
      if (!claimed) continue;
      try {
        const timestamp = String(Date.now());
        const envelope = JSON.stringify({ id: event.id, type: event.eventType, aggregate: { type: event.aggregateType, id: event.aggregateId }, occurredAt: event.createdAt, data: JSON.parse(event.payloadJson) });
        const signature = await sign(config.secret, `${timestamp}.${envelope}`);
        const response = await fetch(config.url, { method: "POST", headers: { "content-type": "application/json", "x-dali-event-id": event.id, "x-dali-timestamp": timestamp, "x-dali-signature": `sha256=${signature}` }, body: envelope, redirect: "error" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        await db.update(integrationOutbox).set({ status: "processed", processedAt: new Date().toISOString(), lastError: null }).where(eq(integrationOutbox.id, event.id));
        outcomes.push({ id: event.id, status: "processed" });
      } catch (error) {
        const message = (error instanceof Error ? error.message : "فشل غير معروف").slice(0, 500);
        const finalFailure = claimed.attempts >= 5;
        const delayMinutes = Math.min(60, 2 ** Math.max(0, claimed.attempts - 1));
        await db.update(integrationOutbox).set({ status: finalFailure ? "failed" : "pending", availableAt: new Date(Date.now() + delayMinutes * 60000).toISOString(), lastError: message }).where(eq(integrationOutbox.id, event.id));
        outcomes.push({ id: event.id, status: finalFailure ? "failed" : "pending", error: message });
      }
    }
    const processed = outcomes.filter((item) => item.status === "processed").length;
    const failed = outcomes.filter((item) => item.status !== "processed").length;
    await auditPortalAction({ actorEmail: access.user.email, action: "integration-outbox-dispatched", entityType: "integration-outbox-batch", entityId: correlationId, after: { processed, failed, total: outcomes.length }, correlationId });
    await emitPortalNotification({ eventType: "integration-outbox-dispatched", title: failed ? "اكتملت معالجة التكامل مع أخطاء" : "اكتملت معالجة التكامل", message: `نجح ${processed} من ${outcomes.length} حدث.`, severity: failed ? "warning" : "success", module: "users", entityType: "integration-outbox-batch", entityId: correlationId, actionView: "operations", targetRole: "admin" }).catch(() => undefined);
    return jsonNoStore({ processed, failed, outcomes });
  } catch (error) {
    console.error("integration-outbox-action-failed", error);
    return jsonNoStore({ error: "تعذّر تنفيذ عملية التكامل" }, { status: 500 });
  }
}
