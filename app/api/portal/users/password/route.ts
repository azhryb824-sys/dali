import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { passwordResetTokens, portalAuthCredentials, portalUsers } from "@/db/schema";
import { auditPortalAction } from "@/lib/audit";
import { hashPassword } from "@/lib/credential-auth";
import { requirePortalApiRole } from "@/lib/portal-access";
import { emitPortalNotification } from "@/lib/portal-notifications";
import { revokePortalSessionsForUser } from "@/lib/portal-session";
import { jsonNoStore, readLimitedJson, rejectCrossSiteRequest, requestCorrelationId, requestSourceHash } from "@/lib/security";

function strongTemporaryPassword(password: string) {
  return password.length >= 12
    && password.length <= 128
    && /[a-z]/.test(password)
    && /[A-Z]/.test(password)
    && /\d/.test(password)
    && /[^A-Za-z0-9]/.test(password);
}

export async function POST(request: Request) {
  const correlationId = requestCorrelationId(request);
  if (rejectCrossSiteRequest(request)) return jsonNoStore({ error: "مصدر الطلب غير مسموح" }, { status: 403 });

  const access = await requirePortalApiRole(["admin", "manager", "employee"]);
  const canResetPasswords = Boolean(
    access
    && (access.role === "admin"
      || access.functionalRoles.includes("system_owner")
      || access.functionalRoles.includes("system_admin")),
  );
  if (!access || !canResetPasswords) {
    return jsonNoStore({ error: "إعادة تعيين كلمة المرور متاحة للمالك ومشرف النظام فقط" }, { status: 403 });
  }

  try {
    const parsed = await readLimitedJson(request, 2_000);
    if (!parsed.ok) return parsed.response;
    const payload = parsed.value as Record<string, unknown>;
    const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
    const temporaryPassword = typeof payload.temporaryPassword === "string" ? payload.temporaryPassword : "";

    if (!email || email === access.user.email.toLowerCase()) {
      return jsonNoStore({ error: "اختر مستخدمًا آخر لإعادة تعيين كلمة مروره" }, { status: 400 });
    }
    if (!strongTemporaryPassword(temporaryPassword)) {
      return jsonNoStore({ error: "كلمة المرور المؤقتة يجب أن تكون من 12 خانة على الأقل وتضم حرفًا كبيرًا وصغيرًا ورقمًا ورمزًا" }, { status: 400 });
    }

    const db = getDb();
    const targetUser = await db.query.portalUsers.findFirst({ where: eq(portalUsers.email, email) });
    if (!targetUser) return jsonNoStore({ error: "المستخدم غير موجود" }, { status: 404 });

    const passwordHash = await hashPassword(temporaryPassword);
    const now = new Date().toISOString();
    const updated = await db.transaction(async (tx) => {
      const [credential] = await tx.update(portalAuthCredentials).set({
        passwordHash,
        mustChangePassword: true,
        passwordChangedAt: null,
        updatedAt: now,
      }).where(eq(portalAuthCredentials.email, email)).returning({
        identifier: portalAuthCredentials.identifier,
        email: portalAuthCredentials.email,
      });
      if (!credential) return null;
      await tx.update(passwordResetTokens).set({ usedAt: now }).where(and(
        eq(passwordResetTokens.email, email),
        isNull(passwordResetTokens.usedAt),
      ));
      return credential;
    });
    if (!updated) return jsonNoStore({ error: "لا توجد بيانات دخول مرتبطة بهذا المستخدم" }, { status: 404 });

    await revokePortalSessionsForUser(email, "administrator-password-reset");
    await auditPortalAction({
      actorEmail: access.user.email,
      action: "portal-user-temporary-password-set",
      entityType: "portal-user",
      entityId: email,
      after: { email, mustChangePassword: true, sessionsRevoked: true },
      reason: "إعادة تعيين إدارية مع إلزام التغيير عند أول دخول",
      source: "security",
      correlationId,
      ipHash: await requestSourceHash(request),
    });
    await emitPortalNotification({
      eventType: "portal-user-password-reset",
      title: "أُعيد تعيين كلمة مرور حسابك",
      message: "استخدم كلمة المرور المؤقتة التي سلّمها لك مشرف النظام، ثم عيّن كلمة مرور دائمة عند أول دخول.",
      severity: "warning",
      module: "users",
      entityType: "portal-user",
      entityId: email,
      actionView: "overview",
      targetEmail: email,
    }).catch(() => undefined);

    return jsonNoStore({ ok: true, email, mustChangePassword: true, sessionsRevoked: true });
  } catch (error) {
    console.error("portal-user-password-reset-failed", { correlationId, error });
    return jsonNoStore({ error: "تعذّرت إعادة تعيين كلمة المرور", correlationId }, { status: 500 });
  }
}
