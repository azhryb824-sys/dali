import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Arabic, English and Bengali share a persistent direction-aware translation runtime", async () => {
  const [i18n, runtime, authoredCatalog, layout, publicApi] = await Promise.all([
    source("lib/i18n.ts"), source("app/components/LocaleRuntime.tsx"),
    source("lib/i18n-authored-strings.ts"), source("app/layout.tsx"), source("app/api/locale/route.ts")
  ]);
  assert.match(i18n, /supportedLocales = \["ar", "en", "bn"\]/);
  assert.match(i18n, /bn: "বাংলা"/);
  assert.match(i18n, /locale === "ar" \? "rtl" : "ltr"/);
  assert.match(i18n, /"لوحة المتابعة".*bn: "ড্যাশবোর্ড"/);
  assert.match(runtime, /MutationObserver/);
  assert.match(runtime, /document\.documentElement\.dir/);
  assert.match(runtime, /document\.cookie/);
  assert.match(runtime, /originalText/);
  assert.match(runtime, /getBrowserTranslator/);
  assert.match(runtime, /authoredUiStrings\.has\(value\)/);
  assert.match(runtime, /data-no-translate/);
  assert.match(authoredCatalog, /إدارة الموظفين/);
  assert.match(authoredCatalog, /طلب عرض سعر/);
  assert.match(runtime, /\/api\/locale/);
  assert.match(layout, /localeCookieName/);
  assert.match(layout, /<html lang=\{locale\} dir=\{localeDirection\(locale\)\}>/);
  assert.match(publicApi, /SameSite=Lax/);
});

test("non-admin portal users choose a saved language on first login while supervisors bypass onboarding", async () => {
  const [portal, onboarding, api, access, schema, migration] = await Promise.all([
    source("app/portal/page.tsx"), source("app/portal/language/page.tsx"),
    source("app/api/portal/language/route.ts"), source("lib/portal-access.ts"),
    source("db/schema.ts"), source("drizzle-pg/0039_replace_urdu_with_bengali.sql")
  ]);
  assert.match(portal, /access\.role !== "admin" && !cookieLocale && !access\.preferredLanguage/);
  assert.match(portal, /redirect\("\/portal\/language"\)/);
  assert.match(onboarding, /access\.role==="admin"/);
  assert.match(api, /preferredLanguage:locale/);
  assert.match(api, /language_selected_at = \$2/);
  assert.match(api, /code!=="42703"/);
  assert.match(access, /preferredLanguage/);
  assert.match(schema, /languageSelectedAt/);
  assert.match(migration, /preferred_language/);
  assert.match(migration, /'ar','en','bn'/);
  assert.match(migration, /WHERE "preferred_language" = 'ur'/);
});

test("login schema repair runs before unrelated HR migrations", async () => {
  const name="00270_login_schema_hotfix.sql",hotfix=await source(`drizzle-pg/${name}`);
  assert.match(name,/^\d+_.+\.sql$/);assert.ok(name.localeCompare("0028_hr_employee_experience.sql")<0);
  assert.match(hotfix,/preferred_language/);assert.match(hotfix,/language_selected_at/);
});
