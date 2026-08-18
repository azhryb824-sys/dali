import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { passwordResetTokens, portalAuthCredentials } from "@/db/schema";
import { sha256 } from "@/lib/credential-auth";
import { sendPasswordResetEmail } from "@/lib/email-delivery";
import { enforcePublicRateLimit, rateLimitResponse, rejectCrossSiteRequest } from "@/lib/security";

export async function POST(request: Request) {
  if (rejectCrossSiteRequest(request)) return new Response(null, { status: 403 });
  const limit = await enforcePublicRateLimit(request, { scope: "forgot-password", limit: 5, windowSeconds: 1800, blockSeconds: 1800 });
  if (!limit.allowed) return rateLimitResponse(limit.retryAfterSeconds);
  const form = await request.formData();
  const identifier = String(form.get("identifier") || "").replace(/\D/g, "");
  const db = getDb();
  let credential = /^\d{10}$/.test(identifier) ? await db.query.portalAuthCredentials.findFirst({ where: eq(portalAuthCredentials.identifier, identifier) }) : null;
  const bootstrapIdentifier = (process.env.PORTAL_ADMIN_IDENTIFIER || process.env.PORTAL_ADMIN_ID || "").replace(/\D/g, "");
  const bootstrapEmail = (process.env.PORTAL_ADMIN_EMAIL || process.env.PORTAL_ADMIN_EMAILS?.split(",")[0] || "").trim().toLowerCase();
  if (!credential && identifier === bootstrapIdentifier && bootstrapEmail && process.env.PORTAL_ADMIN_PASSWORD_HASH) {
    await db.insert(portalAuthCredentials).values({ identifier, email: bootstrapEmail, displayName: process.env.PORTAL_ADMIN_NAME || "مدير النظام", passwordHash: process.env.PORTAL_ADMIN_PASSWORD_HASH }).onConflictDoNothing();
    credential = await db.query.portalAuthCredentials.findFirst({ where: eq(portalAuthCredentials.identifier, identifier) }) || null;
  }
  if (credential) {
    const token = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
    const tokenHash = await sha256(token);
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    await db.insert(passwordResetTokens).values({ tokenHash, identifier, email: credential.email, expiresAt });
    const resetUrl = new URL(`/reset-password?token=${encodeURIComponent(token)}`, request.url).toString();
    await sendPasswordResetEmail({ to: credential.email, recipientName: credential.displayName, resetUrl, idempotencyKey: `password-reset-${tokenHash.slice(0, 32)}` }).catch((error) => console.error("password-reset-email-failed", error));
  }
  return Response.redirect(new URL("/forgot-password?sent=1", request.url), 303);
}
