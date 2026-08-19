import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { passwordResetTokens, portalAuthCredentials } from "@/db/schema";
import { sha256 } from "@/lib/credential-auth";
import { sendPasswordResetEmail } from "@/lib/email-delivery";
import { OperationalError, safeOperationalErrorCode } from "@/lib/operational-error";
import { getPortalAdminConfig, normalizePortalIdentifier } from "@/lib/portal-auth-config";
import { externalRequestUrl } from "@/lib/request-origin";
import { enforcePublicRateLimit, rejectCrossSiteRequest, requestCorrelationId } from "@/lib/security";

function forgotPasswordRedirect(request: Request, params: Record<string, string>, correlationId: string, retryAfterSeconds = 0) {
  const headers = new Headers({
    location: externalRequestUrl(request, `/forgot-password?${new URLSearchParams(params).toString()}`).toString(),
    "cache-control": "no-store",
    "x-request-id": correlationId,
  });
  if (retryAfterSeconds > 0) headers.set("retry-after", String(retryAfterSeconds));
  return new Response(null, { status: 303, headers });
}

export async function POST(request: Request) {
  const correlationId = requestCorrelationId(request);
  try {
    if (rejectCrossSiteRequest(request)) {
      return new Response(null, { status: 403, headers: { "cache-control": "no-store", "x-request-id": correlationId } });
    }
    const limit = await enforcePublicRateLimit(request, { scope: "forgot-password", limit: 5, windowSeconds: 1800, blockSeconds: 1800 });
    if (!limit.allowed) {
      return forgotPasswordRedirect(request, { error: "rate-limit", retryAfter: String(limit.retryAfterSeconds) }, correlationId, limit.retryAfterSeconds);
    }

    const form = await request.formData();
    const identifier = normalizePortalIdentifier(String(form.get("identifier") || ""));
    const db = getDb();
    let credential = /^\d{10}$/.test(identifier)
      ? await db.query.portalAuthCredentials.findFirst({ where: eq(portalAuthCredentials.identifier, identifier) })
      : null;
    const adminConfig = getPortalAdminConfig();

    if (!credential && identifier === adminConfig.identifier) {
      if (!adminConfig.complete) throw new OperationalError("PORTAL_ADMIN_BOOTSTRAP_INCOMPLETE");
      await db.insert(portalAuthCredentials).values({
        identifier,
        email: adminConfig.primaryEmail,
        displayName: adminConfig.displayName,
        passwordHash: adminConfig.passwordHash,
      }).onConflictDoNothing();
      credential = await db.query.portalAuthCredentials.findFirst({ where: eq(portalAuthCredentials.identifier, identifier) }) || null;
      if (!credential) throw new OperationalError("PORTAL_ADMIN_BOOTSTRAP_CONFLICT");
    }

    if (credential) {
      const token = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
      const tokenHash = await sha256(token);
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      await db.insert(passwordResetTokens).values({ tokenHash, identifier, email: credential.email, expiresAt });
      const resetUrl = externalRequestUrl(request, `/reset-password?token=${encodeURIComponent(token)}`).toString();
      await sendPasswordResetEmail({
        to: credential.email,
        recipientName: credential.displayName,
        resetUrl,
        idempotencyKey: `password-reset-${tokenHash.slice(0, 32)}`,
      }).catch((error) => console.error("[auth/forgot-password] email delivery failed", { correlationId, error }));
    }

    return forgotPasswordRedirect(request, { sent: "1" }, correlationId);
  } catch (error) {
    const errorCode = safeOperationalErrorCode(error, "PASSWORD_RESET_REQUEST_FAILED");
    console.error("[auth/forgot-password] failed", { correlationId, errorCode, error });
    return forgotPasswordRedirect(request, { error: "service", requestId: correlationId }, correlationId);
  }
}
