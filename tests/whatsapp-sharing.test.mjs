import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

const source = fs.readFileSync(new URL("../lib/whatsapp.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const whatsapp = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

test("Saudi WhatsApp numbers are normalized to the client's direct account", () => {
  const cases = [
    ["0566110144", "966566110144"],
    ["+966 56 611 0144", "966566110144"],
    ["00966-56-611-0144", "966566110144"],
    ["9660566110144", "966566110144"],
    ["566110144", "966566110144"],
  ];
  for (const [input, expected] of cases) assert.equal(whatsapp.normalizeSaudiWhatsAppNumber(input), expected);
});

test("invalid numbers never open an unrelated WhatsApp account", () => {
  for (const input of ["", "12345", "0112345678", "+20 1012345678"])
    assert.equal(whatsapp.normalizeSaudiWhatsAppNumber(input), null);
});

test("WhatsApp URL targets the client and encodes the complete message", () => {
  const message = "عرض سعر رقم 12: https://dally.info/share/abc";
  const url = whatsapp.createWhatsAppUrl("0566110144", message);
  assert.ok(url.startsWith("https://wa.me/966566110144?text="));
  assert.equal(decodeURIComponent(url.split("?text=")[1]), message);
  assert.equal(
    whatsapp.createWhatsAppAppUrl("0566110144", message),
    `whatsapp://send?phone=966566110144&text=${encodeURIComponent(message)}`,
  );
  assert.equal(
    whatsapp.createWhatsAppWebUrl("0566110144", message),
    `https://web.whatsapp.com/send?phone=966566110144&text=${encodeURIComponent(message)}`,
  );
});

test("portal visual system is loaded after module styles", () => {
  const layout = fs.readFileSync(new URL("../app/portal/layout.tsx", import.meta.url), "utf8");
  const premiumIndex = layout.indexOf('import "./premium-glass.css"');
  const moduleIndex = layout.indexOf('import "./management-enhancements.css"');
  assert.ok(premiumIndex > moduleIndex, "premium visual layer must be the final portal stylesheet");
});
