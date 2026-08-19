import { getRuntimeEnv } from "@/lib/runtime-env";

const ARABIC_INDIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const EASTERN_ARABIC_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

function nodeEnvironment(): Record<string, string | undefined> {
  return typeof process === "undefined" ? {} : process.env;
}

function firstConfiguredValue(...values: Array<string | undefined>) {
  return values.map((value) => value?.trim()).find(Boolean) || "";
}

export function normalizePortalEmail(value: string) {
  return value.trim().toLowerCase();
}

export function normalizePortalIdentifier(value: string) {
  return value
    .trim()
    .replace(/[٠-٩۰-۹]/g, (digit) => {
      const arabicIndicIndex = ARABIC_INDIC_DIGITS.indexOf(digit);
      if (arabicIndicIndex >= 0) return String(arabicIndicIndex);
      const easternArabicIndex = EASTERN_ARABIC_DIGITS.indexOf(digit);
      return easternArabicIndex >= 0 ? String(easternArabicIndex) : digit;
    })
    .replace(/\D/g, "");
}

export function isSupportedPortalPasswordHash(value: string) {
  const [algorithm, iterationsValue, saltValue, hashValue] = value.split("$");
  const iterations = Number(iterationsValue);
  return algorithm === "pbkdf2"
    && Number.isInteger(iterations)
    && iterations >= 210_000
    && /^[A-Za-z0-9_-]{16,}$/.test(saltValue || "")
    && /^[A-Za-z0-9_-]{32,}$/.test(hashValue || "");
}

export function getConfiguredAuthSecret() {
  const runtime = getRuntimeEnv();
  const env = nodeEnvironment();
  return firstConfiguredValue(runtime.AUTH_SECRET, env.AUTH_SECRET);
}

export function getConfiguredAuthMode() {
  const runtime = getRuntimeEnv();
  const env = nodeEnvironment();
  const configured = firstConfiguredValue(runtime.AUTH_MODE, env.AUTH_MODE);
  if (configured) return configured;
  return env.RENDER === "true" ? "credentials" : "chatgpt";
}

export function getPortalAdminConfig() {
  const runtime = getRuntimeEnv();
  const env = nodeEnvironment();
  const emails = new Set(
    [
      runtime.PORTAL_ADMIN_EMAIL,
      env.PORTAL_ADMIN_EMAIL,
      runtime.PORTAL_ADMIN_EMAILS,
      env.PORTAL_ADMIN_EMAILS,
    ]
      .flatMap((value) => (value || "").split(","))
      .map(normalizePortalEmail)
      .filter(Boolean),
  );
  const primaryEmail = normalizePortalEmail(
    firstConfiguredValue(runtime.PORTAL_ADMIN_EMAIL, env.PORTAL_ADMIN_EMAIL)
      || emails.values().next().value
      || "",
  );
  const identifier = normalizePortalIdentifier(
    firstConfiguredValue(
      runtime.PORTAL_ADMIN_IDENTIFIER,
      env.PORTAL_ADMIN_IDENTIFIER,
      env.PORTAL_ADMIN_ID,
    ),
  );
  const displayName = firstConfiguredValue(runtime.PORTAL_ADMIN_NAME, env.PORTAL_ADMIN_NAME) || "مدير النظام";
  const passwordHash = firstConfiguredValue(runtime.PORTAL_ADMIN_PASSWORD_HASH, env.PORTAL_ADMIN_PASSWORD_HASH);
  const missing: string[] = [];
  if (!primaryEmail) missing.push("PORTAL_ADMIN_EMAIL");
  if (!/^\d{10}$/.test(identifier)) missing.push("PORTAL_ADMIN_IDENTIFIER");
  if (!isSupportedPortalPasswordHash(passwordHash)) missing.push("PORTAL_ADMIN_PASSWORD_HASH");

  return {
    emails,
    primaryEmail,
    identifier,
    displayName,
    passwordHash,
    missing,
    complete: missing.length === 0,
  };
}

export function isConfiguredPortalAdminEmail(email: string) {
  return getPortalAdminConfig().emails.has(normalizePortalEmail(email));
}
