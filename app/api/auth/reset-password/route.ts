import { and, eq, gt, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { passwordResetTokens, portalAuthCredentials } from "@/db/schema";
import { hashPassword, sha256 } from "@/lib/credential-auth";
import { safeOperationalErrorCode } from "@/lib/operational-error";
import { revokePortalSessionsForUser } from "@/lib/portal-session";
import { externalRequestUrl } from "@/lib/request-origin";
import { enforcePublicRateLimit, rejectCrossSiteRequest, requestCorrelationId } from "@/lib/security";

function resetRedirect(
  request: Request,
  token: string,
  error: "invalid" | "rate-limit" | "service",
  correlationId: string,
  retryAfterSeconds = 0,
) {
  const params = new URLSearchParams({ token, error });
  if (error === "service") params.set("requestId", correlationId);
  if (retryAfterSeconds > 0) params.set("retryAfter", String(retryAfterSeconds));
  const headers = new Headers({
    location: externalRequestUrl(request, `/reset-password?${params.toString()}`).toString(),
    "cache-control": "no-store",
    "x-request-id": correlationId,
  });
  if (retryAfterSeconds > 0) headers.set("retry-after", String(retryAfterSeconds));
  return new Response(null, { status: 303, headers });
}

export async function POST(request: Request) {
  const correlationId = requestCorrelationId(request);
  let token = "";
  try {
    if (rejectCrossSiteRequest(request)) {
      return new Response(null, { status: 403, headers: { "cache-control": "no-store", "x-request-id": correlationId } });
    }
    const limit = await enforcePublicRateLimit(request, { scope: "reset-password", limit: 8, windowSeconds: 1800, blockSeconds: 1800 });
    const form = await request.formData();
    token = String(form.get("token") || "");
    if (!limit.allowed) return resetRedirect(request, token, "rate-limit", correlationId, limit.retryAfterSeconds);

    const password = String(form.get("password") || "");
    const confirmPassword = String(form.get("confirmPassword") || "");
    if (token.length < 32 || password.length < 12 || password.length > 256 || password !== confirmPassword) {
      return resetRedirect(request, token, "invalid", correlationId);
    }

    const tokenHash = await sha256(token);
    const db = getDb();
    const reset = await db.query.passwordResetTokens.findFirst({
      where: and(
        eq(passwordResetTokens.tokenHash, tokenHash),
        isNull(passwordResetTokens.usedAt),
        gt(passwordResetTokens.expiresAt, new Date().toISOString()),
      ),
    });
    if (!reset) return resetRedirect(request, token, "invalid", correlationId);

    const now = new Date().toISOString();
    await db.update(portalAuthCredentials).set({ passwordHash: await hashPassword(password), updatedAt: now })
      .where(eq(portalAuthCredentials.identifier, reset.identifier));
    await db.update(passwordResetTokens).set({ usedAt: now }).where(eq(passwordResetTokens.tokenHash, tokenHash));
    await revokePortalSessionsForUser(reset.email, "password-reset");
    return new Response(null, {
      status: 303,
      headers: {
        location: externalRequestUrl(request, "/login?reset=1").toString(),
        "cache-control": "no-store",
        "x-request-id": correlationId,
      },
    });
  } catch (error) {
    const errorCode = safeOperationalErrorCode(error, "PASSWORD_RESET_FAILED");
    console.error("[auth/reset-password] failed", { correlationId, errorCode, error });
    return resetRedirect(request, token, "service", correlationId);
  }
}
