import assert from "node:assert/strict";
import test from "node:test";
import {build} from "esbuild";
const result=await build({entryPoints:["lib/website-preview-navigation.ts"],bundle:true,platform:"node",format:"esm",write:false});
const {previewDestination,previewCollectionPaths}=await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
const content={collections:Object.fromEntries(Object.keys(previewCollectionPaths).map(key=>[key,[{id:`${key}-id`,slug:"draft-page",status:"draft"}]]))};
test("preview links resolve language routes and draft IDs without changing the draft",()=>{
 const before=JSON.stringify(content);
 for(const [key,path] of Object.entries(previewCollectionPaths)) {
  assert.deepEqual(previewDestination(content,`/bn${path}`),{view:key,entryId:"",hash:""});
  assert.deepEqual(previewDestination(content,`/en${path}/draft-page`),{view:key,entryId:`${key}-id`,hash:""});
 }
 assert.deepEqual(previewDestination(content,"/contact#quote"),{view:"contact",entryId:"",hash:"#quote"});
 assert.equal(JSON.stringify(content),before);
});
test("preview routing cannot leave the canvas or navigate into private routes",()=>{
 for(const href of ["javascript:alert(1)","//evil.test/services","https://evil.test/contact","/portal","/api/health/ready","/en/portal","/services/missing","https://dally.info:4000/contact"])assert.equal(previewDestination(content,href),null);
 assert.deepEqual(previewDestination(content,"https://www.dally.info/en/about"),{view:"about",entryId:"",hash:""});
});
