import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(new URL("../lib/file-share-runtime.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const runtime = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
const origin = "https://www.dally.info";
const pdfBytes = Buffer.from("%PDF-1.7\nDali test PDF bytes\n%%EOF");
const descriptor = (patch = {}) => ({ url: `${origin}/api/shared-documents/${"a".repeat(64)}`, fileName: "عرض-سعر.pdf", contentType: "application/pdf", sizeBytes: pdfBytes.length, ...patch });
const options = { title: "عرض السعر", text: "ملف عرض السعر للعميل" };
const keys = ["window", "navigator", "fetch", "document"];
let saved;
const setGlobal = (key, value) => Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
beforeEach(() => {
  saved = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  setGlobal("window", { location: { origin } });
  setGlobal("navigator", {});
});
afterEach(() => {
  for (const [key, definition] of saved) {
    if (definition) Object.defineProperty(globalThis, key, definition);
    else delete globalThis[key];
  }
});

test("browser preparation retains the real PDF bytes and filename, not just its link", async () => {
  const requests = [];
  setGlobal("fetch", async (url, init) => { requests.push({ url, init }); return new Response(pdfBytes, { headers: { "content-type": "application/pdf" } }); });
  const prepared = await runtime.prepareDaliShareFiles([descriptor()]);
  assert.equal(prepared.files.length, 1); assert.equal(prepared.totalBytes, pdfBytes.length);
  assert.equal(prepared.files[0].name, "عرض-سعر.pdf"); assert.equal(prepared.files[0].type, "application/pdf");
  assert.deepEqual(Buffer.from(await prepared.files[0].arrayBuffer()), pdfBytes);
  assert.equal(requests[0].init.credentials, "same-origin"); assert.equal(requests[0].init.cache, "no-store");
});

test("untrusted file URLs are rejected before any download or native handoff", async () => {
  let downloads = 0;
  setGlobal("fetch", async () => { downloads++; return new Response(pdfBytes); });
  for (const url of ["https://untrusted.example/file.pdf", `${origin}/api/portal/documents/1`, `${descriptor().url}?token=other`, `${descriptor().url}#fragment`, "file:///etc/passwd"]) {
    await assert.rejects(runtime.prepareDaliShareFiles([descriptor({ url })]), /تعذر التحقق/);
  }
  assert.equal(downloads, 0);
});

test("expired downloads and oversized batches cannot become prepared shares", async () => {
  let downloads = 0;
  setGlobal("fetch", async () => { downloads++; return new Response("Expired", { status: 410 }); });
  await assert.rejects(runtime.prepareDaliShareFiles([descriptor()]), /تعذر تحميل الملف/);
  await assert.rejects(runtime.prepareDaliShareFiles([descriptor({ sizeBytes: 201 * 1024 * 1024 })]), /حجم الملفات كبير/);
  assert.equal(downloads, 1);
});

test("Web Share receives file objects synchronously within the user's button gesture", async () => {
  const prepared = { files: [new File([pdfBytes], "quote.pdf", { type: "application/pdf" })], totalBytes: pdfBytes.length };
  let payload;
  setGlobal("navigator", { canShare: () => true, share: data => { payload = data; return Promise.resolve(); } });
  const result = runtime.sharePreparedDaliFiles(prepared, options);
  assert.ok(payload, "navigator.share must be called before the first async boundary");
  assert.equal(payload.files, prepared.files); assert.equal(payload.text, options.text);
  assert.equal(await result, "shared");
});

test("Web Share cancellation and unsupported file sharing are not reported as success", async () => {
  setGlobal("navigator", { canShare: () => true, share: () => Promise.reject(new DOMException("Cancelled", "AbortError")) });
  assert.equal(await runtime.sharePreparedDaliFiles({ files: [], totalBytes: 0 }, options), "cancelled");
  setGlobal("navigator", { canShare: () => false, share: () => { throw new Error("Must not share"); } });
  assert.equal(await runtime.sharePreparedDaliFiles({ files: [], totalBytes: 0 }, options), "unsupported");
});

test("native Android bridge downloads cache files before passing actual file URIs to WhatsApp", async () => {
  const calls = [];
  window.Capacitor = { isNativePlatform: () => true, isPluginAvailable: () => true, nativePromise: async (plugin, method, input) => {
    calls.push({ plugin, method, input });
    return plugin === "Filesystem" ? { path: `file:///cache/${input.path}` } : { opened: true };
  } };
  assert.equal(runtime.supportsDaliNativeFileShare(), true);
  assert.equal(await runtime.shareDaliFilesNatively([descriptor(), descriptor({ fileName: "invoice.pdf" })], options), true);
  assert.deepEqual(calls.map(c => c.plugin), ["Filesystem", "Filesystem", "DaliWhatsApp"]);
  assert.equal(calls[0].input.directory, "CACHE");
  assert.equal(calls[2].input.files.length, 2);
  assert.ok(calls[2].input.files.every(uri => uri.startsWith("file:///cache/dali-share/")));
  assert.equal(calls[2].input.text, options.text);
});

test("native system Share fallback receives files when the WhatsApp-specific plugin is unavailable", async () => {
  const calls = [];
  window.Capacitor = { isNativePlatform: () => true, isPluginAvailable: name => name !== "DaliWhatsApp", nativePromise: async (plugin, method, input) => {
    calls.push({ plugin, method, input }); return plugin === "Filesystem" ? { path: `/cache/${input.path}` } : {};
  } };
  await runtime.shareDaliFilesNatively([descriptor()], options);
  assert.equal(calls.at(-1).plugin, "Share"); assert.match(calls.at(-1).input.files[0], /^file:\/\/\/cache\//);
});

test("a failed native download prevents opening WhatsApp with an incomplete attachment list", async () => {
  const calls = [];
  window.Capacitor = { isNativePlatform: () => true, isPluginAvailable: () => true, nativePromise: async (plugin) => { calls.push(plugin); return {}; } };
  await assert.rejects(runtime.shareDaliFilesNatively([descriptor()], options), /تعذر تجهيز الملف/);
  assert.deepEqual(calls, ["Filesystem"]);
});

test("desktop bridge receives validated file descriptors and preserves a native launch failure", async () => {
  let received;
  window.daliDesktop = { fileShare: { share: async (files, input) => { received = { files, input }; return { opened: false, reason: "windows-share-ui-timeout" }; } } };
  const result = await runtime.shareDaliFilesOnDesktop([descriptor()], options);
  assert.equal(received.files[0].fileName, "عرض-سعر.pdf"); assert.equal(received.input.text, options.text);
  assert.equal(result.opened, false); assert.equal(result.reason, "windows-share-ui-timeout");
  await assert.rejects(runtime.shareDaliFilesOnDesktop([descriptor({ url: "https://other.example/file.pdf" })], options), /تعذر التحقق/);
});

test("desktop copy requires confirmed native files and retains errors without claiming delivery", async () => {
  assert.equal(runtime.supportsDaliDesktopFileCopy(), false);
  const calls = [];
  window.daliDesktop = { fileShare: { copyFiles: async (files, options) => { calls.push({ files, options }); return { copied: true }; } } };
  assert.equal(runtime.supportsDaliDesktopFileCopy(), true);
  assert.deepEqual(await runtime.copyDaliFilesOnDesktop([descriptor()], options), { copied: true });
  assert.equal(calls[0].files[0].url, descriptor().url);
  await assert.rejects(runtime.copyDaliFilesOnDesktop([descriptor({ url: "file:///private.pdf" })], options), /تعذر التحقق/);
  assert.equal(calls.length, 1);
  window.daliDesktop.fileShare.copyFiles = async () => ({ copied: false, reason: "windows-share-helper-launch-failed" });
  assert.equal((await runtime.copyDaliFilesOnDesktop([descriptor()], options)).copied, false);
});

test("browser refuses empty or truncated attachments and blocks redirects", async () => {
  for (const body of ["", "truncated"]) {
    setGlobal("fetch", async (_url, init) => { assert.equal(init.redirect, "error"); return new Response(body); });
    await assert.rejects(runtime.prepareDaliShareFiles([descriptor()]), /لم يكتمل تنزيل الملف/);
  }
});

test("download failures and missing Windows components have distinct actionable messages", () => {
  assert.match(runtime.daliDesktopFileShareError("share-download-network"), /اتصال الإنترنت/);
  assert.match(runtime.daliDesktopFileShareError("share-download-410"), /رابط جديد/);
  assert.match(runtime.daliDesktopFileShareError("windows-share-ui-timeout"), /نسخ الملفات وفتح واتساب/);
  assert.match(runtime.daliDesktopFileShareError("windows-share-helper-launch-failed"), /أحدث إصدار/);
});
