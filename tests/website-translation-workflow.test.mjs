import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("website translations are reviewable, language-specific and published without overwriting Arabic", async () => {
  const [content, manager, runtime, layout, endpoint, websiteApi] = await Promise.all([
    source("lib/website-content.ts"),
    source("app/portal/WebsiteManager.tsx"),
    source("app/components/LocaleRuntime.tsx"),
    source("app/layout.tsx"),
    source("app/api/portal/translate/route.ts"),
    source("app/api/portal/website/route.ts"),
  ]);
  assert.match(content, /translations: \{ en: Record<string, string>; bn: Record<string, string> \}/);
  assert.match(content, /sanitizeTranslationMap/);
  assert.match(manager, /الترجمة قبل النشر/);
  assert.match(manager, /generateWebsiteTranslations/);
  assert.match(manager, /completeWebsiteTranslations/);
  assert.match(manager, /النشر متوقف حتى اكتمال الترجمة/);
  assert.match(manager, /draft\.translations\[translationTarget\]/);
  assert.match(endpoint, /requestedTarget==="bn"\?"bn":"en"/);
  assert.match(runtime, /websiteTranslations\[trimmed\]\|\|translateUi/);
  assert.match(runtime, /websiteTranslations\[value\]\|\|translateUi/);
  assert.match(layout, /content\.translations\[locale\]/);
  assert.match(websiteApi, /website-content-published/);
  assert.match(websiteApi, /emitPortalNotification/);
  assert.match(websiteApi, /completeWebsiteTranslations/);
  assert.match(websiteApi, /status: 422/);
});

test("published translation memory is also applied to the administrative portal", async () => {
  const dashboard = await source("app/portal/PortalDashboard.tsx");
  assert.match(dashboard, /portal websiteTranslations=/);
  assert.match(dashboard, /initialWebsiteContent\.translations\[currentUser\.preferredLanguage\]/);
});

test("legacy Urdu preferences migrate to Bengali and Bengali remains left-to-right", async () => {
  const [migration, i18n, portal] = await Promise.all([
    source("drizzle-pg/0039_replace_urdu_with_bengali.sql"),
    source("lib/i18n.ts"),
    source("app/portal/page.tsx"),
  ]);
  assert.match(migration, /SET "preferred_language" = 'bn'/);
  assert.match(migration, /IN \('ar','en','bn'\)/);
  assert.match(i18n, /value === "ur" \? "bn"/);
  assert.match(i18n, /locale === "ar" \? "rtl" : "ltr"/);
  assert.match(portal, /normalizeAppLocale\(storedLocale\)/);
});
