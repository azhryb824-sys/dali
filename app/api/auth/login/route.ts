import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { portalAuthCredentials } from "@/db/schema";
import { createIdentityToken, identityCookie, verifyConfiguredPassword, verifyPasswordHash } from "@/lib/credential-auth";
import { enforcePublicRateLimit, rateLimitResponse, rejectCrossSiteRequest } from "@/lib/security";

export async function POST(request: Request) {
  try {
    if (rejectCrossSiteRequest(request)) return new Response(null, { status: 403 });
    const limit = await enforcePublicRateLimit(request, { scope: "portal-login", limit: 8, windowSeconds: 900, blockSeconds: 900 });
    if (!limit.allowed) return rateLimitResponse(limit.retryAfterSeconds);
    const form = await request.formData();
    const identifier = String(form.get("identifier") || "").trim();
    const password = String(form.get("password") || "");
    const configuredEmail = (process.env.PORTAL_ADMIN_EMAIL || process.env.PORTAL_ADMIN_EMAILS?.split(",")[0] || "").trim().toLowerCase();
    const configuredIdentifier = (process.env.PORTAL_ADMIN_IDENTIFIER || process.env.PORTAL_ADMIN_ID || "").replace(/\D/g, "");
    const requested = String(form.get("returnTo") || "/portal");
    const returnTo = requested.startsWith("/portal") && !requested.startsWith("//") ? requested : "/portal";
    
    const db = getDb();
    const stored = /^\d{10}$/.test(identifier) ? await db.query.portalAuthCredentials.findFirst({ where: eq(portalAuthCredentials.identifier, identifier) }) : null;
    const validStored = stored ? await verifyPasswordHash(password, stored.passwordHash) : false;
    const validBootstrap = !stored && identifier === configuredIdentifier && Boolean(configuredEmail) && await verifyConfiguredPassword(password);
    
    if (!/^\d{10}$/.test(identifier) || (!validStored && !validBootstrap)) {
      return Response.redirect(new URL(`/login?error=1&returnTo=${encodeURIComponent(returnTo)}`, request.url), 303);
    }
    
    const email = stored?.email || configuredEmail;
    const displayName = stored?.displayName || process.env.PORTAL_ADMIN_NAME || "مدير النظام";
    if (!stored) await db.insert(portalAuthCredentials).values({ identifier, email, displayName, passwordHash: process.env.PORTAL_ADMIN_PASSWORD_HASH! }).onConflictDoNothing();
    
    const token = await createIdentityToken(email, displayName);
    return new Response(null, { status: 303, headers: { location: new URL(returnTo, request.url).toString(), "set-cookie": identityCookie(request, token), "cache-control": "no-store" } });
  } catch (error) {
    console.error("[auth/login] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "تعذّر معالجة طلب تسجيل الدخول";
    return new Response(JSON.stringify({ error: errorMessage }), { 
      status: 500,
      headers: { "content-type": "application/json" }
    });
  }
}
