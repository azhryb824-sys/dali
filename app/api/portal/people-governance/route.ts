import { and, desc, eq, gte, lte } from "drizzle-orm";
import { getDb } from "@/db";
import { attendanceDeductionProposals, employeeAttendance, employeeLeaveRequests, employeeMovements, employeePerformanceReviews, employees, portalAccessScopes, portalAttendancePolicies, portalAttendanceSessions, portalSessions, portalUsers } from "@/db/schema";
import { auditPortalAction } from "@/lib/audit";
import { closeAttendanceSession, startAttendanceSession } from "@/lib/attendance-governance";
import { hasPortalPermission, requirePortalApiRole } from "@/lib/portal-access";
import { emitPortalNotification } from "@/lib/portal-notifications";
import { jsonNoStore, readLimitedJson, rejectCrossSiteRequest, requestCorrelationId } from "@/lib/security";

async function accessContext() {
  const access = await requirePortalApiRole(["admin","manager","employee"]);
  if (!access) return null;
  const owner = access.functionalRoles.includes("system_owner");
  const systemAdmin = access.role === "admin" || access.functionalRoles.includes("system_admin");
  const hr = await hasPortalPermission(access,"employees","approve");
  const finance = await hasPortalPermission(access,"finance","approve");
  return { access, owner, systemAdmin, hr, finance };
}

function parseDays(value:string){try{const parsed=JSON.parse(value)as unknown;return Array.isArray(parsed)?parsed.filter((day):day is number=>Number.isInteger(day)&&day>=0&&day<=6):[0,1,2,3,4]}catch{return[0,1,2,3,4]}}
function monthRange(month:string){const [year,monthNumber]=month.split("-").map(Number);const start=new Date(Date.UTC(year,monthNumber-1,1));const end=new Date(Date.UTC(year,monthNumber,0));return{start:start.toISOString().slice(0,10),end:end.toISOString().slice(0,10),days:end.getUTCDate(),year,monthNumber}}
type PerformanceWeights={goals:number;quality:number;timeliness:number;collaboration:number;compliance:number;attendance:number};
function roleWeights(roleKey:string,attendance:boolean):PerformanceWeights{const base:Record<string,Omit<PerformanceWeights,"attendance">>={
  sales_representative:{goals:40,quality:20,timeliness:15,collaboration:15,compliance:10},
  purchasing_representative:{goals:25,quality:30,timeliness:20,collaboration:10,compliance:15},
  accountant:{goals:15,quality:30,timeliness:20,collaboration:10,compliance:25},
  legal_affairs:{goals:15,quality:30,timeliness:15,collaboration:10,compliance:30},
  administrative_assistant:{goals:20,quality:25,timeliness:25,collaboration:20,compliance:10},
};const result:PerformanceWeights={...(base[roleKey]||{goals:35,quality:25,timeliness:15,collaboration:15,compliance:10}),attendance:0};if(attendance){result.goals-=10;result.attendance=10}return result}

