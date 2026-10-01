import { createHmac, randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { isPublicPath, publicRoute } from "@/lib/public-locale";
import { mobileAccessFromCookieHeader } from "@/lib/mobile-access";
import { isDaliMobileRequest } from "@/lib/mobile-entry";
import { pwaAccessFromCookieHeader } from "@/lib/pwa-access";
import { desktopAccessFromCookieHeader, desktopDeviceId, desktopEntryFromCookieHeader, isLegacyDesktopRequest } from "@/lib/desktop-entry";

// A rewrite may be re-entered through the Node server. Preserve its public
// language only when our own process signed the original path; browser headers
// must never control canonical URLs or bypass the native access checks.
const publicRewriteKey = randomBytes(32);
function publicRewriteSignature(path: string, method: string) {
  return createHmac("sha256", publicRewriteKey).update(`${method}:${path}`).digest("hex");
}

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "frame-src 'self' https://meet.jit.si",
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
const nativeBootstrapPath = /^\/(?:login(?:\/|$)|forgot-password(?:\/|$)|reset-password(?:\/|$)|api\/auth(?:\/|$)|desktop-access(?:\/|$)|api\/portal\/desktop\/entry-link(?:\/|$))/;
const legacyDesktopBootstrapPath = /^\/(?:login(?:\/|$)|forgot-password(?:\/|$)|reset-password(?:\/|$)|api\/auth(?:\/|$))/;
const portalPagePath = /^\/portal(?:\/|$)/;

export async function proxy(request: NextRequest) {
  const incomingPath = request.headers.get("x-dali-pathname") || "";
  const incomingRoute = publicRoute(incomingPath);
  const trustedRewrite = incomingRoute.prefixed && isPublicPath(incomingRoute.path)
    && incomingRoute.path === request.nextUrl.pathname
    && request.headers.get("x-dali-public-rewrite") === publicRewriteSignature(incomingPath, request.method);
  const originalPath = trustedRewrite ? incomingPath : request.nextUrl.pathname;
  const route = publicRoute(originalPath);
  if (route.prefixed && publicRoute(route.path).prefixed) return new NextResponse(null, { status: 404, headers: { "x-robots-tag": "noindex" } });
  if (route.prefixed && !isPublicPath(route.path)) return new NextResponse(null, { status: 404, headers: { "x-robots-tag": "noindex", "cache-control": "no-store" } });
  if ((request.method === "GET" || request.method === "HEAD") && (isPublicPath(route.path) || /^\/(?:robots\.txt|sitemap\.xml)$/.test(route.path))) {
    const host = (request.headers.get("x-forwarded-host") || request.headers.get("host") || request.nextUrl.host).split(",")[0].trim().toLowerCase().replace(/:443$/, "");
    if (host === "www.dally.info" || route.prefixed && route.locale === "ar") {
      const canonical = request.nextUrl.clone();
      if (host === "www.dally.info") { canonical.hostname = "dally.info"; canonical.port = ""; canonical.protocol = "https:"; }
      if (route.locale === "ar" && route.prefixed) canonical.pathname = route.path;
      return NextResponse.redirect(canonical, 308);
    }
  }
  const emergencyBrowserAccess = process.env.DALI_ALLOW_BROWSER_PORTAL === "true";
  const desktopBootstrapRequest = Boolean(desktopDeviceId(request.headers));
  const legacyDesktopBootstrapRequest = isLegacyDesktopRequest(request.headers);
  const mobileBootstrapRequest = isDaliMobileRequest(request.headers);
  let verifiedDesktopRequest = false;
  let verifiedDesktopEntry = false;
  let verifiedMobileRequest = false;
  if (desktopOnlyPath.test(request.nextUrl.pathname)) {
    try {
      verifiedDesktopRequest = Boolean(await desktopAccessFromCookieHeader(request.headers, request.headers.get("cookie")));
      verifiedDesktopEntry = Boolean(await desktopEntryFromCookieHeader(request.headers, request.headers.get("cookie")));
    } catch {
      verifiedDesktopRequest = false;
      verifiedDesktopEntry = false;
    }
    try {
      verifiedMobileRequest = Boolean(await mobileAccessFromCookieHeader(request.headers.get("cookie")));
    } catch {
      verifiedMobileRequest = false;
    }
  }
  const trustedNativeRequest = verifiedDesktopRequest || verifiedMobileRequest;
  const permittedBootstrapRequest = nativeBootstrapPath.test(request.nextUrl.pathname)
    && (mobileBootstrapRequest || desktopBootstrapRequest || verifiedDesktopEntry);
  const permittedLegacyDesktopBootstrapRequest = legacyDesktopBootstrapPath.test(request.nextUrl.pathname)
    && legacyDesktopBootstrapRequest;
  let trustedPwaRequest = false;
  if (desktopOnlyPath.test(request.nextUrl.pathname) && !trustedNativeRequest) {
    try {
      trustedPwaRequest = Boolean(await pwaAccessFromCookieHeader(request.headers.get("cookie")));
    } catch {
      trustedPwaRequest = false;
    }
  }
  if (desktopOnlyPath.test(request.nextUrl.pathname) && !trustedNativeRequest && !trustedPwaRequest && !permittedBootstrapRequest && !permittedLegacyDesktopBootstrapRequest && !emergencyBrowserAccess) {
    if (portalPagePath.test(request.nextUrl.pathname) && request.method === "GET" && (mobileBootstrapRequest || desktopBootstrapRequest || legacyDesktopBootstrapRequest)) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/login";
      loginUrl.search = new URLSearchParams({ returnTo: `${request.nextUrl.pathname}${request.nextUrl.search}` }).toString();
      return NextResponse.redirect(loginUrl, 307);
    }
    if (request.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "النظام الإداري متاح عبر تطبيق دالي المعتمد فقط" }, { status: 403 });
    }
    return new NextResponse("النظام الإداري متاح عبر تطبيق دالي المعتمد فقط", {
      status: 403,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    });
  }
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-dali-pathname", originalPath);
  requestHeaders.delete("x-dali-public-rewrite");
  if (route.prefixed) requestHeaders.set("x-dali-public-rewrite", publicRewriteSignature(originalPath, request.method));
  requestHeaders.set("x-dali-locale", route.locale);
  const destination = request.nextUrl.clone(); destination.pathname = route.path;
  const response = route.prefixed && !trustedRewrite ? NextResponse.rewrite(destination, { request: { headers: requestHeaders } }) : NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("content-security-policy", contentSecurityPolicy);
  response.headers.set("referrer-policy", "strict-origin-when-cross-origin");
  response.headers.set("x-content-type-options", "nosniff");
  response.headers.set("x-frame-options", request.nextUrl.pathname === "/portal/website-preview" ? "SAMEORIGIN" : "DENY");
  if (request.nextUrl.pathname === "/portal/website-preview") response.headers.set("content-security-policy", contentSecurityPolicy.replace("frame-ancestors 'none'", "frame-ancestors 'self'"));
  response.headers.set("cross-origin-opener-policy", "same-origin");
  response.headers.set("cross-origin-resource-policy", "same-origin");
  response.headers.set("origin-agent-cluster", "?1");
  response.headers.set("x-permitted-cross-domain-policies", "none");
  response.headers.set("permissions-policy", 'camera=(self "https://meet.jit.si"), microphone=(self "https://meet.jit.si"), geolocation=(), payment=(), usb=()');
  if (verifiedMobileRequest) {
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
