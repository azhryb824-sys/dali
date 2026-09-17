import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { getConfiguredAuthSecret } from "@/lib/portal-auth-config";
import { normalizeSaudiWhatsAppNumber } from "@/lib/whatsapp";

const VERSION = "v1";
const PURPOSE = "dali-whatsapp-launch:v1";
const MAX_MESSAGE_LENGTH = 4000;
export const WHATSAPP_LAUNCH_SECONDS = 10 * 60;

type WhatsAppLaunchPayload = {
  version: 1;
  actorEmail: string;
  phone: string;
  message: string;
  expiresAt: number;
};

function encryptionKey() {
  const secret = getConfiguredAuthSecret();
  if (!secret || secret.length < 32) throw new Error("AUTH_SECRET_INVALID");
  return createHash("sha256").update(`${PURPOSE}:${secret}`).digest();
}

function cleanActorEmail(value: string) {
  return value.trim().toLowerCase().slice(0, 320);
}

export function createWhatsAppLaunchToken(
  actorEmail: string,
  phoneValue: string,
  messageValue: string,
) {
  const phone = normalizeSaudiWhatsAppNumber(phoneValue);
  const message = messageValue.trim().slice(0, MAX_MESSAGE_LENGTH);
  const normalizedActor = cleanActorEmail(actorEmail);
  if (!phone || !message || !normalizedActor)
    throw new Error("WHATSAPP_LAUNCH_INPUT_INVALID");

  const payload: WhatsAppLaunchPayload = {
    version: 1,
    actorEmail: normalizedActor,
    phone,
    message,
    expiresAt: Math.floor(Date.now() / 1000) + WHATSAPP_LAUNCH_SECONDS,
  };
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from(PURPOSE, "utf8"));
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);
  return [
    VERSION,
    Buffer.from(iv).toString("base64url"),
    Buffer.from(cipher.getAuthTag()).toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

export function readWhatsAppLaunchToken(token: string, actorEmail: string) {
  if (!token || token.length > 7500) return null;
  const [version, ivValue, tagValue, encryptedValue, extra] = token.split(".");
  if (
    version !== VERSION ||
    !ivValue ||
    !tagValue ||
    !encryptedValue ||
    extra ||
    ![ivValue, tagValue, encryptedValue].every((part) =>
      /^[A-Za-z0-9_-]+$/.test(part),
    )
  )
    return null;

  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      encryptionKey(),
      Buffer.from(ivValue, "base64url"),
    );
    decipher.setAAD(Buffer.from(PURPOSE, "utf8"));
    decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
    const payload = JSON.parse(
      Buffer.concat([
        decipher.update(Buffer.from(encryptedValue, "base64url")),
        decipher.final(),
      ]).toString("utf8"),
    ) as Partial<WhatsAppLaunchPayload>;
    const now = Math.floor(Date.now() / 1000);
    const phone = normalizeSaudiWhatsAppNumber(payload.phone);
    if (
      payload.version !== 1 ||
      payload.actorEmail !== cleanActorEmail(actorEmail) ||
      !phone ||
      typeof payload.message !== "string" ||
      !payload.message.trim() ||
      payload.message.length > MAX_MESSAGE_LENGTH ||
      typeof payload.expiresAt !== "number" ||
      !Number.isInteger(payload.expiresAt) ||
      Number(payload.expiresAt) <= now ||
      Number(payload.expiresAt) > now + WHATSAPP_LAUNCH_SECONDS + 30
    )
      return null;
    return {
      phone,
      message: payload.message,
      expiresAt: Number(payload.expiresAt),
    };
  } catch {
    return null;
  }
}
