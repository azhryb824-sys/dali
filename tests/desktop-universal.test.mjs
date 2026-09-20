import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("new macOS application is independent and does not alter the old application identity", async () => {
  const [legacyPackage, universalPackage, main] = await Promise.all([
    read("desktop/package.json").then(JSON.parse),
    read("desktop-universal/package.json").then(JSON.parse),
    read("desktop-universal/main.mjs"),
  ]);

  assert.equal(legacyPackage.build.appId, "sa.dally.desktop");
  assert.equal(legacyPackage.version, "0.2.12");
  assert.equal(universalPackage.build.appId, "sa.dally.desktop.universal");
  assert.equal(universalPackage.version, "1.0.5");
  assert.notEqual(universalPackage.build.appId, legacyPackage.build.appId);
  assert.notEqual(universalPackage.build.productName, legacyPackage.build.productName);
  assert.match(main, /APP_DATA_DIRECTORY = "DaliAdminUniversal"/);
  assert.match(main, /app\.setPath\("userData"/);
  assert.match(main, /dali-desktop-v1/);
});

test("new macOS package is one Universal build for Intel and Apple Silicon", async () => {
  const [desktopPackage, workflow, main, signingHook] = await Promise.all([
    read("desktop-universal/package.json").then(JSON.parse),
    read(".github/workflows/desktop-universal-macos.yml"),
    read("desktop-universal/main.mjs"),
    read("desktop-universal/scripts/adhoc-sign-mac.cjs"),
  ]);

  assert.match(desktopPackage.scripts["build:mac"], /--universal/);
  assert.equal(desktopPackage.build.mac.minimumSystemVersion, "12.0.0");
  assert.match(workflow, /lipo -archs/);
  assert.match(workflow, /grep -qw arm64/);
  assert.match(workflow, /grep -qw x86_64/);
  assert.match(workflow, /codesign --verify --deep --strict/);
  assert.match(workflow, /hdiutil verify/);
  assert.match(signingHook, /UNIVERSAL_INPUT_SUFFIX\.test\(context\.appOutDir\)/);
  assert.match(main, /render-process-gone/);
  assert.match(main, /MAX_RENDERER_RECOVERIES/);
  assert.match(main, /installDaliMediaPermissions\(session.defaultSession\)/);
  assert.match(main, /requestPortalEntryUrl/);
  assert.match(main, /shell\.openExternal\(whatsappAppUrl\)/);
  assert.match(main, /new ShareMenu/);
  assert.match(main, /dali:files:share/);
  assert.match(main, /prepareDesktopFileShare/);
  assert.match(main, /will-redirect/);
  assert.match(desktopPackage.build.files.join("\n"), /external-navigation\.mjs/);
  assert.match(desktopPackage.build.files.join("\n"), /native-file-share\.mjs/);
  assert.match(workflow, /steps\.universal-version\.outputs\.version/);
});
