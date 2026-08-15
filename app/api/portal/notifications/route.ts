import { getDb } from "@/db";
import { portalNotificationReads } from "@/db/schema";
import { listPortalNotifications, refreshOperationalNotifications } from "@/lib/portal-notifications";
import { requirePortalApiRole } from "@/lib/portal-access";
import { rejectCrossSiteRequest } from "@/lib/security";

async function requireAccess() {
  return requirePortalApiRole(["admin", "manager", "employee"]);
}

export async function GET(request: Request) {
  const access = await requireAccess();
  if (!access) return Response.json({ error: "غير مصرح" }, { status: 403 });
  try {
    await refreshOperationalNotifications({ force: new URL(request.url).searchParams.get("force") === "1" && access.role === "admin" });
    const notifications = await listPortalNotifications(access);
    return Response.json({ notifications });
  } catch {
    return Response.json({ error: "تعذّر تحديث مركز الإشعارات" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  if (rejectCrossSiteRequest(request)) return Response.json({ error: "مصدر الطلب غير مسموح" }, { status: 403 });
  const access = await requireAccess();
  if (!access) return Response.json({ error: "غير مصرح" }, { status: 403 });
  try {
    const payload = await request.json() as { action?: unknown; ids?: unknown };
    const action = typeof payload.action === "string" ? payload.action : "";
    if (!new Set(["read", "read-all", "dismiss"]).has(action)) {
      return Response.json({ error: "إجراء الإشعار غير صحيح" }, { status: 400 });
    }

    const visible = await listPortalNotifications(access);
    const visibleIds = new Set(visible.map((item) => item.id));
    const requestedIds = Array.isArray(payload.ids)
      ? payload.ids.map(Number).filter((id) => Number.isInteger(id) && id > 0 && visibleIds.has(id)).slice(0, 300)
      : [];
    const ids = action === "read-all" ? visible.filter((item) => !item.readAt).map((item) => item.id) : requestedIds;
    if (action !== "read-all" && !ids.length) return Response.json({ error: "لم تُحدّد إشعارات صالحة" }, { status: 400 });

    const db = getDb();
    const userEmail = access.user.email.trim().toLowerCase();
    const now = new Date().toISOString();
    for (const notificationId of ids) {
      await db.insert(portalNotificationReads).values({
        notificationId,
        userEmail,
        readAt: now,
        dismissedAt: action === "dismiss" ? now : null,
      }).onConflictDoUpdate({
        target: [portalNotificationReads.notificationId, portalNotificationReads.userEmail],
        set: { readAt: now, ...(action === "dismiss" ? { dismissedAt: now } : {}) },
      });
    }

    const notifications = await listPortalNotifications(access);
    return Response.json({ notifications });
  } catch {
    return Response.json({ error: "تعذّر تحديث الإشعارات" }, { status: 500 });
  }
}