async function responsePayload() {
  const db=getDb();
  const [users,employeeRows,policies,sessions,proposals,reviews,scopes,activeSessions]=await Promise.all([
    db.select({email:portalUsers.email,displayName:portalUsers.displayName,status:portalUsers.status,department:portalUsers.department}).from(portalUsers).orderBy(portalUsers.displayName),
    db.select({id:employees.id,fullName:employees.fullName,employeeNumber:employees.employeeNumber,portalUserEmail:employees.portalUserEmail,baseSalaryHalalas:employees.baseSalaryHalalas,housingAllowanceHalalas:employees.housingAllowanceHalalas,transportAllowanceHalalas:employees.transportAllowanceHalalas,otherAllowanceHalalas:employees.otherAllowanceHalalas,status:employees.status}).from(employees).orderBy(employees.fullName),
    db.select().from(portalAttendancePolicies).orderBy(desc(portalAttendancePolicies.updatedAt)),
    db.select().from(portalAttendanceSessions).orderBy(desc(portalAttendanceSessions.loginAt)).limit(120),
    db.select().from(attendanceDeductionProposals).orderBy(desc(attendanceDeductionProposals.updatedAt)).limit(60),
    db.select().from(employeePerformanceReviews).orderBy(desc(employeePerformanceReviews.updatedAt)).limit(60),
    db.select({email:portalAccessScopes.userEmail,role:portalAccessScopes.functionalRole,active:portalAccessScopes.active}).from(portalAccessScopes),
    db.select({id:portalSessions.id,userEmail:portalSessions.userEmail,lastActivityAt:portalSessions.lastActivityAt}).from(portalSessions).where(eq(portalSessions.status,"active")),
  ]);
  const rolesByEmail=new Map<string,string[]>();for(const scope of scopes.filter(row=>row.active))rolesByEmail.set(scope.email,[...(rolesByEmail.get(scope.email)||[]),scope.role]);
  const policyByEmail=new Map(policies.map(policy=>[policy.userEmail,policy]));
  const employeesById=new Map(employeeRows.map(employee=>[employee.id,employee]));
  const now=Date.now();
  return jsonNoStore({
    users:users.map(user=>({...user,functionalRoles:rolesByEmail.get(user.email)||[],policy:policyByEmail.get(user.email)||null,employee:employeeRows.find(employee=>employee.portalUserEmail===user.email)||null})),
    employees:employeeRows,sessions,proposals:proposals.map(item=>({...item,employeeName:employeesById.get(item.employeeId)?.fullName||""})),reviews:reviews.map(item=>({...item,employeeName:employeesById.get(item.employeeId)?.fullName||""})),
    metrics:{tracked:policies.filter(item=>item.trackingEnabled).length,online:activeSessions.filter(item=>now-new Date(item.lastActivityAt).getTime()<10*60_000).length,deductionReview:proposals.filter(item=>["draft","hr_review"].includes(item.status)).length,performanceReview:reviews.filter(item=>item.status!=="final").length,unlinked:policies.filter(item=>item.trackingEnabled&&!item.employeeId).length},
  });
}

export async function GET(){const context=await accessContext();if(!context||( !context.owner&&!context.systemAdmin&&!context.hr&&!context.finance))return jsonNoStore({error:"غير مصرح بلوحة حوكمة الموظفين"},{status:403});return responsePayload()}

