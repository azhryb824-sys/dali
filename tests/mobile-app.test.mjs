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
  assert.match(pkg, /"version": "1\.0\.3"/);
  assert.doesNotMatch(pkg, /@capacitor\/privacy-screen/);
  assert.match(config, /https:\/\/www\.dally\.info\/portal/);
  assert.match(config, /errorPath: "offline\.html"/);
  assert.match(config, /appId: "sa\.dally\.mobile"/);
  assert.match(config, /appName: "نظام دالي الإداري"/);
  assert.match(config, /DaliMobile\/1/);
  assert.match(config, /allowMixedContent: false/);
  assert.match(config, /minWebViewVersion: 111/);
  assert.match(config, /resolveServiceWorkerRequests: false/);
  assert.match(config, /webContentsDebuggingEnabled: false/);
  assert.doesNotMatch(config, /PrivacyScreen/);
  assert.match(config, /limitsNavigationsToAppBoundDomains: true/);
  assert.match(gradle, /applicationId "sa\.dally\.mobile"/);
  assert.match(gradle, /versionCode 4/);
  assert.match(gradle, /versionName "1\.0\.3"/);
  assert.match(strings, /<string name="app_name">نظام دالي الإداري<\/string>/);
});

test("server admits the Dali mobile marker without weakening desktop or PWA access", async () => {
  const [proxy, layout, compatibility] = await Promise.all([read("proxy.ts"), read("app/portal/layout.tsx"), read("public/mobile/compatibility.html")]);
  assert.match(proxy, /mobileMarker\.test\(userAgent\)/);
  assert.match(proxy, /trustedNativeRequest = desktopRequest \|\| mobileRequest/);
  assert.match(proxy, /!trustedNativeRequest && !trustedPwaRequest && !emergencyBrowserAccess/);
  assert.match(proxy, /pwaAccessFromCookieHeader/);
  assert.match(proxy, /requestHeaders\.set\("x-dali-pathname"/);
  assert.match(proxy, /camera=\(self\), microphone=\(self\)/);
  assert.match(proxy, /minimumAndroidWebView = 111/);
  assert.match(proxy, /webViewMajor < minimumAndroidWebView/);
  assert.match(compatibility, /Android System WebView/);
  assert.match(layout, /<PwaAccessRuntime \/>/);
  assert.match(layout, /src="\/mobile\/runtime\.js"/);
});

test("mobile offline records are encrypted and sensitive operations stay online", async () => {
  const worker = await read("public/mobile/service-worker.js");
  assert.match(worker, /AES-GCM/);
  assert.match(worker, /extractable|generateKey\(\{ name: "AES-GCM", length: 256 \}, false/);
  assert.match(worker, /privilegedActions/);
  assert.match(worker, /method === "DELETE"/);
  assert.match(worker, /SHA-256/);
  assert.match(worker, /idempotencyKey/);
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
  const [manifest, activity, network, plist, runtime, nextConfig] = await Promise.all([
    read("mobile/android/app/src/main/AndroidManifest.xml"),
    read("mobile/android/app/src/main/java/sa/dally/mobile/MainActivity.java"),
    read("mobile/android/app/src/main/res/xml/network_security_config.xml"),
    read("mobile/ios/App/App/Info.plist"),
    read("public/mobile/runtime.js"),
    read("next.config.ts"),
  ]);
  assert.match(manifest, /android:allowBackup="false"/);
  assert.match(manifest, /android:usesCleartextTraffic="false"/);
  assert.match(manifest, /android:hardwareAccelerated="true"/);
  assert.match(manifest, /android\.permission\.CAMERA/);
  assert.match(manifest, /android\.permission\.RECORD_AUDIO/);
  assert.doesNotMatch(manifest, /READ_MEDIA_IMAGES/);
  assert.match(activity, /onRenderProcessGone/);
  assert.match(activity, /recoverFromRendererFailure/);
  assert.match(activity, /isInfinixDevice/);
  assert.match(activity, /View\.LAYER_TYPE_SOFTWARE/);
  assert.match(activity, /setAlgorithmicDarkeningAllowed\(false\)/);
  assert.match(activity, /inspectPortalRender/);
  assert.match(activity, /hasVisiblePortalContent/);
  assert.match(activity, /renderRecovery=1/);
  const styles = await read("mobile/android/app/src/main/res/values/styles.xml");
  assert.match(styles, /Theme\.AppCompat\.Light\.NoActionBar/);
  assert.match(styles, /android:forceDarkAllowed">false/);
  assert.match(network, /cleartextTrafficPermitted="false"/);
  assert.match(plist, /WKAppBoundDomains/);
  assert.match(plist, /NSCameraUsageDescription/);
  assert.match(runtime, /Filesystem\.writeFile/);
  assert.match(runtime, /PushNotifications/);
  assert.match(runtime, /updateViaCache: "none"/);
  assert.match(nextConfig, /source: "\/mobile\/service-worker\.js"/);
  assert.match(nextConfig, /Service-Worker-Allowed/);
});
