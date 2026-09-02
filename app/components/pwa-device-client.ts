"use client";

const DATABASE_NAME = "dali-pwa-security-v1";
const STORE_NAME = "trusted-device";
const DEVICE_RECORD_KEY = "current";
const ENROLLMENT_CODE_KEY = "dali-pwa-enrollment-code";

type StoredDevice = {
  id: typeof DEVICE_RECORD_KEY;
  deviceId: string;
  deviceName: string;
  platform: "ios-pwa" | "ipad-pwa";
  privateKey: CryptoKey;
};

type ApiError = Error & { code?: string; status?: number };

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.addEventListener("upgradeneeded", () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
    });
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () => reject(request.error || new Error("تعذّر فتح التخزين الآمن للجهاز")));
  });
}

async function transaction<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>) {
  const database = await openDatabase();
  return new Promise<T>((resolve, reject) => {
    const tx = database.transaction(STORE_NAME, mode);
    const request = run(tx.objectStore(STORE_NAME));
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () => reject(request.error || new Error("تعذّر تحديث التخزين الآمن")));
    tx.addEventListener("complete", () => database.close());
    tx.addEventListener("abort", () => {
      database.close();
      reject(tx.error || new Error("أُلغيت عملية التخزين الآمن"));
    });
  });
}

async function storedDevice() {
  try {
    return await transaction<StoredDevice | undefined>("readonly", (store) => store.get(DEVICE_RECORD_KEY));
  } catch {
    return undefined;
  }
}

async function saveDevice(device: StoredDevice) {
  await transaction<IDBValidKey>("readwrite", (store) => store.put(device));
}

export async function clearPwaDevice() {
  await transaction<undefined>("readwrite", (store) => store.delete(DEVICE_RECORD_KEY));
}

function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

async function api<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  let payload: Record<string, unknown> = {};
  try {
    payload = await response.json() as Record<string, unknown>;
  } catch {
    payload = {};
  }
  if (!response.ok) {
    const error = new Error(typeof payload.error === "string" ? payload.error : "تعذّر التحقق من الجهاز") as ApiError;
    error.code = typeof payload.code === "string" ? payload.code : undefined;
    error.status = response.status;
    throw error;
  }
  return payload as T;
}

export function isStandalonePwa() {
  const appleNavigator = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || appleNavigator.standalone === true;
}

export function rememberEnrollmentCode(code: string) {
  const normalized = code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
  if (normalized) localStorage.setItem(ENROLLMENT_CODE_KEY, normalized);
}

export function rememberedEnrollmentCode() {
  return localStorage.getItem(ENROLLMENT_CODE_KEY) || "";
}

export function forgetEnrollmentCode() {
  localStorage.removeItem(ENROLLMENT_CODE_KEY);
}

function platform(): StoredDevice["platform"] {
  return /iPad/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) ? "ipad-pwa" : "ios-pwa";
}

export async function enrollPwaDevice(code: string, deviceName: string) {
  if (!isStandalonePwa()) throw new Error("افتح نظام دالي من الأيقونة التي أضفتها إلى الشاشة الرئيسية لإكمال التفعيل");
  if (!crypto.subtle || !indexedDB) throw new Error("هذا الجهاز لا يدعم التخزين المشفّر المطلوب");
  const keyPair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, ["sign", "verify"]) as CryptoKeyPair;
  const publicKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  const selectedPlatform = platform();
  const enrolled = await api<{ deviceId: string; deviceName: string }>("/api/pwa/enroll", {
    code,
    deviceName,
    platform: selectedPlatform,
    publicKeyJwk,
  });
  await saveDevice({ id: DEVICE_RECORD_KEY, deviceId: enrolled.deviceId, deviceName: enrolled.deviceName, platform: selectedPlatform, privateKey: keyPair.privateKey });
  forgetEnrollmentCode();
  return refreshPwaAccess();
}

export type PwaAccessResult =
  | { status: "ready"; deviceName: string; expiresInSeconds: number }
  | { status: "not-enrolled" }
  | { status: "revoked" };

export async function refreshPwaAccess(): Promise<PwaAccessResult> {
  const device = await storedDevice();
  if (!device) return { status: "not-enrolled" };
  try {
    const challenge = await api<{ challengeId: string; message: string }>("/api/pwa/challenge", { deviceId: device.deviceId });
    const signature = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, device.privateKey, new TextEncoder().encode(challenge.message)));
    const session = await api<{ authorized: true; expiresInSeconds: number }>("/api/pwa/session", {
      deviceId: device.deviceId,
      challengeId: challenge.challengeId,
      signature: base64Url(signature),
    });
    return { status: "ready", deviceName: device.deviceName, expiresInSeconds: session.expiresInSeconds };
  } catch (error) {
    const code = (error as ApiError).code;
    if (code === "DEVICE_REVOKED") {
      await clearPwaDevice().catch(() => undefined);
      return { status: "revoked" };
    }
    throw error;
  }
}
