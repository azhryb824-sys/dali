import type { WebsiteContent, WebsiteCollectionKey } from "@/lib/website-content";
import { publicRoute } from "@/lib/public-locale";
export type PreviewDestination = { view: string; entryId: string; hash: string };
export const previewCollectionPaths: Record<WebsiteCollectionKey,string> = {services:"/services",sectors:"/sectors",locations:"/locations",projects:"/projects",credentials:"/credentials",articles:"/insights",jobs:"/careers",partners:"/partners",pages:"/pages"};
export function previewDestination(content: WebsiteContent, href: string): PreviewDestination | null {
  let url: URL;
  try {url=new URL(href,"https://dally.info");} catch {return null;}
  if(url.protocol!=="https:" || !["dally.info","www.dally.info"].includes(url.hostname) || url.port)return null;
  const path=publicRoute(url.pathname).path.replace(/\/$/,"") || "/";
  if(path==="/")return {view:"home",entryId:"",hash:url.hash};
  if(["/contact","/about","/faq"].includes(path))return {view:path.slice(1),entryId:"",hash:url.hash};
  for(const [key,base] of Object.entries(previewCollectionPaths)) {
    if(path===base)return {view:key,entryId:"",hash:url.hash};
    if(path.startsWith(`${base}/`)) {
      const slug=path.slice(base.length+1);
      const entry=content.collections[key as WebsiteCollectionKey].find(item=>item.slug===slug);
      return entry ? {view:key,entryId:entry.id,hash:url.hash} : null;
    }
  }
  return null;
}
