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
const mobileMarker = /(?:^|\s)DaliMobile\/1(?:\s|$)/;
const minimumAndroidWebView = 111;

function androidWebViewMajor(userAgent: string) {
  if (!mobileMarker.test(userAgent) || !/Android/i.test(userAgent)) return null;
  const match = userAgent.match(/(?:Chrome|Chromium)\/(\d+)/i);
  return match ? Number(match[1]) : null;
}

export async function proxy(request: NextRequest) {
  const emergencyBrowserAccess = process.env.DALI_ALLOW_BROWSER_PORTAL === "true";
  const desktopRequest = request.headers.get("x-dali-desktop-app") === desktopMarker;
  const userAgent = request.headers.get("user-agent") ?? "";
  const mobileRequest = mobileMarker.test(userAgent);
  const trustedNativeRequest = desktopRequest || mobileRequest;
  const webViewMajor = androidWebViewMajor(userAgent);
  if ((request.nextUrl.pathname === "/portal" || request.nextUrl.pathname === "/login") && webViewMajor !== null && webViewMajor < minimumAndroidWebView) {
    return NextResponse.redirect(new URL("/mobile/compatibility.html", request.url), 307);
  }
  let trustedPwaRequest = false;
  if (desktopOnlyPath.test(request.nextUrl.pathname) && !trustedNativeRequest) {
    try {
      trustedPwaRequest = Boolean(await pwaAccessFromCookieHeader(request.headers.get("cookie")));
    } catch {
      trustedPwaRequest = false;
    }
  }
  if (desktopOnlyPath.test(request.nextUrl.pathname) && !trustedNativeRequest && !trustedPwaRequest && !emergencyBrowserAccess) {
    if (request.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "النظام الإداري متاح عبر تطبيق دالي المعتمد فقط" }, { status: 403 });
    }
    return new NextResponse("النظام الإداري متاح عبر تطبيق دالي المعتمد فقط", {
      status: 403,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    });
  }
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-dali-pathname", request.nextUrl.pathname);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("content-security-policy", contentSecurityPolicy);
  response.headers.set("referrer-policy", "strict-origin-when-cross-origin");
  response.headers.set("x-content-type-options", "nosniff");
  response.headers.set("x-frame-options", "DENY");
  response.headers.set("cross-origin-opener-policy", "same-origin");
  response.headers.set("cross-origin-resource-policy", "same-origin");
  response.headers.set("origin-agent-cluster", "?1");
  response.headers.set("x-permitted-cross-domain-policies", "none");
  response.headers.set("permissions-policy", mobileRequest ? "camera=(self), microphone=(self), geolocation=(), payment=(), usb=()" : "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
  if (mobileRequest) {
    response.headers.set("x-dali-client", "mobile");
    response.headers.append("vary", "user-agent");
  }
  response.headers.set("strict-transport-security", "max-age=31536000; includeSubDomains");
  if (nonIndexablePath.test(request.nextUrl.pathname)) response.headers.set("x-robots-tag", "noindex, nofollow, noarchive");
  response.headers.delete("x-powered-by");
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|api/portal/documents/generate).*)"],
};
