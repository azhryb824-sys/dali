import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const runtimeSource = await readFile(
  new URL("../lib/whatsapp-runtime.ts", import.meta.url),
  "utf8",
);
const compiledRuntime = ts.transpileModule(runtimeSource, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const { detectDaliWhatsAppRuntime } = await import(
  `data:text/javascript;base64,${Buffer.from(compiledRuntime).toString("base64")}`
);

test("installed mobile and desktop applications use an in-place WhatsApp handoff", () => {
  assert.equal(
    detectDaliWhatsAppRuntime("Mozilla/5.0 DaliMobile/1 Android", false),
    "mobile-app",
  );
  assert.equal(
    detectDaliWhatsAppRuntime("Mozilla/5.0 DaliMobile/1 iOS", false),
    "mobile-app",
  );
  assert.equal(
    detectDaliWhatsAppRuntime("Electron/44 Chrome/140", true),
    "desktop-app",
  );
  assert.equal(
    detectDaliWhatsAppRuntime("Mozilla/5.0 Chrome/140", false),
    "browser",
  );
});

test("remote portal update preserves every installed application identity", async () => {
  const [android, iosProject, macPackage, windowsPackage] = await Promise.all([
    readFile(new URL("../mobile/android/app/build.gradle", import.meta.url), "utf8"),
    readFile(
      new URL("../mobile/ios/App/App.xcodeproj/project.pbxproj", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../desktop-universal/package.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../desktop/package.json", import.meta.url), "utf8").then(JSON.parse),
  ]);

  assert.match(android, /applicationId "sa\.dally\.mobile"/);
  assert.match(iosProject, /PRODUCT_BUNDLE_IDENTIFIER = sa\.dally\.mobile/);
  assert.equal(macPackage.build.appId, "sa.dally.desktop.universal");
  assert.equal(windowsPackage.build.appId, "sa.dally.desktop");
});
