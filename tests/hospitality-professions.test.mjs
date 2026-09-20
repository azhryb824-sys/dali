import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

let directory, catalog;
before(async () => {
  directory = await mkdtemp(join(tmpdir(), "dali-professions-"));
  const outfile = join(directory, "catalog.mjs");
  await build({ stdin: { contents: `export * from './lib/workforce-requirements.ts'; export { translateUi } from './lib/i18n.ts';`, resolveDir: process.cwd() }, outfile, bundle: true, platform: "node", format: "esm", logLevel: "silent" });
  catalog = await import(pathToFileURL(outfile));
});
after(async () => { if (directory) await rm(directory, { recursive: true, force: true }); });

test("all six hospitality professions have correct English and Bengali labels without duplicate Arabic values", () => {
  const expected = [
    ["عامل تنظيف فندقي", "Housekeeping", "হাউসকিপিং কর্মী"],
    ["ويتر", "Waiter", "ওয়েটার"],
    ["حامل أمتعة", "Bellman", "লাগেজ বহনকারী"],
    ["عامل نظافة مطابخ", "Steward", "রান্নাঘর পরিচ্ছন্নতাকর্মী"],
    ["عامل نظافة المناطق العامة", "Public Area", "সাধারণ এলাকা পরিচ্ছন্নতাকর্মী"],
    ["عامل مغسلة", "Laundry", "লন্ড্রি কর্মী"],
  ];
  for (const [ar, en, bn] of expected) {
    assert.equal(catalog.workforceProfessions.filter(item => item.label === ar).length, 1);
    for (const [locale, label] of [["ar", ar], ["en", en], ["bn", bn]]) {
      assert.equal(catalog.translateUi(ar, locale), label);
      assert.equal(catalog.normalizeWorkforceProfession(label), ar);
      assert.equal(catalog.matchesWorkforceProfession(ar, label), true);
    }
  }
  assert.equal(catalog.normalizeWorkforceProfession(" house keeping "), "عامل تنظيف فندقي");
  assert.equal(catalog.normalizeWorkforceProfession("BELL MAN"), "حامل أمتعة");
  assert.equal(catalog.matchesWorkforceProfession("حامل أمتعة", "bell man"), true);
  assert.equal(catalog.normalizeWorkforceProfession(" Custom service "), "Custom service");
  assert.equal(catalog.matchesWorkforceProfession("عامل مغسلة", "waiter"), false);
  assert.ok(catalog.requirementsForProfession("ويتر").some(item => item.code === "food_safety_certificate"));
});
