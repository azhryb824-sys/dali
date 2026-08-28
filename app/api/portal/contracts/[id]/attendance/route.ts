import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { contractPaymentSchedules, contractProfessions, contractWorkerAbsences, contractWorkerAssignments, workers, workforceContracts } from "@/db/schema";
import { auditPortalAction } from "@/lib/audit";
import { hasPortalPermission, requirePortalApiRole } from "@/lib/portal-access";
import { emitPortalNotification } from "@/lib/portal-notifications";
import { jsonNoStore, readLimitedJson, rejectCrossSiteRequest, requestCorrelationId } from "@/lib/security";

const positiveId=(value:unknown)=>{const n=Number(value);return Number.isSafeInteger(n)&&n>0?n:0};
const clean=(value:unknown,max:number)=>typeof value==="string"?value.trim().slice(0,max):"";
const chargeableDays=(start:string,end:string)=>{let count=0,cursor=new Date(`${start}T12:00:00Z`),last=new Date(`${end}T12:00:00Z`);while(cursor<=last){if(cursor.getUTCDay()!==5)count++;cursor=new Date(cursor.getTime()+86400000)}return count};
const owner=(access:NonNullable<Awaited<ReturnType<typeof requirePortalApiRole>>>)=>access.role==="admin"||access.functionalRoles.includes("system_owner")||access.functionalRoles.includes("system_admin");

export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){
  const access=await requirePortalApiRole(["admin","manager","employee"]);
  if(!access||!(await hasPortalPermission(access,"contracts","read")))return jsonNoStore({error:"غير مصرح"},{status:403});
  const contractId=positiveId((await params).id);if(!contractId)return jsonNoStore({error:"العقد غير صحيح"},{status:400});
  const absences=await getDb().select().from(contractWorkerAbsences).where(eq(contractWorkerAbsences.contractId,contractId)).orderBy(desc(contractWorkerAbsences.absenceDate),desc(contractWorkerAbsences.id));
  return jsonNoStore({absences,canRecord:owner(access)});
}

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  if(rejectCrossSiteRequest(request))return jsonNoStore({error:"مصدر الطلب غير مسموح"},{status:403});
  const access=await requirePortalApiRole(["admin","manager","employee"]);
  if(!access||!owner(access))return jsonNoStore({error:"تسجيل غياب العمالة والخصم من صلاحيات المالك أو مشرف النظام فقط"},{status:403});
  const parsed=await readLimitedJson(request,4000);if(!parsed.ok)return parsed.response;
  const body=parsed.value as Record<string,unknown>,contractId=positiveId((await params).id),workerId=positiveId(body.workerId)||null,contractProfessionId=positiveId(body.contractProfessionId),absenceDate=clean(body.absenceDate,10),absenceEndDate=clean(body.absenceEndDate,10)||absenceDate,notes=clean(body.notes,1000),requestedCount=positiveId(body.absentCount)||1;
  if(!contractId||!contractProfessionId||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(absenceDate)||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(absenceEndDate)||absenceEndDate<absenceDate||absenceEndDate.slice(0,7)!==absenceDate.slice(0,7))return jsonNoStore({error:"فترة الغياب غير صحيحة أو تمتد بين شهرين"},{status:400});
  const db=getDb(),contract=await db.query.workforceContracts.findFirst({where:eq(workforceContracts.id,contractId)}),profession=await db.query.contractProfessions.findFirst({where:eq(contractProfessions.id,contractProfessionId)});
  if(!contract||!profession||profession.contractId!==contractId)return jsonNoStore({error:"العقد أو المهنة غير موجودة"},{status:404});
  if(absenceDate<contract.startDate||absenceEndDate>contract.endDate)return jsonNoStore({error:"فترة الغياب خارج مدة العقد"},{status:400});
  const periodMonth=absenceDate.slice(0,7),payment=await db.query.contractPaymentSchedules.findFirst({where:and(eq(contractPaymentSchedules.contractId,contractId),eq(contractPaymentSchedules.servicePeriod,periodMonth))});
  if(!payment||payment.billingBasis!=="monthly_salary")return jsonNoStore({error:"لا توجد دفعة شهرية مرتبطة بشهر الغياب"},{status:409});
  if(payment.invoiceDocumentId||payment.financialRecordId||["invoiced","paid","cancelled"].includes(payment.status))return jsonNoStore({error:"لا يمكن تعديل خصم الغياب بعد إصدار الفاتورة أو معالجة الدفعة"},{status:409});
  const workDays=chargeableDays(absenceDate,absenceEndDate);if(workDays<1)return jsonNoStore({error:"فترة الغياب تحتوي يوم الجمعة فقط ولا يترتب عليها خصم"},{status:400});
  let absentCount=requestedCount*workDays,selectedWorker:null|typeof workers.$inferSelect=null;
  if(workerId){
    const assignment=await db.query.contractWorkerAssignments.findFirst({where:and(eq(contractWorkerAssignments.contractId,contractId),eq(contractWorkerAssignments.contractProfessionId,contractProfessionId),eq(contractWorkerAssignments.workerId,workerId),eq(contractWorkerAssignments.status,"active"))});
    if(!assignment)return jsonNoStore({error:"العامل غير مسند حاليًا لهذه المهنة في العقد"},{status:409});
    selectedWorker=await db.query.workers.findFirst({where:eq(workers.id,workerId)})||null;absentCount=workDays;
  }else{
    const active=await db.select().from(contractWorkerAssignments).where(and(eq(contractWorkerAssignments.contractId,contractId),eq(contractWorkerAssignments.contractProfessionId,contractProfessionId),eq(contractWorkerAssignments.status,"active")));
    if(requestedCount>active.length)return jsonNoStore({error:"عدد المتغيبين أكبر من عدد العمالة المسندة للمهنة"},{status:409});
  }
  const monthlyRate=profession.actualSalaryHalalas>0?profession.actualSalaryHalalas:selectedWorker?.monthlySalaryHalalas||0;
  const dailyRateHalalas=Math.round(monthlyRate/30);if(dailyRateHalalas<1)return jsonNoStore({error:"راتب المهنة غير مسجل ولا يمكن حساب اليومية"},{status:409});
  const deductionHalalas=dailyRateHalalas*absentCount,dedupeKey=workerId?`${contractId}:${absenceDate}:${absenceEndDate}:worker:${workerId}`:`${contractId}:${absenceDate}:${absenceEndDate}:profession:${contractProfessionId}`;
  try{
    const now=new Date().toISOString();
    const result=await db.transaction(async tx=>{
      const[updatedPayment]=await tx.update(contractPaymentSchedules).set({absenceDeductionHalalas:sql`${contractPaymentSchedules.absenceDeductionHalalas} + ${deductionHalalas}`,updatedAt:now}).where(and(eq(contractPaymentSchedules.id,payment.id),sql`${contractPaymentSchedules.absenceDeductionHalalas} + ${deductionHalalas} <= ${contractPaymentSchedules.subtotalHalalas}`)).returning();
      if(!updatedPayment)throw new Error("DEDUCTION_EXCEEDS_PAYMENT");
      const[absence]=await tx.insert(contractWorkerAbsences).values({contractId,paymentScheduleId:payment.id,workerId,contractProfessionId,profession:profession.profession,absenceDate,absenceEndDate,chargeableDays:workDays,absentCount,dailyRateHalalas,deductionHalalas,notes:notes||null,dedupeKey,recordedBy:access.user.email,updatedAt:now}).returning();
      return{absence,payment:updatedPayment};
    });
    await auditPortalAction({actorEmail:access.user.email,action:"contract-worker-absence-recorded",entityType:"contract-worker-absence",entityId:result.absence.id,after:result.absence,correlationId:requestCorrelationId(request)});
    await emitPortalNotification({eventType:"contract-worker-absence-recorded",title:"سُجل غياب وخصم على دفعة عقد",message:`${contract.referenceCode} — ${profession.profession} — ${absentCount} × ${(dailyRateHalalas/100).toFixed(2)} ر.س — شهر ${periodMonth}.`,severity:"warning",module:"finance",entityType:"contract-payment",entityId:payment.id,actionView:"finance",targetDepartment:"finance"}).catch(()=>undefined);
    return jsonNoStore(result,{status:201});
  }catch(error){
    const message=error instanceof Error?error.message:"";
    if(message.includes("unique"))return jsonNoStore({error:"تم تسجيل غياب العامل أو المهنة لهذا التاريخ مسبقًا"},{status:409});
    if(message==="DEDUCTION_EXCEEDS_PAYMENT")return jsonNoStore({error:"إجمالي الخصومات يتجاوز قيمة الدفعة قبل الضريبة"},{status:409});
    console.error("contract-worker-absence-failed",error);return jsonNoStore({error:"تعذر تسجيل الغياب والخصم"},{status:500});
  }
}

