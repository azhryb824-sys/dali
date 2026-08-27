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

  assert.equal(desktopPackage.version, "0.2.5");
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
  assert.match(workflow, /git push origin \$tag/);
  assert.doesNotMatch(workflow, /tags: \["v\*"\]/);
  assert.match(workflow, /desktop\/dist\/latest\.yml/);
  assert.match(workflow, /desktop\/dist\/\*\.blockmap/);
});
