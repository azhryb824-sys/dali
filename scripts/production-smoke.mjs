import assert from "node:assert/strict";

const origin=(process.env.DALI_PRODUCTION_ORIGIN||"https://dali-ql1q.onrender.com").replace(/\/$/,"");
const pages=["/","/services","/construction","/construction/services","/locations","/contact","/privacy"];
const results=[];
for(const path of pages){const started=performance.now();const response=await fetch(`${origin}${path}`,{redirect:"follow",headers:{"user-agent":"DaliProductionAcceptance/1.0"}});const body=await response.text();const elapsed=Math.round(performance.now()-started);assert.equal(response.status,200,`${path} returned ${response.status}`);assert.match(response.headers.get("content-type")||"",/text\/html/);assert.match(body,/<html[^>]*lang="ar"/);assert.match(body,/<link[^>]+rel="canonical"/);assert.doesNotMatch(body,/وصف برمجي|تعليمات استخدام|placeholder text/i);results.push({path,status:response.status,elapsedMs:elapsed,bytes:Buffer.byteLength(body)})}
const health=await fetch(`${origin}/api/health/ready`);assert.equal(health.status,200);const healthBody=await health.json();assert.equal(healthBody.status,"ok");
for(const path of ["/api/portal/construction/attachments?recordId=1","/api/portal/construction/cost-control?projectId=1"]){const response=await fetch(`${origin}${path}`);assert.equal(response.status,403,`${path} must exist and reject anonymous access`)}
console.table(results);console.log(JSON.stringify({origin,health:healthBody.status,maxPageMs:Math.max(...results.map(item=>item.elapsedMs)),checkedAt:new Date().toISOString()}));

// Public SEO acceptance on the production domain after the atomic switch.
if (new URL(origin).hostname === "dally.info") {
  for (const locale of ["en", "bn"]) {
    const path = `/${locale}/contact`;
    const response = await fetch(`${origin}${path}`);
    assert.equal(response.status, 200, `${path} must render independently`);
    const html = await response.text();
    assert.match(html, new RegExp(`<html[^>]*lang="${locale}"`));
    const canonical = html.match(/<link[^>]+rel="canonical"[^>]+href="([^"]+)"/i)?.[1];
    assert.equal(canonical, `${origin}${path}`);
    assert.match(html, /hreflang="en"/i);
    assert.match(html, /hreflang="bn"/i);
  }
  const robots = await fetch(`${origin}/robots.txt`);
  assert.equal(robots.status, 200);
  assert.match(await robots.text(), /Sitemap: https:\/\/dally\.info\/sitemap\.xml/);
  const sitemap = await fetch(`${origin}/sitemap.xml`);
  assert.equal(sitemap.status, 200);
  const xml = await sitemap.text();
  assert.match(xml, /https:\/\/dally\.info\/en\/contact/);
  assert.match(xml, /https:\/\/dally\.info\/bn\/contact/);
  assert.doesNotMatch(xml, /cust5467|<loc>[^<]*\/portal/);
  const www = await fetch("https://www.dally.info/en/contact?source=deployment", { redirect: "manual" });
  assert.ok([301, 308].includes(www.status), "www must permanently redirect");
  assert.equal(www.headers.get("location"), `${origin}/en/contact?source=deployment`);
  console.log("PUBLIC_SEO_ACCEPTANCE_OK");
}
