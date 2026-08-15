/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { setRuntimeEnv } from "../lib/runtime-env";

interface Env {
  ASSETS: Fetcher;
  BUCKET: R2Bucket;
  DB: D1Database;
  PORTAL_ADMIN_EMAILS?: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  EMAIL_REPLY_TO?: string;
  IMAGES?: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    setRuntimeEnv(env as unknown as import("../lib/runtime-env").DaliRuntimeEnv);
    const url = new URL(request.url);

    if (url.pathname === "/_vinext/image" || url.pathname === "/_next/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      const transformImage = env.IMAGES ? async (body: ReadableStream, { width, format, quality }: { width: number; format: string; quality: number }) => {
        const result = await env.IMAGES!.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
        return result.response();
      } : undefined;
      return handleImageOptimization(request, {
        fetchAsset: async (path) => {
          const asset = await env.ASSETS.fetch(new Request(new URL(path, request.url)));
          if (!asset.ok || !asset.body) return asset;
          const headers = new Headers(asset.headers);
          if (/\.webp(?:$|\?)/i.test(path)) headers.set("content-type", "image/webp");
          else if (/\.png(?:$|\?)/i.test(path)) headers.set("content-type", "image/png");
          else if (/\.jpe?g(?:$|\?)/i.test(path)) headers.set("content-type", "image/jpeg");
          return new Response(asset.body, { status: asset.status, headers });
        },
        ...(transformImage ? { transformImage } : {}),
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;
