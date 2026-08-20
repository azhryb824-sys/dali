import { getRuntimeEnv } from "@/lib/runtime-env";
import { getSqlClient } from "@/db";
import { allowedRequestOrigins } from "@/lib/request-origin";

type RateLimitOptions = {
  scope: string;
  limit: number;
  windowSeconds: number;
  blockSeconds?: number;
};

type FileValidationRule = {
  contentTypes: Set<string>;
  maxBytes: number;
};

const fileSignatures: Record<string, (bytes: Uint8Array) => boolean> = {
  "application/pdf": (bytes) => startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d]),
  "image/png": (bytes) => startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  "image/jpeg": (bytes) => startsWith(bytes, [0xff, 0xd8, 0xff]),
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": isZip,
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": isZip,
  "application/msword": isCompoundOffice,
  "application/vnd.ms-excel": isCompoundOffice,
};

function startsWith(bytes: Uint8Array, signature: number[]) {
  return signature.every((value, index) => bytes[index] === value);
}

function isZip(bytes: Uint8Array) {
  return startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])
    || startsWith(bytes, [0x50, 0x4b, 0x05, 0x06])
    || startsWith(bytes, [0x50, 0x4b, 0x07, 0x08]);
}

function isCompoundOffice(bytes: Uint8Array) {
  return startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
}

export function requestCorrelationId(request: Request) {
  const incoming = request.headers.get("x-request-id")?.trim();
  return incoming && /^[a-zA-Z0-9._:-]{8,120}$/.test(incoming) ? incoming : crypto.randomUUID();
}

export function rejectCrossSiteRequest(request: Request) {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "cross-site") return true;
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return !allowedRequestOrigins(request).has(new URL(origin).origin);
  } catch {
    return true;
  }
}

export async function readLimitedJson(request: Request, maxBytes: number): Promise<
  { ok: true; value: unknown } | { ok: false; response: Response }
> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return { ok: false, response: jsonNoStore({ error: "نوع المحتوى غير مدعوم." }, { status: 415 }) };
  }
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    return { ok: false, response: jsonNoStore({ error: "حجم الطلب تجاوز الحد الآمن." }, { status: 413 }) };
  }

  const reader = request.body?.getReader();
  if (!reader) return { ok: false, response: jsonNoStore({ error: "جسم الطلب غير صالح." }, { status: 400 }) };
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return { ok: false, response: jsonNoStore({ error: "حجم الطلب تجاوز الحد الآمن." }, { status: 413 }) };
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return { ok: true, value: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) };
  } catch {
    return { ok: false, response: jsonNoStore({ error: "صيغة JSON غير صحيحة." }, { status: 400 }) };
  }
}

export async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function requestSourceHash(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = request.headers.get("cf-connecting-ip")?.trim() || forwarded || "unknown";
  const agent = request.headers.get("user-agent") || "unknown";
  return sha256(`${ip}|${agent}`);
}

export async function enforcePublicRateLimit(request: Request, options: RateLimitOptions) {
  const now = new Date();
  const windowStart = new Date(now.getTime() - options.windowSeconds * 1000).toISOString();
  const blockUntil = new Date(now.getTime() + (options.blockSeconds ?? options.windowSeconds) * 1000).toISOString();
  const sourceHash = await requestSourceHash(request);
  const key = await sha256(`${options.scope}|${sourceHash}`);
  const database = getRuntimeEnv().DB;
  const statement = `
    INSERT INTO public_rate_limits (key, window_started_at, request_count, blocked_until, updated_at)
    VALUES ($1, $2, 1, NULL, $3)
    ON CONFLICT(key) DO UPDATE SET
      request_count = CASE
        WHEN public_rate_limits.window_started_at < $4 THEN 1
        ELSE public_rate_limits.request_count + 1
      END,
      window_started_at = CASE
        WHEN public_rate_limits.window_started_at < $5 THEN excluded.window_started_at
        ELSE public_rate_limits.window_started_at
      END,
      blocked_until = CASE
        WHEN public_rate_limits.blocked_until IS NOT NULL AND public_rate_limits.blocked_until > $6 THEN public_rate_limits.blocked_until
        WHEN public_rate_limits.window_started_at < $7 THEN NULL
        WHEN public_rate_limits.request_count + 1 > $8 THEN $9
        ELSE NULL
      END,
      updated_at = excluded.updated_at
    RETURNING request_count, blocked_until
  `;
  const args = [key, now.toISOString(), now.toISOString(), windowStart, windowStart, now.toISOString(), windowStart, options.limit, blockUntil];
  const row = database
    ? await database.prepare(statement).bind(...args).first<{ request_count: number; blocked_until: string | null }>()
    : (await getSqlClient().unsafe<{ request_count: number; blocked_until: string | null }[]>(statement, args))[0];

  const blocked = Boolean(row?.blocked_until && row.blocked_until > now.toISOString());
  return {
    allowed: !blocked && (row?.request_count ?? 1) <= options.limit,
    retryAfterSeconds: blocked ? Math.max(1, Math.ceil((new Date(row!.blocked_until!).getTime() - now.getTime()) / 1000)) : 0,
  };
}

export function rateLimitResponse(retryAfterSeconds: number) {
  return Response.json(
    { error: "تم تجاوز عدد المحاولات المسموح. يرجى المحاولة بعد قليل." },
    { status: 429, headers: { "retry-after": String(retryAfterSeconds), "cache-control": "no-store" } },
  );
}

export async function validateUploadedFile(file: File, rule: FileValidationRule) {
  if (file.size < 1 || file.size > rule.maxBytes || !rule.contentTypes.has(file.type)) {
    return { valid: false as const, error: "نوع الملف أو حجمه غير مسموح." };
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const validator = fileSignatures[file.type];
  if (!validator || !validator(bytes.subarray(0, 16))) {
    return { valid: false as const, error: "محتوى الملف لا يطابق صيغته المعلنة." };
  }
  return {
    valid: true as const,
    bytes,
    validationDetails: `magic-signature:${file.type}`,
  };
}

export function jsonNoStore(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("cache-control", "no-store");
  headers.set("x-content-type-options", "nosniff");
  return Response.json(body, { ...init, headers });
}
