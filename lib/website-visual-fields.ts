import { safeWebsiteButtonHref } from "@/lib/website-section-design";
import { translatePublicValue } from "@/lib/public-translation";
import type { AppLocale } from "@/lib/i18n";
import type { WebsiteContent } from "@/lib/website-content";
export type VisualField = { path: string; label: string; value: string; kind: "text" | "image" | "link" };
const labels: Record<string,string> = { buttons:"الأزرار",label:"نص الزر",href:"رابط الزر",heroImage:"صورة الواجهة",aboutImage:"صورة التعريف",hajjImage:"صورة الموسم",localImage:"صورة الموقع",capabilitiesImage:"صورة الإمكانات",aboutTitle:"عنوان من نحن",aboutDescription:"وصف من نحن",servicesTitle:"عنوان الخدمات",servicesDescription:"وصف الخدمات",sectorsTitle:"عنوان القطاعات",sectorsDescription:"وصف القطاعات",localTitle:"عنوان الحضور المحلي",localDescription:"وصف الحضور المحلي",quoteTitle:"عنوان طلب العرض",quoteDescription:"وصف طلب العرض",professions:"التخصصات",process:"خطوات العمل",blocks:"الأقسام",tags:"التصنيفات",checklist:"قائمة التحقق",faqs:"الأسئلة الشائعة",city:"المدينة",district:"الحي",commercialRegistration:"رقم السجل التجاري",vatNumber:"الرقم الضريبي",googleBusinessUrl:"رابط ملف Google Business Profile",mapUrl:"رابط الموقع على الخريطة",site:"بيانات الشركة",home:"الصفحة الرئيسية",faq:"الأسئلة الشائعة",collections:"المحتوى",title:"العنوان",shortTitle:"العنوان المختصر",summary:"الوصف المختصر",body:"المحتوى",image:"الصورة",imageAlt:"وصف الصورة",question:"السؤال",answer:"الإجابة",heroTitle:"العنوان الرئيسي",heroAccent:"الجزء المميز",heroKicker:"السطر التمهيدي",heroDescription:"وصف الواجهة",companyName:"اسم الشركة",shortName:"الاسم المختصر",address:"العنوان",phone:"الهاتف",email:"البريد",tagline:"العبارة التعريفية",description:"الوصف",text:"النص",services:"الخدمات",sectors:"القطاعات",locations:"مناطق الخدمة",projects:"المشروعات",articles:"المعرفة",pages:"الصفحات",partners:"الشركاء",credentials:"التراخيص",jobs:"الوظائف" };
const excluded = new Set(["layout","tone","align","spacing","style","id","slug","status","publishedAt","updatedAt","updatedBy","sortOrder","featured","translations","seoTitle","seoDescription","focusKeywords"]);
export function visualFields(content: WebsiteContent): VisualField[] {
  const fields: VisualField[]=[];
  function visit(value: unknown, parts: string[]) {
    const key=parts.at(-1)!; if(excluded.has(key)) return;
    if(typeof value === "string") { fields.push({path:parts.join("."),label:parts.map(p=>/^\d+$/.test(p)?String(Number(p)+1):labels[p]||"المحتوى").join(" / "),value,kind:key === "href" ? "link" : /image$/i.test(key)?"image":"text"});return; }
    if(Array.isArray(value))value.forEach((item,index)=>visit(item,[...parts,String(index)]));
    else if(value && typeof value==="object")Object.entries(value).forEach(([k,v])=>visit(v,[...parts,k]));
  }
  for(const key of ["site","home","faq","collections"] as const)visit(content[key],[key]);
  return fields;
}
export function updateVisualField(content: WebsiteContent, path: string, value: string): WebsiteContent | null {
  const field=visualFields(content).find(item=>item.path===path); if(!field || typeof value!=="string" || value.length>8000)return null;
  if(field.kind==="link" && !safeWebsiteButtonHref(value))return null;
  if(field.kind==="image" && !(value === "" && path.includes(".blocks.") ||value === "/dally-logo.jpg" || /^\/images\/[a-zA-Z0-9][a-zA-Z0-9/_-]*\.(?:avif|gif|jpe?g|png|webp)$/.test(value) || /^\/api\/website-assets\/[a-f0-9-]{36}\.(?:jpg|png)$/.test(value)))return null;
  const next=structuredClone(content);let target: unknown=next;const parts=path.split(".");
  for(const part of parts.slice(0,-1))target=(target as Record<string,unknown>)[part];
  (target as Record<string,unknown>)[parts.at(-1)!]=value;
  if(parts[0] === "collections" && parts.length > 3) {
    const entry = (next.collections as Record<string, {updatedAt: string}[]>)[parts[1]]?.[Number(parts[2])];
    if(entry)entry.updatedAt = new Date().toISOString().slice(0,10);
  }
  return next;
}

export function visualFieldValue(content: WebsiteContent, field: VisualField, locale: AppLocale): string {
  return translatePublicValue(field.value, locale, locale === "ar" ? {} : content.translations[locale], field.path.split(".").at(-1));
}
export function updateLocalizedVisualField(content: WebsiteContent, path: string, value: string, locale: AppLocale): WebsiteContent | null {
  if (locale === "ar") return updateVisualField(content, path, value);
  const field = visualFields(content).find(item => item.path === path);
  if (!field || typeof value !== "string" || value.length > 6000) return null;
  // Assets and contact/identity values are shared across languages.
  if (field.kind !== "text" || !/[\u0600-\u06ff]/.test(field.value) || /^(phone|email|mapUrl|googleBusinessUrl|commercialRegistration|vatNumber)$/.test(path.split(".").at(-1)!)) return null;
  const next = structuredClone(content);
  if (value.trim()) next.translations[locale][field.value] = value;
  else delete next.translations[locale][field.value];
  return next;
}
