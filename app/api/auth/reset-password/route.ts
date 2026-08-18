import { and, eq, gt, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { passwordResetTokens, portalAuthCredentials } from "@/db/schema";
import { hashPassword, sha256 } from "@/lib/credential-auth";
import { revokePortalSessionsForUser } from "@/lib/portal-session";
import { enforcePublicRateLimit, rateLimitResponse, rejectCrossSiteRequest } from "@/lib/security";

export async function POST(request: Request) {
  if (rejectCrossSiteRequest(request)) return new Response(null, { status: 403 });
  const limit = await enforcePublicRateLimit(request, { scope: "reset-password", limit: 8, windowSeconds: 1800, blockSeconds: 1800 });
  if (!limit.allowed) return rateLimitResponse(limit.retryAfterSeconds);
  const form = await request.formData();
  const token = String(form.get("token") || "");
  const password = String(form.get("password") || "");
  const confirmPassword = String(form.get("confirmPassword") || "");
  const fail = () => Response.redirect(new URL(`/reset-password?token=${encodeURIComponent(token)}&error=1`, request.url), 303);
  if (token.length < 32 || password.length < 12 || password.length > 256 || password !== confirmPassword) return fail();
  const tokenHash = await sha256(token);
  const db = getDb();
  const reset = await db.query.passwordResetTokens.findFirst({ where: and(eq(passwordResetTokens.tokenHash, tokenHash), isNull(passwordResetTokens.usedAt), gt(passwordResetTokens.expiresAt, new Date().toISOString())) });
  if (!reset) return fail();
  const now = new Date().toISOString();
  await db.update(portalAuthCredentials).set({ passwordHash: await hashPassword(password), updatedAt: now }).where(eq(portalAuthCredentials.identifier, reset.identifier));
  await db.update(passwordResetTokens).set({ usedAt: now }).where(eq(passwordResetTokens.tokenHash, tokenHash));
  await revokePortalSessionsForUser(reset.email, "password-reset");
  return Response.redirect(new URL("/login?reset=1", request.url), 303);
}
