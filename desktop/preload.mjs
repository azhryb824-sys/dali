import { contextBridge, ipcRenderer } from "electron";
import crypto from "node:crypto";

const SYNC_INTERVAL_MS = 20_000;
const originalFetch = globalThis.fetch.bind(globalThis);
const privilegedActions = new Set(["approve","post","mark-paid","pay-judgment","assign-case"]);
const privilegedUrlParts = ["/status","/accounting","/government","/legal-cases"];

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
function restoreBody(body) {
  if (!body) return undefined;
  if (body.type === "text") return body.value;
  if (body.type === "urlencoded") return new URLSearchParams(body.value);
  if (body.type === "form") {
    const form = new FormData();
    for (const item of body.value) {
      if (item.file) form.append(item.name, new File([Uint8Array.from(atob(item.value), char => char.charCodeAt(0))], item.fileName, { type: item.contentType }));
      else form.append(item.name, item.value);
    }
    return form;
  }
}
function requestAction(serialized) {
  if (serialized?.type !== "text") return "";
  try { return String(JSON.parse(serialized.value).action || ""); } catch { return ""; }
}
function isPrivileged(method, url, body) {
  const action = requestAction(body);
  if (privilegedActions.has(action)) return true;
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
async function flushQueue() {
  if (!navigator.onLine) return;
  const queue = await ipcRenderer.invoke("dali:queue:list");
  for (const operation of queue) {
    try {
      const headers = new Headers(operation.headers);
      headers.set("x-idempotency-key", operation.idempotencyKey);
      const response = await originalFetch(operation.url, { method: operation.method, headers, body: restoreBody(operation.body), credentials: "include" });
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
