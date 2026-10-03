import assert from "node:assert/strict";
import test from "node:test";
import {build} from "esbuild";
import {createRequire} from "node:module";
async function bundled(path){const result=await build({entryPoints:[path],bundle:true,platform:"node",format:"esm",write:false});return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);}
const {safeWebsiteButtonHref,safeWebsiteSectionImage,sanitizeSectionDesign,newWebsiteSection,sectionLayouts}=await bundled("lib/website-section-design.ts");
const {invalidWebsiteBlock}=await bundled("lib/website-page-management.ts");
test("section button URLs reject scripts, private routes and normalized private routes",()=>{
 for(const href of ["/contact","/en/pages/workforce","#section-id","https://example.com/details","mailto:office@example.com","tel:+966501234567"])assert.equal(safeWebsiteButtonHref(href),true,href);
 for(const href of ["javascript:alert(1)","data:text/html,test","//evil.test","/portal","/en/portal","/a/../portal","https://dally.info/a/../portal","/api/website","https://dally.info/login","https://user:password@example.com/","/contact%0aheader"])assert.equal(safeWebsiteButtonHref(href),false,href);
});
test("section designs restrict appearance tokens and retain safe named buttons",()=>{
 const design=sanitizeSectionDesign({layout:"<script>",tone:"red;expression()",align:"center",spacing:"spacious",hidden:true,buttons:[{label:"Contact",href:"/contact",style:"outline",newTab:true},{label:"Unsafe",href:"javascript:alert(1)"}],unknown:"ignored"});
 assert.equal(design.layout,"text");assert.equal(design.tone,"light");assert.equal(design.align,"center");assert.equal(design.hidden,true);assert.equal(design.buttons.length,1);assert.equal(design.buttons[0].newTab,true);assert.equal(design.unknown,undefined);
 for(const layout of sectionLayouts){const section=newWebsiteSection(layout);assert.equal(section.layout,layout);assert.equal(invalidWebsiteBlock({home:{blocks:[section]},collections:{}}),null);}
 assert.equal(safeWebsiteSectionImage("https://example.com/picture.png"),false);
 assert.equal(safeWebsiteSectionImage("/images/dali-hero.webp"),true);
 assert.equal(invalidWebsiteBlock({home:{blocks:[{title:"Title",text:"Full text",buttons:[{label:"Contact",href:"/portal"}]}]}}),"home");
});
const rendered=await build({stdin:{contents:'import React from "react"; import {renderToStaticMarkup} from "react-dom/server"; import Sections from "./app/components/ManagedSections"; export function render(blocks){return renderToStaticMarkup(<Sections blocks={blocks}/>)}',resolveDir:process.cwd(),loader:"jsx"},bundle:true,platform:"node",format:"cjs",jsx:"automatic",write:false,plugins:[{name:"preview-components",setup(build){build.onResolve({filter:/^(next\/image|@\/app\/components\/PublicLink)$/},args=>({path:args.path,namespace:"stub"}));build.onLoad({filter:/.*/,namespace:"stub"},args=>({loader:"jsx",resolveDir:process.cwd(),contents:args.path==="next/image"?'import React from "react";export default function Image({src,alt,...props}){delete props.sizes;return <img src={src} alt={alt} {...props}/>;}':'import React from "react";export default function Link({children,...props}){return <a {...props}>{children}</a>;}'}));build.onLoad({filter:/\.css$/},()=>({contents:"",loader:"text"}));}}]});
const renderModule={exports:{}};new Function("require","module","exports",rendered.outputFiles[0].text)(createRequire(import.meta.url),renderModule,renderModule.exports);
test("published sections render formatting, images and buttons while hiding disabled sections and escaping HTML",()=>{
 const html=renderModule.exports.render([{id:"one",layout:"split",tone:"dark",align:"center",spacing:"compact",title:"Section",text:"**Bold** and *italic* <script>alert(1)</script>",checklist:["Point"],image:"/images/dali-hero.webp",imageAlt:"Image",buttons:[{label:"Contact",href:"/contact",style:"outline",newTab:true}]},{title:"Hidden section",text:"Hidden",checklist:[],hidden:true}]);
 assert.match(html,/layout-split tone-dark align-center spacing-compact/);assert.match(html,/<strong>Bold<\/strong>/);assert.match(html,/<em>italic<\/em>/);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>|Hidden section/);assert.match(html,/noopener noreferrer/);assert.match(html,/href="\/contact"/);assert.match(html,/section-one/);
});
