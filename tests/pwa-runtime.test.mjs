import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

async function readPngSize(path) {
  const image = await readFile(new URL(`../${path}`, import.meta.url));
  assert.deepEqual([...image.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  return { width: image.readUInt32BE(16), height: image.readUInt32BE(20) };
}

test("PWA manifest opens the trusted-device launcher with installable icons", async () => {
  const manifest = await read("app/pwa/manifest.webmanifest/route.ts");
  assert.match(manifest, /start_url:\s*"\/pwa\/launch"/);
  assert.match(manifest, /display:\s*"standalone"/);
  assert.match(manifest, /purpose:\s*"maskable"/);
  assert.match(manifest, /icon-192\.png/);
  assert.match(manifest, /icon-512\.png/);
});

test("PWA icons have the exact dimensions advertised to Apple and browsers", async () => {
  assert.deepEqual(await readPngSize("public/pwa/icon-192.png"), { width: 192, height: 192 });
  assert.deepEqual(await readPngSize("public/pwa/icon-512.png"), { width: 512, height: 512 });
  assert.deepEqual(await readPngSize("public/pwa/icon-maskable-512.png"), { width: 512, height: 512 });
  assert.deepEqual(await readPngSize("public/pwa/apple-touch-icon.png"), { width: 180, height: 180 });
});

test("service worker never caches authenticated, API, or enrollment pages", async () => {
  const worker = await read("public/sw.js");
  for (const path of ["/api", "/portal", "/login", "/client", "/worker", "/credentials", "/contracts/signature"]) {
    assert.match(worker, new RegExp(`"${path.replace("/", "\\/")}"`));
  }
  assert.match(worker, /if \(url\.origin !== self\.location\.origin \|\| isPrivatePath\(url\.pathname\)\) return/);
  assert.doesNotMatch(worker, /cache\.put\(request[^\n]+navigate/);
  assert.match(worker, /PRECACHE_URLS\.includes\(url\.pathname\)/);
  assert.doesNotMatch(worker, /url\.pathname\.startsWith\("\/pwa\/"\)/);
});

test("administrative install metadata is isolated from the public-site manifest", async () => {
  const runtime = await read("app/components/PwaRuntime.tsx");
  const [rootLayout, publicManifest, pwaLayout] = await Promise.all([read("app/layout.tsx"), read("app/manifest.ts"), read("app/pwa/layout.tsx")]);
  assert.match(runtime, /process\.env\.NODE_ENV !== "production"/);
  assert.match(runtime, /navigator\.serviceWorker\.register\("\/sw\.js"/);
  assert.match(runtime, /updateViaCache:\s*"none"/);
  assert.match(pwaLayout, /<PwaRuntime\s*\/>/);
  assert.match(pwaLayout, /manifest:\s*"\/pwa\/manifest\.webmanifest"/);
  assert.match(pwaLayout, /appleWebApp/);
  assert.doesNotMatch(rootLayout, /PwaRuntime|appleWebApp/);
  assert.match(rootLayout, /manifest:\s*"\/manifest\.webmanifest"/);
  assert.match(publicManifest, /start_url:\s*"\/"/);
  assert.doesNotMatch(publicManifest, /pwa\/launch|dali-portal-pwa/);
});

test("iPhone activation keeps a non-extractable P-256 private key on the device", async () => {
  const [client, enroll, challenge, session] = await Promise.all([
    read("app/components/pwa-device-client.ts"),
    read("app/api/pwa/enroll/route.ts"),
    read("app/api/pwa/challenge/route.ts"),
    read("app/api/pwa/session/route.ts"),
  ]);
  assert.match(client, /generateKey\(\{ name: "ECDSA", namedCurve: "P-256" \}, false/);
  assert.match(client, /privateKey: keyPair\.privateKey/);
  assert.match(client, /indexedDB\.open/);
  assert.doesNotMatch(client, /exportKey\("jwk", keyPair\.privateKey/);
  assert.match(enroll, /publicKeyJwk/);
  assert.match(enroll, /db\.transaction/);
  assert.match(enroll, /PWA_ENROLLMENT_ALREADY_USED/);
  assert.match(challenge, /CHALLENGE_SECONDS = 90/);
  assert.match(session, /crypto\.subtle\.verify/);
  assert.match(session, /isNull\(pwaDeviceChallenges\.usedAt\)/);
  assert.match(session, /CHALLENGE_REPLAY/);
});

test("temporary PWA access cannot replace the user's normal login", async () => {
  const [access, launch, proxy, login] = await Promise.all([
    read("lib/pwa-access.ts"),
    read("app/components/PwaLaunchClient.tsx"),
    read("proxy.ts"),
    read("app/api/auth/login/route.ts"),
  ]);
  assert.match(access, /PWA_ACCESS_SECONDS = 5 \* 60/);
  assert.match(access, /HttpOnly; SameSite=Strict/);
  assert.match(access, /HMAC/);
  assert.match(launch, /isStandalonePwa\(\)/);
  assert.match(launch, /\/login\?returnTo=%2Fportal&source=pwa/);
  assert.match(launch, /رقم هويته وكلمة مروره/);
  assert.match(proxy, /desktopOnlyPath/);
  assert.match(proxy, /pwaAccessFromCookieHeader/);
  assert.match(proxy, /!desktopRequest && !trustedPwaRequest/);
  assert.match(login, /hasAuthorizedApplicationEntry/);
  assert.match(login, /pwaDevices\.status/);
  assert.match(login, /device\?\.status === "active"/);
});

test("only user administrators can issue or revoke one-time enrollment codes", async () => {
  const adminRoute = await read("app/api/portal/pwa-devices/route.ts");
  assert.match(adminRoute, /canAdministerPortalUsers/);
  assert.match(adminRoute, /ENROLLMENT_MINUTES = 20/);
  assert.match(adminRoute, /sha256\(normalizedCode\)/);
  assert.match(adminRoute, /revoke-enrollment/);
  assert.match(adminRoute, /revoke-device/);
  assert.match(adminRoute, /emitPortalNotification/);
  assert.match(adminRoute, /auditPortalAction/);
});

test("trusted-device migration is additive and records revocation state", async () => {
  const [migration, schema] = await Promise.all([
    read("drizzle-pg/0065_pwa_trusted_devices.sql"),
    read("db/schema.ts"),
  ]);
  for (const table of ["pwa_devices", "pwa_enrollment_tokens", "pwa_device_challenges"]) {
    assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${table}`));
  }
  assert.doesNotMatch(migration, /DROP TABLE|TRUNCATE|DELETE FROM|ALTER TABLE.+DROP/i);
  assert.match(migration, /status IN \('active','revoked'\)/);
  assert.match(schema, /export const pwaDevices = pgTable/);
  assert.match(schema, /revocationReason: text\("revocation_reason"\)/);
});

test("PWA enrollment and proof endpoints are rate-limited and same-origin", async () => {
  const routes = await Promise.all([
    read("app/api/pwa/enroll/route.ts"),
    read("app/api/pwa/challenge/route.ts"),
    read("app/api/pwa/session/route.ts"),
  ]);
  for (const route of routes) {
    assert.match(route, /rejectCrossSiteRequest/);
    assert.match(route, /enforcePublicRateLimit/);
    assert.match(route, /readLimitedJson/);
    assert.match(route, /jsonNoStore/);
  }
});
