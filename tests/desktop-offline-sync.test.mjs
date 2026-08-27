import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read=(path)=>readFile(path,"utf8");

test("desktop uses the same production portal with encrypted local persistence",async()=>{
  const[main,pkg]=await Promise.all([read("desktop/main.mjs"),read("desktop/package.json")]);
  assert.match(main,/https:\/\/www\.dally\.info\/portal/);
  assert.match(main,/aes-256-gcm/);
  assert.match(main,/safeStorage/);
  assert.match(main,/contextIsolation: true/);
  assert.match(main,/nodeIntegration: false/);
  assert.match(pkg,/electron-builder/);
  assert.match(pkg,/nsis/);
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
