import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const css = await readFile(new URL("../app/portal/visual-accessibility.css", import.meta.url), "utf8");

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
