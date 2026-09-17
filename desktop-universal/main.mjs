import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  safeStorage,
  session,
  shell,
} from "electron";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import crypto from "node:crypto";
import {
  isSafeExternalHttpsUrl,
  toWhatsAppAppUrl,
  toWhatsAppWebUrl,
} from "./external-navigation.mjs";

const PORTAL_ORIGIN = "https://www.dally.info";
const PORTAL_URL_OVERRIDE = process.env.DALI_DESKTOP_URL?.trim() || "";
const PORTAL_LOGIN_FALLBACK = `${PORTAL_ORIGIN}/login?returnTo=%2Fportal`;
const DESKTOP_MARKER = "dali-desktop-v1";
const APP_DATA_DIRECTORY = "DaliAdminUniversal";
const MAX_RENDERER_RECOVERIES = 2;

let mainWindow;
let storePath;
let keyPath;
let key;
let desktopDeviceId;
let mutationQueue = Promise.resolve();
let rendererRecoveryAttempts = 0;

async function openOutsideDesktop(value) {
  const whatsappAppUrl = toWhatsAppAppUrl(value);
  if (whatsappAppUrl) {
    try {
      await shell.openExternal(whatsappAppUrl);
      return;
    } catch (error) {
      console.error("Dali Universal WhatsApp launch failed:", error?.message || error);
      const whatsappWebUrl = toWhatsAppWebUrl(value);
      if (whatsappWebUrl) await shell.openExternal(whatsappWebUrl);
      return;
    }
  }
  if (isSafeExternalHttpsUrl(value)) await shell.openExternal(value);
}

function handOffExternalNavigation(value) {
  void openOutsideDesktop(value).catch((error) => {
    console.error("Dali Universal external link failed:", error?.message || error);
  });
}

app.setPath("userData", join(app.getPath("appData"), APP_DATA_DIRECTORY));
app.setAppUserModelId("sa.dally.desktop.universal");

function emptyStore() {
  return {
    deviceId: crypto.randomUUID(),
    cache: {},
    queue: [],
    conflicts: [],
    lastSyncAt: null,
    serverCursor: 0,
  };
}

function encrypt(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const bytes = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return {
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: bytes.toString("base64"),
  };
}

function decrypt(value) {
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(value.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(value.tag, "base64"));
  return JSON.parse(
    Buffer.concat([
      decipher.update(Buffer.from(value.data, "base64")),
      decipher.final(),
    ]).toString("utf8"),
  );
}

async function loadOrCreateKey() {
  await mkdir(app.getPath("userData"), { recursive: true });
  keyPath = join(app.getPath("userData"), "desktop.key");
  if (existsSync(keyPath)) {
    try {
      const protectedKey = Buffer.from(await readFile(keyPath, "utf8"), "base64");
      const encoded = safeStorage.isEncryptionAvailable()
        ? safeStorage.decryptString(protectedKey)
        : protectedKey.toString("utf8");
      const existingKey = Buffer.from(encoded, "base64");
      if (existingKey.length === 32) {
        key = existingKey;
        return;
      }
    } catch (error) {
      console.error("Dali Universal local key recovery failed:", error?.message || error);
    }
  }

  key = crypto.randomBytes(32);
  const encoded = key.toString("base64");
  const protectedKey = safeStorage.isEncryptionAvailable()
    ? safeStorage.encryptString(encoded)
    : Buffer.from(encoded, "utf8");
  await writeFile(keyPath, protectedKey.toString("base64"), { mode: 0o600 });
}

async function readStore() {
  try {
    const value = decrypt(JSON.parse(await readFile(storePath, "utf8")));
    if (!value?.deviceId || typeof value.cache !== "object" || !Array.isArray(value.queue)) {
      throw new Error("invalid-local-store");
    }
    return {
      ...emptyStore(),
      ...value,
      conflicts: Array.isArray(value.conflicts) ? value.conflicts : [],
      serverCursor: Number(value.serverCursor) || 0,
    };
  } catch {
    return emptyStore();
  }
}

