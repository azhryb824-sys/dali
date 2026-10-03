import {isPublicPath,publicRoute} from "@/lib/public-locale";
import type {ManagedBlock} from "@/lib/website-content";
export const sectionLayouts = ["text","split","features","steps","callout","image"] as const;
export function safeWebsiteButtonHref(value: string) {
  if(!value || value.length>1200 || /[\u0000-\u001f\u007f]/.test(value) || /[\s\\<>"'`]/.test(value) || /%0[ad]/i.test(value))return false;
  if(value.startsWith("#"))return /^#[\w-]+$/.test(value);
  if(value.startsWith("/") && !value.startsWith("//")) {
    const path=new URL(value,"https://dally.info").pathname;return isPublicPath(publicRoute(path).path) && !/\/(?:en|ar|bn)(?:\/|$)/.test(publicRoute(path).path);
  }
  if(/^tel:\+?[0-9()-]{7,20}$/.test(value) || /^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))return true;
  try {const url=new URL(value);return url.protocol==="https:" && !!url.hostname && !url.username && !url.password && (!["dally.info","www.dally.info"].includes(url.hostname) || isPublicPath(publicRoute(url.pathname).path));}catch{return false;}
}
export function sanitizeSectionDesign(value: Record<string,unknown>): Partial<ManagedBlock> {
  const design: Partial<ManagedBlock>={};
  if(typeof value.id==="string" && /^[a-zA-Z0-9-]{1,100}$/.test(value.id))design.id=value.id;
  if(value.layout!==undefined)design.layout=sectionLayouts.includes(value.layout as typeof sectionLayouts[number]) ? value.layout as typeof sectionLayouts[number] : "text";
  if(value.tone!==undefined)design.tone=["light","dark","gold"].includes(String(value.tone)) ? value.tone as ManagedBlock["tone"] : "light";
  if(value.align!==undefined)design.align=["start","center","end"].includes(String(value.align)) ? value.align as ManagedBlock["align"] : "start";
  if(value.spacing!==undefined)design.spacing=["compact","normal","spacious"].includes(String(value.spacing)) ? value.spacing as ManagedBlock["spacing"] : "normal";
  if(typeof value.hidden==="boolean")design.hidden=value.hidden;
  if(Array.isArray(value.buttons))design.buttons=value.buttons.slice(0,4).flatMap(button=>{
    if(!button || typeof button!=="object")return [];
    const label=typeof button.label==="string"?button.label.replace(/<[^>]*>/g,"").trim().slice(0,100):"";
    const href=typeof button.href==="string"?button.href.trim():"";
    return label && safeWebsiteButtonHref(href) ? [{label,href,style:button.style==="outline"?"outline" as const:"solid" as const,newTab:button.newTab===true}] : [];
  });
  return design;
}
export function newWebsiteSection(layout: ManagedBlock["layout"]): ManagedBlock {
  return {id:crypto.randomUUID(),layout,tone:layout==="callout"?"dark":"light",align:layout==="callout"?"center":"start",spacing:"normal",hidden:false,title:"عنوان القسم",text:"أضف وصفًا موجزًا ومفيدًا للزائر.",checklist:[],image:layout==="split"||layout==="image"?"/images/dali-capabilities.webp":"",imageAlt:"صورة توضيحية خالية من الكائنات الحية",buttons:layout==="callout"?[{label:"تواصل معنا",href:"/contact",style:"solid",newTab:false}]:[]};
}

export function safeWebsiteSectionImage(value:string) {
  return value === "" || value === "/dally-logo.jpg" || /^\/images\/[a-zA-Z0-9][a-zA-Z0-9/_-]*\.(?:avif|gif|jpe?g|png|webp)$/.test(value) || /^\/api\/website-assets\/[a-f0-9-]{36}\.(?:jpg|png)$/.test(value);
}
