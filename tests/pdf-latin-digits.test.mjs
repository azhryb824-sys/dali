import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { latinDigits, rtlPdfDigits } from "../lib/latin-digits.ts";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("PDF digit normalization converts Arabic and Persian numerals to ASCII", () => {
  assert.equal(latinDigits("١٢٣٤٥٦٧٨٩٠"), "1234567890");
  assert.equal(latinDigits("۱۲۳۴۵۶۷۸۹۰"), "1234567890");
  assert.equal(latinDigits("عقد ٢٠٢٦/۰۸/۲۶"), "عقد 2026/08/26");
  assert.equal(rtlPdfDigits("26 أغسطس 2026"), "62 أغسطس 6202");
  assert.equal(rtlPdfDigits("1,000.00 ريال"), "00.000,1 ريال");
  assert.equal(rtlPdfDigits("15%"), "%51");
});

test("all programmatic PDF generators enforce Latin numerals", () => {
  const issued = read("lib/pdf-generator.ts");
  const brand = read("lib/brand-identity-pdf.ts");
  const fonts = read("lib/cairo-font-bytes.ts");
  assert.match(issued, /latinDigits\(String\(value \|\| " "\)\)/);
  assert.match(issued, /ar-SA-u-ca-gregory-nu-latn/);
  assert.match(issued, /cairoFontBytes\("arabicRegular"\)/);
  assert.doesNotMatch(issued, /latinFontByFont/);
  assert.match(issued, /rtlFonts\.add\(regular\)/);
  assert.match(issued, /rtlPdfDigits\(value\)/);
  assert.doesNotMatch(issued, /٠١٢٣٤٥٦٧٨٩/);
  assert.match(brand, /cairoFontBytes\("arabicRegular"\)/);
  assert.doesNotMatch(brand, /latinFontByFont/);
  assert.match(fonts, /DaliArabic-Regular\.ttf/);
  assert.match(fonts, /DaliArabic-Bold\.ttf/);
});
