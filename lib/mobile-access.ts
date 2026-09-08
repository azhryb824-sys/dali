import type { MobilePlatform } from "@/lib/mobile-entry";
import { getConfiguredAuthSecret } from "@/lib/portal-auth-config";
import { isSecureExternalRequest } from "@/lib/request-origin";

export const MOBILE_ACCESS_COOKIE = "__Host-dali_mobile_access";
const MOBILE_DEV_ACCESS_COOKIE = "dali_mobile_access_dev";
export const MOBILE_ACCESS_SECONDS = 8 * 60 * 60;
const TOKEN_PART_PATTERN = /^[A-Za-z0-9_-]+$/;

type MobileAccessPayload = {
  version: 1;
  platform: MobilePlatform;
  nonce: string;
  expiresAt: number;
};

function encodeBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

function decodeBase64Url(value: string) {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function configuredSecret() {
  const secret = getConfiguredAuthSecret();
  if (!secret || secret.length < 32) throw new Error("AUTH_SECRET_INVALID");
  return secret;
}

async function sign(value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(configuredSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
}

function signaturesMatch(expected: Uint8Array, received: Uint8Array) {
  let difference = expected.length ^ received.length;
  for (let index = 0; index < Math.min(expected.length, received.length); index += 1) {
    difference |= expected[index] ^ received[index];
  }
  return difference === 0;
}

function cookieValue(cookieHeader: string | null, name: string) {
  const item = (cookieHeader || "").split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  if (!item) return "";
  try {
    return decodeURIComponent(item.slice(item.indexOf("=") + 1));
  } catch {
    return "";
  }
}

export async function issueMobileAccessToken(platform: MobilePlatform) {
  const payload: MobileAccessPayload = {
    version: 1,
    platform,
    nonce: encodeBase64Url(crypto.getRandomValues(new Uint8Array(18))),
    expiresAt: Math.floor(Date.now() / 1000) + MOBILE_ACCESS_SECONDS,
  };
  const encodedPayload = encodeBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  return `${encodedPayload}.${encodeBase64Url(await sign(encodedPayload))}`;
}

export async function verifyMobileAccessToken(token: string) {
  if (!token || token.length > 1200) return null;
  const parts = token.split(".");
  if (parts.length !== 2 || parts.some((part) => !part || !TOKEN_PART_PATTERN.test(part))) return null;
  const [encodedPayload, encodedSignature] = parts;
  let receivedSignature: Uint8Array;
  try {
    receivedSignature = decodeBase64Url(encodedSignature);
  } catch {
    return null;
  }
  if (!signaturesMatch(await sign(encodedPayload), receivedSignature)) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(decodeBase64Url(encodedPayload))) as MobileAccessPayload;
    const now = Math.floor(Date.now() / 1000);
    if (
      payload.version !== 1
      || !["android", "ios", "mobile"].includes(payload.platform)
      || !TOKEN_PART_PATTERN.test(payload.nonce)
      || payload.nonce.length < 20
      || !Number.isInteger(payload.expiresAt)
      || payload.expiresAt <= now
      || payload.expiresAt > now + MOBILE_ACCESS_SECONDS + 30
    ) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function mobileAccessFromCookieHeader(cookieHeader: string | null) {
  const token = cookieValue(cookieHeader, MOBILE_ACCESS_COOKIE) || cookieValue(cookieHeader, MOBILE_DEV_ACCESS_COOKIE);
  return token ? verifyMobileAccessToken(token) : null;
}

export function mobileAccessCookie(request: Request, token: string) {
  const secure = isSecureExternalRequest(request);
  const name = secure ? MOBILE_ACCESS_COOKIE : MOBILE_DEV_ACCESS_COOKIE;
  return `${name}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${MOBILE_ACCESS_SECONDS}${secure ? "; Secure" : ""}; Priority=High`;
}

export function clearMobileAccessCookies(request: Request) {
  const secure = isSecureExternalRequest(request);
  return [MOBILE_ACCESS_COOKIE, MOBILE_DEV_ACCESS_COOKIE]
    .map((name) => `${name}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure && name === MOBILE_ACCESS_COOKIE ? "; Secure" : ""}; Priority=High`);
}