export async function POST(request:Request){
  if(rejectCrossSiteRequest(request))return jsonNoStore({error:"مصدر الطلب غير مسموح"},{status:403});
  const context=await accessContext();if(!context)return jsonNoStore({error:"غير مصرح"},{status:403});
  const parsed=await readLimitedJson(request,20_000);if(!parsed.ok)return parsed.response;const body=parsed.value as Record<string,unknown>;const action=typeof body.action==="string"?body.action:"";const db=getDb();const now=new Date().toISOString();

  if(action==="toggle_tracking"){
    if(!context.owner)return jsonNoStore({error:"تفعيل حساب زمن الحضور متاح لمالك النظام فقط"},{status:403});
    const userEmail=typeof body.userEmail==="string"?body.userEmail.trim().toLowerCase():"";const employeeId=Number(body.employeeId)||null;const enabled=body.enabled===true;const reason=typeof body.reason==="string"?body.reason.trim().slice(0,500):"";
    if(!userEmail||reason.length<10)return jsonNoStore({error:"اختر المستخدم واكتب سبباً واضحاً لا يقل عن 10 أحرف"},{status:400});
    const target=await db.query.portalUsers.findFirst({where:eq(portalUsers.email,userEmail)});if(!target)return jsonNoStore({error:"المستخدم غير موجود"},{status:404});
    const targetAdmin=await db.query.portalAccessScopes.findFirst({where:and(eq(portalAccessScopes.userEmail,userEmail),eq(portalAccessScopes.functionalRole,"system_admin"),eq(portalAccessScopes.active,true))});
    if(targetAdmin)return jsonNoStore({error:"مشرف النظام مستثنى من حساب زمن الحضور"},{status:409});
    const linked=employeeId?await db.query.employees.findFirst({where:eq(employees.id,employeeId)}):null;if(employeeId&&(!linked||linked.portalUserEmail!==userEmail))return jsonNoStore({error:"يجب ربط المستخدم بملف الموظف المطابق أولاً"},{status:409});
    const requiredMinutes=Math.max(1,Math.min(720,Number(body.requiredMinutes)||480));const graceMinutes=Math.max(0,Math.min(120,Number(body.graceMinutes)||10));const shiftStart=typeof body.shiftStart==="string"&&/^\d{2}:\d{2}$/.test(body.shiftStart)?body.shiftStart:"08:00";const shiftEnd=typeof body.shiftEnd==="string"&&/^\d{2}:\d{2}$/.test(body.shiftEnd)?body.shiftEnd:"17:00";
    await db.insert(portalAttendancePolicies).values({userEmail,employeeId,trackingEnabled:enabled,shiftStart,shiftEnd,requiredMinutes,graceMinutes,activatedBy:context.access.user.email,activationReason:reason,createdAt:now,updatedAt:now}).onConflictDoUpdate({target:portalAttendancePolicies.userEmail,set:{employeeId,trackingEnabled:enabled,shiftStart,shiftEnd,requiredMinutes,graceMinutes,activatedBy:context.access.user.email,activationReason:reason,updatedAt:now}});
    const active=await db.select().from(portalSessions).where(and(eq(portalSessions.userEmail,userEmail),eq(portalSessions.status,"active")));if(enabled){for(const session of active)await startAttendanceSession(session.id,userEmail,session.createdAt)}else{for(const session of active)await closeAttendanceSession(session.id,now,"attendance-tracking-disabled",false)}
    await auditPortalAction({actorEmail:context.access.user.email,action:enabled?"attendance-tracking-enabled":"attendance-tracking-disabled",entityType:"portal-user",entityId:userEmail,reason,after:{employeeId,shiftStart,shiftEnd,requiredMinutes,graceMinutes},source:"hr",correlationId:requestCorrelationId(request)});
    await emitPortalNotification({eventType:"attendance-policy-changed",title:enabled?"فُعّل حساب زمن الحضور":"أُوقف حساب زمن الحضور",message:`${target.displayName} — ${reason}`,severity:enabled?"warning":"info",module:"employees",entityType:"portal-user",entityId:userEmail,actionView:"employees",targetEmail:userEmail}).catch(()=>undefined);
    return responsePayload();
  }

  if(action==="calculate_deduction"){
    if(!context.owner&&!context.hr)return jsonNoStore({error:"غير مصرح بحساب نقص الدوام"},{status:403});
    const employeeId=Number(body.employeeId);const periodMonth=typeof body.periodMonth==="string"?body.periodMonth:"";const currentMonth=new Date(Date.now()+3*60*60_000).toISOString().slice(0,7);if(!employeeId||!/^\d{4}-\d{2}$/.test(periodMonth)||periodMonth>currentMonth)return jsonNoStore({error:"اختر الموظف وشهراً حالياً أو سابقاً"},{status:400});
    const employee=await db.query.employees.findFirst({where:eq(employees.id,employeeId)});const policy=await db.query.portalAttendancePolicies.findFirst({where:and(eq(portalAttendancePolicies.employeeId,employeeId),eq(portalAttendancePolicies.trackingEnabled,true))});if(!employee||!policy)return jsonNoStore({error:"الموظف غير مرتبط بسياسة حضور مفعّلة"},{status:409});
    const range=monthRange(periodMonth);const today=new Date(Date.now()+3*60*60_000).toISOString().slice(0,10);const effectiveEnd=range.end<today?range.end:today;const effectiveDays=Math.max(0,Math.min(range.days,new Date(`${effectiveEnd}T00:00:00Z`).getUTCDate()));const [sessionRows,leaveRows,attendanceRows]=await Promise.all([
      db.select().from(portalAttendanceSessions).where(and(eq(portalAttendanceSessions.employeeId,employeeId),gte(portalAttendanceSessions.workDate,range.start),lte(portalAttendanceSessions.workDate,effectiveEnd))),
      db.select().from(employeeLeaveRequests).where(and(eq(employeeLeaveRequests.employeeId,employeeId),eq(employeeLeaveRequests.status,"approved"),lte(employeeLeaveRequests.startDate,effectiveEnd),gte(employeeLeaveRequests.endDate,range.start))),
      db.select().from(employeeAttendance).where(and(eq(employeeAttendance.employeeId,employeeId),gte(employeeAttendance.attendanceDate,range.start),lte(employeeAttendance.attendanceDate,effectiveEnd))),
    ]);
    const workdays=new Set(parseDays(policy.workdaysJson));const excusedDates=new Set(attendanceRows.filter(row=>["leave","sick","holiday"].includes(row.status)).map(row=>row.attendanceDate));for(const leave of leaveRows){for(let date=new Date(`${leave.startDate}T00:00:00Z`);date<=new Date(`${leave.endDate}T00:00:00Z`);date.setUTCDate(date.getUTCDate()+1))excusedDates.add(date.toISOString().slice(0,10))}
    const minutesByDate=new Map<string,number>();for(const row of sessionRows)minutesByDate.set(row.workDate,(minutesByDate.get(row.workDate)||0)+row.durationMinutes);
    let requiredMinutes=0,workedMinutes=0,excusedMinutes=0;const details=[] as Array<{date:string;required:number;worked:number;excused:boolean;missing:number}>;for(let day=1;day<=effectiveDays;day++){const date=new Date(Date.UTC(range.year,range.monthNumber-1,day));if(!workdays.has(date.getUTCDay()))continue;const dateKey=date.toISOString().slice(0,10);const excused=excusedDates.has(dateKey);const worked=Math.min(policy.requiredMinutes,minutesByDate.get(dateKey)||0);requiredMinutes+=policy.requiredMinutes;workedMinutes+=worked;if(excused)excusedMinutes+=policy.requiredMinutes;details.push({date:dateKey,required:policy.requiredMinutes,worked,excused,missing:excused?0:Math.max(0,policy.requiredMinutes-worked)})}
    const missingMinutes=Math.max(0,requiredMinutes-workedMinutes-excusedMinutes);const grossSalaryHalalas=employee.baseSalaryHalalas+employee.housingAllowanceHalalas+employee.transportAllowanceHalalas+employee.otherAllowanceHalalas;const calculatedAmountHalalas=requiredMinutes?Math.round(grossSalaryHalalas*(missingMinutes/requiredMinutes)):0;const cappedAmountHalalas=Math.min(calculatedAmountHalalas,Math.floor(grossSalaryHalalas*.5));const calculationJson=JSON.stringify({method:"proportional-scheduled-minutes",policy:{requiredMinutes:policy.requiredMinutes,shiftStart:policy.shiftStart,shiftEnd:policy.shiftEnd,graceMinutes:policy.graceMinutes},details,legalCapPercent:50});
    const [proposal]=await db.insert(attendanceDeductionProposals).values({employeeId,periodMonth,requiredMinutes,workedMinutes,excusedMinutes,missingMinutes,grossSalaryHalalas,calculatedAmountHalalas,cappedAmountHalalas,status:"draft",calculationJson,createdBy:context.access.user.email,createdAt:now,updatedAt:now}).onConflictDoUpdate({target:[attendanceDeductionProposals.employeeId,attendanceDeductionProposals.periodMonth],set:{requiredMinutes,workedMinutes,excusedMinutes,missingMinutes,grossSalaryHalalas,calculatedAmountHalalas,cappedAmountHalalas,status:"draft",calculationJson,createdBy:context.access.user.email,reviewedBy:null,reviewedAt:null,approvedBy:null,approvedAt:null,movementId:null,updatedAt:now}}).returning();
    await auditPortalAction({actorEmail:context.access.user.email,action:"attendance-deduction-calculated",entityType:"attendance-deduction",entityId:String(proposal.id),after:proposal,reason:"حساب نسبي بحسب دقائق الدوام الفعلية مع استبعاد الإجازات المعتمدة وسقف 50%",source:"finance",correlationId:requestCorrelationId(request)});
    return responsePayload();
  }

  if(action==="submit_deduction"||action==="approve_deduction"||action==="reject_deduction"){
    const id=Number(body.id);const reason=typeof body.reason==="string"?body.reason.trim().slice(0,1000):"";const consent=body.writtenConsentConfirmed===true;const legalBasis=typeof body.legalBasis==="string"?body.legalBasis.trim().slice(0,1000):"";if(!id||reason.length<10)return jsonNoStore({error:"اكتب مبرراً واضحاً لا يقل عن 10 أحرف"},{status:400});const proposal=await db.query.attendanceDeductionProposals.findFirst({where:eq(attendanceDeductionProposals.id,id)});if(!proposal)return jsonNoStore({error:"المسودة غير موجودة"},{status:404});
    if(action==="submit_deduction"){
      if(!context.owner&&!context.hr)return jsonNoStore({error:"غير مصرح بالمراجعة البشرية"},{status:403});
      await db.update(attendanceDeductionProposals).set({status:"hr_review",writtenConsentConfirmed:consent,legalBasis:legalBasis||null,reviewedBy:context.access.user.email,reviewedAt:now,updatedAt:now}).where(eq(attendanceDeductionProposals.id,id));
    }else if(action==="approve_deduction"){
      if(!context.systemAdmin&&!context.finance)return jsonNoStore({error:"الاعتماد المالي متاح لمشرف النظام أو صاحب صلاحية الاعتماد المالي"},{status:403});if(proposal.status!=="hr_review")return jsonNoStore({error:"يجب إكمال مراجعة الموارد البشرية أولاً"},{status:409});if(proposal.reviewedBy===context.access.user.email)return jsonNoStore({error:"فصل المهام يمنع مراجع الموارد البشرية من اعتماد الخصم مالياً"},{status:409});if(!proposal.writtenConsentConfirmed&&!(proposal.legalBasis&&proposal.legalBasis.length>=10))return jsonNoStore({error:"يلزم توثيق موافقة الموظف الخطية أو الأساس النظامي للحسم"},{status:409});
      const [movement]=await db.insert(employeeMovements).values({employeeId:proposal.employeeId,movementType:"deduction",effectiveDate:`${proposal.periodMonth}-28`,amountHalalas:proposal.cappedAmountHalalas,description:`خصم نقص دوام معتمد للشهر ${proposal.periodMonth} — ${reason}`,status:"approved",createdBy:context.access.user.email,createdAt:now,updatedAt:now}).returning();await db.update(attendanceDeductionProposals).set({status:"finance_approved",approvedBy:context.access.user.email,approvedAt:now,movementId:movement.id,updatedAt:now}).where(eq(attendanceDeductionProposals.id,id));
    }else{
      if(!context.owner&&!context.systemAdmin&&!context.hr&&!context.finance)return jsonNoStore({error:"غير مصرح بالرفض"},{status:403});await db.update(attendanceDeductionProposals).set({status:"rejected",legalBasis:reason,updatedAt:now}).where(eq(attendanceDeductionProposals.id,id));
    }
    await auditPortalAction({actorEmail:context.access.user.email,action:`attendance-deduction-${action}`,entityType:"attendance-deduction",entityId:String(id),before:proposal,after:{action,reason,consent,legalBasis},reason,source:"finance",correlationId:requestCorrelationId(request)});
    await emitPortalNotification({eventType:"attendance-deduction-status",title:"تحديث مسودة خصم الدوام",message:`المعاملة #${id} — ${reason}`,severity:action==="approve_deduction"?"warning":"info",module:"finance",entityType:"attendance-deduction",entityId:String(id),actionView:"finance",targetRole:"admin"}).catch(()=>undefined);return responsePayload();
  }

  if(action==="create_performance_review"){
    if(!context.owner&&!context.systemAdmin&&!context.hr)return jsonNoStore({error:"غير مصرح بإنشاء التقييم"},{status:403});const employeeId=Number(body.employeeId);const periodStart=typeof body.periodStart==="string"?body.periodStart:"";const periodEnd=typeof body.periodEnd==="string"?body.periodEnd:"";const roleKey=typeof body.roleKey==="string"?body.roleKey:"general";const evidence=typeof body.evidence==="string"?body.evidence.trim().slice(0,4000):"";const comment=typeof body.managerComment==="string"?body.managerComment.trim().slice(0,2000):"";const scores={goals:Number(body.goalsScore),quality:Number(body.qualityScore),timeliness:Number(body.timelinessScore),collaboration:Number(body.collaborationScore),compliance:Number(body.complianceScore),attendance:Number(body.attendanceScore)};if(!employeeId||!periodStart||!periodEnd||periodEnd<periodStart||evidence.length<20||Object.values(scores).some(value=>!Number.isFinite(value)||value<0||value>100))return jsonNoStore({error:"أكمل فترة التقييم والدرجات من 0 إلى 100 وأرفق أدلة موضوعية"},{status:400});const tracked=Boolean(await db.query.portalAttendancePolicies.findFirst({where:and(eq(portalAttendancePolicies.employeeId,employeeId),eq(portalAttendancePolicies.trackingEnabled,true))}));const weights=roleWeights(roleKey,tracked);const overall=Math.round(scores.goals*weights.goals/100+scores.quality*weights.quality/100+scores.timeliness*weights.timeliness/100+scores.collaboration*weights.collaboration/100+scores.compliance*weights.compliance/100+(tracked?scores.attendance*weights.attendance/100:0));const [review]=await db.insert(employeePerformanceReviews).values({employeeId,periodStart,periodEnd,roleKey,status:"manager_review",goalsScore:scores.goals,qualityScore:scores.quality,timelinessScore:scores.timeliness,collaborationScore:scores.collaboration,complianceScore:scores.compliance,attendanceScore:tracked?scores.attendance:null,overallScore:overall,weightsJson:JSON.stringify(weights),evidenceJson:JSON.stringify({narrative:evidence,source:"manager-supported-evidence"}),managerComment:comment||null,reviewerEmail:context.access.user.email,createdAt:now,updatedAt:now}).returning();await auditPortalAction({actorEmail:context.access.user.email,action:"performance-review-created",entityType:"employee-performance",entityId:String(review.id),after:review,reason:"تقييم موزون بحسب الدور مع أدلة ومعايرة مستقلة",source:"hr",correlationId:requestCorrelationId(request)});return responsePayload();
  }

  if(action==="finalize_performance_review"){
    if(!context.owner&&!context.systemAdmin&&!context.hr)return jsonNoStore({error:"غير مصرح بالمعايرة"},{status:403});const id=Number(body.id);const comment=typeof body.comment==="string"?body.comment.trim().slice(0,2000):"";const review=await db.query.employeePerformanceReviews.findFirst({where:eq(employeePerformanceReviews.id,id)});if(!review||comment.length<10)return jsonNoStore({error:"اكتب ملاحظة معايرة واضحة"},{status:400});if(review.reviewerEmail===context.access.user.email)return jsonNoStore({error:"يجب أن ينفذ المعايرة مستخدم مختلف عن منشئ التقييم"},{status:409});await db.update(employeePerformanceReviews).set({status:"final",calibratedBy:context.access.user.email,calibratedAt:now,employeeComment:comment,updatedAt:now}).where(eq(employeePerformanceReviews.id,id));await auditPortalAction({actorEmail:context.access.user.email,action:"performance-review-finalized",entityType:"employee-performance",entityId:String(id),before:review,after:{status:"final",calibrationComment:comment},reason:comment,source:"hr",correlationId:requestCorrelationId(request)});await emitPortalNotification({eventType:"performance-review-finalized",title:"اكتمل تقييم أداء موظف",message:`التقييم #${id} — النتيجة ${review.overallScore}%`,severity:"success",module:"employees",entityType:"employee-performance",entityId:String(id),actionView:"employees",targetRole:"admin"}).catch(()=>undefined);return responsePayload();
  }
  return jsonNoStore({error:"الإجراء غير معروف"},{status:400});
}
