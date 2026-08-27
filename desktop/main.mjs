import { app, BrowserWindow, ipcMain, net, safeStorage, session } from "electron";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import crypto from "node:crypto";

const PORTAL_URL = process.env.DALI_DESKTOP_URL || "https://www.dally.info/portal";
let mainWindow;
let storePath;
let keyPath;
let key;

function encrypt(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const bytes = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return { iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), data: bytes.toString("base64") };
}
function decrypt(value) {
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(value.iv, "base64"));
  decipher.setAuthTag(Buffer.from(value.tag, "base64"));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(value.data, "base64")), decipher.final()]).toString("utf8"));
}
async function loadKey() {
  await mkdir(app.getPath("userData"), { recursive: true });
  keyPath = join(app.getPath("userData"), "desktop.key");
  if (existsSync(keyPath)) {
    const protectedKey = Buffer.from(await readFile(keyPath, "utf8"), "base64");
    key = safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(protectedKey) : protectedKey.toString("utf8");
    key = Buffer.from(key, "base64");
    return;
  }
  key = crypto.randomBytes(32);
  const encoded = key.toString("base64");
  const protectedKey = safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(encoded) : Buffer.from(encoded, "utf8");
  await writeFile(keyPath, protectedKey.toString("base64"), { mode: 0o600 });
}
async function readStore() {
  try { return decrypt(JSON.parse(await readFile(storePath, "utf8"))); }
  catch { return { deviceId: crypto.randomUUID(), cache: {}, queue: [], conflicts: [], lastSyncAt: null }; }
}
async function writeStore(store) {
  await writeFile(storePath, JSON.stringify(encrypt(store)), { mode: 0o600 });
}
async function mutateStore(handler) {
  const store = await readStore();
  const result = await handler(store);
  await writeStore(store);
  return result;
}
function registerIpc() {
  ipcMain.handle("dali:state", async () => {
    const store = await readStore();
    return { deviceId: store.deviceId, queued: store.queue.length, conflicts: store.conflicts.length, lastSyncAt: store.lastSyncAt };
  });
  ipcMain.handle("dali:cache:get", async (_event, cacheKey) => (await readStore()).cache[cacheKey] || null);
  ipcMain.handle("dali:cache:put", async (_event, cacheKey, response) => mutateStore(store => {
    store.cache[cacheKey] = { ...response, cachedAt: new Date().toISOString() };
    return true;
  }));
  ipcMain.handle("dali:queue:add", async (_event, operation) => mutateStore(store => {
    if (!store.queue.some(item => item.idempotencyKey === operation.idempotencyKey)) store.queue.push(operation);
    return { queued: store.queue.length };
  }));
  ipcMain.handle("dali:queue:list", async () => (await readStore()).queue);
  ipcMain.handle("dali:queue:done", async (_event, id, syncAt) => mutateStore(store => {
    store.queue = store.queue.filter(item => item.id !== id);
    store.lastSyncAt = syncAt;
    return true;
  }));
  ipcMain.handle("dali:queue:conflict", async (_event, id, conflict) => mutateStore(store => {
    const operation = store.queue.find(item => item.id === id);
    store.queue = store.queue.filter(item => item.id !== id);
    if (operation) store.conflicts.push({ ...operation, conflict, detectedAt: new Date().toISOString() });
    return true;
  }));
}
async function openWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    backgroundColor: "#071a2b",
    webPreferences: {
      preload: join(import.meta.dirname, "preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://www.dally.info/")) return { action: "allow" };
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith("https://www.dally.info/")) event.preventDefault();
  });
  mainWindow.once("ready-to-show", () => mainWindow.show());
  try {
    await mainWindow.loadURL(PORTAL_URL);
    const snapshot = join(app.getPath("userData"), "portal-snapshot.mhtml");
    await mainWindow.webContents.savePage(snapshot, "MHTML").catch(() => undefined);
  } catch {
    await mainWindow.loadFile(join(import.meta.dirname, "offline.html"));
  }
}
app.whenReady().then(async () => {
  storePath = join(app.getPath("userData"), "offline-store.enc");
  await loadKey();
  if (!existsSync(storePath)) await writeStore({ deviceId: crypto.randomUUID(), cache: {}, queue: [], conflicts: [], lastSyncAt: null });
  registerIpc();
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  await openWindow();
});
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) void openWindow(); });
