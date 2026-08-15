export type DaliRuntimeEnv = {
  ASSETS: Fetcher;
  BUCKET: R2Bucket;
  DB: D1Database;
  PORTAL_ADMIN_EMAILS?: string;
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
  const runtime = globalThis.__DALI_RUNTIME_ENV__;
  if (!runtime) {
    throw new Error("بيئة تشغيل النظام الإداري غير متاحة.");
  }
  return runtime;
}
