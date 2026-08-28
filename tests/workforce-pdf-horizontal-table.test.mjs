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

test("bilingual workforce PDFs render centered Arabic-over-English cells",()=>{
  assert.match(source,/const bilingualWorkforceTable =/);
  assert.match(source,/\["المهنة", "Profession"\]/);
  assert.match(source,/\["العدد", "Qty"\]/);
  assert.match(source,/\["سعر العامل", "Worker price"\]/);
  assert.match(source,/\["السكن", "Accommodation"\]/);
  assert.match(source,/\["النقل", "Transportation"\]/);
  assert.match(source,/drawCentered\(page, arabic/);
  assert.match(source,/drawCentered\(page, english/);
  assert.match(source,/bilingualWorkforceTable\(quotationItems\.map/);
  assert.match(source,/bilingualWorkforceTable\(professions\.map/);
});
