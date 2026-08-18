import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const developmentPreviewMeta =
  /<meta(?=[^>]*\bname=["']codex-preview["'])(?=[^>]*\bcontent=["']development["'])[^>]*>/i;

test("constructs portal redirects with complete mutable headers", async () => {
  const routeFiles = [
    "../app/api/portal/session/start/route.ts",
    "../app/api/portal/session/end/route.ts",
  ];

  for (const routeFile of routeFiles) {
    const source = await readFile(new URL(routeFile, import.meta.url), "utf8");
    assert.match(source, /new Response\(null,/);
    assert.doesNotMatch(source, /\bresponse\.headers\.(?:set|append)\(/);
  }
});

test("renders the public site and protects request workflows", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  const env = {
    ASSETS: {
      fetch: async (request) => {
        const pathname = new URL(request.url).pathname;
        if (pathname === "/images/dali-hero.webp") return new Response(await readFile(new URL("../public/images/dali-hero.webp", import.meta.url)), { headers: { "content-type": "application/octet-stream" } });
        return new Response("Not found", { status: 404 });
      },
    },
    DB: {
      prepare(sql) {
        return {
          bind() { return this; },
          async first() {
            return sql.includes("SELECT 1") ? { healthy: 1 } : { request_count: 1, blocked_until: null };
          },
        };
      },
    },
  };
  const context = {
    waitUntil() {},
    passThroughOnException() {},
  };

  const response = await worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    env,
    context,
  );

  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-type") ?? "",
    /^text\/html\b/i,
  );
  const html = await response.text();
  assert.match(html, developmentPreviewMeta);
  assert.match(html, /البحث في جميع أقسام الموقع/);
  assert.match(html, /الكوادر المناسبة/);
  assert.match(html, /محادثة مباشرة/);
  assert.match(html, /إرسال طلب عرض السعر/);
  assert.match(html, /حي الرصيفة/);
  assert.match(html, /شركة دالي للتشغيل والصيانة/);
  assert.doesNotMatch(html, /شركة دالي للمقاولات/);
  assert.match(html, /ProfessionalService/);
  assert.match(html, /WebSite/);
  assert.match(html, /FAQPage/);
  assert.match(html, /href=["']\/services\/construction-workforce["']/);
  assert.match(html, /href=["']\/insights["']/);
  assert.doesNotMatch(html, /حي ولي العهد|الدائري الخامس/);
  assert.doesNotMatch(html, /href=["']\/portal["']/i);
  assert.match(response.headers.get("content-security-policy") ?? "", /default-src 'self'/);
  assert.match(response.headers.get("content-security-policy") ?? "", /frame-src 'none'/);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.equal(response.headers.get("cross-origin-resource-policy"), "same-origin");
  assert.equal(response.headers.get("x-permitted-cross-domain-policies"), "none");
  assert.equal(response.headers.get("x-robots-tag"), null);
  const unifiedHeader = html.match(/<header class="site-header">[\s\S]*?<\/header>/)?.[0];
  assert.ok(unifiedHeader, "the shared public header must render on the homepage");

  const optimizedImage = await worker.fetch(
    new Request("http://localhost/_next/image?url=%2Fimages%2Fdali-hero.webp&w=1080&q=75", { headers: { accept: "image/webp" } }),
    env,
    context,
  );
  assert.equal(optimizedImage.status, 200);
  assert.equal(optimizedImage.headers.get("content-type"), "image/webp");
  assert.match(optimizedImage.headers.get("cache-control") ?? "", /public/);
  assert.equal(optimizedImage.headers.get("x-content-type-options"), "nosniff");
  assert.ok((await optimizedImage.arrayBuffer()).byteLength > 10_000);

  for (const [path, expected] of [
    ["/about", "عن شركة دالي"],
    ["/services", "حلول عملية تدعم استمرارية أعمالك"],
    ["/services/manpower-supply-makkah", "توفير عمالة للمشروعات والمنشآت"],
    ["/services/construction-workforce", "قوى عاملة وفرق فنية للمشروعات الإنشائية"],
    ["/services/operations-maintenance", "فرق التشغيل والصيانة"],
    ["/services/technical-teams", "توفير فنيين وفرق متعددة المهن"],
    ["/hajj", "قوى عاملة مرنة"],
    ["/insights", "معرفة تساعدك على التخطيط بثقة"],
    ["/insights/workforce-demand-planning", "كيف تخطط احتياج القوى العاملة"],
    ["/insights/hajj-season-workforce-readiness", "دليل جاهزية فرق العمل"],
    ["/insights/worker-document-checklist", "قائمة مراجعة وثائق العامل"],
    ["/sectors", "خبرة مرنة تفهم طبيعة قطاعك"],
    ["/sectors/hotels-hospitality", "حلول القوى العاملة للفنادق والضيافة في مكة"],
    ["/sectors/seasonal-hajj", "فرق تشغيل وخدمات مساندة لموسم الحج في مكة"],
    ["/locations", "من مكة، أقرب إلى احتياج أعمالك"],
    ["/locations/makkah", "توفير العمالة والتشغيل والصيانة في مكة المكرمة"],
    ["/projects", "خبرات نبني عليها شراكات أطول"],
    ["/credentials", "ثقة تستند إلى معلومات واضحة"],
    ["/careers", "انضم إلى فريق يصنع فرقًا"],
    ["/partners", "شراكات تصنع قيمة مشتركة"],
    ["/faq", "إجابات مباشرة"],
    ["/feedback", "صوتك يساعدنا"],
    ["/contact", "طلب عرض سعر"],
    ["/privacy", "سياسة الخصوصية"],
    ["/terms", "الشروط والأحكام"],
    ["/search?q=الحج", "نتائج البحث"],
  ]) {
    const page = await worker.fetch(new Request(`http://localhost${path}`, { headers: { accept: "text/html" } }), env, context);
    assert.equal(page.status, 200, path);
    const pageHtml = await page.text();
    assert.match(pageHtml, new RegExp(expected), path);
    assert.doesNotMatch(pageHtml, /شركة دالي للمقاولات/, path);
    assert.doesNotMatch(pageHtml, /inner-site-header/, path);
    assert.equal(pageHtml.match(/<header class="site-header">[\s\S]*?<\/header>/)?.[0], unifiedHeader, `${path} must use the same public navigation`);
  }

  const missingService = await worker.fetch(new Request("http://localhost/services/not-a-real-service", { headers: { accept: "text/html" } }), env, context);
  assert.equal(missingService.status, 404);
  const missingSector = await worker.fetch(new Request("http://localhost/sectors/not-a-real-sector", { headers: { accept: "text/html" } }), env, context);
  assert.equal(missingSector.status, 404);
  const missingLocation = await worker.fetch(new Request("http://localhost/locations/not-a-real-location", { headers: { accept: "text/html" } }), env, context);
  assert.equal(missingLocation.status, 404);

  for (const path of ["/projects", "/credentials", "/careers", "/feedback"]) {
    const page = await worker.fetch(new Request(`http://localhost${path}`, { headers: { accept: "text/html" } }), env, context);
    assert.equal(page.status, 200, path);
    assert.match(await page.text(), /<meta(?=[^>]*name=["']robots["'])(?=[^>]*content=["']noindex, follow["'])[^>]*>/i, path);
  }

  const sitemap = await worker.fetch(new Request("http://localhost/sitemap.xml"), env, context);
  assert.equal(sitemap.status, 200);
  const sitemapXml = await sitemap.text();
  assert.match(sitemapXml, /services\/manpower-supply-makkah/);
  assert.match(sitemapXml, /insights\/hajj-season-workforce-readiness/);
  assert.match(sitemapXml, /sectors\/hotels-hospitality/);
  assert.match(sitemapXml, /sectors\/seasonal-hajj/);
  assert.match(sitemapXml, /locations\/makkah/);
  assert.doesNotMatch(sitemapXml, /\/projects<|\/credentials<|\/careers<|\/feedback</);
  assert.match(sitemapXml, /<lastmod>2026-08-14<\/lastmod>/);
  assert.doesNotMatch(sitemapXml, /<priority>|<changefreq>/);

  const robots = await worker.fetch(new Request("http://localhost/robots.txt"), env, context);
  assert.equal(robots.status, 200);
  const robotsText = await robots.text();
  assert.match(robotsText, /Disallow: \/portal/);
  assert.match(robotsText, /Disallow: \/api/);
  assert.doesNotMatch(robotsText, /Disallow: \/search/);
  assert.match(robotsText, /Sitemap: https:\/\/dali-contracting\.cust5467\.chatgpt\.site\/sitemap\.xml/);

  const search = await worker.fetch(new Request("http://localhost/search?q=المقاولات", { headers: { accept: "text/html" } }), env, context);
  assert.equal(search.status, 200);
  assert.equal(search.headers.get("x-robots-tag"), "noindex, nofollow, noarchive");

  const health = await worker.fetch(new Request("http://localhost/api/health"), env, context);
  assert.equal(health.status, 200);
  assert.equal(health.headers.get("x-robots-tag"), "noindex, nofollow, noarchive");
  assert.equal((await health.json()).status, "ok");

  const invalidRequest = await worker.fetch(
    new Request("http://localhost/api/workforce-requests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    }),
    env,
    context,
  );
  assert.equal(invalidRequest.status, 400);

  const unsupportedRequest = await worker.fetch(
    new Request("http://localhost/api/workforce-requests", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "not-json",
    }),
    env,
    context,
  );
  assert.equal(unsupportedRequest.status, 415);

  const oversizedRequest = await worker.fetch(
    new Request("http://localhost/api/workforce-requests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ details: "x".repeat(25_000) }),
    }),
    env,
    context,
  );
  assert.equal(oversizedRequest.status, 413);

  const crossSiteRequest = await worker.fetch(
    new Request("http://localhost/api/workforce-requests", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://attacker.example" },
      body: JSON.stringify({}),
    }),
    env,
    context,
  );
  assert.equal(crossSiteRequest.status, 403);

  const invalidChat = await worker.fetch(
    new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "start" }),
    }),
    env,
    context,
  );
  assert.equal(invalidChat.status, 400);

  const unauthorizedConversations = await worker.fetch(
    new Request("http://localhost/api/portal/conversations"),
    env,
    context,
  );
  assert.equal(unauthorizedConversations.status, 403);

  for (const path of ["/api/portal/session/touch", "/api/portal/access-request"]) {
    const unauthorized = await worker.fetch(new Request(`http://localhost${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }), env, context);
    assert.equal(unauthorized.status, 401, path);
  }

  for (const path of ["/api/portal/operations", "/api/portal/search?q=test", "/api/portal/integrations", "/api/portal/documents/share", "/api/portal/website", "/api/portal/accounting", "/api/portal/hr", "/api/portal/compliance", "/api/portal/finance/posting", "/api/portal/purchasing", "/api/portal/reports", "/api/portal/reports/pdf", "/api/portal/banking/reconciliations"]) {
    const unauthorized = await worker.fetch(new Request(`http://localhost${path}`), env, context);
    assert.equal(unauthorized.status, 403, path);
  }

  const unauthorizedReply = await worker.fetch(
    new Request("http://localhost/api/portal/requests/1/reply", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ subject: "اختبار", body: "رد" }),
    }),
    env,
    context,
  );
  assert.equal(unauthorizedReply.status, 403);
});
