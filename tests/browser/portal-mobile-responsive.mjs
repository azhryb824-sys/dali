// Browser regression for the real portal shell plus representative dense module surfaces.
import assert from "node:assert/strict";
import { build } from "esbuild";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
const require = createRequire(import.meta.url);
const { chromium } = await import(process.env.DALI_PLAYWRIGHT_MODULE || "playwright");
const root = process.cwd();
const dir = await mkdtemp(join(root, "node_modules/.portal-mobile-"));
const artifacts = resolve(process.env.DALI_MOBILE_ARTIFACTS || "/tmp/dali-mobile-browser");
await mkdir(artifacts,{recursive:true});
const plugins=[{name:"fixture-only-adapters",setup(b){
 b.onResolve({filter:/^@\/db$/},()=>({path:"db",namespace:"fixture"}));
 b.onResolve({filter:/^next\/image$/},()=>({path:"image",namespace:"fixture"}));
 b.onLoad({filter:/.*/,namespace:"fixture"},args=>({loader:"jsx",resolveDir:root,contents:args.path==="db"
   ? 'export function getDb(){throw new Error("Unexpected live database access")} export const getSqlClient=getDb;'
   : 'import React from "react"; export default function Image({src,alt,className,width,height}){return <img src={typeof src==="string"?src:src.src} alt={alt} className={className} width={width} height={height}/>}' }));
}}];
await build({entryPoints:["tests/browser/locale-fixture-client.jsx"],bundle:true,platform:"browser",format:"iife",jsx:"automatic",outfile:join(dir,"client.js"),define:{"process.env.NODE_ENV":'"development"',"process.env":"{}"},plugins});
await build({entryPoints:["tests/browser/locale-fixture-server.jsx"],bundle:true,platform:"node",packages:"external",format:"cjs",jsx:"automatic",outfile:join(dir,"server.cjs"),plugins});
const {render}=require(join(dir,"server.cjs"));
const js=await readFile(join(dir,"client.js"));
const css=(await Promise.all([
 "app/globals.css","app/portal/portal.css","app/portal/premium-glass.css",
 "app/portal/visual-accessibility.css","app/portal/mobile-responsive.css"
].map(p=>readFile(p,"utf8")))).join("\n");
const server=createServer(async(req,res)=>{
 const url=new URL(req.url,"http://localhost");
 if(url.pathname==="/client.js"){res.setHeader("content-type","text/javascript");res.end(js);return}
 if(url.pathname==="/style.css"){res.setHeader("content-type","text/css");res.end(css);return}
 if(url.pathname==="/dally-logo.jpg"){res.setHeader("content-type","image/jpeg");res.end(await readFile("public/dally-logo.jpg"));return}
 if(url.pathname.startsWith("/api/")){res.setHeader("content-type","application/json");res.end(JSON.stringify({notifications:[],tasks:[],incoming:[],requests:[],roleDefinitions:[],conversations:[],messages:[],results:[],status:"ok"}));return}
 if(url.pathname!=="/"){res.statusCode=204;res.end();return}
 const locale=url.searchParams.get("locale")||"ar";
 res.setHeader("content-type","text/html; charset=utf-8");
 res.end('<!doctype html><html lang="'+locale+'" dir="'+(locale==="ar"?"rtl":"ltr")+'"><head><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><link rel="stylesheet" href="/style.css"></head><body><div id="root">'+render(locale)+'</div><script src="/client.js"></script></body></html>');
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const origin="http://127.0.0.1:"+server.address().port;
const browser=await chromium.launch({headless:true});
const results=[];
async function assertNoPageOverflow(page,label){
 const m=await page.evaluate(()=>({viewport:innerWidth,html:document.documentElement.scrollWidth,body:document.body.scrollWidth}));
 assert.ok(m.html<=m.viewport+1, label+" html overflow "+JSON.stringify(m));
 assert.ok(m.body<=m.viewport+1, label+" body overflow "+JSON.stringify(m));
 return m;
}
async function injectStressLab(page){
 await page.evaluate(()=>{
  const host=document.createElement("section");host.id="mobile-stress-lab";host.className="panel";host.innerHTML=`
   <div class="management-form"><label>حقل<input value="اختبار طويل"></label><label>اختيار<select><option>خيار طويل للاختبار</option></select></label><label class="span-two">ملاحظات<textarea>نص تجريبي</textarea></label></div>
   <div class="payment-schedule-list"><div><strong>دفعة شهرية تجريبية طويلة</strong><span>1,000 ر.س</span><span>15%</span><div class="payment-actions"><button>إجراء أول</button><button>إجراء ثان</button></div></div></div>
   <div class="request-table-wrap"><table class="request-table"><thead><tr><th>أ</th><th>ب</th><th>ج</th><th>د</th></tr></thead><tbody><tr><td>1</td><td>بيانات طويلة للغاية لاختبار التمرير الداخلي</td><td>3</td><td>4</td></tr></tbody></table></div>
   <div class="workforce-board-metrics"><article>1</article><article>2</article><article>3</article><article>4</article></div>
   <div class="employee-card-grid"><article class="employee-profile-card"><header><div><strong>موظف اختباري</strong><small>بطاقة</small></div></header></article></div>`;
  document.querySelector(".admin-content")?.appendChild(host);
 });
}
try{
 const cases=[
  {width:360,height:800,locale:"ar"},{width:390,height:844,locale:"ar"},{width:430,height:900,locale:"en"},
  {width:768,height:1024,locale:"bn"},{width:1024,height:900,locale:"ar"}
 ];
 for(const v of cases){
  const context=await browser.newContext({viewport:{width:v.width,height:v.height}});
  const page=await context.newPage();const errors=[];
  page.on("pageerror",e=>errors.push(e.message));
  await page.goto(origin+"/?locale="+v.locale);
  await page.waitForSelector(".admin-shell");
  await page.waitForTimeout(150);
  await injectStressLab(page);
  const overviewContrast=await page.evaluate(()=>{
    const executiveHeading=document.querySelector(".executive-command-head h2");
    const executiveCopy=document.querySelector(".executive-command-head p");
    const metric=document.querySelector(".module-metrics button strong");
    return {
      executiveHeading: executiveHeading ? getComputedStyle(executiveHeading).color : "",
      executiveCopy: executiveCopy ? getComputedStyle(executiveCopy).color : "",
      metric: metric ? getComputedStyle(metric).color : "",
    };
  });
  assert.equal(overviewContrast.executiveHeading,"rgb(255, 255, 255)");
  assert.notEqual(overviewContrast.executiveCopy,"rgb(82, 107, 119)");
  assert.equal(overviewContrast.metric,"rgb(8, 47, 63)");
  const overflow=await assertNoPageOverflow(page,"base-"+v.width);
  if(v.width<=820){
    const menu=page.locator(".mobile-menu");assert.equal(await menu.isVisible(),true);
    const sidebar=page.locator(".admin-sidebar");
    const before=await sidebar.evaluate(el=>getComputedStyle(el).transform);
    assert.notEqual(before,"none");
    await menu.click();
    await page.locator(".sidebar-backdrop").waitFor();
    await page.waitForFunction(()=>{const el=document.querySelector(".admin-sidebar");const r=el?.getBoundingClientRect();return Boolean(r&&r.left>=-1&&r.right<=innerWidth+1)});
    const box=await sidebar.boundingBox();assert.ok(box&&box.x>=-1&&box.x+box.width<=v.width+1,JSON.stringify(box));
    await page.mouse.click(10,Math.min(220,v.height/2));await page.waitForFunction(()=>!document.querySelector(".admin-sidebar")?.classList.contains("sidebar-open"));
  } else {
    assert.equal(await page.locator(".mobile-menu").isVisible(),false);
  }
  if(v.width<=620){
    const cols=await page.locator(".metric-grid").first().evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(" ").length);
    assert.equal(cols,1);
    const actions=await page.locator("#mobile-stress-lab .payment-actions").evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(" ").length);
    assert.equal(actions,1);
  }
  const tableWrap=page.locator("#mobile-stress-lab .request-table-wrap");
  assert.ok((await tableWrap.evaluate(el=>el.scrollWidth)) >= (await tableWrap.evaluate(el=>el.clientWidth)));
  await assertNoPageOverflow(page,"stress-"+v.width);
  assert.deepEqual(errors,[]);
  await page.screenshot({path:join(artifacts,"portal-"+v.width+"-"+v.locale+".png"),fullPage:true});
  results.push({width:v.width,locale:v.locale,overflow,mobileMenu:v.width<=820,overviewContrast});
  await context.close();
 }
 const executiveContext=await browser.newContext({viewport:{width:1024,height:900}});
 const executivePage=await executiveContext.newPage();
 await executivePage.goto(origin+"/?locale=ar");
 await executivePage.waitForSelector(".admin-shell");
 await executivePage.getByRole("button",{name:"مركز المالك والمشرف"}).click();
 await executivePage.waitForSelector(".executive-center-heading");
 const centerContrast=await executivePage.evaluate(()=>({
   title:getComputedStyle(document.querySelector(".executive-center-heading h2")).color,
   copy:getComputedStyle(document.querySelector(".executive-center-heading p")).color,
   button:getComputedStyle(document.querySelector(".executive-center-heading > button")).color,
 }));
 assert.equal(centerContrast.title,"rgb(255, 255, 255)");
 assert.equal(centerContrast.button,"rgb(255, 255, 255)");
 assert.notEqual(centerContrast.copy,"rgb(82, 107, 119)");
 await executivePage.screenshot({path:join(artifacts,"executive-center-contrast.png"),fullPage:true});
 results.push({executiveCenterContrast:centerContrast});
 await executiveContext.close();
 await writeFile(join(artifacts,"results.json"),JSON.stringify({status:"passed",cases:results.length,results},null,2));
 console.log(JSON.stringify({status:"passed",cases:results.length,results},null,2));
}finally{
 await browser.close();await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true});
}
