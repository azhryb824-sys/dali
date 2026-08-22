import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { portalAuthCredentials, portalUsers } from "@/db/schema";
import { createIdentityToken, identityCookie, verifyPasswordHash } from "@/lib/credential-auth";
import { OperationalError, safeOperationalErrorCode } from "@/lib/operational-error";
import { getPortalAdminConfig, normalizePortalEmail, normalizePortalIdentifier } from "@/lib/portal-auth-config";
import { externalRequestUrl } from "@/lib/request-origin";
import { enforcePublicRateLimit, rejectCrossSiteRequest, requestCorrelationId } from "@/lib/security";
import { createMfaChallenge, mfaChallengeCookie, userRequiresMfa } from "@/lib/portal-mfa";

function safePortalReturnPath(value: string) {
  return value.startsWith("/portal") && !value.startsWith("//") ? value : "/portal";
}

function loginRedirect(
  request: Request,
  returnTo: string,
  error: "credentials" | "rate-limit" | "service",
  correlationId: string,
  options: { retryAfterSeconds?: number; stage?: string } = {},
) {
  const params = new URLSearchParams({ error, returnTo });
  if (error === "service") params.set("requestId", correlationId);
  if (error === "service" && options.stage) params.set("stage", options.stage);
  if (options.retryAfterSeconds) params.set("retryAfter", String(options.retryAfterSeconds));
  const headers = new Headers({
    location: externalRequestUrl(request, `/login?${params.toString()}`).toString(),
    "cache-control": "no-store",
    "x-request-id": correlationId,
  });
  if (options.retryAfterSeconds) headers.set("retry-after", String(options.retryAfterSeconds));
  return new Response(null, { status: 303, headers });
}

export async function POST(request: Request) {
  const correlationId = requestCorrelationId(request);
  let stage = "request";
  try {
    if (rejectCrossSiteRequest(request)) {
      return new Response(null, { status: 403, headers: { "cache-control": "no-store", "x-request-id": correlationId } });
    }

    const requested = String((await request.clone().formData()).get("returnTo") || "/portal");
    const returnTo = safePortalReturnPath(requested);
    const limit = await enforcePublicRateLimit(request, { scope: "portal-login", limit: 8, windowSeconds: 900, blockSeconds: 900 });
    if (!limit.allowed) return loginRedirect(request, returnTo, "rate-limit", correlationId, { retryAfterSeconds: limit.retryAfterSeconds });

    const form = await request.formData();
    const identifier = normalizePortalIdentifier(String(form.get("identifier") || ""));
    const password = String(form.get("password") || "");
    if (!/^\d{10}$/.test(identifier)) return loginRedirect(request, returnTo, "credentials", correlationId);

    stage = "credential-read";
    const db = getDb();
    const adminConfig = getPortalAdminConfig();
    const stored = await db.query.portalAuthCredentials.findFirst({ where: eq(portalAuthCredentials.identifier, identifier) });
    let credential = stored || null;
    let authenticated = stored ? await verifyPasswordHash(password, stored.passwordHash) : false;

    if (stored && identifier === adminConfig.identifier && adminConfig.complete
      && normalizePortalEmail(stored.email) === adminConfig.primaryEmail
      && await verifyPasswordHash(password, adminConfig.passwordHash)) {
      const [synchronized] = await db.update(portalAuthCredentials).set({
        email: adminConfig.primaryEmail,
        displayName: adminConfig.displayName,
        passwordHash: adminConfig.passwordHash,
        updatedAt: new Date().toISOString(),
      }).where(eq(portalAuthCredentials.identifier, identifier)).returning();
      credential = synchronized || stored;
      authenticated = true;
    }

    if (!stored && identifier === adminConfig.identifier) {
      if (!adminConfig.complete) throw new OperationalError("PORTAL_ADMIN_BOOTSTRAP_INCOMPLETE");
      if (await verifyPasswordHash(password, adminConfig.passwordHash)) {
        await db.insert(portalAuthCredentials).values({
          identifier,
          email: adminConfig.primaryEmail,
          displayName: adminConfig.displayName,
          passwordHash: adminConfig.passwordHash,
        }).onConflictDoNothing();
        credential = await db.query.portalAuthCredentials.findFirst({ where: eq(portalAuthCredentials.identifier, identifier) }) || null;
        authenticated = Boolean(
          credential
          && normalizePortalEmail(credential.email) === adminConfig.primaryEmail
          && await verifyPasswordHash(password, credential.passwordHash),
        );
        if (!credential || !authenticated) throw new OperationalError("PORTAL_ADMIN_BOOTSTRAP_CONFLICT");
      }
    }

    if (!credential || !authenticated) return loginRedirect(request, returnTo, "credentials", correlationId);

    const email = normalizePortalEmail(credential.email);
    const displayName = credential.displayName.trim() || email;
    if (!email) throw new OperationalError("PORTAL_CREDENTIAL_EMAIL_INVALID");

    stage = "user-sync";
    if (adminConfig.emails.has(email)) {
      const now = new Date().toISOString();
      await db.insert(portalUsers).values({
        email,
        displayName,
        role: "admin",
        department: "general",
        status: "active",
        lastLoginAt: now,
        lastActivityAt: now,
        updatedAt: now,
      }).onConflictDoUpdate({
        target: portalUsers.email,
        set: {
          displayName,
          role: "admin",
          department: "general",
          status: "active",
          lastLoginAt: now,
          lastActivityAt: now,
          updatedAt: now,
        },
      });
    }

    stage = "mfa-policy";
    if (await userRequiresMfa(email)) {
      stage = "mfa-challenge";
      const challenge = await createMfaChallenge(credential, request, returnTo);
      return new Response(null, {
        status: 303,
        headers: {
          location: externalRequestUrl(request, `/login/mfa?returnTo=${encodeURIComponent(returnTo)}&mode=${challenge.purpose}`).toString(),
          "set-cookie": mfaChallengeCookie(request, challenge.token),
          "cache-control": "no-store",
          "x-request-id": correlationId,
        },
      });
    }

    stage = "identity-token";
    const token = await createIdentityToken(email, displayName);
    return new Response(null, {
      status: 303,
      headers: {
        location: externalRequestUrl(request, returnTo).toString(),
        "set-cookie": identityCookie(request, token),
        "cache-control": "no-store",
        "x-request-id": correlationId,
      },
    });
  } catch (error) {
    const errorCode = safeOperationalErrorCode(error, "PORTAL_LOGIN_FAILED");
    console.error("[auth/login] failed", { correlationId, stage, errorCode, error });
    return loginRedirect(request, "/portal", "service", correlationId, { stage });
  }
}
