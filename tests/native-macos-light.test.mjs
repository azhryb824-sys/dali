import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = path => readFile(path, "utf8");

test("lightweight macOS application uses the system WebKit engine and remains separate", async () => {
  const [source, plist, build] = await Promise.all([
    read("native-macos/Sources/main.swift"),
    read("native-macos/Resources/Info.plist"),
    read("native-macos/scripts/build.sh"),
  ]);
  assert.match(source, /import WebKit/);
  assert.match(source, /WKWebView/);
  assert.doesNotMatch(source, /Electron|Chromium/);
  assert.match(source, /applicationShouldTerminateAfterLastWindowClosed/);
  assert.match(source, /return scheme == "https"/);
  assert.match(source, /DaliDesktopNative\/1/);
  assert.match(plist, /sa\.dally\.desktop\.light/);
  assert.doesNotMatch(plist, /sa\.dally\.desktop<\/string>/);
  assert.match(build, /arm64-apple-macos13\.0/);
  assert.match(build, /-framework WebKit/);
});

test("native macOS requests keep the existing protected desktop entry contract", async () => {
  const source = await read("native-macos/Sources/main.swift");
  assert.match(source, /\/api\/portal\/desktop\/entry-link/);
  assert.match(source, /x-dali-desktop-app/);
  assert.match(source, /x-dali-desktop-device/);
  assert.match(source, /dali-desktop-v1/);
  assert.match(source, /\/desktop-access\//);
  assert.match(source, /new MutationObserver/);
  assert.match(source, /XMLHttpRequest\.prototype/);
});

test("native macOS application does not install background or replacement behavior", async () => {
  const [source, plist, readme] = await Promise.all([
    read("native-macos/Sources/main.swift"),
    read("native-macos/Resources/Info.plist"),
    read("native-macos/README.md"),
  ]);
  assert.doesNotMatch(plist, /LSBackgroundOnly|SMLoginItem|LaunchAgent|LaunchDaemon/);
  assert.doesNotMatch(source, /setActivationPolicy\(\.accessory\)|NSWorkspace\.shared\.setDefaultApplication/);
  assert.match(readme, /لا ينشئ خدمة خلفية/);
  assert.match(readme, /لا يستبدل/);
});
