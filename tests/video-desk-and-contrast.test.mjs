import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const desk = await readFile(new URL("../app/portal/VideoInterviewDesk.tsx", import.meta.url), "utf8");
const css = await readFile(new URL("../app/portal/visual-accessibility.css", import.meta.url), "utf8");

test("video desk opens once for each newly seen incoming call", () => {
  assert.match(desk, /seenIncoming=useRef\(new Set<string>\(\)\)/);
  assert.match(desk, /incomingNow\.some\(item=>!seenIncoming\.current\.has\(item\.id\)\)/);
  assert.doesNotMatch(desk, /if\(interviews\.some\([^\n]+\)\)setOpen\(true\)/);
});

test("idle video launcher remains inside its fixed desk container", () => {
  assert.doesNotMatch(desk, /if\(!data\.interviews\.length&&!open\)return <button/);
  assert.match(desk, /return <aside className=\{`video-desk/);
  assert.match(css, /\.video-desk\{[\s\S]*position:fixed/);
});

test("known dark portal headers have explicit light foregrounds", () => {
  for (const selector of [".hr-heading", ".compliance-workspace>header", ".reports-workspace>header", ".accounting-heading"]) {
    assert.ok(css.includes(selector), "missing dark-surface protection for " + selector);
  }
});