export async function DELETE(request:Request,{params}:{params:Promise<{id:string}>}){
  if(rejectCrossSiteRequest(request))return jsonNoStore({error:"مصدر الطلب غير مسموح"},{status:403});
  const access=await requirePortalApiRole(["admin","manager","employee"]);if(!access||!owner(access))return jsonNoStore({error:"إلغاء قيد الغياب من صلاحيات المالك أو مشرف النظام فقط"},{status:403});
  const contractId=positiveId((await params).id),absenceId=positiveId(new URL(request.url).searchParams.get("absenceId"));if(!contractId||!absenceId)return jsonNoStore({error:"البيانات غير صحيحة"},{status:400});
  const db=getDb(),absence=await db.query.contractWorkerAbsences.findFirst({where:eq(contractWorkerAbsences.id,absenceId)});if(!absence||absence.contractId!==contractId||absence.status!=="active")return jsonNoStore({error:"قيد الغياب غير موجود أو ملغى"},{status:404});
  const payment=await db.query.contractPaymentSchedules.findFirst({where:eq(contractPaymentSchedules.id,absence.paymentScheduleId)});if(!payment||payment.invoiceDocumentId||payment.financialRecordId)return jsonNoStore({error:"لا يمكن إلغاء الخصم بعد إصدار الفاتورة"},{status:409});
  const now=new Date().toISOString();
  const result=await db.transaction(async tx=>{const[voided]=await tx.update(contractWorkerAbsences).set({status:"void",voidedBy:access.user.email,voidedAt:now,updatedAt:now}).where(and(eq(contractWorkerAbsences.id,absenceId),eq(contractWorkerAbsences.status,"active"))).returning();if(!voided)throw new Error("ABSENCE_CHANGED");const[updatedPayment]=await tx.update(contractPaymentSchedules).set({absenceDeductionHalalas:sql`greatest(0,${contractPaymentSchedules.absenceDeductionHalalas} - ${absence.deductionHalalas})`,updatedAt:now}).where(eq(contractPaymentSchedules.id,payment.id)).returning();return{absence:voided,payment:updatedPayment};});
  await auditPortalAction({actorEmail:access.user.email,action:"contract-worker-absence-voided",entityType:"contract-worker-absence",entityId:absenceId,before:absence,after:result.absence,correlationId:requestCorrelationId(request)});
  return jsonNoStore(result);
}
