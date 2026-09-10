import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (file) => readFile(path.join(root, file), "utf8");

async function sourceFiles(directory) {
  const entries = await readdir(path.join(root, directory), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relative = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(relative));
    else if (/\.(?:ts|tsx|js|jsx)$/.test(entry.name)) files.push(relative);
  }
  return files;
}

test("all user interfaces use the in-page dialog service instead of native webview dialogs", async () => {
  const files = (await sourceFiles("app")).filter((file) => !file.includes(`${path.sep}api${path.sep}`));
  const sources = await Promise.all(files.map(read));
  assert.equal(sources.some((source) => /window\.(?:prompt|alert|confirm)\s*\(/.test(source)), false);
  const [layout, provider] = await Promise.all([
    read("app/layout.tsx"),
    read("app/components/AppDialogProvider.tsx"),
  ]);
  assert.match(layout, /<AppDialogProvider>/);
  assert.match(provider, /role=\{active\.kind === "alert" \? "alertdialog" : "dialog"\}/);
  assert.match(provider, /event\.key === "Escape"/);
  assert.match(provider, /event\.key !== "Tab"/);
});

test("client interfaces use guarded API JSON parsing", async () => {
  const files = (await sourceFiles("app")).filter((file) => !file.includes(`${path.sep}api${path.sep}`));
  const sources = await Promise.all(files.map(read));
  const unsafe = files.filter((_file, index) => /(?:response|res|r|stampResponse|letterResponse|operationResponse)\.json\s*\(/.test(sources[index]));
  assert.deepEqual(unsafe, []);
  assert.match(await read("lib/client-api.ts"), /if \(!body\.trim\(\)\)/);
});

test("native application markers only bootstrap login and signed device access protects portal routes", async () => {
  const [proxy, login, redeem, desktop, session, legacyUpgrade] = await Promise.all([
    read("proxy.ts"),
    read("app/api/auth/login/route.ts"),
    read("app/desktop-access/[token]/route.ts"),
    read("lib/desktop-entry.ts"),
    read("lib/portal-session.ts"),
    read("app/api/auth/desktop-upgrade/route.ts"),
  ]);
  assert.match(proxy, /desktopAccessFromCookieHeader/);
  assert.match(proxy, /mobileAccessFromCookieHeader/);
  assert.match(proxy, /permittedBootstrapRequest/);
  assert.match(proxy, /portalPagePath/);
  assert.doesNotMatch(proxy, /trustedNativeRequest\s*=\s*desktopRequest/);
  assert.doesNotMatch(proxy, /let verifiedMobileRequest\s*=\s*mobileRequest/);
  assert.match(login, /desktopAccessCookie/);
  assert.match(login, /issueDesktopAccessToken/);
  assert.match(login, /mobileAccessCookie/);
  assert.match(redeem, /issueDesktopAccessToken/);
  assert.match(redeem, /desktopAccessCookie/);
  assert.doesNotMatch(redeem, /createIdentityToken|issuePortalSession/);
  assert.match(desktop, /version:\s*2/);
  assert.match(desktop, /__Host-dali_desktop_access/);
  assert.match(desktop, /isLegacyDesktopRequest/);
  assert.match(desktop, /Electron\\\/38/);
  assert.match(legacyUpgrade, /getChatGPTUser/);
  assert.match(legacyUpgrade, /desktopAccessCookie/);
  assert.doesNotMatch(legacyUpgrade, /issuePortalSession/);
  assert.match(session, /dali-desktop-v2:/);
});

test("construction attachment routes authenticate before identifier validation or record lookup", async () => {
  const route = await read("app/api/portal/construction/attachments/route.ts");
  for (const method of ["GET", "POST", "PATCH"]) {
    const start = route.indexOf(`export async function ${method}`);
    const end = route.indexOf("\nexport async function ", start + 1);
    const body = route.slice(start, end < 0 ? route.length : end);
    const authIndex = body.indexOf("requirePortalApiRole");
    assert.ok(authIndex >= 0, `${method} must authenticate`);
    if (method === "GET") assert.ok(authIndex < body.indexOf("recordId ="));
    if (method === "PATCH") assert.ok(authIndex < body.indexOf("findFirst"));
  }
});

test("production framework dependencies use patched versions", async () => {
  const packageJson = JSON.parse(await read("package.json"));
  assert.equal(packageJson.dependencies.next, "16.3.3");
  assert.equal(packageJson.dependencies.sharp, "0.35.4");
  assert.equal(packageJson.dependencies["baseline-browser-mapping"], "2.11.0");
  assert.equal(packageJson.devDependencies["eslint-config-next"], "16.3.3");
});
