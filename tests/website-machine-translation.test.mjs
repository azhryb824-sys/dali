import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
const bundle=await build({entryPoints:['lib/website-machine-translation.ts'],bundle:true,platform:'node',format:'esm',write:false});
const {translationSegments,translateWebsiteText}=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
test('translation segments preserve UTF-8 content without exceeding provider limits',()=>{
 for(const text of ['نص طويل '.repeat(500),'ع'.repeat(4000),'عنوان\nنص آخر','🌍'.repeat(1000)]){const parts=translationSegments(text);assert.equal(parts.join(''),text);assert.ok(parts.every(part=>Buffer.byteLength(part)<=480));}
});
test('free translator preserves order, languages, and caches successful requests',async()=>{
 let calls=0;const fetcher=async url=>{calls++;assert.equal(url.hostname,'api.mymemory.translated.net');assert.equal(url.searchParams.get('langpair'),'ar|bn');return new Response(JSON.stringify({responseStatus:200,responseData:{translatedText:'অনুবাদ'}}));};
 const signal=new AbortController().signal;
 assert.deepEqual(await translateWebsiteText(['اختبار مستقل','ترجمة ثانية'],'bn',signal,fetcher),['অনুবাদ','অনুবাদ']);
 await translateWebsiteText(['اختبار مستقل'],'bn',signal,fetcher);assert.equal(calls,2);
});
test('quota messages and untranslated provider responses never become content',async()=>{
 const signal=new AbortController().signal;
 await assert.rejects(translateWebsiteText(['اختبار حد الخدمة'],'en',signal,async()=>new Response(JSON.stringify({quotaFinished:true,responseStatus:403,responseData:{translatedText:'quota'}}))),/TRANSLATION_QUOTA/);
 await assert.rejects(translateWebsiteText(['اختبار فشل مستقل'],'en',signal,async()=>new Response(JSON.stringify({responseStatus:200,responseData:{translatedText:'النص العربي'}}))),/TRANSLATION_UNAVAILABLE/);
});
