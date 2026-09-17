import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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

  assert.equal(desktopPackage.version, "0.2.8");
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
