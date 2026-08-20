import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { companyAssets, constructionOpportunities, constructionProjects, constructionRecordLines, constructionRecords } from "@/db/schema";
import { canReadConstruction, getActivePortalScopes, scopeAllowsProject } from "@/lib/access-policy";
import { auditPortalAction } from "@/lib/audit";
import { generateIssuedPdf } from "@/lib/pdf-generator";
import { hasPortalPermission, requirePortalApiRole } from "@/lib/portal-access";
import { emitPortalNotification } from "@/lib/portal-notifications";
import { requestCorrelationId } from "@/lib/security";

const labels:Record<string,string>={survey:"محضر معاينة",estimate:"تقدير تكلفة",boq:"جدول كميات",contract:"عقد مقاولات",wbs:"هيكل تقسيم العمل",daily_log:"يومية موقع",document:"سجل وثيقة هندسية",rfi:"طلب معلومات RFI",submittal:"اعتماد مادة",inspection:"طلب فحص",ncr:"حالة عدم مطابقة",safety:"سجل سلامة",procurement:"طلب شراء مشروع",subcontract:"سجل مقاول باطن",change_order:"أمر تغيير",payment_certificate:"مستخلص أعمال",handover:"محضر تسليم وضمان",risk:"سجل مخاطر"};
const money=(value:number)=>new Intl.NumberFormat("ar-SA",{style:"currency",currency:"SAR"}).format(value/100);

export async function GET(request:Request){
  const access=await requirePortalApiRole(["admin","manager","employee"]);
  if(!access)return Response.json({error:"غير مصرح بتنزيل ملفات المقاولات"},{status:403});
  const scopes=await getActivePortalScopes(access);
  if(!(await hasPortalPermission(access,"construction","read"))&&!canReadConstruction(access,scopes))return Response.json({error:"غير مصرح بالوصول إلى قطاع المقاولات"},{status:403});
  const id=Number(new URL(request.url).searchParams.get("id"));
  if(!Number.isInteger(id)||id<1)return Response.json({error:"رقم السجل غير صحيح"},{status:400});
  const db=getDb();
  const record=await db.query.constructionRecords.findFirst({where:eq(constructionRecords.id,id)});
  if(!record)return Response.json({error:"سجل المقاولات غير موجود"},{status:404});
  const [project,opportunity,lines,assets]=await Promise.all([
    record.projectId?db.query.constructionProjects.findFirst({where:eq(constructionProjects.id,record.projectId)}):null,
    record.opportunityId?db.query.constructionOpportunities.findFirst({where:eq(constructionOpportunities.id,record.opportunityId)}):null,
    db.select().from(constructionRecordLines).where(eq(constructionRecordLines.recordId,id)),
    db.select().from(companyAssets),
  ]);
  if(record.projectId&&(!project||!scopeAllowsProject(access,scopes,project.id,project.cityId)))return Response.json({error:"المشروع خارج نطاق صلاحية المستخدم"},{status:403});
  const assetInput=assets.filter((asset):asset is typeof asset&{slot:"stamp"|"signature"}=>asset.slot==="stamp"||asset.slot==="signature").map(asset=>({slot:asset.slot,storageKey:asset.storageKey,contentType:asset.contentType}));
  if(assetInput.length<2)return Response.json({error:"يجب رفع الختم والتوقيع المعتمدين قبل إصدار الملف"},{status:409});
  const lineDetails=lines.length?lines.map(line=>`${line.lineNumber}. ${line.itemCode?`${line.itemCode} - `:""}${line.description} | ${line.quantityMilli/1000} ${line.unit||"وحدة"} × ${money(line.unitRateHalalas)} = ${money(line.totalHalalas)}`).join("\n"):"لا توجد بنود تفصيلية مضافة إلى هذا الإصدار.";
  const clientName=project?.clientName||opportunity?.clientName||"جهة المشروع";
  const details=[record.description,`النوع: ${labels[record.recordType]||record.recordType}`,`الحالة: ${record.status}`,`المراجعة: ${record.revision}`,`المسؤول: ${record.responsibleEmail}`,record.dueDate?`تاريخ الاستحقاق: ${record.dueDate}`:"",record.retentionBps?`نسبة الاحتجاز: ${record.retentionBps/100}%`:"",`البنود:\n${lineDetails}`].filter(Boolean).join("\n\n");
  const bytes=await generateIssuedPdf({documentType:"construction_record",referenceCode:record.recordCode,clientName,title:record.title,issueDate:new Date().toISOString().slice(0,10),amountHalalas:record.amountHalalas||undefined,details},assetInput);
  const correlationId=requestCorrelationId(request);
  await auditPortalAction({actorEmail:access.user.email,action:"construction-record-pdf-generated",entityType:`construction-${record.recordType}`,entityId:record.id,after:{recordCode:record.recordCode,revision:record.revision},correlationId});
  await emitPortalNotification({eventType:"construction-record-pdf-generated",title:"أُصدر ملف PDF لمشروع مقاولات",message:`${record.recordCode} — ${record.title}.`,severity:"info",module:"construction",entityType:`construction-${record.recordType}`,entityId:record.id,actionView:"construction",targetEmail:access.user.email}).catch(()=>undefined);
  return new Response(bytes as BodyInit,{headers:{"content-type":"application/pdf","content-disposition":`attachment; filename="${record.recordCode}.pdf"`,"cache-control":"private, no-store","x-content-type-options":"nosniff"}});
}
