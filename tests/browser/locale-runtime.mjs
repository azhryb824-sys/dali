// Real React dashboard + DOM/cookie/navigation checks. All API responses here
// are fixtures, never production data. Run with Playwright installed separately.
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, readFile, rm, mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = await import(process.env.DALI_PLAYWRIGHT_MODULE || "playwright");
const root = process.cwd();
// Keep the server bundle beneath this repository so React resolves normally.
const dir = await mkdtemp(join(root, "node_modules/.locale-browser-"));
const artifacts = resolve(process.env.DALI_LOCALE_ARTIFACTS || "/tmp/dali-locale-browser");
await mkdir(artifacts, { recursive: true });
const plugins = [{ name: "fixture-only-adapters", setup(b) {
  b.onResolve({ filter: /^@\/db$/ }, () => ({ path: "db", namespace: "fixture" }));
  b.onResolve({ filter: /^next\/image$/ }, () => ({ path: "image", namespace: "fixture" }));
  b.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ loader: "jsx", resolveDir: root, contents: args.path === "db"
    ? 'export function getDb(){throw new Error("Unexpected live database access")} export const getSqlClient=getDb;'
    : 'import React from "react"; export default function Image({src,alt,className,width,height}){return <img src={typeof src === "string" ? src : src.src} alt={alt} className={className} width={width} height={height}/>}' }));
} }];
await build({ entryPoints: ["tests/browser/locale-fixture-client.jsx"], bundle: true, platform: "browser", format: "iife", jsx: "automatic", outfile: join(dir, "client.js"), define: { "process.env.NODE_ENV": '"development"', "process.env": "{}" }, plugins });
await build({ entryPoints: ["tests/browser/locale-fixture-server.jsx"], bundle: true, platform: "node", packages: "external", format: "cjs", jsx: "automatic", outfile: join(dir, "server.cjs"), plugins });
const { render } = require(join(dir, "server.cjs"));
const js = await readFile(join(dir, "client.js"));
const css = (await Promise.all(["app/globals.css", "app/portal/portal.css", "app/portal/premium-glass.css", "app/portal/visual-accessibility.css"].map(path => readFile(path, "utf8")))).join("\n");
let failSave = false, saveDelay = 0;
const saves = [], documents = [];
const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/client.js") { res.setHeader("content-type", "text/javascript"); res.end(js); return; }
  if (url.pathname === "/style.css") { res.setHeader("content-type", "text/css"); res.end(css); return; }
  if (url.pathname.startsWith("/api/")) {
    res.setHeader("content-type", "application/json");
    if (url.pathname.endsWith("/language") || url.pathname === "/api/locale") {
      let body = ""; for await (const chunk of req) body += chunk;
      const data = JSON.parse(body); saves.push({ path: url.pathname, ...data });
      await new Promise(resolve => setTimeout(resolve, saveDelay));
      res.statusCode = failSave ? 500 : 200;
      res.end(JSON.stringify(failSave ? { error: "Fixture failure" } : { locale: data.locale })); return;
    }
    res.end(JSON.stringify({ notifications: [], tasks: [], incoming: [], requests: [], roleDefinitions: [], conversations: [], messages: [], results: [], status: "ok" })); return;
  }
  if (url.pathname === "/dally-logo.jpg") { res.setHeader("content-type", "image/jpeg"); res.end(await readFile("public/dally-logo.jpg")); return; }
  if (url.pathname !== "/") { res.statusCode = 204; res.end(); return; }
  documents.push(req.url);
  const locale = req.headers.cookie?.match(/dali_locale=([^;]+)/)?.[1] || url.searchParams.get("locale") || "ar";
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.end(`<!doctype html><html lang="${locale}" dir="${locale === "ar" ? "rtl" : "ltr"}"><head><link rel="stylesheet" href="/style.css"></head><body><div id="root">${render(locale)}</div><script id="payload" type="application/json">{"weeklyOff":"الجمعة"}</script><script src="/client.js"></script></body></html>`);
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, ...(process.env.DALI_CHROMIUM_PATH ? { executablePath: process.env.DALI_CHROMIUM_PATH } : {}) });
const results = [];
try {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    for (const initial of ["ar", "en", "bn"]) {
      const context = await browser.newContext({ viewport });
      await context.addCookies([{ name: "dali_locale", value: initial, url: origin }, { name: "fixture_session", value: "preserve-me", url: origin }]);
      const page = await context.newPage(), errors = [];
      page.on("pageerror", error => errors.push(error.message));
      page.on("console", message => { if (message.type() === "error" && /HYDRATION|portal-render-failed/.test(message.text())) errors.push(message.text()); });
      await page.goto(`${origin}/?locale=${initial}&delay=1`);
      await page.waitForSelector(".admin-shell");
      await page.waitForFunction(() => Boolean(window.localeProbe));
      await page.waitForFunction(locale => {
        const title = document.querySelector(".admin-shell h1")?.textContent || "";
        return locale === "ar" ? title.includes("مرحباً") : locale === "en" ? title.includes("Welcome") : title.includes("স্বাগত");
      }, initial);
      const marker = await page.evaluate(() => window.documentMarker = crypto.randomUUID());
      const search = page.locator(".global-search input");
      await search.fill("مسودة الجمعة 123");
      const before = documents.length;
      for (const locale of ["en", "bn", "ar", "bn", "en", "ar"]) {
        await page.locator(".portal-language-switcher select").selectOption(locale);
        await page.waitForFunction(value => document.documentElement.lang === value && !document.querySelector(".portal-language-switcher select").disabled, locale);
        await page.waitForFunction(locale => {
          const title = document.querySelector(".admin-shell h1")?.textContent || "";
          return locale === "ar" ? title.includes("مرحباً") : locale === "en" ? title.includes("Welcome") : title.includes("স্বাগত");
        }, locale);
        assert.equal(await search.inputValue(), "مسودة الجمعة 123");
        assert.equal(await page.evaluate(() => window.documentMarker), marker);
        assert.equal(await page.locator("html").getAttribute("dir"), locale === "ar" ? "rtl" : "ltr");
      }
      assert.equal(documents.length, before, "Language switching reloaded the dashboard");
      assert.equal(await page.locator("#payload").textContent(), '{"weeklyOff":"الجمعة"}');
      assert.equal((await context.cookies()).find(c => c.name === "fixture_session")?.value, "preserve-me");
      failSave = true;
      await page.locator(".portal-language-switcher select").selectOption("en");
      await page.locator(".portal-language-switcher [role=alert]").waitFor();
      assert.equal(await page.locator(".portal-language-switcher select").inputValue(), "ar");
      assert.equal(await page.locator("html").getAttribute("lang"), "ar");
      assert.equal(await search.inputValue(), "مسودة الجمعة 123");
      failSave = false; saveDelay = 350;
      await page.locator(".portal-language-switcher select").selectOption("en");
      assert.equal(await page.locator(".portal-language-switcher select").isDisabled(), true);
      await page.waitForFunction(() => document.documentElement.lang === "en");
      saveDelay = 0;
      await page.waitForTimeout(100);
      assert.deepEqual(errors, []);
      await page.screenshot({ path: join(artifacts, `portal-${viewport.width}-${initial}-to-en.png`), fullPage: true });
      results.push({ initial, viewport: viewport.width, switches: 7, noReload: true, draftPreserved: true, failurePreservedLocale: true, errors });
      await context.close();
    }
  }
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(origin); await page.waitForFunction(() => Boolean(window.localeProbe));
  const dom = await page.evaluate(() => {
    const root = document.createElement("div"); root.dataset.daliNoTranslate = "";
    document.body.appendChild(root);
    // Run the actual helper directly on a detached fixture so the live page
    // observer cannot interfere with the deterministic dynamic-node assertions.
    const fixture = document.createElement("section");
    fixture.innerHTML = '<script type="application/json">{"day":"الجمعة"}</script><style>.x:before{content:"الجمعة"}</style><textarea>الجمعة</textarea><div contenteditable>الجمعة</div><span translate="no">الجمعة</span><p title="الجمعة">الجمعة</p><select><option>الجمعة</option></select>';
    const t = window.localeProbe.translateLocaleTree;
    t(fixture, "en");
    const paragraph = fixture.querySelector("p"), node = paragraph.firstChild;
    const en = paragraph.textContent, title = paragraph.title;
    node.nodeValue = "السبت"; paragraph.title = "السبت";
    t(fixture, "en"); const updated = paragraph.textContent;
    t(fixture, "bn"); const bn = paragraph.textContent;
    t(fixture, "ar");
    return { en, title, updated, bn, ar: paragraph.textContent, sameNode: paragraph.firstChild === node,
      script: fixture.querySelector("script").textContent, style: fixture.querySelector("style").textContent,
      textarea: fixture.querySelector("textarea").value, editable: fixture.querySelector("[contenteditable]").textContent,
      exempt: fixture.querySelector("[translate=no]").textContent, optionValue: fixture.querySelector("option").value };
  });
  assert.equal(dom.en, "Friday"); assert.equal(dom.title, "Friday"); assert.equal(dom.updated, "Saturday");
  assert.equal(dom.bn, "শনিবার"); assert.equal(dom.ar, "السبت"); assert.equal(dom.sameNode, true);
  assert.equal(dom.script, '{"day":"الجمعة"}'); assert.equal(dom.style, '.x:before{content:"الجمعة"}');
  for (const key of ["textarea", "editable", "exempt", "optionValue"]) assert.equal(dom[key], "الجمعة");
  results.push({ domSafety: dom }); await context.close();
  assert.ok(saves.every(save => save.path === "/api/portal/language"));
  console.log(JSON.stringify({ status: "passed", cases: results.length, results }, null, 2));
  await writeFile(join(artifacts, "results.json"), JSON.stringify({ status: "passed", cases: results.length, results }, null, 2));
} finally {
  await browser.close(); await new Promise(resolve => server.close(resolve)); await rm(dir, { recursive: true, force: true });
}
