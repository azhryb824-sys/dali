import { and, eq, gt, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { portalAccessScopes, portalAuthCredentials, portalMfaChallenges, portalUsers } from "@/db/schema";
import { getConfiguredAuthSecret, normalizePortalEmail } from "@/lib/portal-auth-config";
import { isSecureExternalRequest } from "@/lib/request-origin";
import { sha256 } from "@/lib/credential-auth";

export const MFA_CHALLENGE_COOKIE = "__Host-dali_mfa";
const MFA_DEV_CHALLENGE_COOKIE = "dali_mfa_dev";
const CHALLENGE_MINUTES = 10;
const sensitiveFunctionalRoles = new Set(["system_owner", "system_admin", "executive", "finance_director", "project_accountant"]);
const base32Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function randomBytes(length: number) {
  return crypto.getRandomValues(new Uint8Array(length));
}

function base32Encode(bytes: Uint8Array) {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += base32Alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += base32Alphabet[(value << (5 - bits)) & 31];
  return output;
}

function base32Decode(value: string) {
  let bits = 0;
  let buffer = 0;
  const bytes: number[] = [];
  for (const character of value.toUpperCase().replace(/[^A-Z2-7]/g, "")) {
    const index = base32Alphabet.indexOf(character);
    if (index < 0) continue;
    buffer = (buffer << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((buffer >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(bytes);
}

async function encryptionKey() {
  const secret = getConfiguredAuthSecret();
  if (!secret || secret.length < 32) throw new Error("AUTH_SECRET_INVALID");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`dali:mfa:${secret}`));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptMfaValue(value: string) {
  const iv = randomBytes(12);
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await encryptionKey(), new TextEncoder().encode(value));
  return `${Buffer.from(iv).toString("base64url")}.${Buffer.from(encrypted).toString("base64url")}`;
}

export async function decryptMfaValue(value: string) {
  const [ivValue, encryptedValue] = value.split(".");
  if (!ivValue || !encryptedValue) throw new Error("MFA_CIPHERTEXT_INVALID");
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(Buffer.from(ivValue, "base64url")) },
    await encryptionKey(),
    new Uint8Array(Buffer.from(encryptedValue, "base64url")),
  );
  return new TextDecoder().decode(decrypted);
}

export function generateTotpSecret() {
  return base32Encode(randomBytes(20));
}

async function totpAt(secret: string, counter: number) {
  const data = new Uint8Array(8);
  let current = counter;
  for (let index = 7; index >= 0; index -= 1) {
    data[index] = current % 256;
    current = Math.floor(current / 256);
  }
  const key = await crypto.subtle.importKey("raw", base32Decode(secret), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, data));
  const offset = digest[digest.length - 1] & 15;
  const binary = ((digest[offset] & 127) << 24) | (digest[offset + 1] << 16) | (digest[offset + 2] << 8) | digest[offset + 3];
  return String(binary % 1_000_000).padStart(6, "0");
}

function constantTimeEqual(left: string, right: string) {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  let difference = a.length ^ b.length;
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) difference |= a[index] ^ b[index];
  return difference === 0;
}

export async function verifyTotp(secret: string, code: string, now = Date.now()) {
  const normalized = code.replace(/\D/g, "");
  if (normalized.length !== 6) return false;
  const counter = Math.floor(now / 30_000);
  for (const drift of [-1, 0, 1]) if (constantTimeEqual(await totpAt(secret, counter + drift), normalized)) return true;
  return false;
}

function recoveryCode() {
  const raw = Buffer.from(randomBytes(8)).toString("hex").toUpperCase();
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}-${raw.slice(12)}`;
}

export async function recoveryHash(code: string) {
  return sha256(`dali:mfa:recovery:${getConfiguredAuthSecret()}:${code.toUpperCase().replace(/[^A-F0-9]/g, "")}`);
}

export async function generateRecoveryCodes() {
  const codes = Array.from({ length: 10 }, recoveryCode);
  return { codes, hashes: await Promise.all(codes.map(recoveryHash)) };
}

export function totpUri(secret: string, email: string) {
  const issuer = "شركة دالي";
  return `otpauth://totp/${encodeURIComponent(`${issuer}:${email}`)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

