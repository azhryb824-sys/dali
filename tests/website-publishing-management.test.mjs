import assert from "node:assert/strict";
import test from "node:test";
import {build} from "esbuild";
async function bundled(path){const result=await build({entryPoints:[path],bundle:true,platform:"node",format:"esm",write:false});return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);}
const {translationBatches,translationCoverage}=await bundled("lib/website-translation-audit.ts");
const {moveWebsiteEntry,duplicateWebsiteEntry,invalidWebsiteBlock}=await bundled("lib/website-page-management.ts");
test("translation requests fit UTF-8 body limits and preserve every long Arabic source",()=>{
 const values=Array.from({length:120},(_,index)=>`${index} ${"ع".repeat(5990)}`);
 const batches=translationBatches(values,"bn");assert.deepEqual(batches.flat(),values);
 for(const batch of batches){assert.ok(batch.length<=100);assert.ok(new TextEncoder().encode(JSON.stringify({values:batch,target:"bn"})).byteLength<=50000);}
 assert.deepEqual(translationBatches([],"en"),[]);
});
test("invalid explicit translation cannot hide behind a valid built-in fallback",()=>{
 const source="الصفحة الرئيسية";
 const original={home:{heroTitle:source},translations:{en:{},bn:{}}};
 assert.equal(translationCoverage(original,"en").missing.includes(source),false);
 original.translations.en[source]=source;
 assert.equal(translationCoverage(original,"en").missing.includes(source),true);
 original.translations.en[source]="Reviewed home";
 assert.equal(translationCoverage(original,"en").missing.includes(source),false);
});
test("page reordering uses stable IDs and duplicate stays an independent draft",()=>{
 const original=[{id:"a",slug:"first",sortOrder:1,status:"published",featured:true,blocks:[{title:"First",text:"Original",checklist:[]}]},{id:"b",slug:"second",sortOrder:2,status:"draft",blocks:[]}];
 const moved=moveWebsiteEntry(original,"b",-1);assert.deepEqual(moved.map(x=>x.id),["b","a"]);assert.deepEqual(moved.map(x=>x.sortOrder),[1,2]);assert.equal(original[0].id,"a");
 assert.equal(moveWebsiteEntry(original,"missing",1),original);
 const duplicated=duplicateWebsiteEntry(original,"a","pages-new-000000000001");const copy=duplicated.at(-1);assert.equal(copy.status,"draft");assert.equal(copy.featured,false);assert.notEqual(copy.slug,original[0].slug);
 copy.blocks[0].text="Changed";assert.equal(original[0].blocks[0].text,"Original");assert.equal(duplicateWebsiteEntry(original,"a","a"),original);
});

test("publishing does not silently discard incomplete page sections",()=>{
 assert.equal(invalidWebsiteBlock({collections:{pages:[{blocks:[{title:"",text:""}]}]}}),"pages");
 assert.equal(invalidWebsiteBlock({collections:{pages:[{blocks:[{title:"Title",text:"Valid text"}]}]}}),null);
 assert.equal(invalidWebsiteBlock(null),null);
});
