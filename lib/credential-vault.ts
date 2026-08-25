import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function key() {
  const configured = process.env.GOVERNMENT_VAULT_KEY?.trim();
  if (configured) {
    const decoded = Buffer.from(configured, "base64");
    if (decoded.length === 32) return decoded;
    if (/^[a-f\d]{64}$/i.test(configured)) return Buffer.from(configured, "hex");
    throw new Error("GOVERNMENT_VAULT_KEY يجب أن يكون مفتاحًا Base64 بطول 32 بايت");
  }
  const fallback = process.env.AUTH_SECRET?.trim();
  if (!fallback || fallback.length < 32) throw new Error("خزنة بيانات الدخول غير مهيأة");
  return createHash("sha256").update(`dali-government-vault:${fallback}`).digest();
}

export function encryptCredential(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `v1.${Buffer.from(iv).toString("base64url")}.${Buffer.from(cipher.getAuthTag()).toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptCredential(envelope: string | null) {
  if (!envelope) return "";
  const [version, iv, tag, encrypted] = envelope.split(".");
  if (version !== "v1" || !iv || !tag || !encrypted) throw new Error("صيغة البيانات المشفرة غير صحيحة");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
}
