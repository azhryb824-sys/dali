import assert from "node:assert/strict";
import { build } from "esbuild";
import test from "node:test";
const bundle=await build({entryPoints:["lib/website-visual-fields.ts"],bundle:true,platform:"node",format:"esm",write:false});
const {visualFields,updateVisualField,updateLocalizedVisualField,visualFieldValue}=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
function fixture(){return {site:{companyName:"Dali"},home:{heroTitle:"Title",heroImage:"/images/dali-hero.webp",process:[{title:"Step",text:"Description"}]},faq:[{question:"Question",answer:"Answer"}],collections:{services:[{id:"stable",slug:"stable",title:"Service",image:"/images/dali-capabilities.webp",blocks:[{title:"Scope",text:"Original"}]}]},version:1};}
test("visual editing updates the selected nested field without touching identifiers or the published source",()=>{
 const original=fixture();const next=updateVisualField(original,"collections.services.0.blocks.0.text","Updated");
 assert.equal(next.collections.services[0].blocks[0].text,"Updated");assert.equal(original.collections.services[0].blocks[0].text,"Original");assert.equal(next.collections.services[0].id,"stable");assert.equal(next.version,1);
 assert.equal(updateVisualField(original,"collections.services.0.id","changed"),null);assert.equal(updateVisualField(original,"__proto__.polluted","yes"),null);assert.equal(updateVisualField(original,"version","2"),null);
});
test("visual image editing accepts uploaded site assets and blocks external and script URLs",()=>{
 const content=fixture();assert.equal(visualFields(content).find(f=>f.path==="home.heroImage").kind,"image");
 assert.equal(updateVisualField(content,"home.heroImage","/api/website-assets/00000000-0000-4000-8000-000000000001.jpg").home.heroImage,"/api/website-assets/00000000-0000-4000-8000-000000000001.jpg");
 for(const value of ["javascript:alert(1)","//external.test/image.jpg","https://external.test/image.jpg",'/images/bad".jpg'])assert.equal(updateVisualField(content,"home.heroImage",value),null);
});

test("localized visual edits preserve Arabic and other languages and can clear an override",()=>{
 const original=fixture(); original.home.heroTitle="عنوان عربي"; original.translations={en:{},bn:{"عنوان عربي":"বাংলা"}};
 const next=updateLocalizedVisualField(original,"home.heroTitle","English title","en");
 assert.equal(next.home.heroTitle,"عنوان عربي"); assert.equal(next.translations.en["عنوان عربي"],"English title");
 assert.equal(next.translations.bn["عنوان عربي"],"বাংলা"); assert.deepEqual(original.translations.en,{});
 assert.equal(visualFieldValue(next,visualFields(next).find(f=>f.path==="home.heroTitle"),"en"),"English title");
 assert.equal(updateLocalizedVisualField(next,"home.heroTitle","","en").translations.en["عنوان عربي"],undefined);
 assert.equal(updateLocalizedVisualField(next,"home.heroImage","/images/other.webp","en"),null);
 assert.equal(updateLocalizedVisualField(next,"__proto__.bad","x","en"),null);
 const arabic=updateLocalizedVisualField(next,"home.heroTitle","عنوان جديد","ar");
 assert.equal(arabic.home.heroTitle,"عنوان جديد"); assert.equal(arabic.translations.en["عنوان جديد"],undefined);
});
