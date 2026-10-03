import {safeWebsiteButtonHref,safeWebsiteSectionImage} from "@/lib/website-section-design";
import type { ManagedEntry } from "@/lib/website-content";
export function moveWebsiteEntry(entries: ManagedEntry[], id: string, direction: -1 | 1) {
  const next = structuredClone(entries).sort((a,b) => a.sortOrder - b.sortOrder);
  const index = next.findIndex(entry => entry.id === id);
  const destination = index + direction;
  if (index < 0 || destination < 0 || destination >= next.length) return entries;
  [next[index],next[destination]] = [next[destination],next[index]];
  return next.map((entry,index) => ({...entry,sortOrder:index+1}));
}
export function duplicateWebsiteEntry(entries: ManagedEntry[], id: string, newId: string): ManagedEntry[] {
  const source=entries.find(entry=>entry.id===id);
  if(!source || !/^[a-z0-9-]+$/i.test(newId) || entries.some(entry=>entry.id===newId))return entries;
  const copy=structuredClone(source);
  copy.id=newId; copy.slug=`${source.slug.slice(0,60)}-${newId.slice(-12)}`;
  if(entries.some(entry=>entry.slug===copy.slug))return entries;
  copy.status="draft";copy.featured=false;copy.sortOrder=Math.max(0,...entries.map(entry=>entry.sortOrder))+1;copy.updatedAt=new Date().toISOString().slice(0,10);
  return [...entries,copy];
}

export function invalidWebsiteBlock(content: unknown): string | null {
  if(!content || typeof content!=="object")return null;
  const root=content as {home?:{blocks?:unknown};collections?:unknown};
  const groups: [string,unknown][] = [["home",[{blocks:root.home?.blocks}]],...Object.entries(root.collections || {})];
  for(const [key,entries] of groups) {
    if(!Array.isArray(entries))continue;
    for(const entry of entries) {
      if(!entry || !Array.isArray(entry.blocks))continue;
      for(const block of entry.blocks) {
        if(!block || typeof block.title!=="string" || block.title.trim().length<2 || typeof block.text!=="string" || block.text.trim().length<5)return key;
        if(block.image !== undefined && (typeof block.image !== "string" || !safeWebsiteSectionImage(block.image)))return key;
        if(Array.isArray(block.buttons) && block.buttons.some((button:{label?:unknown;href?:unknown})=>!button || typeof button.label!=="string" || !button.label.trim() || typeof button.href!=="string" || !safeWebsiteButtonHref(button.href)))return key;
      }
    }
  }
  return null;
}

export function newWebsitePage(): ManagedEntry {
 const id=crypto.randomUUID(),date=new Date().toISOString().slice(0,10);
 return {id:`pages-${id}`,slug:`page-${id.slice(0,12)}`,title:"عنصر جديد",shortTitle:"عنصر جديد",summary:"أضف وصفًا موجزًا ومفيدًا للزائر.",body:"اكتب مقدمة واضحة تشرح النطاق والفائدة دون ادعاءات غير موثقة.",image:"/images/dali-capabilities.webp",imageAlt:"صورة توضيحية خالية من الكائنات الحية",status:"draft",featured:false,sortOrder:1,seoTitle:"عنوان صفحة واضح",seoDescription:"وصف دقيق للصفحة وسبب فائدتها للباحث.",focusKeywords:"",tags:[],checklist:[],blocks:[],faqs:[],publishedAt:date,updatedAt:date};
}
