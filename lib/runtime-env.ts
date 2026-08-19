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

export function setRuntimeEnv(env: DaliRuntimeEnv) {
  globalThis.__DALI_RUNTIME_ENV__ = env;
}

export function getRuntimeEnv(): DaliRuntimeEnv {
  return globalThis.__DALI_RUNTIME_ENV__ ?? getNodeRuntimeEnv();
}

function getNodeRuntimeEnv(): DaliRuntimeEnv {
  const root = process.env.UPLOADS_DIR || ".data/uploads";
  const bucket: StorageBucket = {
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

function safeStoragePath(root: string, key: string) {
  if (!/^[a-zA-Z0-9/_().@+-]{1,500}$/.test(key) || key.includes("..")) throw new Error("مسار تخزين غير صالح.");
  return `${root.replace(/\/$/, "")}/${key}`;
}
