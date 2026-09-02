import { getConfiguredAuthSecret } from "@/lib/portal-auth-config";
import { isSecureExternalRequest } from "@/lib/request-origin";

export const PWA_ACCESS_COOKIE = "__Host-dali_pwa_access";
const PWA_DEV_ACCESS_COOKIE = "dali_pwa_access_dev";
export const PWA_ACCESS_SECONDS = 5 * 60;
const TOKEN_PART_PATTERN = /^[A-Za-z0-9_-]+$/;
const DEVICE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type PwaAccessPayload = {
  version: 1;
  deviceId: string;
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

export async function issuePwaAccessToken(deviceId: string) {
  if (!DEVICE_ID_PATTERN.test(deviceId)) throw new Error("PWA_DEVICE_ID_INVALID");
  const payload: PwaAccessPayload = {
    version: 1,
    deviceId: deviceId.toLowerCase(),
    nonce: encodeBase64Url(crypto.getRandomValues(new Uint8Array(18))),
    expiresAt: Math.floor(Date.now() / 1000) + PWA_ACCESS_SECONDS,
  };
  const encodedPayload = encodeBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  return `${encodedPayload}.${encodeBase64Url(await sign(encodedPayload))}`;
}

export async function verifyPwaAccessToken(token: string) {
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
    const payload = JSON.parse(new TextDecoder().decode(decodeBase64Url(encodedPayload))) as PwaAccessPayload;
    const now = Math.floor(Date.now() / 1000);
    if (
      payload.version !== 1
      || !DEVICE_ID_PATTERN.test(payload.deviceId)
      || !TOKEN_PART_PATTERN.test(payload.nonce)
      || payload.nonce.length < 20
      || !Number.isInteger(payload.expiresAt)
      || payload.expiresAt <= now
      || payload.expiresAt > now + PWA_ACCESS_SECONDS + 30
    ) return null;
    return payload;
  } catch {
    return null;
  }
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

export async function pwaAccessFromCookieHeader(cookieHeader: string | null) {
  const token = cookieValue(cookieHeader, PWA_ACCESS_COOKIE) || cookieValue(cookieHeader, PWA_DEV_ACCESS_COOKIE);
  return token ? verifyPwaAccessToken(token) : null;
}

export function pwaAccessCookie(request: Request, token: string) {
  const secure = isSecureExternalRequest(request);
  const name = secure ? PWA_ACCESS_COOKIE : PWA_DEV_ACCESS_COOKIE;
  return `${name}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${PWA_ACCESS_SECONDS}${secure ? "; Secure" : ""}; Priority=High`;
}

export function clearPwaAccessCookies(request: Request) {
  const secure = isSecureExternalRequest(request);
  return [PWA_ACCESS_COOKIE, PWA_DEV_ACCESS_COOKIE]
    .map((name) => `${name}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure && name === PWA_ACCESS_COOKIE ? "; Secure" : ""}; Priority=High`);
}
