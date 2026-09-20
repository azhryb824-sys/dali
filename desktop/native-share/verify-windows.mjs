import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { openWindowsFileShare, prepareDesktopFileShare } from "../native-file-share.mjs";

assert.equal(process.platform, "win32", "This check must execute the real Windows helper");
const desktopRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const helper = join(desktopRoot, "native-share/bin/DaliNativeShare.exe");
const root = await mkdtemp(join(tmpdir(), "dali-native-verify-"));
const app = { getPath: () => root, getAppPath: () => desktopRoot, isPackaged: false };
// A complete, readable one-page PDF, not just a file with a PDF extension.
const pageText = "BT /F1 12 Tf 50 700 Td (Dali attachment verification) Tj ET";
const objects = [
  "<< /Type /Catalog /Pages 2 0 R >>",
  "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
  "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
  "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  `<< /Length ${pageText.length} >>\nstream\n${pageText}\nendstream`,
];
let pdf = "%PDF-1.4\n";
const offsets = objects.map((object, index) => {
  const offset = pdf.length;
  pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  return offset;
});
const xref = pdf.length;
pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
const bytes = Buffer.from(pdf, "ascii");
const descriptors = ["عرض سعر.pdf", "عقد.pdf", "عقد.pdf"].map(fileName => ({
  url: `https://www.dally.info/api/shared-documents/${"a".repeat(64)}`,
  fileName, sizeBytes: bytes.length,
}));
let shareProcess;
try {
  const prepared = await prepareDesktopFileShare(app, descriptors, { title: "ملفات دالي", text: "Native verification" }, async () => new Response(bytes));
  execFileSync(helper, ["--verify-files", prepared.manifestPath], { timeout: 20_000, windowsHide: true });
  assert.equal(await readFile(prepared.statusPath, "utf8"), "verified");
  console.log("WINRT_FILE_PACKAGE_OK: actual Arabic-named PDF files round-trip through DataPackage");

  const copied = await openWindowsFileShare(app, prepared.manifestPath, prepared.statusPath, "copy");
  assert.equal(copied.copied, true);
  assert.equal(copied.opened, false, "Clipboard copy must not claim the share UI opened");
  const clipboardJson = execFileSync("pwsh", ["-NoProfile", "-STA", "-Command", "Add-Type -AssemblyName System.Windows.Forms; ConvertTo-Json -InputObject @([System.Windows.Forms.Clipboard]::GetFileDropList()) -Compress"], { encoding: "utf8", timeout: 20_000 });
  const clipboardFiles = JSON.parse(clipboardJson.trim());
  assert.equal(clipboardFiles.length, descriptors.length);
  for (const file of clipboardFiles) assert.deepEqual(await readFile(file), bytes);
  assert.equal(new Set(clipboardFiles.map(file => file.toLowerCase())).size, 3);
  console.log("WINDOWS_CLIPBOARD_OK: independent Windows clipboard reader received every PDF and verified its bytes");

  // Exercise the real UI too. Hosted Windows Server runners may have no Share
  // Host; record that limitation explicitly while still requiring file/clipboard checks.
  await rm(prepared.statusPath, { force: true });
  shareProcess = spawn(helper, [prepared.manifestPath], { stdio: "ignore", windowsHide: true });
  await new Promise((resolve, reject) => { shareProcess.once("spawn", resolve); shareProcess.once("error", reject); });
  const deadline = Date.now() + 15_000;
  let status = "";
  while (Date.now() < deadline) {
    status = await readFile(prepared.statusPath, "utf8").catch(() => "");
    if (status === "ready" || status.startsWith("error:") || shareProcess.exitCode !== null) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (status === "ready") console.log("WINDOWS_SHARE_UI_READY: DataRequested received the actual file package");
  else {
    assert.match(status, /^error:windows-share-hresult-\d+$/, `Unexplained native UI failure: ${status}; exit=${shareProcess.exitCode}`);
    console.log(`WINDOWS_SHARE_UI_UNAVAILABLE_ON_RUNNER: ${status}; file package and clipboard were verified independently`);
  }
  shareProcess.kill();

  // No arbitrary paths outside the prepared directory may be copied.
  const outsideFile = join(root, "outside.pdf");
  await writeFile(outsideFile, bytes);
  const lines = (await readFile(prepared.manifestPath, "utf8")).split("\r\n");
  lines[3] = Buffer.from(outsideFile).toString("base64");
  await writeFile(prepared.manifestPath, lines.join("\r\n"));
  assert.throws(() => execFileSync(helper, ["--copy-files", prepared.manifestPath], { timeout: 20_000, windowsHide: true }));
  assert.equal(await readFile(prepared.statusPath, "utf8"), "error:share-file-unavailable");
  console.log("NATIVE_PATH_BOUNDARY_OK");
} finally {
  shareProcess?.kill();
  await rm(root, { force: true, recursive: true, maxRetries: 10, retryDelay: 100 });
}
