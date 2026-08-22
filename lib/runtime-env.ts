export type StorageObject = {
  body: ReadableStream<Uint8Array> | null;
  httpEtag?: string;
  httpMetadata?: { contentType?: string };
  arrayBuffer(): Promise<ArrayBuffer>;
  text(): Promise<string>;
};

export type StorageBucket = {
  get(key: string, options?: unknown): Promise<StorageObject | null>;
  put(key: string, value: string | Uint8Array | ArrayBuffer | ReadableStream | Blob | null, options?: unknown): Promise<unknown>;
  delete(key: string): Promise<void>;
};

export type DaliRuntimeEnv = {
  ASSETS: Fetcher;
  BUCKET: StorageBucket;
  DB?: D1Database;
  AUTH_MODE?: string;
  AUTH_SECRET?: string;
  PORTAL_ADMIN_EMAIL?: string;
  PORTAL_ADMIN_EMAILS?: string;
  PORTAL_ADMIN_IDENTIFIER?: string;
  PORTAL_ADMIN_NAME?: string;
  PORTAL_ADMIN_PASSWORD_HASH?: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  EMAIL_REPLY_TO?: string;
  INTEGRATION_WEBHOOK_URL?: string;
  INTEGRATION_WEBHOOK_SECRET?: string;
};

declare global {
  var __DALI_RUNTIME_ENV__: DaliRuntimeEnv | undefined;
}

let nodeRuntimeEnv: DaliRuntimeEnv | undefined;

export function setRuntimeEnv(env: DaliRuntimeEnv) {
  globalThis.__DALI_RUNTIME_ENV__ = env;
}

export function getRuntimeEnv(): DaliRuntimeEnv {
  const node = nodeRuntimeEnv ??= getNodeRuntimeEnv();
  const injected = globalThis.__DALI_RUNTIME_ENV__;
  if (!injected) return node;
  return {
    ...node,
    ...injected,
    ASSETS: injected.ASSETS ?? node.ASSETS,
    BUCKET: injected.BUCKET ?? node.BUCKET,
  };
}

function getNodeRuntimeEnv(): DaliRuntimeEnv {
  const root = process.env.UPLOADS_DIR || ".data/uploads";
  const bucket = process.env.DATABASE_URL ? createPostgresStorageBucket() : createFileStorageBucket(root);
  return {
    ASSETS: {
      async fetch(request: RequestInfo | URL) {
        const { readFile } = await import("node:fs/promises");
        const url = new URL(typeof request === "string" ? request : request instanceof URL ? request : request.url, "http://localhost");
        const file = safeStoragePath("public", url.pathname.replace(/^\//, ""));
        try { return new Response(await readFile(file)); } catch { return new Response("Not found", { status: 404 }); }
      },
      connect() { throw new Error("ASSETS.connect is unavailable in the Node runtime."); },
    } as Fetcher,
    BUCKET: bucket,
    AUTH_MODE: process.env.AUTH_MODE,
    AUTH_SECRET: process.env.AUTH_SECRET,
    PORTAL_ADMIN_EMAIL: process.env.PORTAL_ADMIN_EMAIL,
    PORTAL_ADMIN_EMAILS: process.env.PORTAL_ADMIN_EMAILS,
    PORTAL_ADMIN_IDENTIFIER: process.env.PORTAL_ADMIN_IDENTIFIER || process.env.PORTAL_ADMIN_ID,
    PORTAL_ADMIN_NAME: process.env.PORTAL_ADMIN_NAME,
    PORTAL_ADMIN_PASSWORD_HASH: process.env.PORTAL_ADMIN_PASSWORD_HASH,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    EMAIL_FROM: process.env.EMAIL_FROM,
    EMAIL_REPLY_TO: process.env.EMAIL_REPLY_TO,
    INTEGRATION_WEBHOOK_URL: process.env.INTEGRATION_WEBHOOK_URL,
    INTEGRATION_WEBHOOK_SECRET: process.env.INTEGRATION_WEBHOOK_SECRET,
  };
}

function createFileStorageBucket(root: string): StorageBucket {
  return {
    async get(key) {
      const { readFile } = await import("node:fs/promises");
      const path = safeStoragePath(root, key);
      try {
        const bytes = await readFile(path);
        const copy = new Uint8Array(bytes);
        return {
          body: new Blob([copy]).stream(),
          async arrayBuffer() { return copy.buffer.slice(copy.byteOffset, copy.byteOffset + copy.byteLength); },
          async text() { return new TextDecoder().decode(copy); },
        };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      }
    },
    async put(key, value) {
      const { mkdir, writeFile } = await import("node:fs/promises");
      const { dirname } = await import("node:path");
      const path = safeStoragePath(root, key);
      await mkdir(dirname(path), { recursive: true, mode: 0o700 });
      const bytes = value instanceof ReadableStream
        ? new Uint8Array(await new Response(value).arrayBuffer())
        : value instanceof Blob
          ? new Uint8Array(await value.arrayBuffer())
          : typeof value === "string"
            ? new TextEncoder().encode(value)
            : value === null
              ? new Uint8Array()
              : new Uint8Array(value);
      await writeFile(path, bytes, { mode: 0o600 });
    },
    async delete(key) {
      const { unlink } = await import("node:fs/promises");
      await unlink(safeStoragePath(root, key)).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
      });
    },
  };
}

