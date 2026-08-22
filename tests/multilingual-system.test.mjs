import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Arabic, English and Urdu share a persistent direction-aware translation runtime", async () => {
  const [i18n, runtime, layout, publicApi] = await Promise.all([
    source("lib/i18n.ts"), source("app/components/LocaleRuntime.tsx"),
    source("app/layout.tsx"), source("app/api/locale/route.ts")
  ]);
  assert.match(i18n, /supportedLocales = \["ar", "en", "ur"\]/);
  assert.match(i18n, /locale === "en" \? "ltr" : "rtl"/);
  assert.match(i18n, /ur:"ڈیش بورڈ"/);
  assert.match(runtime, /MutationObserver/);
  assert.match(runtime, /document\.documentElement\.dir/);
  assert.match(runtime, /\/api\/locale/);
  assert.match(layout, /localeCookieName/);
  assert.match(layout, /<html lang=\{locale\} dir=\{localeDirection\(locale\)\}>/);
  assert.match(publicApi, /SameSite=Lax/);
});

test("non-admin portal users choose a saved language on first login while supervisors bypass onboarding", async () => {
  const [portal, onboarding, api, access, schema, migration] = await Promise.all([
    source("app/portal/page.tsx"), source("app/portal/language/page.tsx"),
    source("app/api/portal/language/route.ts"), source("lib/portal-access.ts"),
    source("db/schema.ts"), source("drizzle-pg/0027_multilingual_preferences.sql")
  ]);
  assert.match(portal, /access\.role !== "admin" && !access\.preferredLanguage/);
  assert.match(portal, /redirect\("\/portal\/language"\)/);
  assert.match(onboarding, /access\.role==="admin"/);
  assert.match(api, /preferredLanguage:locale/);
  assert.match(api, /languageSelectedAt:now/);
  assert.match(access, /preferredLanguage/);
  assert.match(schema, /languageSelectedAt/);
  assert.match(migration, /preferred_language/);
  assert.match(migration, /'ar','en','ur'/);
});

test("login schema repair runs before unrelated HR migrations", async () => {
  const hotfix=await source("drizzle-pg/0027z_login_schema_hotfix.sql");
  assert.ok("0027z_login_schema_hotfix.sql".localeCompare("0028_hr_employee_experience.sql")<0);
  assert.match(hotfix,/preferred_language/);assert.match(hotfix,/language_selected_at/);
});
