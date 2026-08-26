import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { companyDocuments, portalActivity, workforceContracts } from "@/db/schema";
import { objectKey, safeFileName } from "@/lib/company-documents";
import { emitPortalNotification } from "@/lib/portal-notifications";
import { hasPortalPermission, requirePortalApiRole } from "@/lib/portal-access";
import { getRuntimeEnv } from "@/lib/runtime-env";
import { jsonNoStore, rejectCrossSiteRequest, validateUploadedFile } from "@/lib/security";

const PDF_TYPES=new Set(["application/pdf"]);
const MAX_PDF_BYTES=25*1024*1024;

export async function POST(request:Request,context:{params:Promise<{id:string}>}){
  if(rejectCrossSiteRequest(request))return jsonNoStore({error:"مصدر الطلب غير مسموح"},{status:403});
  const access=await requirePortalApiRole(["admin","manager","employee"]);
  const elevated=access&&(access.role==="admin"||access.functionalRoles.some(role=>role==="system_owner"||role==="system_admin"));
  if(!access||(!elevated&&!(await hasPortalPermission(access,"contracts","write"))))return jsonNoStore({error:"غير مصرح برفع العقد الموقع"},{status:403});
  let storageKey="";
  try{
    const id=Number((await context.params).id);
    if(!Number.isSafeInteger(id)||id<1)return jsonNoStore({error:"رقم العقد غير صحيح"},{status:400});
    const db=getDb();
    const contract=await db.query.workforceContracts.findFirst({where:eq(workforceContracts.id,id)});
    if(!contract)return jsonNoStore({error:"العقد غير موجود"},{status:404});
    if(!["approved","sent","signed"].includes(contract.status))return jsonNoStore({error:"يجب اعتماد العقد قبل رفع النسخة الموقعة"},{status:409});
    const document=await db.query.companyDocuments.findFirst({where:eq(companyDocuments.id,contract.documentId)});
    if(!document||document.status!=="active")return jsonNoStore({error:"مستند العقد غير متاح"},{status:404});
    let form:FormData;try{form=await request.formData()}catch{return jsonNoStore({error:"تعذّر قراءة الملف المرفوع"},{status:400})}
    const file=form.get("file");
    if(!(file instanceof File))return jsonNoStore({error:"اختر ملف PDF للعقد الموقع"},{status:400});
    const validation=await validateUploadedFile(file,{contentTypes:PDF_TYPES,maxBytes:MAX_PDF_BYTES});
    if(!validation.valid)return jsonNoStore({error:validation.error},{status:400});
    if(validation.bytes.byteLength<5||new TextDecoder().decode(validation.bytes.slice(0,5))!=="%PDF-")return jsonNoStore({error:"الملف ليس PDF صالحًا"},{status:400});
    const fileName=safeFileName(file.name.toLowerCase().endsWith(".pdf")?file.name:`${file.name}.pdf`);
    storageKey=objectKey("signed-contracts",fileName);
    await getRuntimeEnv().BUCKET.put(storageKey,validation.bytes,{httpMetadata:{contentType:"application/pdf"},customMetadata:{contractId:String(id),uploadedBy:access.user.email,validation:validation.validationDetails}});
    const stored=await getRuntimeEnv().BUCKET.get(storageKey);
    if(!stored||(await stored.arrayBuffer()).byteLength!==validation.bytes.byteLength)throw new Error("SIGNED_CONTRACT_STORAGE_VERIFICATION_FAILED");
    const now=new Date().toISOString();
    const metadata=(()=>{try{return document.metadataJson?JSON.parse(document.metadataJson):{}}catch{return {}}})();
    const saved=await db.transaction(async tx=>{
      const [savedDocument]=await tx.update(companyDocuments).set({
        storageKey,fileName,contentType:"application/pdf",sizeBytes:validation.bytes.byteLength,
        source:"signed-upload",validationStatus:"pdf-signature-validated",validationDetails:validation.validationDetails,
        metadataJson:JSON.stringify({...metadata,previousContractStorageKey:document.storageKey,signedUploadedAt:now,signedUploadedBy:access.user.email}),
        updatedAt:now,
      }).where(and(eq(companyDocuments.id,document.id),eq(companyDocuments.storageKey,document.storageKey))).returning();
      if(!savedDocument)return null;
      const [savedContract]=await tx.update(workforceContracts).set({status:"signed",signedAt:now,updatedAt:now})
        .where(and(eq(workforceContracts.id,id),inArray(workforceContracts.status,[contract.status]))).returning();
      if(!savedContract)throw new Error("CONTRACT_STATUS_CHANGED");
      await tx.insert(portalActivity).values({actorEmail:access.user.email,action:"signed-contract-uploaded-internally",entityType:"workforce-contract",entityId:String(id),afterJson:JSON.stringify({documentId:document.id,fileName,sizeBytes:validation.bytes.byteLength,previousStorageKey:document.storageKey}),correlationId:crypto.randomUUID(),source:"portal"});
      return savedContract;
    });
    if(!saved)throw new Error("CONTRACT_DOCUMENT_CHANGED");
    await emitPortalNotification({eventType:"signed-contract-uploaded",title:"تم رفع العقد الموقع",message:`${contract.referenceCode} — أصبحت النسخة الموقعة هي النسخة الحالية مع حفظ مرجع السابقة.`,severity:"info",module:"documents",entityType:"workforce-contract",entityId:id,actionView:"contractual-documents",targetDepartment: "workforce"}).catch(()=>undefined);
    return jsonNoStore({status:"ok",contract:saved});
  }catch(error){
    if(storageKey)await getRuntimeEnv().BUCKET.delete(storageKey).catch(()=>undefined);
    console.error("portal-signed-contract-upload-failed",error);
    return jsonNoStore({error:"تعذّر حفظ العقد الموقع. لم يتم استبدال النسخة الحالية."},{status:500});
  }
}
