import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { workforceRequestAttachments, workforceRequests } from "@/db/schema";
import { objectKey, safeFileName, uploadContentTypes } from "@/lib/company-documents";
import { getRuntimeEnv } from "@/lib/runtime-env";
import { enforcePublicRateLimit, jsonNoStore, rateLimitResponse, rejectCrossSiteRequest, validateUploadedFile } from "@/lib/security";

const emailValue = (value: unknown) => typeof value === "string" ? value.trim().toLowerCase().slice(0, 160) : "";
const trackingValue = (value: unknown) => typeof value === "string" ? value.trim().toUpperCase().slice(0, 40) : "";
const statusLabels: Record<string,string> = { new:"تم الاستلام",reviewing:"قيد المراجعة",contacted:"تم التواصل",qualified:"تم تأهيل الطلب",quoted:"تم إعداد العرض",closed:"مكتمل",rejected:"معتذر عنه" };

async function findRequest(trackingCode:string,email:string){
  if(!/^DAL-[A-Z0-9-]{8,35}$/.test(trackingCode)||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return null;
  return getDb().query.workforceRequests.findFirst({where:and(eq(workforceRequests.trackingCode,trackingCode),eq(workforceRequests.email,email),eq(workforceRequests.requestType,"quotation"))});
}

export async function GET(request:Request){
  const limit=await enforcePublicRateLimit(request,{scope:"quote-status",limit:20,windowSeconds:900,blockSeconds:900});if(!limit.allowed)return rateLimitResponse(limit.retryAfterSeconds);
  const url=new URL(request.url);const quote=await findRequest(trackingValue(url.searchParams.get("trackingCode")),emailValue(url.searchParams.get("email")));
  if(!quote)return jsonNoStore({error:"تعذّر مطابقة رقم المتابعة والبريد."},{status:404});
  const attachments=await getDb().select({id:workforceRequestAttachments.id,fileName:workforceRequestAttachments.fileName,sizeBytes:workforceRequestAttachments.sizeBytes,createdAt:workforceRequestAttachments.createdAt}).from(workforceRequestAttachments).where(eq(workforceRequestAttachments.requestId,quote.id));
  return jsonNoStore({trackingCode:quote.trackingCode,status:quote.status,statusLabel:statusLabels[quote.status]||"قيد المعالجة",updatedAt:quote.updatedAt,attachments});
}

export async function POST(request:Request){
  if(rejectCrossSiteRequest(request))return jsonNoStore({error:"مصدر الطلب غير مسموح."},{status:403});
  const limit=await enforcePublicRateLimit(request,{scope:"quote-attachment",limit:12,windowSeconds:1800,blockSeconds:1800});if(!limit.allowed)return rateLimitResponse(limit.retryAfterSeconds);
  let storageKey="";try{const form=await request.formData();const quote=await findRequest(trackingValue(form.get("trackingCode")),emailValue(form.get("email")));if(!quote)return jsonNoStore({error:"تعذّر مطابقة الطلب."},{status:404});
    const file=form.get("file");if(!(file instanceof File))return jsonNoStore({error:"اختر ملفًا صالحًا."},{status:400});
    const validation=await validateUploadedFile(file,{contentTypes:uploadContentTypes,maxBytes:10*1024*1024});if(!validation.valid)return jsonNoStore({error:validation.error},{status:400});
    const existing=await getDb().select().from(workforceRequestAttachments).where(eq(workforceRequestAttachments.requestId,quote.id));if(existing.length>=8)return jsonNoStore({error:"وصل الطلب إلى الحد الأقصى وهو 8 مرفقات."},{status:409});
    const fileName=safeFileName(file.name);storageKey=objectKey(`public-quotes/${quote.id}`,fileName);await getRuntimeEnv().BUCKET.put(storageKey,validation.bytes,{httpMetadata:{contentType:file.type},customMetadata:{requestId:String(quote.id),validation:validation.validationDetails}});
    const [saved]=await getDb().insert(workforceRequestAttachments).values({requestId:quote.id,fileName,storageKey,contentType:file.type,sizeBytes:file.size}).returning({id:workforceRequestAttachments.id,fileName:workforceRequestAttachments.fileName,sizeBytes:workforceRequestAttachments.sizeBytes,createdAt:workforceRequestAttachments.createdAt});
    return jsonNoStore({attachment:saved},{status:201});
  }catch(error){if(storageKey)await getRuntimeEnv().BUCKET.delete(storageKey).catch(()=>undefined);console.error("public-quote-attachment-failed",error);return jsonNoStore({error:"تعذّر حفظ المرفق حاليًا."},{status:500})}
}
