import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const config = await readFile(new URL("../capacitor.config.ts", import.meta.url), "utf8");
const required = ["sa.dally.mobile", "نظام دالي الإداري", "https://www.dally.info/portal", 'errorPath: "offline.html"', "DaliMobile/1", "allowMixedContent: false", "minWebViewVersion: 111", "resolveServiceWorkerRequests: false", "webContentsDebuggingEnabled: false", "limitsNavigationsToAppBoundDomains: true"];
const missing = required.filter((value) => !config.includes(value));
if (missing.length) throw new Error(`Mobile security configuration is incomplete: ${missing.join(", ")}`);
const index = await readFile(new URL("../www/index.html", import.meta.url), "utf8");
if (!index.includes('lang="ar"') || !index.includes('dir="rtl"')) throw new Error("Arabic RTL bootstrap is missing");
const manifest = await readFile(new URL("../android/app/src/main/AndroidManifest.xml", import.meta.url), "utf8");
if (!manifest.includes("android.permission.RECORD_AUDIO") || manifest.includes("READ_MEDIA_IMAGES")) throw new Error("Android permissions are not privacy-scoped");
const gradle = await readFile(new URL("../android/app/build.gradle", import.meta.url), "utf8");
if (!gradle.includes('applicationId "sa.dally.mobile"') || !gradle.includes("versionCode 3") || !gradle.includes('versionName "1.0.2"')) throw new Error("Android identity or version is incorrect");
console.log(JSON.stringify({ status: "ok", root, appId: "sa.dally.mobile", appName: "نظام دالي الإداري", version: "1.0.2", platforms: ["android", "ios"], remotePortal: true, minimumAndroidWebView: 111 }));
