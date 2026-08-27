import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { legalCaseActionLog, legalCaseActivities, legalCaseAttachments, legalRecords } from "@/db/schema";
import { auditPortalAction } from "@/lib/audit";
import { emitPortalNotification } from "@/lib/portal-notifications";
import { hasPortalPermission, requirePortalApiRole } from "@/lib/portal-access";
import { jsonNoStore, readLimitedJson, rejectCrossSiteRequest } from "@/lib/security";

const clean=(value:unknown,max=1000)=>typeof value==="string"?value.trim().slice(0,max):"";
type LegalActor=NonNullable<Awaited<ReturnType<typeof requirePortalApiRole>>>;
async function access(write=false){const actor=await requirePortalApiRole(["admin","manager","employee"]);return actor&&await hasPortalPermission(actor,"legal",write?"write":"read")?actor:null}
function isSupervisor(actor:LegalActor){return actor.role==="admin"||actor.functionalRoles.some(role=>["system_owner","system_admin","legal_supervisor"].includes(role))}
function actorRole(actor:LegalActor){if(actor.functionalRoles.includes("legal_supervisor"))return"legal_supervisor";if(actor.functionalRoles.includes("legal_lawyer"))return"legal_lawyer";if(actor.functionalRoles.includes("lawyer"))return"lawyer";if(actor.functionalRoles.includes("system_owner"))return"system_owner";if(actor.functionalRoles.includes("system_admin")||actor.role==="admin")return"system_admin";return"legal_staff"}

export async function GET(){
  const actor=await access();if(!actor)return jsonNoStore({error:"غير مصرح"},{status:403});
  const db=getDb();
  const[cases,activities,attachments,actionLog]=await Promise.all([
    db.select().from(legalRecords).orderBy(asc(legalRecords.status),asc(legalRecords.createdAt)),
    db.select().from(legalCaseActivities).orderBy(asc(legalCaseActivities.dueAt),asc(legalCaseActivities.createdAt)),
    db.select().from(legalCaseAttachments).orderBy(asc(legalCaseAttachments.createdAt)),
    db.select().from(legalCaseActionLog).orderBy(asc(legalCaseActionLog.createdAt)),
  ]);
  return jsonNoStore({cases,activities,attachments,actionLog,currentActorEmail:actor.user.email,currentActorRole:actorRole(actor),canWrite:await hasPortalPermission(actor,"legal","write"),canApprove:await hasPortalPermission(actor,"legal","approve"),canSupervise:isSupervisor(actor)})
}

export async function POST(request:Request){
  if(rejectCrossSiteRequest(request))return jsonNoStore({error:"مصدر الطلب غير مسموح"},{status:403});
  const actor=await access(true);if(!actor)return jsonNoStore({error:"غير مصرح"},{status:403});
  const parsed=await readLimitedJson(request,10000);if(!parsed.ok)return parsed.response;
  const body=parsed.value as Record<string,unknown>;const legalRecordId=Number(body.legalRecordId);const activityType=clean(body.activityType,30);const title=clean(body.title,180);const details=clean(body.details,5000);const priority=clean(body.priority,20)||"medium";const dueAt=clean(body.dueAt,30)||null;
  const requestedAssignee=clean(body.assignedTo,180)||null;const assignedTo=isSupervisor(actor)?requestedAssignee:(actor.user.email||null);
  if(!Number.isInteger(legalRecordId)||legalRecordId<1||title.length<3||!["task","deadline","note","communication","hearing","settlement"].includes(activityType)||!["low","medium","high","critical"].includes(priority))return jsonNoStore({error:"بيانات نشاط القضية غير مكتملة"},{status:400});
  const db=getDb();const matter=await db.query.legalRecords.findFirst({where:eq(legalRecords.id,legalRecordId)});if(!matter)return jsonNoStore({error:"الملف القانوني غير موجود"},{status:404});
  const now=new Date().toISOString();
  const saved=await db.transaction(async tx=>{
    const[row]=await tx.insert(legalCaseActivities).values({legalRecordId,activityType,title,details:details||null,priority,dueAt,assignedTo,createdBy:actor.user.email,updatedAt:now}).returning();
    await tx.insert(legalCaseActionLog).values({legalRecordId,activityId:row.id,action:assignedTo&&assignedTo!==actor.user.email?"assigned":"created",fromStatus:null,toStatus:"open",details:assignedTo?`الإجراء: ${title} — أُسند إلى ${assignedTo}`:`الإجراء: ${title}`,actorEmail:actor.user.email,actorRole:actorRole(actor)});
    return row;
  });
  await auditPortalAction({actorEmail:actor.user.email,action:"legal-case-activity-created",entityType:"legal-case-activity",entityId:saved.id,after:{...saved,actorRole:actorRole(actor)}});
  await emitPortalNotification({eventType:"legal-case-activity-created",title:activityType==="deadline"?"أضيف موعد قانوني":"أضيف إجراء إلى قضية",message:`${matter.referenceCode} — ${title}`,severity:priority==="critical"?"critical":priority==="high"?"warning":"info",module:"legal",entityType:"legal-record",entityId:legalRecordId,actionView:"legal",targetDepartment:"legal",targetEmail:assignedTo}).catch(()=>undefined);
  return jsonNoStore({activity:saved},{status:201})
}

