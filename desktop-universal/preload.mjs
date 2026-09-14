import { contextBridge, ipcRenderer } from "electron";
import crypto from "node:crypto";

const SYNC_INTERVAL_MS = 20_000;
const originalFetch = globalThis.fetch.bind(globalThis);
const privilegedActions = new Set(["approve","post","mark-paid","pay-judgment","assign-case","initialize","add-bank","reset-password","activate"]);
const privilegedUrlParts = ["/status","/accounting","/government","/legal-cases","/users","/role-definitions","/access-scopes","/signed-document","/finance/posting"];

function absoluteUrl(input) {
  const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  return new URL(raw, location.href).href;
}
async function serializeBody(body) {
  if (!body) return null;
  if (typeof body === "string") return { type: "text", value: body };
  if (body instanceof URLSearchParams) return { type: "urlencoded", value: body.toString() };
  if (body instanceof FormData) {
    const values = [];
    for (const [name, value] of body.entries()) {
      if (value instanceof File) values.push({ name, file: true, fileName: value.name, contentType: value.type, value: Buffer.from(await value.arrayBuffer()).toString("base64") });
      else values.push({ name, file: false, value });
    }
    return { type: "form", value: values };
  }
  return null;
}
function requestAction(serialized) {
  if (serialized?.type !== "text") return "";
  try { return String(JSON.parse(serialized.value).action || ""); } catch { return ""; }
}
function isPrivileged(method, url, body) {
  const action = requestAction(body);
  if (method === "DELETE" || privilegedActions.has(action)) return true;
  if (method === "PATCH" && privilegedUrlParts.some(part => url.includes(part))) return true;
  if (/\/contracts\/\d+\/status/.test(url)) return true;
  return false;
}
async function cacheResponse(url, response) {
  const contentType = response.headers.get("content-type") || "";
  if (!response.ok || !contentType.includes("application/json")) return;
  const text = await response.clone().text();
  await ipcRenderer.invoke("dali:cache:put", url, { status: response.status, headers: [...response.headers.entries()], body: text });
}
async function cachedResponse(url) {
  const cached = await ipcRenderer.invoke("dali:cache:get", url);
  return cached ? new Response(cached.body, { status: cached.status, headers: cached.headers }) : null;
}
async function queueMutation(method, url, init, body) {
  const id = crypto.randomUUID();
  const idempotencyKey = crypto.createHash("sha256").update(method + url + JSON.stringify(body) + id).digest("hex");
  await ipcRenderer.invoke("dali:queue:add", { id, idempotencyKey, method, url, headers: [...new Headers(init.headers || {}).entries()], body, createdAt: new Date().toISOString(), attempts: 0 });
  window.dispatchEvent(new CustomEvent("dali-offline-queued", { detail: { id } }));
  return new Response(JSON.stringify({ status: "queued", offline: true, operationId: id, message: "حُفظت العملية محليًا وستُزامن عند عودة الاتصال." }), { status: 202, headers: { "content-type": "application/json" } });
}
globalThis.fetch = async (input, init = {}) => {
  const url = absoluteUrl(input);
  const method = String(init.method || (typeof input !== "string" && !(input instanceof URL) ? input.method : "GET")).toUpperCase();
  if (method === "GET") {
    try {
      const response = await originalFetch(input, init);
      await cacheResponse(url, response);
      return response;
    } catch (error) {
      const cached = await cachedResponse(url);
      if (cached) return cached;
      throw error;
    }
  }
  const body = await serializeBody(init.body);
  if (!navigator.onLine && isPrivileged(method, url, body)) throw new Error("هذا الإجراء حساس ويتطلب اتصالًا مباشرًا بالخادم.");
  try { return await originalFetch(input, init); }
  catch (error) {
    if (isPrivileged(method, url, body)) throw error;
    return queueMutation(method, url, init, body);
  }
};
function notifyServerChanges(changes) {
  const count = changes.length;
  window.dispatchEvent(new CustomEvent("dali-server-changes", { detail: { count, changes } }));
  let badge = document.getElementById("dali-desktop-update-badge");
  if (!badge) {
    badge = document.createElement("div");
    badge.id = "dali-desktop-update-badge";
    badge.setAttribute("role", "status");
    Object.assign(badge.style, { position:"fixed", left:"18px", bottom:"18px", zIndex:"2147483647", border:"0", borderRadius:"12px", padding:"12px 16px", background:"#d5a94e", color:"#071a2b", fontWeight:"800", pointerEvents:"none", opacity:"1", transition:"opacity .25s ease" });
    document.body.appendChild(badge);
  }
  badge.style.opacity = "1";
  badge.textContent = `تم تحديث البيانات تلقائيًا (${count})`;
  window.setTimeout(() => { if (badge) badge.style.opacity = "0"; }, 2500);
}
async function flushQueue() {
  if (!navigator.onLine) return;
  const syncState = await ipcRenderer.invoke("dali:state");
  const registration = await originalFetch(`/api/portal/desktop/sync?deviceId=${encodeURIComponent(syncState.deviceId)}&cursor=${syncState.serverCursor || 0}`, { credentials: "include" }).catch(() => null);
  if (!registration?.ok) return;
  const serverSync = await registration.json().catch(() => null);
  if (serverSync?.cursor) await ipcRenderer.invoke("dali:cursor:set", serverSync.cursor);
  if (serverSync?.changes?.length) notifyServerChanges(serverSync.changes);
  const queue = await ipcRenderer.invoke("dali:queue:list");
  for (const operation of queue) {
    try {
      const state = await ipcRenderer.invoke("dali:state");
      const target = new URL(operation.url);
      const response = await originalFetch("/api/portal/desktop/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          deviceId: state.deviceId,
          deviceName: navigator.userAgent.slice(0, 160),
          idempotencyKey: operation.idempotencyKey,
          method: operation.method,
          requestPath: target.pathname + target.search,
          headers: operation.headers,
          body: operation.body,
        }),
      });
      if (response.ok) await ipcRenderer.invoke("dali:queue:done", operation.id, new Date().toISOString());
      else if ([409, 412, 422].includes(response.status)) await ipcRenderer.invoke("dali:queue:conflict", operation.id, { status: response.status, body: await response.text() });
      else if (response.status >= 400 && response.status < 500) await ipcRenderer.invoke("dali:queue:conflict", operation.id, { status: response.status, body: await response.text() });
    } catch {}
  }
  window.dispatchEvent(new CustomEvent("dali-sync-complete", { detail: await ipcRenderer.invoke("dali:state") }));
}
setInterval(() => void flushQueue(), SYNC_INTERVAL_MS);
window.addEventListener("online", () => void flushQueue());
contextBridge.exposeInMainWorld("daliDesktop", {
  state: () => ipcRenderer.invoke("dali:state"),
  syncNow: () => flushQueue(),
  isOnline: () => navigator.onLine,
  policy: { intervalSeconds: 20, privilegedOperationsRequireOnline: true },
});
