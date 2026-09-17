import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const PORTAL_ORIGIN = "https://www.dally.info";
const ALLOWED_DOWNLOAD_PATH =
  /^\/api\/(?:shared-documents\/[a-f0-9]{64}|legal-shares\/[a-f0-9]{64}|legal-share-bundles\/[a-f0-9]{64}\/items\/[1-9]\d*)$/i;
const MAX_SHARE_FILES = 200;
const MAX_SHARE_BYTES = 200 * 1024 * 1024;
const CLEANUP_DELAY_MS = 30 * 60 * 1000;

function safeFileName(value, index) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, "-")
    .replace(/[. ]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180) || `dali-file-${index + 1}`;
}

function trustedDescriptor(value, index) {
  try {
    const url = new URL(String(value?.url || ""));
    const sizeBytes = Math.max(0, Math.round(Number(value?.sizeBytes) || 0));
    if (
      url.origin !== PORTAL_ORIGIN ||
      !ALLOWED_DOWNLOAD_PATH.test(url.pathname) ||
      url.search ||
      url.hash ||
      sizeBytes > MAX_SHARE_BYTES
    ) return null;
    return {
      url: url.toString(),
      fileName: safeFileName(value?.fileName, index),
      sizeBytes,
    };
  } catch {
    return null;
  }
}

function trustedOptions(value) {
  const title = String(value?.title || "").trim().slice(0, 240);
  const text = String(value?.text || "").trim().slice(0, 20_000);
  if (!title) return null;
  return { title, text };
}

function uniqueFileName(fileName, index, usedNames) {
  const key = fileName.toLocaleLowerCase("en");
  if (!usedNames.has(key)) {
    usedNames.add(key);
    return fileName;
  }
  const dot = fileName.lastIndexOf(".");
  const suffix = `-${index + 1}`;
  const candidate = dot > 0
    ? `${fileName.slice(0, dot)}${suffix}${fileName.slice(dot)}`
    : `${fileName}${suffix}`;
  usedNames.add(candidate.toLocaleLowerCase("en"));
  return candidate;
}

export async function prepareDesktopFileShare(app, rawFiles, rawOptions) {
  if (
    !Array.isArray(rawFiles) ||
    rawFiles.length < 1 ||
    rawFiles.length > MAX_SHARE_FILES
  ) throw new Error("invalid-share-files");
  const files = rawFiles.map(trustedDescriptor);
  if (files.some((file) => !file)) throw new Error("untrusted-share-file");
  const options = trustedOptions(rawOptions);
  if (!options) throw new Error("invalid-share-options");
  const declaredBytes = files.reduce((sum, file) => sum + file.sizeBytes, 0);
  if (declaredBytes > MAX_SHARE_BYTES) throw new Error("share-files-too-large");

  const directory = await mkdtemp(join(app.getPath("temp"), "dali-share-"));
  const filePaths = [];
  const usedNames = new Set();
  let totalBytes = 0;
  try {
    for (const [index, file] of files.entries()) {
      const response = await fetch(file.url, {
        headers: { accept: "application/octet-stream,application/pdf,*/*" },
        redirect: "error",
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`share-download-${response.status}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      totalBytes += bytes.length;
      if (totalBytes > MAX_SHARE_BYTES) throw new Error("share-files-too-large");
      if (file.sizeBytes > 0 && bytes.length !== file.sizeBytes)
        throw new Error("share-file-size-mismatch");
      const fileName = uniqueFileName(file.fileName, index, usedNames);
      const filePath = join(directory, fileName);
      await writeFile(filePath, bytes, { mode: 0o600, flag: "wx" });
      filePaths.push(filePath);
    }

    const encode = (value) => Buffer.from(value, "utf8").toString("base64");
    const manifestPath = join(directory, "share.dali");
    const statusPath = join(directory, "share-status.dali");
    await writeFile(
      manifestPath,
      [options.title, options.text, statusPath, ...filePaths]
        .map(encode)
        .join("\r\n"),
      { encoding: "utf8", mode: 0o600, flag: "wx" },
    );
    return {
      ...options,
      directory,
      filePaths,
      manifestPath,
      statusPath,
      totalBytes,
    };
  } catch (error) {
    await rm(directory, { force: true, recursive: true }).catch(() => undefined);
    throw error;
  }
}

export function scheduleDesktopShareCleanup(directory, delay = CLEANUP_DELAY_MS) {
  const timer = setTimeout(() => {
    void rm(directory, { force: true, recursive: true });
  }, delay);
  timer.unref?.();
}

function windowsHelperPath(app) {
  return app.isPackaged
    ? join(process.resourcesPath, "DaliNativeShare.exe")
    : join(app.getAppPath(), "native-share", "bin", "DaliNativeShare.exe");
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function openWindowsFileShare(app, manifestPath, statusPath) {
  const helperPath = windowsHelperPath(app);
  if (!existsSync(helperPath)) throw new Error("windows-share-helper-missing");
  const child = spawn(helperPath, [manifestPath], {
    detached: true,
    windowsHide: true,
    stdio: "ignore",
  });
  try {
    await new Promise((resolve, reject) => {
      child.once("spawn", resolve);
      child.once("error", reject);
    });

    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      const status = await readFile(statusPath, "utf8").catch(() => "");
      if (status === "ready") {
        child.unref();
        return { opened: true, status };
      }
      if (status.startsWith("error:"))
        throw new Error(status.slice("error:".length) || "windows-share-helper-failed");
      if (child.exitCode !== null)
        throw new Error(`windows-share-helper-${child.exitCode}`);
      await wait(100);
    }
    throw new Error("windows-share-ui-timeout");
  } catch (error) {
    if (child.exitCode === null) child.kill();
    throw error;
  }
}
