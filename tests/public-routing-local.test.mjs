import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";
import test from "node:test";
async function load(file) {
  const result = await build({ entryPoints: [file], bundle: true, platform: "node", format: "esm", write: false });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
}
const routing = await load("lib/public-locale.ts");
test("public locale links preserve page, query and anchor and never localize private routes", () => {
  for (const locale of routing.publicLocales) {
    const prefix = locale === "ar" ? "" : `/${locale}`;
    assert.equal(routing.localizedPath("/services/site?x=1#details", locale), `${prefix}/services/site?x=1#details`);
    assert.equal(routing.localizedPath("/bn/contact#quote", locale), `${prefix}/contact#quote`);
    assert.equal(routing.localizedPath("/", locale), prefix || "/");
    for (const path of ["/portal", "/api/portal/website", "/login", "/worker", "/pwa", "/dally-logo.jpg"]) assert.equal(routing.localizedPath(path, locale), path);
  }
  assert.equal(routing.localizedPath("//external.test/path", "en"), "//external.test/path");
  assert.equal(routing.isPublicPath("/%70ortal/website"), false);
  assert.equal(routing.isPublicPath("/%61pi/portal/website"), false);
  assert.equal(routing.isPublicPath("/%zz"), false);
});
test("language alternates identify each independent page and the Arabic fallback", () => {
  assert.deepEqual(routing.languageAlternates("/services/site"), { "ar-SA": "/services/site", en: "/en/services/site", bn: "/bn/services/site", "x-default": "/services/site" });
});
test("local map references accept Google HTTPS URLs and reject spoofed hosts", async () => {
  const { safeMapUrl, companyMapUrl } = await load("lib/local-business.ts");
  assert.equal(safeMapUrl("https://maps.app.goo.gl/verified"), "https://maps.app.goo.gl/verified");
  for (const url of ["javascript:alert(1)", "http://google.com/maps", "https://google.com.attacker.test/maps", "https://attacker.test"]) assert.equal(safeMapUrl(url), "");
  const fallback = new URL(companyMapUrl({ companyName: "Dali", address: "Makkah", mapUrl: "", googleBusinessUrl: "" }));
  assert.equal(fallback.hostname, "www.google.com");
  assert.equal(fallback.searchParams.get("query"), "Dali، Makkah");
});
test("the visual preview retains server authorization and never publishes drafts on message receipt", async () => {
  const [page, canvas] = await Promise.all([readFile("app/portal/website-preview/page.tsx", "utf8"), readFile("app/portal/website-preview/WebsitePreviewCanvas.tsx", "utf8")]);
  assert.match(page, /hasPortalPermission\(access, "website", "read"\)/);
  assert.match(canvas, /event\.source !== window\.parent/);
  assert.match(canvas, /event\.origin !== window\.location\.origin/);
  assert.doesNotMatch(canvas, /fetch\(|method:\s*"PUT"/);
});
test("public translation preserves URL and Date metadata objects and stable identifiers", async () => {
  const { translatePublicValue } = await load("lib/public-translation.ts");
  const origin = new URL("https://dally.info"); const date = new Date("2026-10-01T00:00:00Z");
  const source = { metadataBase: origin, title: "عنوان", slug: "عنوان", updatedAt: date, nested: { description: "عنوان" } };
  const result = translatePublicValue(source, "en", { "عنوان": "Title" });
  assert.equal(result.metadataBase, origin);
  assert.equal(result.updatedAt, date);
  assert.equal(result.title, "Title");
  assert.equal(result.slug, "عنوان");
  assert.equal(result.nested.description, "Title");
  assert.equal(source.title, "عنوان");
});
