import { createIdentityToken, identityCookie, verifyConfiguredPassword } from "@/lib/credential-auth";
import { enforcePublicRateLimit, rateLimitResponse, rejectCrossSiteRequest } from "@/lib/security";

export async function POST(request: Request) {
  if (rejectCrossSiteRequest(request)) return new Response(null, { status: 403 });
  const limit = await enforcePublicRateLimit(request, { scope: "portal-login", limit: 8, windowSeconds: 900, blockSeconds: 900 });
  if (!limit.allowed) return rateLimitResponse(limit.retryAfterSeconds);
  const form = await request.formData();
  const email = String(form.get("email") || "").trim().toLowerCase();
  const password = String(form.get("password") || "");
  const configuredEmail = (process.env.PORTAL_ADMIN_EMAIL || process.env.PORTAL_ADMIN_EMAILS?.split(",")[0] || "").trim().toLowerCase();
  const requested = String(form.get("returnTo") || "/portal");
  const returnTo = requested.startsWith("/portal") && !requested.startsWith("//") ? requested : "/portal";
  if (!configuredEmail || email !== configuredEmail || !(await verifyConfiguredPassword(password))) {
    return Response.redirect(new URL(`/login?error=1&returnTo=${encodeURIComponent(returnTo)}`, request.url), 303);
  }
  const token = await createIdentityToken(email, process.env.PORTAL_ADMIN_NAME || "مدير النظام");
  return new Response(null, { status: 303, headers: { location: new URL(returnTo, request.url).toString(), "set-cookie": identityCookie(request, token), "cache-control": "no-store" } });
}
