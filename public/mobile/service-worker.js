"use strict";

const DB_NAME = "dali-mobile-secure-v1";
const DB_VERSION = 1;
const SHELL_CACHE = "dali-mobile-shell-v1";
const SYNC_PATH = "/api/portal/desktop/sync";
const MAX_CACHE_BYTES = 2_000_000;
const privilegedActions = new Set(["approve", "post", "mark-paid", "pay-judgment", "assign-case", "initialize", "add-bank", "reset-password", "activate"]);
const privilegedUrlParts = ["/status", "/accounting", "/government", "/legal-cases", "/users", "/role-definitions", "/access-scopes", "/signed-document", "/finance/posting"];

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const store of ["meta", "keys", "responses", "queue", "conflicts"]) if (!db.objectStoreNames.contains(store)) db.createObjectStore(store, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function storeGet(name, id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(name, "readonly");
    const request = transaction.objectStore(name).get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  }).finally(() => db.close());
}

async function storePut(name, value) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(name, "readwrite");
    transaction.objectStore(name).put(value);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  }).finally(() => db.close());
}

async function storeDelete(name, id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(name, "readwrite");
    transaction.objectStore(name).delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  }).finally(() => db.close());
}

async function storeAll(name) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(name, "readonly").objectStore(name).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  }).finally(() => db.close());
}

async function encryptionKey() {
  const existing = await storeGet("keys", "primary");
  if (existing?.key) return existing.key;
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  await storePut("keys", { id: "primary", key });
  return key;
}

async function seal(value) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = new TextEncoder().encode(JSON.stringify(value));
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await encryptionKey(), plain);
  return { iv, data };
}

async function open(record) {
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: record.iv }, await encryptionKey(), record.data);
  return JSON.parse(new TextDecoder().decode(plain));
}

function hex(bytes) { return [...new Uint8Array(bytes)].map((part) => part.toString(16).padStart(2, "0")).join(""); }
async function sha256(value) { return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))); }
async function deviceId() {
  const existing = await storeGet("meta", "device");
  if (existing?.value) return existing.value;
  const value = crypto.randomUUID();
  await storePut("meta", { id: "device", value });
  return value;
}

function bodyAction(body) {
  if (body?.type !== "text") return "";
  try { return String(JSON.parse(body.value).action || ""); } catch { return ""; }
}
function isPrivileged(method, url, body) {
  if (method === "DELETE" || privilegedActions.has(bodyAction(body))) return true;
  if (method === "PATCH" && privilegedUrlParts.some((part) => url.includes(part))) return true;
  return /\/contracts\/\d+\/status/.test(url);
}

function bytesToBase64(bytes) {
  let binary = "";
  const view = new Uint8Array(bytes);
  for (let offset = 0; offset < view.length; offset += 8192) binary += String.fromCharCode(...view.subarray(offset, offset + 8192));
  return btoa(binary);
}

async function serializeBody(request) {
  if (request.method === "GET" || request.method === "HEAD") return null;
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    const form = await request.clone().formData();
    const values = [];
    for (const [name, value] of form.entries()) {
      if (value instanceof File) values.push({ name, file: true, fileName: value.name, contentType: value.type, value: bytesToBase64(await value.arrayBuffer()) });
      else values.push({ name, file: false, value });
    }
    return { type: "form", value: values };
  }
  const value = await request.clone().text();
  return { type: contentType.includes("application/x-www-form-urlencoded") ? "urlencoded" : "text", value };
}

async function cacheJson(request, response) {
  if (!response.ok || !(response.headers.get("content-type") || "").includes("application/json")) return;
  const body = await response.clone().text();
  if (new TextEncoder().encode(body).byteLength > MAX_CACHE_BYTES) return;
  const encrypted = await seal({ status: response.status, headers: [...response.headers.entries()].filter(([name]) => ["content-type", "cache-control"].includes(name.toLowerCase())), body, savedAt: new Date().toISOString() });
  await storePut("responses", { id: request.url, ...encrypted });
}

async function cachedJson(request) {
  const record = await storeGet("responses", request.url);
  if (!record) return null;
  try {
    const cached = await open(record);
    return new Response(cached.body, { status: cached.status, headers: [...cached.headers, ["x-dali-offline-cache", "1"]] });
  } catch {
    await storeDelete("responses", request.url);
    return null;
  }
}

