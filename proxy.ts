import { NextRequest, NextResponse } from "next/server";
import { pwaAccessFromCookieHeader } from "@/lib/pwa-access";

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "frame-src 'none'",
  "child-src 'none'",
  "manifest-src 'self'",
  "media-src 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline'",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "upgrade-insecure-requests",
].join("; ");

const nonIndexablePath = /^\/(?:api(?:\/|$)|portal(?:\/|$)|pwa(?:\/|$)|desktop-access(?:\/|$)|client(?:\/|$)|worker(?:\/|$)|search(?:\/|$)|contracts\/signature(?:\/|$))/;
const desktopOnlyPath = /^\/(?:portal(?:\/|$)|login(?:\/|$)|desktop-access(?:\/|$)|forgot-password(?:\/|$)|reset-password(?:\/|$)|api\/auth(?:\/|$)|api\/portal(?:\/|$))/;
const desktopMarker = "dali-desktop-v1";

export async function proxy(request: NextRequest) {
  const emergencyBrowserAccess = process.env.DALI_ALLOW_BROWSER_PORTAL === "true";
  const desktopRequest = request.headers.get("x-dali-desktop-app") === desktopMarker;
  let trustedPwaRequest = false;
  if (desktopOnlyPath.test(request.nextUrl.pathname) && !desktopRequest) {
    try {
      trustedPwaRequest = Boolean(await pwaAccessFromCookieHeader(request.headers.get("cookie")));
    } catch {
      trustedPwaRequest = false;
    }
  }
  if (desktopOnlyPath.test(request.nextUrl.pathname) && !desktopRequest && !trustedPwaRequest && !emergencyBrowserAccess) {
    if (request.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "النظام الإداري متاح عبر تطبيق دالي المعتمد فقط" }, { status: 403 });
    }
    return new NextResponse("النظام الإداري متاح عبر تطبيق دالي المعتمد فقط", {
      status: 403,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    });
  }
  const response = NextResponse.next();
  response.headers.set("content-security-policy", contentSecurityPolicy);
  response.headers.set("referrer-policy", "strict-origin-when-cross-origin");
  response.headers.set("x-content-type-options", "nosniff");
  response.headers.set("x-frame-options", "DENY");
  response.headers.set("cross-origin-opener-policy", "same-origin");
  response.headers.set("cross-origin-resource-policy", "same-origin");
  response.headers.set("origin-agent-cluster", "?1");
  response.headers.set("x-permitted-cross-domain-policies", "none");
  response.headers.set("permissions-policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
  response.headers.set("strict-transport-security", "max-age=31536000; includeSubDomains");
  if (nonIndexablePath.test(request.nextUrl.pathname)) response.headers.set("x-robots-tag", "noindex, nofollow, noarchive");
  response.headers.delete("x-powered-by");
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|api/portal/documents/generate).*)"],
};
