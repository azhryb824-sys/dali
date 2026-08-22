"use client";
import { useEffect, useState } from "react";
import { AppLocale, localeDirection, localeNames, translateUi } from "@/lib/i18n";

function translateTree(root:unknown,locale:AppLocale){
  document.documentElement.lang=locale;document.documentElement.dir=localeDirection(locale);document.body.dir=localeDirection(locale);
  if(locale==="ar")return;
  const walker=document.createTreeWalker(root as Node,NodeFilter.SHOW_TEXT);const nodes:Text[]=[];while(walker.nextNode())nodes.push(walker.currentNode as Text);
  for(const node of nodes){const raw=node.nodeValue||"",trimmed=raw.trim();if(!trimmed)continue;const translated=translateUi(trimmed,locale);if(translated!==trimmed)node.nodeValue=raw.replace(trimmed,translated)}
  (root as Document).querySelectorAll?.<HTMLElement>("[placeholder],[aria-label],[title]").forEach(element=>{for(const attr of ["placeholder","aria-label","title"]){const value=element.getAttribute(attr);if(value)element.setAttribute(attr,translateUi(value,locale))}});
}
export default function LocaleRuntime({initialLocale,portal=false,showSwitcher=true}:{initialLocale:AppLocale;portal?:boolean;showSwitcher?:boolean}){const[locale,setLocale]=useState(initialLocale);useEffect(()=>{translateTree(document,locale);const observer=new MutationObserver(records=>records.forEach(record=>record.addedNodes.forEach(node=>{if(node.nodeType===Node.ELEMENT_NODE)translateTree(node as Element,locale);else if(node.nodeType===Node.TEXT_NODE&&node.parentElement)translateTree(node.parentElement,locale)})));observer.observe(document.body,{subtree:true,childList:true});return()=>observer.disconnect()},[locale]);async function change(next:AppLocale){setLocale(next);await fetch(portal?"/api/portal/language":"/api/locale",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({locale:next})}).catch(()=>undefined);window.location.reload()}return showSwitcher?<label className={`language-switcher ${portal?"portal-language-switcher":""}`}><span>{translateUi("اللغة",locale)}</span><select value={locale} onChange={event=>void change(event.target.value as AppLocale)} aria-label={translateUi("اختيار اللغة",locale)}>{(["ar","en","ur"]as AppLocale[]).map(item=><option key={item} value={item}>{localeNames[item]}</option>)}</select></label>:null}
