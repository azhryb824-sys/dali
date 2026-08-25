"use client";
import { useEffect, useState } from "react";
import { AppLocale, localeCookieName, localeDirection, localeNames, translateUi } from "@/lib/i18n";
import { authoredUiStrings } from "@/lib/i18n-authored-strings";

const originalText=new WeakMap<Text,string>();
const originalAttributes=new WeakMap<HTMLElement,Map<string,string>>();
type BrowserTranslator={translate:(value:string)=>Promise<string>};
type BrowserTranslatorFactory={availability:(options:{sourceLanguage:string;targetLanguage:string})=>Promise<string>;create:(options:{sourceLanguage:string;targetLanguage:string})=>Promise<BrowserTranslator>};
const browserTranslators=new Map<AppLocale,Promise<BrowserTranslator|null>>();
const browserTranslationCache=new Map<string,string>();

function getBrowserTranslator(locale:AppLocale){if(locale==="ar")return Promise.resolve(null);const existing=browserTranslators.get(locale);if(existing)return existing;const pending=(async()=>{try{const factory=(globalThis as typeof globalThis&{Translator?:BrowserTranslatorFactory}).Translator;if(!factory)return null;const state=await factory.availability({sourceLanguage:"ar",targetLanguage:locale});if(state==="unavailable")return null;return await factory.create({sourceLanguage:"ar",targetLanguage:locale})}catch{return null}})();browserTranslators.set(locale,pending);return pending}

function isAuthoredInterfaceText(node:Text,value:string){
  const parent=node.parentElement;
  if(!parent||parent.closest("[data-no-translate],tbody,.activity-list,.portal-chat-messages,[contenteditable='true']"))return false;
  return authoredUiStrings.has(value);
}

async function translateBrowserFallback(root:Node,locale:AppLocale){if(locale==="ar")return;const translator=await getBrowserTranslator(locale);if(!translator)return;const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);const nodes:Text[]=[];while(walker.nextNode())nodes.push(walker.currentNode as Text);for(const node of nodes){const raw=originalText.get(node)??node.nodeValue??"",value=raw.trim();if(!/[\u0600-\u06ff]/.test(value)||translateUi(value,locale)!==value||!isAuthoredInterfaceText(node,value))continue;const key=`${locale}:${value}`;let translated=browserTranslationCache.get(key);if(!translated){try{translated=await translator.translate(value);browserTranslationCache.set(key,translated)}catch{continue}}if(document.contains(node))node.nodeValue=raw.replace(value,translated)}}

function translateTree(root:unknown,locale:AppLocale,websiteTranslations:Record<string,string>){
  document.documentElement.lang=locale;document.documentElement.dir=localeDirection(locale);document.body.dir=localeDirection(locale);
  const walker=document.createTreeWalker(root as Node,NodeFilter.SHOW_TEXT);const nodes:Text[]=[];while(walker.nextNode())nodes.push(walker.currentNode as Text);
  for(const node of nodes){if(!originalText.has(node))originalText.set(node,node.nodeValue||"");const raw=originalText.get(node)||"",trimmed=raw.trim();if(!trimmed)continue;const translated=websiteTranslations[trimmed]||translateUi(trimmed,locale);node.nodeValue=translated===trimmed?raw:raw.replace(trimmed,translated)}
  (root as Document).querySelectorAll?.<HTMLElement>("[placeholder],[aria-label],[title]").forEach(element=>{let originals=originalAttributes.get(element);if(!originals){originals=new Map;originalAttributes.set(element,originals)}for(const attr of ["placeholder","aria-label","title"]){if(!originals.has(attr)){const value=element.getAttribute(attr);if(value)originals.set(attr,value)}const value=originals.get(attr);if(value)element.setAttribute(attr,websiteTranslations[value]||translateUi(value,locale))}});
  void translateBrowserFallback(root as Node,locale);
}
export default function LocaleRuntime({initialLocale,portal=false,showSwitcher=true,websiteTranslations={}}:{initialLocale:AppLocale;portal?:boolean;showSwitcher?:boolean;websiteTranslations?:Record<string,string>}){const[locale,setLocale]=useState(initialLocale);useEffect(()=>{translateTree(document,locale,websiteTranslations);const observer=new MutationObserver(records=>records.forEach(record=>record.addedNodes.forEach(node=>{if(node.nodeType===Node.ELEMENT_NODE)translateTree(node as Element,locale,websiteTranslations);else if(node.nodeType===Node.TEXT_NODE&&node.parentElement)translateTree(node.parentElement,locale,websiteTranslations)})));observer.observe(document.body,{subtree:true,childList:true});return()=>observer.disconnect()},[locale,websiteTranslations]);async function change(next:AppLocale){setLocale(next);document.cookie=`${localeCookieName}=${next}; Path=/; Max-Age=31536000; SameSite=Lax`;await fetch(portal?"/api/portal/language":"/api/locale",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({locale:next})}).catch(()=>undefined);window.location.reload()}return showSwitcher?<label className={`language-switcher ${portal?"portal-language-switcher":""}`}><span>{translateUi("اللغة",locale)}</span><select value={locale} onChange={event=>void change(event.target.value as AppLocale)} aria-label={translateUi("اختيار اللغة",locale)}>{(["ar","en","bn"]as AppLocale[]).map(item=><option key={item} value={item}>{localeNames[item]}</option>)}</select></label>:null}