export async function userRequiresMfa(email: string) {
  const normalized = normalizePortalEmail(email);
  const db = getDb();
  const user = await db.query.portalUsers.findFirst({ where: eq(portalUsers.email, normalized) });
  if (!user) return false;
  if (user.role === "admin" || user.role === "manager" || user.department === "finance") return true;
  const scopes = await db.select({ role: portalAccessScopes.functionalRole }).from(portalAccessScopes)
    .where(and(eq(portalAccessScopes.userEmail, normalized), eq(portalAccessScopes.active, true)));
  return scopes.some((scope) => sensitiveFunctionalRoles.has(scope.role));
}

function tokenFromCookieHeader(cookieHeader: string | null) {
  const parts = (cookieHeader || "").split(";").map((part) => part.trim());
  for (const name of [MFA_CHALLENGE_COOKIE, MFA_DEV_CHALLENGE_COOKIE]) {
    const match = parts.find((part) => part.startsWith(`${name}=`));
    if (match) {
      try { return decodeURIComponent(match.slice(match.indexOf("=") + 1)); } catch { return ""; }
    }
  }
  return "";
}

export function mfaChallengeCookie(request: Request, token: string) {
  const secure = isSecureExternalRequest(request);
  const name = secure ? MFA_CHALLENGE_COOKIE : MFA_DEV_CHALLENGE_COOKIE;
  return `${name}=${encodeURIComponent(token)}; Path=/login/mfa; HttpOnly; SameSite=Strict; Max-Age=${CHALLENGE_MINUTES * 60}${secure ? "; Secure" : ""}; Priority=High`;
}

export function clearMfaChallengeCookies(request: Request) {
  const secure = isSecureExternalRequest(request);
  return [MFA_CHALLENGE_COOKIE, MFA_DEV_CHALLENGE_COOKIE].map((name) => `${name}=; Path=/login/mfa; HttpOnly; SameSite=Strict; Max-Age=0${secure && name === MFA_CHALLENGE_COOKIE ? "; Secure" : ""}; Priority=High`);
}

export async function createMfaChallenge(credential: typeof portalAuthCredentials.$inferSelect, request: Request, returnTo: string) {
  const token = Buffer.from(randomBytes(32)).toString("hex");
  const purpose = credential.mfaEnabledAt && credential.mfaSecretEncrypted ? "verify" : "enroll";
  let pendingSecretEncrypted: string | null = null;
  let pendingRecoveryHashesJson: string | null = null;
  let pendingRecoveryCodesEncrypted: string | null = null;
  if (purpose === "enroll") {
    const secret = generateTotpSecret();
    const recovery = await generateRecoveryCodes();
    [pendingSecretEncrypted, pendingRecoveryCodesEncrypted] = await Promise.all([
      encryptMfaValue(secret), encryptMfaValue(JSON.stringify(recovery.codes)),
    ]);
    pendingRecoveryHashesJson = JSON.stringify(recovery.hashes);
  }
  const now = new Date();
  await getDb().insert(portalMfaChallenges).values({
    id: crypto.randomUUID(), tokenHash: await sha256(token), identifier: credential.identifier, purpose,
    pendingSecretEncrypted, pendingRecoveryHashesJson, pendingRecoveryCodesEncrypted, returnTo,
    expiresAt: new Date(now.getTime() + CHALLENGE_MINUTES * 60_000).toISOString(), createdAt: now.toISOString(),
  });
  return { token, purpose } as const;
}

export async function readMfaChallenge(request: Request) {
  const token = tokenFromCookieHeader(request.headers.get("cookie"));
  if (!token) return null;
  return getDb().query.portalMfaChallenges.findFirst({
    where: and(eq(portalMfaChallenges.tokenHash, await sha256(token)), isNull(portalMfaChallenges.usedAt), gt(portalMfaChallenges.expiresAt, new Date().toISOString())),
  });
}
