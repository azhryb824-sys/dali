import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("mobile container targets Android and iOS through the trusted production portal", async () => {
  const [pkg, config, gradle, strings] = await Promise.all([
    read("mobile/package.json"),
    read("mobile/capacitor.config.ts"),
    read("mobile/android/app/build.gradle"),
    read("mobile/android/app/src/main/res/values/strings.xml"),
  ]);
  assert.match(pkg, /@capacitor\/android/);
  assert.match(pkg, /@capacitor\/ios/);
  assert.match(pkg, /"version": "1\.0\.1"/);
  assert.match(config, /https:\/\/www\.dally\.info\/portal/);
  assert.match(config, /errorPath: "offline\.html"/);
  assert.match(config, /appId: "sa\.dally\.mobile"/);
  assert.match(config, /appName: "نظام دالي الإداري"/);
  assert.match(config, /DaliMobile\/1/);
  assert.match(config, /allowMixedContent: false/);
  assert.match(config, /webContentsDebuggingEnabled: false/);
  assert.match(config, /limitsNavigationsToAppBoundDomains: true/);
  assert.match(gradle, /applicationId "sa\.dally\.mobile"/);
  assert.match(gradle, /versionCode 2/);
  assert.match(gradle, /versionName "1\.0\.1"/);
  assert.match(strings, /<string name="app_name">نظام دالي الإداري<\/string>/);
});

test("server admits signed mobile sessions without weakening desktop or PWA access", async () => {
  const [proxy, login, logout, mobileEntry, mobileAccess, portalSession, layout] = await Promise.all([
    read("proxy.ts"),
    read("app/api/auth/login/route.ts"),
    read("app/api/auth/logout/route.ts"),
    read("lib/mobile-entry.ts"),
    read("lib/mobile-access.ts"),
    read("lib/portal-session.ts"),
    read("app/portal/layout.tsx"),
  ]);
  assert.match(mobileEntry, /\(\?:\^\|\\s\)DaliMobile\\\/1\(\?:\\s\|\$\)/);
  assert.match(proxy, /isDaliMobileRequest\(request\.headers\)/);
  assert.match(proxy, /mobileAccessFromCookieHeader\(request\.headers\.get\("cookie"\)\)/);
  assert.match(login, /isDaliMobileRequest\(request\.headers\)/);
  assert.match(login, /issueMobileAccessToken/);
  assert.match(login, /mobileAccessCookie/);
  assert.match(logout, /clearMobileAccessCookies/);
  assert.match(mobileAccess, /HMAC/);
  assert.match(mobileAccess, /__Host-dali_mobile_access/);
  assert.match(mobileAccess, /HttpOnly; SameSite=Strict/);
  assert.match(portalSession, /dali-mobile-v1:\$\{mobileAccess\.platform\}:\$\{mobileAccess\.nonce\}/);
  assert.match(portalSession, /requestUserAgentHash\(requestHeaders\)/);
  assert.match(proxy, /trustedNativeRequest = verifiedDesktopRequest \|\| verifiedMobileRequest/);
  assert.match(proxy, /!trustedNativeRequest && !trustedPwaRequest && !permittedBootstrapRequest && !emergencyBrowserAccess/);
  assert.match(proxy, /nativeBootstrapPath/);
  assert.match(proxy, /pwaAccessFromCookieHeader/);
  assert.match(proxy, /requestHeaders\.set\("x-dali-pathname"/);
  assert.match(proxy, /camera=\(self\), microphone=\(self\)/);
  assert.match(layout, /<PwaAccessRuntime \/>/);
  assert.match(layout, /src="\/mobile\/runtime\.js"/);
});

test("mobile entry detection accepts only the explicit Dali marker", async () => {
  const { isDaliMobileRequest } = await import("../lib/mobile-entry.ts");
  const headers = (userAgent) => new Headers({ "user-agent": userAgent });
  assert.equal(isDaliMobileRequest(headers("Mozilla/5.0 DaliMobile/1 Android")), true);
  assert.equal(isDaliMobileRequest(headers("DaliMobile/1")), true);
  assert.equal(isDaliMobileRequest(headers("Mozilla/5.0 DaliMobile/10 Android")), false);
  assert.equal(isDaliMobileRequest(headers("Mozilla/5.0 Android")), false);
});

test("mobile offline records are encrypted and sensitive operations stay online", async () => {
  const worker = await read("public/mobile/service-worker.js");
  assert.match(worker, /AES-GCM/);
  assert.match(worker, /extractable|generateKey\(\{ name: "AES-GCM", length: 256 \}, false/);
  assert.match(worker, /privilegedActions/);
  assert.match(worker, /method === "DELETE"/);
  assert.match(worker, /SHA-256/);
  assert.match(worker, /idempotencyKey/);
  assert.match(worker, /request\.mode === "navigate"[\s\S]{0,260}return;/);
  assert.doesNotMatch(worker, /request\.mode === "navigate"[\s\S]{0,260}respondWith/);
  assert.doesNotMatch(worker, /caches\.put\([^\n]*api\/portal/);
});

test("mobile and desktop share server-side idempotent synchronization with platform tracking", async () => {
  const sync = await read("app/api/portal/desktop/sync/route.ts");
  assert.match(sync, /devicePlatform\(request:Request\)/);
  assert.match(sync, /value==="android"\|\|value==="ios"/);
  assert.match(sync, /idempotencyKey/);
  assert.match(sync, /onlineOnly\(method,requestPath,body\)/);
});

test("native projects disable cleartext and declare privacy-scoped device permissions", async () => {
  const [manifest, network, dataRules, plist, runtime, nextConfig] = await Promise.all([
    read("mobile/android/app/src/main/AndroidManifest.xml"),
    read("mobile/android/app/src/main/res/xml/network_security_config.xml"),
    read("mobile/android/app/src/main/res/xml/data_extraction_rules.xml"),
    read("mobile/ios/App/App/Info.plist"),
    read("public/mobile/runtime.js"),
    read("next.config.ts"),
  ]);
  assert.match(manifest, /android:allowBackup="false"/);
  assert.match(manifest, /android:usesCleartextTraffic="false"/);
  assert.match(manifest, /android\.permission\.CAMERA/);
  assert.match(manifest, /android\.permission\.RECORD_AUDIO/);
  assert.match(manifest, /android\.hardware\.camera" android:required="false"/);
  assert.match(manifest, /android\.hardware\.microphone" android:required="false"/);
  assert.match(manifest, /android:dataExtractionRules="@xml\/data_extraction_rules"/);
  assert.ok(manifest.indexOf("<uses-permission") < manifest.indexOf("<application"));
  assert.doesNotMatch(manifest, /READ_MEDIA_IMAGES/);
  assert.match(dataRules, /<cloud-backup>/);
  assert.match(dataRules, /<device-transfer>/);
  assert.match(dataRules, /<exclude domain="database" path="\." \/>/);
  assert.match(network, /cleartextTrafficPermitted="false"/);
  assert.match(plist, /WKAppBoundDomains/);
  assert.match(plist, /NSCameraUsageDescription/);
  assert.match(runtime, /Filesystem\.writeFile/);
  assert.match(runtime, /PushNotifications/);
  assert.match(runtime, /updateViaCache: "none"/);
  assert.match(nextConfig, /source: "\/mobile\/service-worker\.js"/);
  assert.match(nextConfig, /Service-Worker-Allowed/);
});
