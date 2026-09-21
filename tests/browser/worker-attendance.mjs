// Component-browser tests of the actual ContractDrawer. API data and session
// cookies here are fixtures; real API authorization/transactions have separate
// PostgreSQL integration tests. No production accounts or endpoints are used.
import assert from "node:assert/strict";
import { build } from "esbuild";
import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
const { chromium } = await import(process.env.DALI_PLAYWRIGHT_MODULE || "playwright");
const root = process.cwd();
const dir = await mkdtemp(join(root, "node_modules/.attendance-browser-"));
const artifacts = resolve(process.env.DALI_ATTENDANCE_ARTIFACTS || "/tmp/dali-attendance-browser");
await mkdir(artifacts, { recursive: true });
await build({ stdin: { resolveDir: root, loader: "jsx", contents: `
import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {TestContractDrawer} from './app/portal/PortalDashboard';
import {canManageWorkerAttendance} from './lib/worker-attendance-access';
const query = new URLSearchParams(location.search), role = query.get('role') || 'system_owner';
const actor = {role: role === 'legacy' ? 'admin' : 'employee', functionalRoles: role === 'legacy' ? [] : [role]};
const contract = {id:1,documentId:1,referenceCode:'ATT-BROWSER',clientName:'عميل الاختبار',title:'عقد العمالة',workSite:'مكة المكرمة',startDate:'2026-01-01',endDate:'2026-12-31',issueDate:'2026-01-01',status:query.get('inactive') ? 'draft' : 'active',quantityMode:'fixed',versionNumber:1,approvedBy:'qa',amountHalalas:900000,details:'بيانات اختبار'};
const professions = [{id:10,contractId:1,profession:'عامل عام',requiredCount:2,sponsorshipType:'dali',sponsorName:null,actualSalaryHalalas:300000,unitSalaryHalalas:450000}, {id:11,contractId:1,profession:'كهربائي',requiredCount:1,sponsorshipType:'dali',sponsorName:null,actualSalaryHalalas:300000,unitSalaryHalalas:450000}];
const workers = [
{id:1,fullName:'العامل الأول',status:'assigned'}, {id:2,fullName:'العامل الثاني',status:'assigned'},
{id:3,fullName:'البديل المطابق',status:'available'}, {id:4,fullName:'كفالة مختلفة',status:'available',sponsorshipType:'other',sponsorName:'جهة أخرى'},
{id:5,fullName:'عامل مؤرشف',status:'available',archivedAt:'2026-01-01'}, {id:6,fullName:'عامل سابق',status:'leave'},
{id:7,fullName:'بديل كهربائي',status:'available',profession:'كهربائي'}
].map(w => ({workerNumber:'W-'+w.id,profession:'عامل عام',nationality:'سوداني',clientSite:'مكة المكرمة',sponsorshipType:'dali',sponsorName:null,archivedAt:null, ...w}));
const assignments = [1,2,6].map(id=>({id,contractId:1,contractProfessionId:10,workerId:id,status:id===6?'released':'active',assignedBy:'qa',assignedAt:'2026-01-01T00:00:00Z',releasedAt:id===6?'2026-08-31T23:59:59Z':null}));
function App(){
 const [busy,setBusy]=useState(null);
 async function record(contractId,contractProfessionId,absenceDate,absenceEndDate,workerId,replacementWorkerId,absentCount,notes){
  setBusy('contract-absence-'+contractId);
  try { const response=await fetch('/api/portal/contracts/'+contractId+'/attendance',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({contractProfessionId,absenceDate,absenceEndDate,workerId,replacementWorkerId,absentCount,notes})});return (await response.json()).absence; }
  finally { setBusy(null); }
 }
 async function voidAbsence(contractId,absenceId){setBusy('contract-absence-void-'+absenceId);try {return (await (await fetch('/api/portal/contracts/'+contractId+'/attendance?absenceId='+absenceId,{method:'DELETE'})).json()).absence;}finally{setBusy(null)}}
 return <TestContractDrawer contract={contract} professions={professions} assignments={assignments} workers={workers} canWrite={false} canManageWorkerAssignments={false} canManageAttendance={canManageWorkerAttendance(actor)} isOwner={false} isAdmin={false} busy={busy} onClose={()=>{}} onAssign={async()=>{}} onRelease={async()=>{}} onStatus={async()=>{}} onEdit={async()=>{}} onDelete={async()=>{}} onRecordAbsence={record} onVoidAbsence={voidAbsence}/>;
}
createRoot(document.getElementById('root')).render(<App/>);
` }, bundle: true, platform: "browser", format: "iife", jsx: "automatic", outfile: join(dir, "client.js"), define: { "process.env.NODE_ENV": '"development"', "process.env": "{}" }, plugins: [{ name: "test-only-drawer-export", setup(b) {
  b.onLoad({ filter: /PortalDashboard\.tsx$/ }, async args => ({ contents: (await readFile(args.path, "utf8")) + "\nexport { ContractDrawer as TestContractDrawer };\n", loader: "tsx", resolveDir: resolve("app/portal") }));
  b.onResolve({ filter: /^@\/db$/ }, () => ({ path: "db", namespace: "fixture" }));
  b.onResolve({ filter: /^next\/image$/ }, () => ({ path: "image", namespace: "fixture" }));
  b.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ loader: "jsx", resolveDir: root, contents: args.path === "db" ? 'export function getDb(){throw new Error("Unexpected live database access")} export const getSqlClient=getDb;' : 'import React from "react"; export default function Image({src,alt}){return <img src={typeof src === "string" ? src : src.src} alt={alt}/>}' }));
} }] });
const js = await readFile(join(dir, "client.js"));
const css = (await Promise.all(["app/globals.css", "app/portal/portal.css", "app/portal/premium-glass.css", "app/portal/visual-accessibility.css"].map(path => readFile(path, "utf8")))).join("\n");
let scenario;
const reset = (options = {}) => scenario = { canRecord: true, readStatus: 200, reads: 0, writes: [], voids: [], absences: [], ...options };
reset();
const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/client.js") {res.setHeader("content-type", "text/javascript");res.end(js);return;}
  if (url.pathname === "/style.css") {res.setHeader("content-type", "text/css");res.end(css);return;}
  if (url.pathname.endsWith("/attendance")) {
    res.setHeader("content-type", "application/json");
    if (req.method === "GET") {scenario.reads++;res.statusCode=scenario.readStatus;res.end(JSON.stringify(scenario.readStatus===200?{absences:scenario.absences,canRecord:scenario.canRecord,canViewFinancialImpact:scenario.canRecord}:{error:"تعذر تحميل سجل الغياب"}));return;}
    if (req.method === "POST") {
      let raw="";for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw);scenario.writes.push(body);
      const absence={id:scenario.writes.length,contractId:1,paymentScheduleId:1,profession:"عامل عام",chargeableDays:2,absentCount:2,dailyRateHalalas:10000,deductionHalalas:20000,clientDailyRateHalalas:15000,clientDeductionHalalas:body.replacementWorkerId?0:30000,status:"active",recordedBy:"qa",...body};
      scenario.absences.unshift(absence);res.statusCode=201;res.end(JSON.stringify({absence}));return;
    }
    if(req.method === "DELETE"){const id=Number(url.searchParams.get("absenceId"));scenario.voids.push(id);const absence=scenario.absences.find(a=>a.id===id);absence.status="void";absence.voidedBy="qa";res.end(JSON.stringify({absence}));return;}
  }
  if(url.pathname!=="/"){res.statusCode=204;res.end();return;}
  res.setHeader("content-type","text/html; charset=utf-8");res.end('<!doctype html><html lang="ar" dir="rtl"><head><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/client.js"></script></body></html>');
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true});
const results=[];
let page;
async function open(role,width=1440,extra=""){
 const context=await browser.newContext({viewport:{width,height:1000}});await context.addCookies([{name:"fixture_session",value:"unchanged",url:origin}]);
 page=await context.newPage();page.setDefaultTimeout(10000);const errors=[];page.on("pageerror",error=>errors.push(error.message));
 await page.goto(`${origin}/?role=${role}${extra}`);await page.locator('.contract-workspace-tabs').getByRole('button',{name:'الغياب والاستبدال',exact:true}).click();
 return {context,errors,panel:page.locator('fieldset.contract-absence-panel')};
}
async function ready(){await page.waitForFunction(()=>{const f=document.querySelector('fieldset.contract-absence-panel');return f && !f.disabled})}
async function chooseDates(panel){await panel.locator('input[type=date]').nth(0).fill('2026-08-06');await panel.locator('input[type=date]').nth(1).fill('2026-08-08')}
try {
 for(const width of [1440,390])for(const role of ['system_owner','system_admin','legacy']){
  reset();const {context,errors,panel}=await open(role,width);await ready();await chooseDates(panel);
  const selects=panel.locator('select');await selects.nth(0).selectOption('10');
  assert.ok((await selects.nth(1).locator('option').allTextContents()).includes('عامل سابق'));
  await selects.nth(1).selectOption('1');
  const replacements=await selects.nth(2).locator('option').allTextContents();assert.ok(replacements.some(t=>t.includes('البديل المطابق')));assert.ok(!replacements.some(t=>/كفالة مختلفة|مؤرشف|بديل كهربائي/.test(t)));
  await selects.nth(2).selectOption('3');await selects.nth(1).selectOption('2');assert.equal(await selects.nth(2).inputValue(),'');
  await selects.nth(2).selectOption('3');await selects.nth(0).selectOption('11');assert.equal(await selects.nth(1).inputValue(),'');assert.equal(await selects.nth(2).inputValue(),'');
  await selects.nth(0).selectOption('10');await selects.nth(1).selectOption('1');await selects.nth(2).selectOption('3');
  await panel.getByPlaceholder('سبب الغياب أو مرجع إثبات الحضور').fill('مرجع الاختبار');
  await panel.getByRole('button',{name:'تسجيل الغياب وخصم اليومية',exact:true}).click();
  await page.locator('.contract-absence-history article').waitFor();
  assert.equal(scenario.writes.length,1);assert.deepEqual(scenario.writes[0],{contractProfessionId:10,absenceDate:'2026-08-06',absenceEndDate:'2026-08-08',workerId:1,replacementWorkerId:3,absentCount:1,notes:'مرجع الاختبار'});
  await page.getByRole('button',{name:'إلغاء القيد',exact:true}).click();assert.equal(scenario.voids.length,0);
  await page.getByRole('button',{name:'تأكيد إلغاء القيد',exact:true}).click();await page.locator('.contract-absence-history .absence-void').waitFor();assert.deepEqual(scenario.voids,[1]);
  assert.equal((await context.cookies()).find(c=>c.name==='fixture_session').value,'unchanged');assert.deepEqual(errors,[]);
  await page.screenshot({path:join(artifacts,`attendance-${role}-${width}.png`),fullPage:true});results.push({role,width,record:true,replacement:true,void:true,errors});await context.close();
 }
 reset({readStatus:503});{
  const {context,panel,errors}=await open('system_admin');await page.getByRole('button',{name:'إعادة المحاولة',exact:true}).waitFor();assert.equal(await panel.isVisible(),true);assert.equal(await panel.isDisabled(),true);
  scenario.readStatus=200;await page.getByRole('button',{name:'إعادة المحاولة',exact:true}).click();await ready();assert.equal(scenario.reads,2);assert.deepEqual(errors,[]);results.push({retryRestoresManagement:true});await context.close();
 }
 reset({canRecord:false});{
  const {context,panel}=await open('system_owner');await page.getByRole('alert').filter({hasText:'غير مصرح'}).waitFor();assert.equal(await panel.isDisabled(),true);assert.equal(scenario.writes.length,0);results.push({serverPermissionRequired:true});await context.close();
 }
 reset();{
  const {context,panel}=await open('workforce_supervisor');await page.getByText('تسجيل غياب العمالة والخصم المالي من صلاحيات المالك أو مشرف النظام فقط',{exact:true}).waitFor();assert.equal(await panel.count(),0);assert.equal(await page.getByRole('button',{name:'إلغاء القيد',exact:true}).count(),0);results.push({fieldSupervisorNoFinancialAuthority:true});await context.close();
 }
 reset();{
  const {context,panel}=await open('system_admin',1440,'&inactive=1');await page.getByText('لا يمكن تسجيل الغياب إلا على عقد نشط',{exact:true}).waitFor();assert.equal(await panel.isVisible(),true);assert.equal(await panel.isDisabled(),true);results.push({inactiveContractExplained:true});await context.close();
 }
 console.log(JSON.stringify({status:'passed',cases:results.length,results},null,2));await writeFile(join(artifacts,'results.json'),JSON.stringify({status:'passed',cases:results.length,results},null,2));
} catch(error){
 if(page&&!page.isClosed()){await page.screenshot({path:join(artifacts,'failure.png'),fullPage:true}).catch(()=>{});await writeFile(join(artifacts,'failure.html'),await page.content()).catch(()=>{});}throw error;
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true});}