async function writeStore(store) {
  await writeFile(storePath, JSON.stringify(encrypt(store)), { mode: 0o600 });
}

function mutateStore(handler) {
  const operation = mutationQueue.then(async () => {
    const store = await readStore();
    const result = await handler(store);
    await writeStore(store);
    return result;
  });
  mutationQueue = operation.then(
    () => undefined,
    () => undefined,
  );
  return operation;
}

function registerIpc() {
  ipcMain.handle("dali:state", async () => {
    const store = await readStore();
    return {
      deviceId: store.deviceId,
      queued: store.queue.length,
      conflicts: store.conflicts.length,
      lastSyncAt: store.lastSyncAt,
      serverCursor: store.serverCursor || 0,
    };
  });
  ipcMain.handle("dali:cache:get", async (_event, cacheKey) =>
    (await readStore()).cache[cacheKey] || null,
  );
  ipcMain.handle("dali:cache:put", async (_event, cacheKey, response) =>
    mutateStore((store) => {
      store.cache[cacheKey] = { ...response, cachedAt: new Date().toISOString() };
      return true;
    }),
  );
  ipcMain.handle("dali:cursor:set", async (_event, cursor) =>
    mutateStore((store) => {
      store.serverCursor = Math.max(store.serverCursor || 0, Number(cursor) || 0);
      return store.serverCursor;
    }),
  );
  ipcMain.handle("dali:queue:add", async (_event, operation) =>
    mutateStore((store) => {
      if (!store.queue.some((item) => item.idempotencyKey === operation.idempotencyKey)) {
        store.queue.push(operation);
      }
      return { queued: store.queue.length };
    }),
  );
  ipcMain.handle("dali:queue:list", async () => (await readStore()).queue);
  ipcMain.handle("dali:queue:done", async (_event, id, syncAt) =>
    mutateStore((store) => {
      store.queue = store.queue.filter((item) => item.id !== id);
      store.lastSyncAt = syncAt;
      return true;
    }),
  );
  ipcMain.handle("dali:queue:conflict", async (_event, id, conflict) =>
    mutateStore((store) => {
      const operation = store.queue.find((item) => item.id === id);
      store.queue = store.queue.filter((item) => item.id !== id);
      if (operation) {
        store.conflicts.push({
          ...operation,
          conflict,
          detectedAt: new Date().toISOString(),
        });
      }
      return true;
    }),
  );
}

function trustedPortalUrl(value, requiredPathPrefix = "/") {
  try {
    const url = new URL(value, PORTAL_ORIGIN);
    return url.origin === PORTAL_ORIGIN && url.pathname.startsWith(requiredPathPrefix)
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

async function requestPortalEntryUrl() {
  if (PORTAL_URL_OVERRIDE) {
    return trustedPortalUrl(PORTAL_URL_OVERRIDE) || PORTAL_LOGIN_FALLBACK;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(`${PORTAL_ORIGIN}/api/portal/desktop/entry-link`, {
      method: "POST",
      headers: {
        accept: "application/json",
        "x-dali-desktop-app": DESKTOP_MARKER,
        "x-dali-desktop-device": desktopDeviceId,
      },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`desktop-entry-${response.status}`);
    const payload = await response.json();
    const protectedUrl = trustedPortalUrl(String(payload?.url || ""), "/desktop-access/");
    if (!protectedUrl) throw new Error("desktop-entry-url-invalid");
    return protectedUrl;
  } catch (error) {
    console.error("Dali Universal protected entry failed:", error?.message || error);
    return PORTAL_LOGIN_FALLBACK;
  } finally {
    clearTimeout(timeout);
  }
}

async function loadOfflineFallback() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const snapshot = join(app.getPath("userData"), "portal-snapshot.mhtml");
  if (existsSync(snapshot)) {
    const loaded = await mainWindow.loadFile(snapshot).then(
      () => true,
      () => false,
    );
    if (loaded) return;
  }
  await mainWindow.loadFile(join(import.meta.dirname, "offline.html"));
}

async function loadPortal() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    await mainWindow.loadURL(await requestPortalEntryUrl());
    const snapshot = join(app.getPath("userData"), "portal-snapshot.mhtml");
    await mainWindow.webContents.savePage(snapshot, "MHTML").catch(() => undefined);
  } catch (error) {
    console.error("Dali Universal portal load failed:", error?.message || error);
    await loadOfflineFallback();
  }
}

function openWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    title: "نظام دالي الإداري الجديد",
    icon: join(import.meta.dirname, "assets", "dali-icon.png"),
    backgroundColor: "#071a2b",
    webPreferences: {
      preload: join(import.meta.dirname, "preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: true,
    },
  });

  const revealTimer = setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.show();
  }, 12_000);
  mainWindow.once("ready-to-show", () => {
    clearTimeout(revealTimer);
    mainWindow?.show();
  });
  mainWindow.on("closed", () => {
    clearTimeout(revealTimer);
    mainWindow = undefined;
  });
  mainWindow.webContents.on("did-finish-load", () => {
    rendererRecoveryAttempts = 0;
  });
  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const recoverable = ["crashed", "oom", "abnormal-exit", "killed"].includes(details.reason);
    if (recoverable && rendererRecoveryAttempts < MAX_RENDERER_RECOVERIES) {
      rendererRecoveryAttempts += 1;
      setTimeout(() => void loadPortal(), 800 * rendererRecoveryAttempts);
      return;
    }
    void dialog.showMessageBox(mainWindow, {
      type: "error",
      title: "تعذّر تشغيل الواجهة",
      message: "أغلق التطبيق وافتحه مجددًا. بيانات النظام على الخادم لم تتأثر.",
      detail: `سبب توقف الواجهة: ${details.reason}`,
    });
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    const trustedUrl = trustedPortalUrl(url);
    if (trustedUrl) {
      void mainWindow?.loadURL(trustedUrl);
    } else {
      handOffExternalNavigation(url);
    }
    return { action: "deny" };
  });
  const handleNavigation = (event, url) => {
    if (trustedPortalUrl(url)) return;
    event.preventDefault();
    handOffExternalNavigation(url);
  };
  mainWindow.webContents.on("will-navigate", handleNavigation);
  mainWindow.webContents.on("will-redirect", handleNavigation);

  void loadPortal();
}

async function bootstrap() {
  storePath = join(app.getPath("userData"), "offline-store.enc");
  await loadOrCreateKey();
  const startupStore = await readStore();
  desktopDeviceId = startupStore.deviceId;
  await writeStore(startupStore);
  registerIpc();

  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: [`${PORTAL_ORIGIN}/*`] },
    (details, callback) => {
      details.requestHeaders["x-dali-desktop-app"] = DESKTOP_MARKER;
      details.requestHeaders["x-dali-desktop-device"] = desktopDeviceId;
      callback({ requestHeaders: details.requestHeaders });
    },
  );
  const mediaAllowed = (requestingUrl) => {
    try {
      return new URL(requestingUrl).origin === PORTAL_ORIGIN;
    } catch {
      return false;
    }
  };
  session.defaultSession.setPermissionCheckHandler(
    (_webContents, permission, requestingOrigin) =>
      permission === "media" && mediaAllowed(requestingOrigin),
  );
  session.defaultSession.setPermissionRequestHandler(
    (webContents, permission, callback, details) => {
      const requestingUrl = details.requestingUrl || webContents.getURL();
      callback(permission === "media" && mediaAllowed(requestingUrl));
    },
  );

  openWindow();
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
  app.whenReady().then(bootstrap).catch((error) => {
    console.error("Dali Universal startup failed:", error);
    dialog.showErrorBox(
      "تعذّر تشغيل نظام دالي",
      "تعذّر بدء التطبيق الجديد. أعد تشغيل الجهاز ثم حاول مجددًا.",
    );
    app.quit();
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) openWindow();
});

process.on("unhandledRejection", (error) => {
  console.error("Dali Universal unhandled rejection:", error);
});
