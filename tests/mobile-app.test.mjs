import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("mobile container targets Android and iOS through the trusted production portal", async () => {
  const [pkg, config] = await Promise.all([read("mobile/package.json"), read("mobile/capacitor.config.ts")]);
  assert.match(pkg, /@capacitor\/android/);
  assert.match(pkg, /@capacitor\/ios/);
  assert.match(config, /https:\/\/www\.dally\.info\/portal/);
  assert.match(config, /DaliMobile\/1/);
  assert.match(config, /allowMixedContent: false/);
  assert.match(config, /webContentsDebuggingEnabled: false/);
  assert.match(config, /limitsNavigationsToAppBoundDomains: true/);
});

test("server admits the mobile marker without weakening ordinary browser isolation", async () => {
  const proxy = await read("proxy.ts");
  assert.match(proxy, /mobileMarker\.test\(request\.headers\.get\("user-agent"\)/);
  assert.match(proxy, /trustedAppRequest = desktopRequest \|\| mobileRequest/);
  assert.match(proxy, /!trustedAppRequest && !emergencyBrowserAccess/);
  assert.match(proxy, /camera=\(self\), microphone=\(self\)/);
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
  const [manifest, network, plist, runtime] = await Promise.all([
    read("mobile/android/app/src/main/AndroidManifest.xml"),
    read("mobile/android/app/src/main/res/xml/network_security_config.xml"),
    read("mobile/ios/App/App/Info.plist"),
    read("public/mobile/runtime.js"),
  ]);
  assert.match(manifest, /android:allowBackup="false"/);
  assert.match(manifest, /android:usesCleartextTraffic="false"/);
  assert.match(network, /cleartextTrafficPermitted="false"/);
  assert.match(plist, /WKAppBoundDomains/);
  assert.match(plist, /NSCameraUsageDescription/);
  assert.match(runtime, /Filesystem\.writeFile/);
  assert.match(runtime, /PushNotifications/);
});
