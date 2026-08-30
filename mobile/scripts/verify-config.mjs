import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const config = await readFile(new URL("../capacitor.config.ts", import.meta.url), "utf8");
const required = ["sa.dally.mobile", "https://www.dally.info/portal", "DaliMobile/1", "allowMixedContent: false", "webContentsDebuggingEnabled: false", "limitsNavigationsToAppBoundDomains: true"];
const missing = required.filter((value) => !config.includes(value));
if (missing.length) throw new Error(`Mobile security configuration is incomplete: ${missing.join(", ")}`);
const index = await readFile(new URL("../www/index.html", import.meta.url), "utf8");
if (!index.includes('lang="ar"') || !index.includes('dir="rtl"')) throw new Error("Arabic RTL bootstrap is missing");
console.log(JSON.stringify({ status: "ok", root, appId: "sa.dally.mobile", platforms: ["android", "ios"], remotePortal: true }));
