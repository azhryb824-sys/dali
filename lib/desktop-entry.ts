import { headers } from "next/headers";
import { getConfiguredAuthSecret } from "@/lib/portal-auth-config";
import { isSecureExternalRequest } from "@/lib/request-origin";

export const DESKTOP_APP_HEADER = "x-dali-desktop-app";
export const DESKTOP_DEVICE_HEADER = "x-dali-desktop-device";
export const DESKTOP_APP_MARKER = "dali-desktop-v1";
export const DESKTOP_ENTRY_SECONDS = 5 * 60;
export const DESKTOP_ENTRY_COOKIE = "__Host-dali_desktop_entry";
const DEV_DESKTOP_ENTRY_COOKIE = "dali_desktop_entry_dev";
const DEVICE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN_PART_PATTERN = /^[A-Za-z0-9_-]+$/;

type HeaderReader = Pick<Headers, "get">;
type DesktopEntryPayload = {
  version: 1;
  deviceId: string;
  nonce: string;
  expiresAt: number;
};

function base64UrlEncode(bytes: Uint8Array) {
  return Buffer.from(bytes).toString("base64url");
}

function base64UrlDecode(value: string) {
  return new Uint8Array(Buffer.from(value, "base64url"));
}

function desktopEntrySecret() {
  const secret = getConfiguredAuthSecret();
  if (!secret || secret.length < 32) throw new Error("AUTH_SECRET_INVALID");
  return secret;
}

async function signPayload(payload: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(desktopEntrySecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)));
}

function signaturesMatch(expected: Uint8Array, received: Uint8Array) {
  let difference = expected.length ^ received.length;
  for (let index = 0; index < Math.min(expected.length, received.length); index += 1) {
    difference |= expected[index] ^ received[index];
  }
  return difference === 0;
}

export function desktopDeviceId(source: HeaderReader) {
  if (source.get(DESKTOP_APP_HEADER) !== DESKTOP_APP_MARKER) return null;
  const deviceId = source.get(DESKTOP_DEVICE_HEADER)?.trim().toLowerCase() || "";
  return DEVICE_ID_PATTERN.test(deviceId) ? deviceId : null;
}

export async function createDesktopEntryToken(source: HeaderReader) {
  const deviceId = desktopDeviceId(source);
  if (!deviceId) return null;
  const payload: DesktopEntryPayload = {
    version: 1,
    deviceId,
    nonce: base64UrlEncode(crypto.getRandomValues(new Uint8Array(18))),
    expiresAt: Math.floor(Date.now() / 1000) + DESKTOP_ENTRY_SECONDS,
  };
  const encodedPayload = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  return `${encodedPayload}.${base64UrlEncode(await signPayload(encodedPayload))}`;
}

export async function verifyDesktopEntryToken(source: HeaderReader, token: string) {
  const deviceId = desktopDeviceId(source);
  if (!deviceId || token.length > 1000) return null;
  const parts = token.split(".");
  if (parts.length !== 2 || parts.some((part) => !part || !TOKEN_PART_PATTERN.test(part))) return null;
  const [encodedPayload, encodedSignature] = parts;
  let receivedSignature: Uint8Array;
  try {
    receivedSignature = base64UrlDecode(encodedSignature);
  } catch {
    return null;
  }
  if (!signaturesMatch(await signPayload(encodedPayload), receivedSignature)) return null;

  try {
    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(encodedPayload))) as DesktopEntryPayload;
    const now = Math.floor(Date.now() / 1000);
    if (
      payload.version !== 1
      || payload.deviceId !== deviceId
      || !TOKEN_PART_PATTERN.test(payload.nonce)
      || payload.nonce.length < 20
      || !Number.isInteger(payload.expiresAt)
      || payload.expiresAt <= now
      || payload.expiresAt > now + DESKTOP_ENTRY_SECONDS + 30
    ) return null;
    return payload;
  } catch {
    return null;
  }
}

function cookieValue(cookieHeader: string, name: string) {
  const item = cookieHeader.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  if (!item) return "";
  try {
    return decodeURIComponent(item.slice(item.indexOf("=") + 1));
  } catch {
    return "";
  }
}

export function desktopEntryCookie(request: Request, token: string) {
  const secure = isSecureExternalRequest(request);
  const name = secure ? DESKTOP_ENTRY_COOKIE : DEV_DESKTOP_ENTRY_COOKIE;
  return `${name}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${DESKTOP_ENTRY_SECONDS}${secure ? "; Secure" : ""}; Priority=High`;
}

export async function hasVerifiedDesktopEntry() {
  const requestHeaders = await headers();
  const cookieHeader = requestHeaders.get("cookie") || "";
  const token = cookieValue(cookieHeader, DESKTOP_ENTRY_COOKIE) || cookieValue(cookieHeader, DEV_DESKTOP_ENTRY_COOKIE);
  return token ? Boolean(await verifyDesktopEntryToken(requestHeaders, token)) : false;
}
