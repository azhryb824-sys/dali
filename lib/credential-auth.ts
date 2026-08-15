import { headers } from "next/headers";

export const IDENTITY_COOKIE = "__Host-dali_identity";
const DEV_IDENTITY_COOKIE = "dali_identity_dev";
const SESSION_SECONDS = 8 * 60 * 60;

type Identity = { email: string; displayName: string; exp: number };

function bytesToBase64Url(bytes: Uint8Array) {
  return Buffer.from(bytes).toString("base64url");
}

function base64UrlToBytes(value: string) {
  return new Uint8Array(Buffer.from(value, "base64url"));
}

async function hmac(value: string) {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("AUTH_SECRET must contain at least 32 characters.");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
}

export async function createIdentityToken(email: string, displayName: string) {
  const payload = bytesToBase64Url(new TextEncoder().encode(JSON.stringify({
    email: email.trim().toLowerCase(),
    displayName: displayName.trim() || email,
    exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS,
  } satisfies Identity)));
  return `${payload}.${bytesToBase64Url(await hmac(payload))}`;
}

export async function readCredentialIdentity() {
  const requestHeaders = await headers();
  const cookieHeader = requestHeaders.get("cookie") || "";
  const token = [IDENTITY_COOKIE, DEV_IDENTITY_COOKIE]
    .map((name) => cookieHeader.split(";").map((item) => item.trim()).find((item) => item.startsWith(`${name}=`)))
    .find(Boolean)?.split("=").slice(1).join("=");
  if (!token) return null;
  const [payload, signature] = decodeURIComponent(token).split(".");
  if (!payload || !signature) return null;
  const expected = await hmac(payload);
  const received = base64UrlToBytes(signature);
  let difference = expected.length ^ received.length;
  for (let index = 0; index < Math.min(expected.length, received.length); index += 1) difference |= expected[index] ^ received[index];
  if (difference !== 0) return null;
  try {
    const identity = JSON.parse(new TextDecoder().decode(base64UrlToBytes(payload))) as Identity;
    if (!identity.email || identity.exp <= Math.floor(Date.now() / 1000)) return null;
    return identity;
  } catch {
    return null;
  }
}

export function identityCookie(request: Request, token: string) {
  const secure = new URL(request.url).protocol === "https:";
  const name = secure ? IDENTITY_COOKIE : DEV_IDENTITY_COOKIE;
  return `${name}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_SECONDS}${secure ? "; Secure" : ""}; Priority=High`;
}

export function clearIdentityCookies(request: Request) {
  const secure = new URL(request.url).protocol === "https:";
  return [IDENTITY_COOKIE, DEV_IDENTITY_COOKIE].map((name) => `${name}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure && name === IDENTITY_COOKIE ? "; Secure" : ""}; Priority=High`);
}

export async function verifyConfiguredPassword(password: string) {
  const encoded = process.env.PORTAL_ADMIN_PASSWORD_HASH || "";
  const [algorithm, iterationsValue, saltValue, expectedValue] = encoded.split("$");
  const iterations = Number(iterationsValue);
  if (algorithm !== "pbkdf2" || !Number.isInteger(iterations) || iterations < 210_000 || !saltValue || !expectedValue) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const derived = new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: base64UrlToBytes(saltValue), iterations }, key, 256));
  const expected = base64UrlToBytes(expectedValue);
  if (derived.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < derived.length; index += 1) difference |= derived[index] ^ expected[index];
  return difference === 0;
}
