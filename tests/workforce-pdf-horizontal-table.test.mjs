import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source=readFileSync(new URL("../lib/pdf-generator.ts",import.meta.url),"utf8");

test("workforce quotation table uses client-facing price and housing columns",()=>{
  assert.match(source,/drawRight\(page, "سعر العامل"/);
  assert.match(source,/drawRight\(page, "السكن"/);
  assert.match(source,/drawRight\(page, "النقل"/);
  assert.doesNotMatch(source,/drawRight\(page, "راتب العامل"/);
});

test("workforce contract renders professions through the same horizontal table",()=>{
  assert.match(source,/composer\.heading\("جدول المهن والأسعار والخدمات"\)/);
  assert.match(source,/composer\.quotationTable\(professions\.map/);
});
