import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { latinDigits } from "../lib/latin-digits.ts";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("PDF digit normalization converts Arabic and Persian numerals to ASCII", () => {
  assert.equal(latinDigits("١٢٣٤٥٦٧٨٩٠"), "1234567890");
  assert.equal(latinDigits("۱۲۳۴۵۶۷۸۹۰"), "1234567890");
  assert.equal(latinDigits("عقد ٢٠٢٦/۰۸/۲۶"), "عقد 2026/08/26");
});

test("all programmatic PDF generators enforce Latin numerals", () => {
  const issued = read("lib/pdf-generator.ts");
  const brand = read("lib/brand-identity-pdf.ts");
  assert.match(issued, /latinDigits\(String\(value \|\| " "\)\)/);
  assert.match(issued, /ar-SA-u-ca-gregory-nu-latn/);
  assert.match(issued, /latinFontByFont\.set\(regular, latinRegular\)/);
  assert.match(issued, /font: run\.font/);
  assert.doesNotMatch(issued, /٠١٢٣٤٥٦٧٨٩/);
  assert.match(brand, /latinFontByFont\.set\(regular, latinRegular\)/);
  assert.match(brand, /font: run\.font/);
});