export async function PATCH(request:Request){
  if(rejectCrossSiteRequest(request))return jsonNoStore({error:"مصدر الطلب غير مسموح"},{status:403});
  const actor=await access(true);if(!actor)return jsonNoStore({error:"غير مصرح"},{status:403});
  const parsed=await readLimitedJson(request,5000);if(!parsed.ok)return parsed.response;
  const body=parsed.value as Record<string,unknown>;const actionRequest=clean(body.action,30);
  const db=getDb();
  if(actionRequest==="assign-case"){
    if(!isSupervisor(actor))return jsonNoStore({error:"إسناد القضية من صلاحيات المحامي المشرف"},{status:403});
    const legalRecordId=Number(body.legalRecordId);const assignedLawyerEmail=clean(body.assignedLawyerEmail,180).toLowerCase();
    if(!Number.isInteger(legalRecordId)||legalRecordId<1||!assignedLawyerEmail.includes("@"))return jsonNoStore({error:"اختر بريد المحامي المستلم للقضية"},{status:400});
    const beforeCase=await db.query.legalRecords.findFirst({where:eq(legalRecords.id,legalRecordId)});if(!beforeCase)return jsonNoStore({error:"الملف القانوني غير موجود"},{status:404});
    const now=new Date().toISOString();
    const updatedCase=await db.transaction(async tx=>{
      const[row]=await tx.update(legalRecords).set({assignedLawyerEmail,assignedBy:actor.user.email,assignedAt:now,updatedAt:now}).where(eq(legalRecords.id,legalRecordId)).returning();
      await tx.insert(legalCaseActionLog).values({legalRecordId,activityId:null,action:"assigned",fromStatus:null,toStatus:null,details:`إسناد القضية إلى المحامي ${assignedLawyerEmail}`,actorEmail:actor.user.email,actorRole:actorRole(actor)});
      return row;
    });
    await auditPortalAction({actorEmail:actor.user.email,action:"legal-case-assigned",entityType:"legal-record",entityId:legalRecordId,before:beforeCase,after:updatedCase});
    await emitPortalNotification({eventType:"legal-case-assigned",title:"أُسند ملف قانوني إليك",message:`${updatedCase.referenceCode} — ${updatedCase.title}`,severity:"info",module:"legal",entityType:"legal-record",entityId:legalRecordId,actionView:"legal",targetEmail:assignedLawyerEmail}).catch(()=>undefined);
    return jsonNoStore({case:updatedCase});
  }
  const id=Number(body.id);const status=clean(body.status,20);
  if(!Number.isInteger(id)||id<1||!["open","in_progress","completed","cancelled"].includes(status))return jsonNoStore({error:"الحالة غير صحيحة"},{status:400});
  const before=await db.query.legalCaseActivities.findFirst({where:eq(legalCaseActivities.id,id)});if(!before)return jsonNoStore({error:"الإجراء غير موجود"},{status:404});
  if(!isSupervisor(actor)&&before.assignedTo?.toLowerCase()!==actor.user.email.toLowerCase()&&before.createdBy.toLowerCase()!==actor.user.email.toLowerCase())return jsonNoStore({error:"المحامي الفرعي يستطيع تحديث الإجراءات المسندة إليه فقط"},{status:403});
  if(status==="cancelled"&&!isSupervisor(actor))return jsonNoStore({error:"إلغاء الإجراء من صلاحيات المحامي المشرف"},{status:403});
  const now=new Date().toISOString();const action=status==="in_progress"?"started":status==="completed"?"completed":status==="cancelled"?"cancelled":"assigned";
  const updated=await db.transaction(async tx=>{
    const[row]=await tx.update(legalCaseActivities).set({status,completedAt:status==="completed"?now:null,updatedAt:now}).where(and(eq(legalCaseActivities.id,id),eq(legalCaseActivities.status,before.status))).returning();
    if(!row)return null;
    await tx.insert(legalCaseActionLog).values({legalRecordId:before.legalRecordId,activityId:id,action,fromStatus:before.status,toStatus:status,details:`${before.title}: ${before.status} ← ${status}`,actorEmail:actor.user.email,actorRole:actorRole(actor)});
    return row;
  });
  if(!updated)return jsonNoStore({error:"تغير الإجراء قبل الحفظ"},{status:409});
  await auditPortalAction({actorEmail:actor.user.email,action:"legal-case-activity-updated",entityType:"legal-case-activity",entityId:id,before,after:{...updated,actorRole:actorRole(actor)}});
  return jsonNoStore({activity:updated})
}
