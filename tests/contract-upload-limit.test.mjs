import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const nextConfig = await readFile(new URL("../next.config.ts", import.meta.url), "utf8");
const route = await readFile(new URL("../app/api/portal/documents/generate/route.ts", import.meta.url), "utf8");

test("Next proxy accepts the complete contract multipart payload", () => {
  assert.match(nextConfig, /proxyClientMaxBodySize:\s*"40mb"/);
});

test("multipart parsing errors are not mislabeled as database failures", () => {
  const parsePosition = route.indexOf("form = await request.formData()");
  const storagePosition = route.indexOf('let storageKey = ""');
  assert.ok(parsePosition > -1);
  assert.ok(storagePosition > parsePosition);
  assert.match(route, /issued-document-form-data/);
  assert.match(route, /تعذّر قراءة ملفات العقد/);
});
