import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { after, test } from "node:test";
import { build } from "esbuild";

const dir = await mkdtemp(join(tmpdir(), "dali-locale-test-"));
const output = join(dir, "client.cjs");
await build({ entryPoints: ["lib/client-locale.ts"], bundle: true, platform: "node", format: "cjs", outfile: output });
const client = await import(pathToFileURL(output).href);
after(() => rm(dir, { recursive: true, force: true }));

function browser(fetcher) {
  const saved = Object.fromEntries(["document", "window", "fetch"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  let cookie = "dali_locale=ar; dali_session=test-only-session", writes = [], events = 0;
  const window = new EventTarget();
  window.location = { protocol: "https:", reload() { assert.fail("Language switching must not reload the portal"); }, replace() { assert.fail("Language switching must not end the session"); } };
  window.setTimeout = setTimeout; window.clearTimeout = clearTimeout;
  window.addEventListener("dali-locale-changed", () => events++);
  const document = { get cookie() { return cookie; }, set cookie(value) { writes.push(value); cookie = value.split(";")[0] + "; dali_session=test-only-session"; } };
  for (const [key, value] of Object.entries({ window, document, fetch: fetcher })) Object.defineProperty(globalThis, key, { configurable: true, value });
  return { window, get cookie() { return cookie; }, get writes() { return writes; }, get events() { return events; }, restore() { for (const [key, descriptor] of Object.entries(saved)) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } } };
}

test("language switches commit each supported locale without navigation or touching the session", async () => {
  const calls = [];
  const env = browser(async (url, options) => { calls.push([url, options]); return Response.json(JSON.parse(options.body)); });
  try {
    for (const locale of ["en", "bn", "ar"]) {
      await client.saveClientLocale(locale, true);
      assert.equal(client.readClientLocale(), locale);
      assert.ok(env.cookie.includes("dali_session=test-only-session"));
    }
    assert.equal(env.events, 3);
    assert.ok(env.writes.every(value => value.includes("Secure") && value.includes("SameSite=Lax")));
    for (const [url, options] of calls) {
      assert.equal(url, "/api/portal/language");
      assert.equal(options.credentials, "same-origin"); assert.equal(options.cache, "no-store");
    }
  } finally { env.restore(); }
});

for (const [name, response] of [
  ["forbidden", () => Response.json({ error: "Forbidden" }, { status: 403 })],
  ["server error", () => Response.json({ error: "Failed" }, { status: 500 })],
  ["invalid response", () => new Response("not-json")],
  ["empty response", () => new Response("")],
  ["wrong locale", () => Response.json({ locale: "bn" })],
  ["network failure", () => { throw new Error("offline"); }],
]) test(`failed language save (${name}) preserves the current UI locale`, async () => {
  const env = browser(response);
  try {
    await assert.rejects(client.saveClientLocale("en", true));
    assert.equal(client.readClientLocale(), "ar"); assert.equal(env.writes.length, 0); assert.equal(env.events, 0);
  } finally { env.restore(); }
});

test("overlapping language saves cannot commit out of order; public uses its own endpoint", async () => {
  let finish;
  const env = browser(url => { assert.equal(url, "/api/locale"); return new Promise(resolve => { finish = resolve; }); });
  try {
    const first = client.saveClientLocale("en", false);
    await assert.rejects(client.saveClientLocale("bn", false));
    assert.equal(client.readClientLocale(), "ar");
    finish(Response.json({ locale: "en" })); await first;
    assert.equal(client.readClientLocale(), "en"); assert.equal(env.events, 1);
  } finally { env.restore(); }
});

test("invalid locales never reach the API", async () => {
  const env = browser(() => assert.fail("Unexpected request"));
  try { await assert.rejects(client.saveClientLocale("xx", true)); assert.equal(env.writes.length, 0); }
  finally { env.restore(); }
});

test("a stalled save times out without changing locale, and subsequent retries work", async () => {
  let attempts = 0;
  const env = browser((_url, options) => ++attempts === 1 ? new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => reject(new Error("aborted")))) : Promise.resolve(Response.json({ locale: "en" })));
  env.window.setTimeout = handler => setTimeout(handler, 5);
  try {
    await assert.rejects(client.saveClientLocale("en", true)); assert.equal(client.readClientLocale(), "ar");
    await client.saveClientLocale("en", true); assert.equal(client.readClientLocale(), "en");
  } finally { env.restore(); }
});

test("portal error recovery and scoped translation do not replace authentication or mutate executable data", async () => {
  const runtime = await readFile("app/components/LocaleRuntime.tsx", "utf8");
  const dom = await readFile("lib/locale-dom.ts", "utf8");
  const error = await readFile("app/portal/error.tsx", "utf8");
  assert.match(runtime, /if \(!portal && portalPage\) return/);
  assert.match(runtime, /closest\("\.admin-shell"\)/);
  assert.doesNotMatch(runtime, /location\.(?:reload|replace)|router\.refresh/);
  assert.match(dom, /script,style,noscript,template/);
  assert.match(dom, /contenteditable/); assert.match(dom, /parent\?\.closest\("textarea"\)/);
  assert.match(dom, /current === previous\.rendered/); assert.match(dom, /characterData: true/);
  assert.doesNotMatch(dom, /innerHTML|outerHTML|replaceChild|removeChild/);
  assert.match(error, /setClientLocale\("ar"\); reset\(\)/);
  assert.doesNotMatch(error, /الخادم يعمل، لكن/);
});
