import assert from "node:assert/strict";

const origin=(process.env.DALI_PRODUCTION_ORIGIN||"https://dali-ql1q.onrender.com").replace(/\/$/,"");
const pages=["/","/services","/construction","/construction/services","/locations","/contact","/privacy"];
const results=[];
for(const path of pages){const started=performance.now();const response=await fetch(`${origin}${path}`,{redirect:"follow",headers:{"user-agent":"DaliProductionAcceptance/1.0"}});const body=await response.text();const elapsed=Math.round(performance.now()-started);assert.equal(response.status,200,`${path} returned ${response.status}`);assert.match(response.headers.get("content-type")||"",/text\/html/);assert.match(body,/<html[^>]*lang="ar"/);assert.match(body,/<link[^>]+rel="canonical"/);assert.doesNotMatch(body,/وصف برمجي|تعليمات استخدام|placeholder text/i);results.push({path,status:response.status,elapsedMs:elapsed,bytes:Buffer.byteLength(body)})}
const health=await fetch(`${origin}/api/health/ready`);assert.equal(health.status,200);const healthBody=await health.json();assert.equal(healthBody.status,"ok");
for(const path of ["/api/portal/construction/attachments?recordId=1","/api/portal/construction/cost-control?projectId=1"]){const response=await fetch(`${origin}${path}`);assert.equal(response.status,403,`${path} must exist and reject anonymous access`)}
console.table(results);console.log(JSON.stringify({origin,health:healthBody.status,maxPageMs:Math.max(...results.map(item=>item.elapsedMs)),checkedAt:new Date().toISOString()}));
