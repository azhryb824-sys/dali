import { requirePortalApiRole } from "@/lib/portal-access";
import { jsonNoStore, readLimitedJson, rejectCrossSiteRequest } from "@/lib/security";

export async function POST(request:Request){
  if(rejectCrossSiteRequest(request))return jsonNoStore({error:"مصدر الطلب غير مسموح"},{status:403});
  const access=await requirePortalApiRole(["admin","manager","employee"]);if(!access)return jsonNoStore({error:"غير مصرح"},{status:403});
  const parsed=await readLimitedJson(request,60000);if(!parsed.ok)return parsed.response;
  const values=Array.isArray((parsed.value as {values?:unknown}).values)?(parsed.value as {values:unknown[]}).values.map(value=>String(value||"").trim().slice(0,6000)).slice(0,120):[];
  const requestedTarget=String((parsed.value as {target?:unknown}).target||"en");
  const target=requestedTarget==="bn"?"bn":"en";
  if(!values.length||values.some(value=>!value))return jsonNoStore({error:"النصوص المطلوب ترجمتها غير مكتملة"},{status:400});
  const endpoint=process.env.LIBRETRANSLATE_URL?.trim();if(!endpoint)return jsonNoStore({error:"مساعد الترجمة المجاني غير مفعّل على الخادم؛ أدخل النص الإنجليزي يدوياً أو اضبط LIBRETRANSLATE_URL"},{status:503});
  let url:URL;try{url=new URL(endpoint)}catch{return jsonNoStore({error:"عنوان خدمة الترجمة غير صحيح"},{status:503})}if(url.protocol!=="https:")return jsonNoStore({error:"خدمة الترجمة يجب أن تستخدم HTTPS"},{status:503});
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),20000);
  try{
    const response=await fetch(url,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({q:values,source:"ar",target,format:"text",api_key:process.env.LIBRETRANSLATE_API_KEY||undefined}),signal:controller.signal,cache:"no-store"});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);const result=await response.json() as {translatedText?:string|string[]};const translated=Array.isArray(result.translatedText)?result.translatedText:[result.translatedText];if(translated.length!==values.length||translated.some(value=>typeof value!=="string"||!value.trim()))throw new Error("INVALID_TRANSLATION");return jsonNoStore({translated});
  }catch{return jsonNoStore({error:"تعذر الاتصال بمساعد الترجمة؛ لم تُرسل أو تُحفظ أي تعديلات"},{status:502})}finally{clearTimeout(timeout)}
}
