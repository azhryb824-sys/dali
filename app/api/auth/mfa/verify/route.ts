import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { portalAuthCredentials, portalMfaChallenges } from "@/db/schema";
import { createIdentityToken, identityCookie } from "@/lib/credential-auth";
import { auditPortalAction } from "@/lib/audit";
import { externalRequestUrl } from "@/lib/request-origin";
import { enforcePublicRateLimit, rejectCrossSiteRequest, requestCorrelationId } from "@/lib/security";
import { clearMfaChallengeCookies, decryptMfaValue, readMfaChallenge, recoveryHash, verifyTotp } from "@/lib/portal-mfa";

function safeReturnTo(value: FormDataEntryValue | null) {
  const path = String(value || "/portal");
  return path.startsWith("/portal") && !path.startsWith("//") ? path : "/portal";
}

function redirectMfa(request: Request, returnTo: string, mode: string, error: "code" | "attempts") {
  const url = externalRequestUrl(request, `/login/mfa?returnTo=${encodeURIComponent(returnTo)}&mode=${mode}&error=${error}`);
  return new Response(null, { status: 303, headers: { location: url.toString(), "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  const correlationId = requestCorrelationId(request);
  if (rejectCrossSiteRequest(request)) return new Response(null, { status: 403, headers: { "cache-control": "no-store" } });
  const limit = await enforcePublicRateLimit(request, { scope: "portal-mfa", limit: 8, windowSeconds: 600, blockSeconds: 900 });
  if (!limit.allowed) return redirectMfa(request, "/portal", "verify", "attempts");
  const form = await request.formData();
  const returnTo = safeReturnTo(form.get("returnTo"));
  const code = String(form.get("code") || "").trim();
  const challenge = await readMfaChallenge(request);
  if (!challenge) return Response.redirect(externalRequestUrl(request, "/login?error=mfa-expired"), 303);
  if (challenge.attempts >= 8) return redirectMfa(request, returnTo, challenge.purpose, "attempts");

  const db = getDb();
  const credential = await db.query.portalAuthCredentials.findFirst({ where: eq(portalAuthCredentials.identifier, challenge.identifier) });
  if (!credential) return Response.redirect(externalRequestUrl(request, "/login?error=credentials"), 303);
  const secretEncrypted = challenge.purpose === "enroll" ? challenge.pendingSecretEncrypted : credential.mfaSecretEncrypted;
  const validTotp = secretEncrypted ? await verifyTotp(await decryptMfaValue(secretEncrypted), code) : false;
  let recoveryIndex = -1;
  let recoveryHashes: string[] = [];
  if (!validTotp && challenge.purpose === "verify" && credential.mfaRecoveryHashesJson) {
    try { recoveryHashes = JSON.parse(credential.mfaRecoveryHashesJson) as string[]; } catch { recoveryHashes = []; }
    const candidate = await recoveryHash(code);
    recoveryIndex = recoveryHashes.findIndex((hash) => hash === candidate);
  }
  if (!validTotp && recoveryIndex < 0) {
    const attempts = challenge.attempts + 1;
    await db.update(portalMfaChallenges).set({ attempts, ...(attempts >= 8 ? { usedAt: new Date().toISOString() } : {}) })
      .where(and(eq(portalMfaChallenges.id, challenge.id), isNull(portalMfaChallenges.usedAt)));
    return redirectMfa(request, returnTo, challenge.purpose, attempts >= 8 ? "attempts" : "code");
  }

  const now = new Date().toISOString();
  await db.transaction(async (tx) => {
    const [claimed] = await tx.update(portalMfaChallenges).set({ usedAt: now })
      .where(and(eq(portalMfaChallenges.id, challenge.id), isNull(portalMfaChallenges.usedAt))).returning({ id: portalMfaChallenges.id });
    if (!claimed) throw new Error("MFA_CHALLENGE_REPLAYED");
    if (challenge.purpose === "enroll") {
      if (!challenge.pendingSecretEncrypted || !challenge.pendingRecoveryHashesJson) throw new Error("MFA_ENROLLMENT_INCOMPLETE");
      await tx.update(portalAuthCredentials).set({
        mfaSecretEncrypted: challenge.pendingSecretEncrypted,
        mfaEnabledAt: now,
        mfaRecoveryHashesJson: challenge.pendingRecoveryHashesJson,
        mfaRecoveryGeneratedAt: now,
        mfaLastVerifiedAt: now,
        updatedAt: now,
      }).where(eq(portalAuthCredentials.identifier, credential.identifier));
    } else {
      if (recoveryIndex >= 0) recoveryHashes.splice(recoveryIndex, 1);
      await tx.update(portalAuthCredentials).set({
        mfaLastVerifiedAt: now,
        ...(recoveryIndex >= 0 ? { mfaRecoveryHashesJson: JSON.stringify(recoveryHashes) } : {}),
        updatedAt: now,
      }).where(eq(portalAuthCredentials.identifier, credential.identifier));
    }
  });

  await auditPortalAction({ actorEmail: credential.email, action: challenge.purpose === "enroll" ? "mfa-enrolled" : "mfa-verified", entityType: "portal-credential", entityId: credential.identifier, source: "security", correlationId, after: { recoveryCodeUsed: recoveryIndex >= 0 } });
  const headers = new Headers({ location: externalRequestUrl(request, returnTo).toString(), "cache-control": "no-store", "x-request-id": correlationId });
  headers.append("set-cookie", identityCookie(request, await createIdentityToken(credential.email, credential.displayName, "mfa")));
  for (const cookie of clearMfaChallengeCookies(request)) headers.append("set-cookie", cookie);
  return new Response(null, { status: 303, headers });
}
