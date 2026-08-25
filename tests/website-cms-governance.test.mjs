import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("non-developers can create safe managed pages with automatic hidden routes", async () => {
  const [content, manager, page, sitemap, search] = await Promise.all([
    source("lib/website-content.ts"),
    source("app/portal/WebsiteManager.tsx"),
    source("app/pages/[slug]/page.tsx"),
    source("app/sitemap.ts"),
    source("lib/site-content.ts"),
  ]);
  assert.match(content, /WebsiteCollectionKey = .*"pages"/);
  assert.match(content, /pages: sanitizeCollection/);
  assert.match(content, /pages: "\/pages"/);
  assert.match(manager, /الصفحات الإضافية/);
  assert.match(manager, /label === "الرابط الإنجليزي"\) return null/);
  assert.match(manager, /crypto\.randomUUID\(\)/);
  assert.match(page, /findPublishedEntry\(content, "pages", slug\)/);
  assert.match(page, /generateMetadata/);
  assert.match(sitemap, /"pages"/);
  assert.match(search, /Object\.entries\(content\.collections\)/);
});

test("translation governance inventories every authored Arabic string and blocks incomplete publication", async () => {
  const [audit, manager, api, runtime] = await Promise.all([
    source("lib/website-translation-audit.ts"),
    source("app/portal/WebsiteManager.tsx"),
    source("app/api/portal/website/route.ts"),
    source("app/components/LocaleRuntime.tsx"),
  ]);
  assert.match(audit, /new Set<string>\(authoredUiStrings\)/);
  assert.match(audit, /\[\\u0600-\\u06ff\]/);
  assert.match(audit, /memory\[source\]/);
  assert.match(audit, /translateUi\(source, target\)/);
  assert.match(audit, /complete: missing\.length === 0/);
  assert.match(manager, /translationAudit\.complete/);
  assert.match(api, /لا يمكن نشر الموقع قبل اكتمال الترجمة/);
  assert.match(runtime, /placeholder.*aria-label.*title/);
});