function createPostgresStorageBucket(): StorageBucket {
  async function client() {
    const { getSqlClient } = await import("@/db");
    return getSqlClient();
  }
  return {
    async get(key) {
      validateStorageKey(key);
      const sql = await client();
      const rows = await sql.unsafe<{ object_data: Uint8Array; content_type: string | null; etag: string }[]>(
        "SELECT object_data, content_type, etag FROM private.object_storage WHERE storage_key = $1 LIMIT 1",
        [key],
      );
      const row = rows[0];
      if (!row) return null;
      const copy = new Uint8Array(row.object_data);
      return {
        body: new Blob([copy]).stream(),
        httpEtag: row.etag,
        httpMetadata: { contentType: row.content_type || undefined },
        async arrayBuffer() { return copy.buffer.slice(copy.byteOffset, copy.byteOffset + copy.byteLength); },
        async text() { return new TextDecoder().decode(copy); },
      };
    },
    async put(key, value, options) {
      validateStorageKey(key);
      const bytes = value instanceof ReadableStream
        ? new Uint8Array(await new Response(value).arrayBuffer())
        : value instanceof Blob
          ? new Uint8Array(await value.arrayBuffer())
          : typeof value === "string"
            ? new TextEncoder().encode(value)
            : value === null
              ? new Uint8Array()
              : new Uint8Array(value);
      const contentType = (options as { httpMetadata?: { contentType?: string } } | undefined)?.httpMetadata?.contentType || null;
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      const etag = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
      const sql = await client();
      await sql.unsafe(
        `INSERT INTO private.object_storage (storage_key, object_data, content_type, etag, updated_at)
         VALUES ($1, $2, $3, $4, now())
         ON CONFLICT (storage_key) DO UPDATE SET object_data = EXCLUDED.object_data, content_type = EXCLUDED.content_type, etag = EXCLUDED.etag, updated_at = now()`,
        [key, bytes, contentType, etag],
      );
      return { etag };
    },
    async delete(key) {
      validateStorageKey(key);
      const sql = await client();
      await sql.unsafe("DELETE FROM private.object_storage WHERE storage_key = $1", [key]);
    },
  };
}

function validateStorageKey(key: string) {
  if (!/^[a-zA-Z0-9/_().@+-]{1,500}$/.test(key) || key.includes("..")) throw new Error("مسار تخزين غير صالح.");
}

function safeStoragePath(root: string, key: string) {
  validateStorageKey(key);
  return `${root.replace(/\/$/, "")}/${key}`;
}
