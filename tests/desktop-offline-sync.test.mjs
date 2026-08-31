import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read=(path)=>readFile(path,"utf8");

test("desktop uses the same production portal with encrypted local persistence",async()=>{
  const[main,pkg]=await Promise.all([read("desktop/main.mjs"),read("desktop/package.json")]);
  assert.match(main,/https:\/\/www\.dally\.info/);
  assert.match(main,/\/api\/portal\/desktop\/entry-link/);
  assert.match(main,/PORTAL_LOGIN_FALLBACK/);
  assert.match(main,/aes-256-gcm/);
  assert.match(main,/safeStorage/);
  assert.match(main,/contextIsolation: true/);
  assert.match(main,/nodeIntegration: false/);
  assert.match(pkg,/electron-builder/);
  assert.match(pkg,/nsis/);
});

test("administrative entry is desktop-only while public pages remain available",async()=>{
  const [proxy,main,desktopPackage]=await Promise.all([read("proxy.ts"),read("desktop/main.mjs"),read("desktop/package.json")]);
  assert.match(proxy,/desktopOnlyPath/);
  assert.match(proxy,/x-dali-desktop-app/);
  assert.match(proxy,/DALI_ALLOW_BROWSER_PORTAL/);
  assert.match(main,/webRequest\.onBeforeSendHeaders/);
  assert.match(main,/dali-desktop-v1/);
  assert.match(main,/x-dali-desktop-device/);
  assert.match(desktopPackage,/dali-icon\.ico/);
  assert.doesNotMatch(proxy,/desktopOnlyPath\s*=.*contracts\/signature/);
});

test("desktop entry uses a short-lived device-bound link that only opens login",async()=>{
  const[main,token,issue,redeem,login,proxy]=await Promise.all([
    read("desktop/main.mjs"),
    read("lib/desktop-entry.ts"),
    read("app/api/portal/desktop/entry-link/route.ts"),
    read("app/desktop-access/[token]/route.ts"),
    read("app/login/page.tsx"),
    read("proxy.ts"),
  ]);
  assert.match(main,/requestPortalEntryUrl/);
  assert.match(main,/\/desktop-access\//);
  assert.match(token,/HMAC/);
  assert.match(token,/SHA-256/);
  assert.match(token,/DESKTOP_ENTRY_SECONDS = 5 \* 60/);
  assert.match(token,/payload\.deviceId !== deviceId/);
  assert.match(token,/HttpOnly; SameSite=Strict/);
  assert.match(issue,/enforcePublicRateLimit/);
  assert.match(redeem,/verifyDesktopEntryToken/);
  assert.match(redeem,/\/login\?returnTo=%2Fportal/);
  assert.doesNotMatch(redeem,/createIdentityToken|issuePortalSession/);
  assert.match(login,/hasVerifiedDesktopEntry/);
  assert.match(proxy,/desktop-access/);
});

test("macOS packaging keeps the Arabic bundle name byte-identical to Electron helpers",async()=>{
  const[signing,workflow]=await Promise.all([
    read("desktop/scripts/adhoc-sign-mac.cjs"),
    read(".github/workflows/desktop-macos-no-terminal.yml"),
  ]);
  assert.match(signing,/alignBundleNameWithHelpers/);
  assert.match(signing,/CFBundleName/);
  assert.match(signing,/primaryHelper\.slice/);
  assert.match(workflow,/Contents\/Frameworks\/\$bundle_name Helper\.app/);
});

test("offline queue synchronizes every twenty seconds and server prevents duplicate writes",async()=>{
  const[preload,route,migration]=await Promise.all([read("desktop/preload.mjs"),read("app/api/portal/desktop/sync/route.ts"),read("drizzle-pg/0056_desktop_offline_sync.sql")]);
  assert.match(preload,/SYNC_INTERVAL_MS = 20_000/);
  assert.match(preload,/idempotencyKey: operation\.idempotencyKey/);
  assert.match(preload,/\/api\/portal\/desktop\/sync/);
  assert.match(route,/headers\.set\("x-idempotency-key",idempotencyKey\)/);
  assert.match(route,/idempotencyKey/);
  assert.match(route,/desktopSyncOperations\.idempotencyKey/);
  assert.match(route,/x-dali-idempotent-replay/);
  assert.match(migration,/idempotency_key text NOT NULL UNIQUE/);
});

test("server changes update the current view without reloading the page",async()=>{
  const preload=await read("desktop/preload.mjs");
  assert.doesNotMatch(preload,/location\.reload\s*\(/);
  assert.match(preload,/dali-server-changes/);
  assert.match(preload,/CustomEvent/);
});

test("approvals payments posting and destructive actions cannot queue offline",async()=>{
  const[preload,route]=await Promise.all([read("desktop/preload.mjs"),read("app/api/portal/desktop/sync/route.ts")]);
  for(const action of ["approve","post","mark-paid","pay-judgment","assign-case","add-bank","reset-password"]){
    assert.match(preload,new RegExp(action.replace("-","\\-")));
    assert.match(route,new RegExp(action.replace("-","\\-")));
  }
  assert.match(preload,/method === "DELETE"/);
  assert.match(route,/method==="DELETE"/);
  assert.match(preload,/هذا الإجراء حساس ويتطلب اتصالًا مباشرًا بالخادم/);
  assert.match(route,/هذا الإجراء حساس ولا يُقبل من طابور العمل دون اتصال/);
});

test("desktop sync schema is additive",async()=>{
  const migration=await read("drizzle-pg/0056_desktop_offline_sync.sql");
  assert.match(migration,/CREATE TABLE IF NOT EXISTS public\.desktop_devices/);
  assert.match(migration,/CREATE TABLE IF NOT EXISTS public\.desktop_sync_operations/);
  assert.doesNotMatch(migration,/DROP TABLE|TRUNCATE|DELETE FROM/i);
});
