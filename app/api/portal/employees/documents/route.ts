import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { employeeDocuments, employees } from "@/db/schema";
import { auditPortalAction } from "@/lib/audit";
import { objectKey, safeFileName } from "@/lib/company-documents";
import { canAccessPortalDepartment, requirePortalApiRole } from "@/lib/portal-access";
import { getRuntimeEnv } from "@/lib/runtime-env";
import { rejectCrossSiteRequest, validateUploadedFile } from "@/lib/security";

const TYPES=new Set(["application/pdf","image/png","image/jpeg"]);
const clean=(value:FormDataEntryValue|null,max:number)=>typeof value==="string"?value.trim().slice(0,max):"";

export async function POST(request:Request){
  if(rejectCrossSiteRequest(request))return Response.json({error:"مصدر الطلب غير مسموح"},{status:403});
  const access=await requirePortalApiRole(["admin","manager","employee"]);if(!access||!canAccessPortalDepartment(access,"employees",true))return Response.json({error:"غير مصرح"},{status:403});
  let storageKey="";
  try{const form=await request.formData();const employeeId=Number(form.get("employeeId")),documentType=clean(form.get("documentType"),60),file=form.get("file");if(!Number.isInteger(employeeId)||employeeId<1||!documentType||!(file instanceof File)||file.size<1)return Response.json({error:"اختر ملف الوثيقة الفعلي"},{status:400});const employee=await getDb().query.employees.findFirst({where:eq(employees.id,employeeId)});if(!employee)return Response.json({error:"الموظف غير موجود"},{status:404});const validation=await validateUploadedFile(file,{contentTypes:TYPES,maxBytes:12*1024*1024});if(!validation.valid)return Response.json({error:validation.error},{status:400});const fileName=safeFileName(file.name);storageKey=objectKey("employee-files",fileName);await getRuntimeEnv().BUCKET.put(storageKey,validation.bytes,{httpMetadata:{contentType:file.type},customMetadata:{uploadedBy:access.user.email,employeeId:String(employeeId),documentType}});const[document]=await getDb().insert(employeeDocuments).values({employeeId,documentType,documentNumber:clean(form.get("documentNumber"),80)||null,expiryDate:clean(form.get("expiryDate"),10)||null,fileName,storageKey,status:"valid",notes:clean(form.get("notes"),500)||fileName,createdBy:access.user.email,updatedAt:new Date().toISOString()}).returning();await auditPortalAction({actorEmail:access.user.email,action:"employee-document-uploaded",entityType:"employee-document",entityId:document.id,after:{...document,storageKey:"[stored]"}});return Response.json({document},{status:201});}catch(error){if(storageKey)await getRuntimeEnv().BUCKET.delete(storageKey).catch(()=>undefined);return Response.json({error:error instanceof Error?error.message:"تعذر رفع الوثيقة"},{status:500})}
}
