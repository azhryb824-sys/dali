import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const css = await readFile(new URL("../app/portal/visual-accessibility.css", import.meta.url), "utf8");
const portalCss = await readFile(new URL("../app/portal/portal.css", import.meta.url), "utf8");
const glassCss = await readFile(new URL("../app/portal/premium-glass.css", import.meta.url), "utf8");

test("dark contract surfaces keep readable foreground colors", () => {
  assert.match(css, /\.admin-shell \.feature-heading :where\(h1,h2,h3,h4,strong,b\)/);
  assert.match(css, /\.admin-shell \.payment-command-center>header :where\(h2,strong\)/);
  assert.match(css, /color:#fff!important/);
});

test("payment KPI cards have bounded responsive dimensions", () => {
  assert.match(css, /\.payment-kpis article\{/);
  assert.match(css, /min-height:118px!important/);
  assert.match(css, /max-height:150px/);
  assert.match(css, /@media\(max-width:430px\)/);
});

test("contract creation has structured responsive surfaces", () => {
  assert.match(css, /\.issue-modal \.issue-form-step\.visible/);
  assert.match(css, /\.issue-modal \.contract-wizard-steps button\.active/);
  assert.match(css, /\.issue-modal \.modal-actions/);
});

test("employee governance retains its dark readable surface", () => {
  assert.match(portalCss, /\.executive-people-center\{[^}]*background:linear-gradient\(145deg,#001d2d 0,#07374a 34%,#fff 34\.1%\)/);
  const genericSurface = glassCss.match(/\.admin-shell :where\((.+)\)\{background:linear-gradient\(145deg,rgba\(255,255,255/);
  assert.ok(genericSurface);
  assert.match(genericSurface[1], /\.panel:not\(\.executive-people-center\)/);
  assert.match(css, /\.executive-command-head[\s\S]*color:#fff!important/);
});

test("record modals constrain translated controls without horizontal overflow", () => {
  assert.match(portalCss, /\.record-modal form\{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(portalCss, /\.record-modal label\{[^}]*min-width:0/);
  assert.match(portalCss, /\.record-modal input,\.record-modal select,\.record-modal textarea\{width:100%;min-width:0;max-width:100%;box-sizing:border-box\}/);
});