async function queueMutation(request, body) {
  const id = crypto.randomUUID();
  const url = new URL(request.url);
  const idempotencyKey = await sha256(`${request.method}:${url.pathname}${url.search}:${JSON.stringify(body)}:${id}`);
  const encrypted = await seal({ idempotencyKey, method: request.method, requestPath: url.pathname + url.search, headers: [...request.headers.entries()].filter(([name]) => ["content-type", "accept"].includes(name.toLowerCase())), body, createdAt: new Date().toISOString() });
  await storePut("queue", { id, ...encrypted });
  await broadcast({ type: "dali-offline-queued", id });
  return new Response(JSON.stringify({ status: "queued", offline: true, operationId: id, message: "حُفظت العملية محليًا وستُزامن عند عودة الاتصال." }), { status: 202, headers: { "content-type": "application/json" } });
}

async function broadcast(message) {
  const clients = await self.clients.matchAll({ includeUncontrolled: true, type: "window" });
  for (const client of clients) client.postMessage(message);
}

function platform() { return /Android/i.test(self.navigator.userAgent) ? "android" : /iPhone|iPad|iPod/i.test(self.navigator.userAgent) ? "ios" : "mobile"; }
async function sync() {
  if (!self.navigator.onLine) return;
  const id = await deviceId();
  const cursorRecord = await storeGet("meta", "cursor");
  const registration = await fetch(`${SYNC_PATH}?deviceId=${encodeURIComponent(id)}&cursor=${Number(cursorRecord?.value || 0)}`, { headers: { "x-dali-device-name": self.navigator.userAgent.slice(0, 160), "x-dali-device-platform": platform() }, credentials: "include" }).catch(() => null);
  if (!registration?.ok) return;
  const serverState = await registration.json().catch(() => null);
  if (Number.isSafeInteger(serverState?.cursor)) await storePut("meta", { id: "cursor", value: serverState.cursor });
  const queue = await storeAll("queue");
  for (const record of queue) {
    try {
      const operation = await open(record);
      const response = await fetch(SYNC_PATH, { method: "POST", credentials: "include", headers: { "content-type": "application/json", "x-dali-device-platform": platform() }, body: JSON.stringify({ deviceId: id, deviceName: self.navigator.userAgent.slice(0, 160), ...operation }) });
      if (response.ok) await storeDelete("queue", record.id);
      else if ([400, 403, 409, 412, 422].includes(response.status)) {
        await storePut("conflicts", { ...record, errorStatus: response.status, failedAt: new Date().toISOString() });
        await storeDelete("queue", record.id);
        await broadcast({ type: "dali-sync-conflict", id: record.id, status: response.status });
      }
    } catch {}
  }
  await broadcast({ type: "dali-sync-complete", state: { cursor: serverState?.cursor || 0, changes: serverState?.changes?.length || 0, queued: (await storeAll("queue")).length, conflicts: (await storeAll("conflicts")).length } });
}

self.addEventListener("install", (event) => event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(["/mobile/offline.html", "/dally-logo.jpg"]))));
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("message", (event) => { if (event.data?.type === "dali-sync") event.waitUntil(sync()); });
self.addEventListener("sync", (event) => { if (event.tag === "dali-mobile-sync") event.waitUntil(sync()); });
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/mobile/offline.html")));
    return;
  }
  if (url.pathname.startsWith("/_next/static/") || url.pathname === "/dally-logo.jpg") {
    event.respondWith(caches.open(SHELL_CACHE).then(async (cache) => {
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) await cache.put(request, response.clone());
      return response;
    }));
    return;
  }
  if (!url.pathname.startsWith("/api/portal/") || url.pathname === SYNC_PATH) return;
  if (request.method === "GET") {
    event.respondWith(fetch(request).then(async (response) => { await cacheJson(request, response); return response; }).catch(async () => (await cachedJson(request)) || new Response(JSON.stringify({ error: "لا توجد نسخة محفوظة لهذه البيانات" }), { status: 503, headers: { "content-type": "application/json" } })));
    return;
  }
  event.respondWith((async () => {
    const body = await serializeBody(request);
    if (!self.navigator.onLine && isPrivileged(request.method, request.url, body)) return new Response(JSON.stringify({ error: "هذا الإجراء حساس ويتطلب اتصالًا مباشرًا بالخادم" }), { status: 503, headers: { "content-type": "application/json" } });
    try { return await fetch(request); }
    catch (error) {
      if (isPrivileged(request.method, request.url, body)) throw error;
      return queueMutation(request, body);
    }
  })());
});
