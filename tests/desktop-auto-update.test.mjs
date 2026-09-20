import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("desktop application checks, downloads, and installs stable updates", async () => {
  const main = await readFile(new URL("desktop/main.mjs", root), "utf8");
  assert.match(main, /electron-updater/);
  assert.match(main, /autoUpdater\.autoDownload = true/);
  assert.match(main, /autoUpdater\.allowPrerelease = false/);
  assert.match(main, /autoUpdater\.checkForUpdates\(\)/);
  assert.match(main, /autoUpdater\.quitAndInstall\(false, true\)/);
  assert.match(main, /UPDATE_CHECK_INTERVAL_MS = 6 \* 60 \* 60 \* 1000/);
});

test("desktop build publishes the updater metadata with the installer", async () => {
  const desktopPackage = JSON.parse(await readFile(new URL("desktop/package.json", root), "utf8"));
  const workflow = await readFile(new URL(".github/workflows/desktop-windows.yml", root), "utf8");

  assert.equal(desktopPackage.version, "0.2.12");
  assert.equal(desktopPackage.build.publish.provider, "github");
  assert.equal(desktopPackage.build.publish.owner, "azhryb824-sys");
  assert.equal(desktopPackage.build.publish.repo, "dali");
  assert.equal(desktopPackage.build.publish.releaseType, "release");
  assert.doesNotMatch(workflow, /--publish always/);
  assert.match(workflow, /--publish never/);
  assert.match(workflow, /gh release create/);
  assert.match(workflow, /--verify-tag/);
  assert.doesNotMatch(workflow, /inputs\.publish_update/);
  assert.match(workflow, /Create immutable release tag/);
  assert.match(workflow, /id: desktop-version/);
  assert.match(workflow, /steps\.desktop-version\.outputs\.version/);
  assert.doesNotMatch(workflow, /Dali-Desktop-Setup-0\.2\.5/);
  assert.match(workflow, /git push origin \$tag/);
  assert.doesNotMatch(workflow, /tags: \["v\*"\]/);
  assert.match(workflow, /desktop\/dist\/latest\.yml/);
  assert.match(workflow, /desktop\/dist\/\*\.blockmap/);
});

test("desktop hands verified WhatsApp links to the installed Windows application", async () => {
  const [main, navigation] = await Promise.all([
    readFile(new URL("desktop/main.mjs", root), "utf8"),
    readFile(new URL("desktop/external-navigation.mjs", root), "utf8"),
  ]);

  assert.match(main, /shell\.openExternal\(whatsappAppUrl\)/);
  assert.match(main, /dali:whatsapp:open/);
  assert.match(main, /verifiedWhatsAppWebUrl/);
  assert.match(main, /will-redirect/);
  assert.match(main, /did-create-window/);
  assert.match(main, /web-contents-created/);
  assert.match(navigation, /whatsapp:\/\/send/);
  assert.match(navigation, /SAUDI_WHATSAPP_PHONE/);
});

test("desktop credential saving is encrypted and restricted to the login page", async () => {
  const [main, preload] = await Promise.all([
    readFile(new URL("desktop/main.mjs", root), "utf8"),
    readFile(new URL("desktop/preload.mjs", root), "utf8"),
  ]);
  assert.match(main, /aes-256-gcm/);
  assert.match(main, /safeStorage\.isEncryptionAvailable\(\)/);
  assert.match(main, /trustedRendererPath\(event, "\/login"\)/);
  assert.match(main, /dali:login-credentials:save/);
  assert.match(preload, /location\.pathname === "\/login"/);
});

test("Windows desktop shares actual downloaded files through the native share UI", async () => {
  const [main, preload, bridge, helper, buildScript, workflow, desktopPackage] = await Promise.all([
    readFile(new URL("desktop/main.mjs", root), "utf8"),
    readFile(new URL("desktop/preload.mjs", root), "utf8"),
    readFile(new URL("desktop/native-file-share.mjs", root), "utf8"),
    readFile(new URL("desktop/native-share/DaliNativeShare.cpp", root), "utf8"),
    readFile(new URL("desktop/native-share/build.cmd", root), "utf8"),
    readFile(new URL(".github/workflows/desktop-windows.yml", root), "utf8"),
    readFile(new URL("desktop/package.json", root), "utf8").then(JSON.parse),
  ]);

  assert.match(main, /dali:files:share/);
  assert.match(main, /prepareDesktopFileShare/);
  assert.match(main, /openWindowsFileShare/);
  assert.match(main, /prepared\.statusPath/);
  assert.match(preload, /fileShare:/);
  assert.match(preload, /dali:files:share/);
  assert.match(bridge, /ALLOWED_DOWNLOAD_PATH/);
  assert.match(bridge, /for await \(const chunk of response\.body\)/);
  assert.match(bridge, /DaliNativeShare\.exe/);
  assert.match(bridge, /status === "ready"/);
  assert.match(bridge, /windows-share-ui-timeout/);
  assert.match(helper, /SetStorageItems/);
  assert.match(helper, /ShowShareUIForWindow/);
  assert.match(helper, /TargetApplicationChosen/);
  assert.match(helper, /SetForegroundWindow/);
  assert.match(helper, /WriteStatus\("ready"\)/);
  assert.match(buildScript, /user32\.lib/);
  assert.match(workflow, /Build native Windows file-share bridge/);
  assert.match(workflow, /native-share\\build\.cmd/);
  assert.match(JSON.stringify(desktopPackage.build.win.extraResources), /DaliNativeShare\.exe/);
});

test("desktop file bridge downloads verified bytes instead of handing WhatsApp only a link", async () => {
  const { prepareDesktopFileShare } = await import("../desktop/native-file-share.mjs");
  const temporaryRoot = await mkdtemp(join(tmpdir(), "dali-file-share-test-"));
  const originalFetch = globalThis.fetch;
  const bytes = Buffer.from("%PDF-test", "utf8");
  globalThis.fetch = async () => new Response(bytes, {
    status: 200,
    headers: { "content-type": "application/pdf" },
  });
  try {
    const result = await prepareDesktopFileShare(
      { getPath: () => temporaryRoot },
      [{
        url: `https://www.dally.info/api/shared-documents/${"a".repeat(64)}`,
        fileName: "العقد.pdf",
        contentType: "application/pdf",
        sizeBytes: bytes.length,
      }],
      { title: "العقد المعتمد", text: "مرفق العقد الفعلي" },
    );
    assert.equal(result.filePaths.length, 1);
    assert.deepEqual(await readFile(result.filePaths[0]), bytes);
    const manifest = await readFile(result.manifestPath, "utf8");
    const manifestValues = manifest
      .split("\r\n")
      .map((value) => Buffer.from(value, "base64").toString("utf8"));
    assert.equal(manifestValues[2], result.statusPath);
    assert.equal(manifestValues[3], result.filePaths[0]);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});
