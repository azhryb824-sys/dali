import { registerLegalReferral } from "@/lib/legal-referrals";
import { paymentLegalReferralError } from "@/lib/legal-lifecycle-rules";
import { and, asc, eq, inArray, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { bankAccounts, chartOfAccounts, clientContacts, clients, companyAssets, companyDocuments, contractPaymentSettlementAllocations, contractPaymentSettlements, contractPaymentSchedules, contractProfessions, contractWorkerAssignments, financialRecords, legalReferrals, workers, workforceContracts } from "@/db/schema";
import { auditPortalAction } from "@/lib/audit";
import { cleanText, makeReference, objectKey } from "@/lib/company-documents";
import { generateIssuedPdf } from "@/lib/pdf-generator";
import { contractInvoicePdfCopy } from "@/lib/invoice-pdf-copy";
import { canSharePortalDocuments, hasPortalPermission, requirePortalApiRole } from "@/lib/portal-access";
import { emitPortalNotification } from "@/lib/portal-notifications";
import { issueDueContractInvoice } from "@/lib/contract-payment-invoicing";
import { loadContractLegalDocuments } from "@/lib/contract-legal-documents";
import { AUTOMATED_CONTRACT_BILLING_ACTOR, canInvoiceContractPayment, invoiceEligibleContractStatuses } from "@/lib/contract-payment-integrity";
import { recordContractPaymentSettlement, reverseContractPaymentSettlement, type ContractPaymentAllocationInput } from "@/lib/contract-payment-settlements";
import { getRuntimeEnv } from "@/lib/runtime-env";
import { jsonNoStore, readLimitedJson, rejectCrossSiteRequest, requestCorrelationId } from "@/lib/security";

const positiveId=(value:unknown)=>{const id=Number(value);return Number.isInteger(id)&&id>0?id:0};
const owner=(access:NonNullable<Awaited<ReturnType<typeof requirePortalApiRole>>>)=>access.role==="admin"||access.functionalRoles.includes("system_owner")||access.functionalRoles.includes("system_admin");
const approvedContractSharer=(access:NonNullable<Awaited<ReturnType<typeof requirePortalApiRole>>>)=>owner(access)||access.functionalRoles.includes("administrative_assistant");
const settlementAllocations=(body:Record<string,unknown>,remainingAmountHalalas:number):ContractPaymentAllocationInput[]=>{
  if(Array.isArray(body.allocations))return body.allocations.slice(0,10).flatMap(item=>{
    if(!item||typeof item!=="object")return[];
    const value=item as Record<string,unknown>;const paymentMethod=cleanText(value.paymentMethod,30);
    if(!["bank_transfer","cash","cheque"].includes(paymentMethod))return[];
    return[{paymentMethod:paymentMethod as ContractPaymentAllocationInput["paymentMethod"],amountHalalas:Number(value.amountHalalas),bankAccountId:positiveId(value.bankAccountId)||null,paymentAccountId:positiveId(value.paymentAccountId)||null,paymentReference:cleanText(value.paymentReference,180)||null}];
  });
  const paymentMethod=cleanText(body.paymentMethod,30);
  if(!["bank_transfer","cash","cheque"].includes(paymentMethod))return[];
  const requestedAmount=Number(body.amountHalalas);const amountHalalas=Number.isSafeInteger(requestedAmount)&&requestedAmount>0?requestedAmount:remainingAmountHalalas;
  return[{paymentMethod:paymentMethod as ContractPaymentAllocationInput["paymentMethod"],amountHalalas,bankAccountId:positiveId(body.bankAccountId)||null,paymentAccountId:positiveId(body.paymentAccountId)||null,paymentReference:cleanText(body.paymentReference,180)||null}];
};

export async function GET(){
  const access=await requirePortalApiRole(["admin","manager","employee"]);
  if(!access||!(await hasPortalPermission(access,"contracts","read"))&&!(await hasPortalPermission(access,"finance","read")))return jsonNoStore({error:"غير مصرح"},{status:403});
  const db=getDb();const today=new Date().toISOString().slice(0,10);
  const billableContracts=await db.select({id:workforceContracts.id}).from(workforceContracts).where(and(isNotNull(workforceContracts.approvedBy),or(inArray(workforceContracts.status,invoiceEligibleContractStatuses),and(inArray(workforceContracts.status,["cancelled","terminated"]),isNotNull(workforceContracts.cancellationEffectiveDate)))));
  const billableContractIds=billableContracts.map(item=>item.id);
  if(billableContractIds.length){
    await db.update(contractPaymentSchedules).set({status:"due",updatedAt:new Date().toISOString()}).where(and(inArray(contractPaymentSchedules.contractId,billableContractIds),eq(contractPaymentSchedules.status,"scheduled"),or(isNull(contractPaymentSchedules.cancellationDisposition),eq(contractPaymentSchedules.cancellationDisposition,"preserve")),lte(contractPaymentSchedules.dueDate,today)));
    const due=await db.select().from(contractPaymentSchedules).where(and(inArray(contractPaymentSchedules.contractId,billableContractIds),eq(contractPaymentSchedules.status,"due"),or(isNull(contractPaymentSchedules.cancellationDisposition),eq(contractPaymentSchedules.cancellationDisposition,"preserve")),lte(contractPaymentSchedules.dueDate,today)));
    for(const payment of due)await issueDueContractInvoice(payment.id,AUTOMATED_CONTRACT_BILLING_ACTOR).catch(async error=>{await emitPortalNotification({eventType:"contract-payment-auto-invoice-failed",title:"تعذر إنشاء فاتورة دفعة مستحقة",message:`الدفعة ${payment.id} — ${error instanceof Error?error.message:"خطأ غير معروف"}`,severity:"critical",module:"finance",entityType:"contract-payment",entityId:payment.id,actionView:"operations",targetDepartment:"finance",dedupeKey:`auto-invoice-failed:${payment.id}:${payment.dueDate}`}).catch(()=>undefined)});
  }
  const [canReadFinance,canRecordPayment,canReadContracts]=await Promise.all([hasPortalPermission(access,"finance","read"),hasPortalPermission(access,"finance","pay"),hasPortalPermission(access,"contracts","read")]);
  const [contracts,paymentRows,professions,contacts,banks,paymentAccounts,financeRows]=await Promise.all([db.select().from(workforceContracts).orderBy(asc(workforceContracts.startDate)),db.select().from(contractPaymentSchedules).orderBy(asc(contractPaymentSchedules.dueDate),asc(contractPaymentSchedules.installmentNumber)),db.select().from(contractProfessions),db.select().from(clientContacts),canRecordPayment?db.select().from(bankAccounts).where(eq(bankAccounts.status,"active")).orderBy(asc(bankAccounts.bankName)):Promise.resolve([]),canRecordPayment?db.select().from(chartOfAccounts).where(and(eq(chartOfAccounts.status,"active"),eq(chartOfAccounts.accountType,"asset"),eq(chartOfAccounts.isPosting,true))).orderBy(asc(chartOfAccounts.code)):Promise.resolve([]),db.select().from(financialRecords).where(isNotNull(financialRecords.contractPaymentScheduleId))]);
  const financialById=new Map(financeRows.map(item=>[item.id,item]));
  const approvedContractIds=new Set(contracts.filter(item=>item.approvedBy).map(item=>item.id));
  const legalReferralRows=await db.select().from(legalReferrals);
  const payments=paymentRows.map(payment=>{const financial=payment.financialRecordId?financialById.get(payment.financialRecordId):null;const invoiceAmountHalalas=financial?.amountHalalas??payment.amountHalalas;const paidAmountHalalas=Math.min(invoiceAmountHalalas,Math.max(0,payment.paidAmountHalalas));const remainingAmountHalalas=Math.max(0,invoiceAmountHalalas-paidAmountHalalas);const referral=legalReferralRows.filter(item=>item.paymentScheduleId===payment.id).sort((a,b)=>b.id-a.id)[0];return{...payment,legalReferralStatus:referral?.status||null,legalRecordId:referral?.legalRecordId||null,invoiceAmountHalalas,paidAmountHalalas,remainingAmountHalalas,isOverdue:approvedContractIds.has(payment.contractId)&&payment.status!=="cancelled"&&!payment.cancellationDisposition?.startsWith("review_")&&remainingAmountHalalas>0&&payment.dueDate<today}});
  const settlementRows=canReadFinance||canRecordPayment||owner(access)?await db.select().from(contractPaymentSettlements).orderBy(asc(contractPaymentSettlements.createdAt),asc(contractPaymentSettlements.id)):[];
  const allocationRows=settlementRows.length?await db.select().from(contractPaymentSettlementAllocations).where(inArray(contractPaymentSettlementAllocations.settlementId,settlementRows.map(item=>item.id))).orderBy(asc(contractPaymentSettlementAllocations.id)):[];
  const clientMobiles=Object.fromEntries(contacts.filter(item=>item.mobile).sort((a,b)=>Number(b.isPrimary)-Number(a.isPrimary)).map(item=>[item.clientId,item.mobile]));
  return jsonNoStore({contracts,payments,professions,clientMobiles,banks,paymentAccounts,settlements:settlementRows,settlementAllocations:allocationRows,canManageContracts:owner(access)||await hasPortalPermission(access,"contracts","write"),canApproveContracts:owner(access),canRefer:owner(access),canInvoice:await hasPortalPermission(access,"finance","write"),canRecordPayment,canReferLegal:owner(access),canShareApprovedContracts:approvedContractSharer(access)&&canReadContracts&&canSharePortalDocuments(access)});
}

export async function POST(request:Request){
  if(rejectCrossSiteRequest(request))return jsonNoStore({error:"مصدر الطلب غير مسموح"},{status:403});
  const access=await requirePortalApiRole(["admin","manager","employee"]);if(!access||!(await hasPortalPermission(access,"finance","write")))return jsonNoStore({error:"غير مصرح بإنشاء الفاتورة"},{status:403});
  const parsed=await readLimitedJson(request,6000);if(!parsed.ok)return parsed.response;const body=parsed.value as Record<string,unknown>;const paymentId=positiveId(body.paymentId);if(!paymentId)return jsonNoStore({error:"الدفعة غير صحيحة"},{status:400});
  const db=getDb();const payment=await db.query.contractPaymentSchedules.findFirst({where:eq(contractPaymentSchedules.id,paymentId)});if(!payment)return jsonNoStore({error:"الدفعة غير موجودة"},{status:404});if(payment.status!=="referred"||payment.invoiceDocumentId)return jsonNoStore({error:"الدفعة لم تُحل للمحاسبة أو سبق إصدار فاتورتها"},{status:409});
  const contract=await db.query.workforceContracts.findFirst({where:eq(workforceContracts.id,payment.contractId)});if(!contract)return jsonNoStore({error:"العقد غير موجود"},{status:404});if(!canInvoiceContractPayment(contract,payment))return jsonNoStore({error:"لا يمكن إصدار فاتورة قبل اعتماد العقد أو بعد إغلاقه"},{status:409});
  const assets=await db.select().from(companyAssets);if(!assets.some(a=>a.slot==="stamp")||!assets.some(a=>a.slot==="signature"))return jsonNoStore({error:"يجب اعتماد الختم والتوقيع قبل إصدار الفاتورة"},{status:409});
  const absenceDeductionHalalas=payment.absenceDeductionHalalas||0;const netSubtotalHalalas=Math.max(0,payment.subtotalHalalas-absenceDeductionHalalas);const netVatHalalas=Math.round(netSubtotalHalalas*payment.vatRateBps/10000);const netAmountHalalas=netSubtotalHalalas+netVatHalalas;
  const purchaser=contract.contractDirection==="dali_purchaser";const referenceCode=makeReference(purchaser?"PAY":"INV");const documentType=purchaser?"payment_voucher":"invoice";const copy=contractInvoicePdfCopy({purchaser,paymentTitle:payment.title,paymentTitleEn:payment.titleEn,installmentNumber:payment.installmentNumber,contractReference:contract.referenceCode,absenceDeductionHalalas});const documentTitle=copy.titleAr;const documentTitleEn=copy.titleEn;const issueDate=new Date().toISOString().slice(0,10);const invoiceDetails=copy.detailsAr;const invoiceDetailsEn=copy.detailsEn;const bytes=await generateIssuedPdf({documentType,referenceCode,clientName:contract.clientName,clientCr:contract.clientCr||undefined,clientVat:contract.clientVat||undefined,title:`${documentTitle} - ${contract.referenceCode}`,titleEn:`${documentTitleEn} - ${contract.referenceCode}`,issueDate,expiryDate:payment.dueDate,amountHalalas:netAmountHalalas,subtotalHalalas:netSubtotalHalalas,vatHalalas:netVatHalalas,vatRateBps:payment.vatRateBps,details:invoiceDetails,detailsEn:invoiceDetailsEn},assets.map(a=>({slot:a.slot as "stamp"|"signature",storageKey:a.storageKey,contentType:a.contentType})));
  const fileName=`${referenceCode}.pdf`;const storageKey=objectKey("issued-pdfs",fileName);await getRuntimeEnv().BUCKET.put(storageKey,bytes,{httpMetadata:{contentType:"application/pdf"},customMetadata:{issuedBy:access.user.email,referenceCode,contractPaymentId:String(payment.id)}});
  try{
    const result=await db.transaction(async tx=>{
      await tx.execute(sql`select id from workforce_contracts where id = ${contract.id} for update`);
      await tx.execute(sql`select id from contract_payment_schedules where id = ${payment.id} for update`);
      const freshContract=await tx.query.workforceContracts.findFirst({where:eq(workforceContracts.id,contract.id)});
      const freshPayment=await tx.query.contractPaymentSchedules.findFirst({where:eq(contractPaymentSchedules.id,payment.id)});
      if(!freshContract||!freshPayment||!canInvoiceContractPayment(freshContract,freshPayment)||freshPayment.amountHalalas!==payment.amountHalalas||freshPayment.dueDate!==payment.dueDate)throw new Error("تغيرت الدفعة أو حالة العقد قبل إصدار الفاتورة؛ حدّث البيانات");
      const[document]=await tx.insert(companyDocuments).values({
        referenceCode,title:documentTitle,category:"finance",documentType,counterparty:contract.clientName,fileName,storageKey,contentType:"application/pdf",sizeBytes:bytes.byteLength,expiryDate:payment.dueDate,source:"generated",
        metadataJson:JSON.stringify({
          clientId:contract.clientId,supplierId:contract.supplierId,contractDirection:contract.contractDirection,contractId:contract.id,contractReference:contract.referenceCode,
          clientCr:contract.clientCr||null,clientVat:contract.clientVat||null,paymentScheduleId:payment.id,installmentNumber:payment.installmentNumber,billingBasis:payment.billingBasis,
          servicePeriod:payment.servicePeriod,issueDate,titleEn:documentTitleEn,details:invoiceDetails,detailsEn:invoiceDetailsEn,absenceDeductionHalalas,amountHalalas:netAmountHalalas,subtotalHalalas:netSubtotalHalalas,
          vatHalalas:netVatHalalas,vatRateBps:payment.vatRateBps,netSubtotalHalalas,netVatHalalas,netAmountHalalas,templateVersion:"letterhead-v5-english-invoice-copy",
        }),createdBy:access.user.email,
      }).returning();
      const[financial]=await tx.insert(financialRecords).values({referenceCode:makeReference("FIN"),category:purchaser?"workforce_supplier_payable":"workforce_invoice",description:`${documentTitle} - ${contract.referenceCode} - ${contract.clientName}`,amountHalalas:netAmountHalalas,subtotalHalalas:netSubtotalHalalas,vatHalalas:netVatHalalas,vatRateBps:payment.vatRateBps,dueDate:payment.dueDate,periodMonth:payment.servicePeriod,contractId:contract.id,contractPaymentScheduleId:payment.id,documentId:document.id,status:"pending",postingStatus:"unposted"}).returning();
      const[updated]=await tx.update(contractPaymentSchedules).set({status:"invoiced",invoiceDocumentId:document.id,financialRecordId:financial.id,invoicedBy:access.user.email,invoicedAt:new Date().toISOString(),updatedAt:new Date().toISOString()}).where(and(eq(contractPaymentSchedules.id,payment.id),eq(contractPaymentSchedules.status,"referred"),eq(contractPaymentSchedules.absenceDeductionHalalas,absenceDeductionHalalas),isNull(contractPaymentSchedules.invoiceDocumentId),isNull(contractPaymentSchedules.financialRecordId))).returning();
      if(!updated)throw new Error("تمت معالجة الدفعة من مستخدم آخر");return{document,financial,payment:updated};
    });
    await auditPortalAction({actorEmail:access.user.email,action:"contract-payment-invoiced",entityType:"contract-payment",entityId:payment.id,before:payment,after:result.payment,correlationId:requestCorrelationId(request)});await emitPortalNotification({eventType:"contract-payment-invoiced",title:"أُصدرت فاتورة دفعة عقد",message:`${referenceCode} - ${contract.clientName} - ${payment.title}`,severity:"success",module:"finance",entityType:"company-document",entityId:result.document.id,actionView:"documents",targetRole:"admin"}).catch(()=>undefined);return jsonNoStore(result,{status:201});
  }catch(error){await getRuntimeEnv().BUCKET.delete(storageKey).catch(()=>undefined);return jsonNoStore({error:error instanceof Error?error.message:"تعذر إصدار الفاتورة"},{status:409})}
}

export async function PATCH(request:Request){
  if(rejectCrossSiteRequest(request))return jsonNoStore({error:"مصدر الطلب غير مسموح"},{status:403});const access=await requirePortalApiRole(["admin","manager","employee"]);if(!access)return jsonNoStore({error:"غير مصرح"},{status:403});const parsed=await readLimitedJson(request,8000);if(!parsed.ok)return parsed.response;const body=parsed.value as Record<string,unknown>;const action=cleanText(body.action,40);const paymentId=positiveId(body.paymentId);const db=getDb();const payment=paymentId?await db.query.contractPaymentSchedules.findFirst({where:eq(contractPaymentSchedules.id,paymentId)}):null;if(!payment)return jsonNoStore({error:"الدفعة غير موجودة"},{status:404});const contract=await db.query.workforceContracts.findFirst({where:eq(workforceContracts.id,payment.contractId)});if(!contract)return jsonNoStore({error:"العقد غير موجود"},{status:404});const now=new Date().toISOString();
  if(action==="review-cancellation") {
    if(!owner(access))return jsonNoStore({error:"اعتماد تسوية الإلغاء للمالك أو مشرف النظام"},{status:403});
    const reason=cleanText(body.reason,1000), subtotalHalalas=Number(body.subtotalHalalas);
    if(reason.length<10)return jsonNoStore({error:"اكتب أساس التسوية والمستند المؤيد"},{status:400});
    try {
      const updated=await db.transaction(async tx=>{
        await tx.execute(sql`select id from workforce_contracts where id = ${contract.id} for update`);
        await tx.execute(sql`select id from contract_payment_schedules where id = ${payment.id} for update`);
        const current=await tx.query.contractPaymentSchedules.findFirst({where:eq(contractPaymentSchedules.id,payment.id)});
        const currentContract=await tx.query.workforceContracts.findFirst({where:eq(workforceContracts.id,contract.id)});
        if(!current || !currentContract?.cancellationEffectiveDate || !current.cancellationDisposition?.startsWith("review_"))throw new Error("الدفعة لا تنتظر تسوية إلغاء");
        if(current.cancellationDisposition!=="review_accrual" || current.invoiceDocumentId || current.financialRecordId || current.paidAmountHalalas)throw new Error("الفاتورة المسجلة تحتاج معالجة مستقلة بإشعار دائن أو تسوية أو استرداد معتمد؛ لا يمكن تعديلها من جدول الدفعات");
        if(!Number.isSafeInteger(subtotalHalalas)||subtotalHalalas<0||subtotalHalalas>current.subtotalHalalas)throw new Error("المبلغ النهائي قبل الضريبة يجب أن يكون بين صفر وقيمة الخدمة الأصلية؛ يسجل التعويض منفصلًا");
        const vatHalalas=Math.round(subtotalHalalas*current.vatRateBps/10000);
        const[row]=await tx.update(contractPaymentSchedules).set({
          cancellationDisposition:subtotalHalalas===0?"cancel_future":"preserve",
          status:subtotalHalalas===0?"cancelled":"due",
          ...(subtotalHalalas>0?{subtotalHalalas,vatHalalas,amountHalalas:subtotalHalalas+vatHalalas,absenceDeductionHalalas:Math.min(current.absenceDeductionHalalas,subtotalHalalas),dueDate:currentContract.cancellationEffectiveDate}:{}),updatedAt:now,
        }).where(eq(contractPaymentSchedules.id,payment.id)).returning();
        return row;
      });
      await auditPortalAction({actorEmail:access.user.email,action:"contract-cancellation-accrual-approved",entityType:"contract-payment",entityId:payment.id,before:payment,after:updated,reason});
      await emitPortalNotification({eventType:"contract-cancellation-accrual-approved",title:"اعتمدت التسوية النهائية لخدمة العقد",message:`${contract.referenceCode} — ${reason}`,severity:"info",module:"finance",entityType:"contract-payment",entityId:payment.id,actionView:"contractual-documents",targetDepartment:"finance"}).catch(()=>undefined);
      return jsonNoStore({payment:updated});
    } catch(error) { return jsonNoStore({error:error instanceof Error?error.message:"تعذر اعتماد التسوية"},{status:409}); }
  }
  if(action==="refer-accounting"){
    if(!owner(access))return jsonNoStore({error:"إحالة الدفعة للمحاسبة من صلاحيات المالك فقط"},{status:403});if(!canInvoiceContractPayment(contract,payment))return jsonNoStore({error:"لا يمكن إحالة دفعة للمحاسبة قبل اعتماد العقد أو بعد إغلاقه"},{status:409});if(!["due","scheduled"].includes(payment.status)||payment.dueDate>now.slice(0,10))return jsonNoStore({error:"لا يمكن إحالة دفعة لم يحن موعدها أو تمت معالجتها"},{status:409});const updated=await db.transaction(async tx=>{
      await tx.execute(sql`select id from workforce_contracts where id = ${contract.id} for update`);
      await tx.execute(sql`select id from contract_payment_schedules where id = ${payment.id} for update`);
      const currentContract=await tx.query.workforceContracts.findFirst({where:eq(workforceContracts.id,contract.id)});
      const current=await tx.query.contractPaymentSchedules.findFirst({where:eq(contractPaymentSchedules.id,payment.id)});
      if(!currentContract||!current||!canInvoiceContractPayment(currentContract,current)||current.dueDate>now.slice(0,10))return null;
      const[row]=await tx.update(contractPaymentSchedules).set({status:"referred",referredBy:access.user.email,referredAt:now,updatedAt:now}).where(and(eq(contractPaymentSchedules.id,payment.id),inArray(contractPaymentSchedules.status,["scheduled","due"]))).returning();return row;
    });if(!updated)return jsonNoStore({error:"تغيرت حالة الدفعة"},{status:409});await auditPortalAction({actorEmail:access.user.email,action:"contract-payment-referred",entityType:"contract-payment",entityId:payment.id,before:payment,after:updated,correlationId:requestCorrelationId(request)});await emitPortalNotification({eventType:"contract-payment-referred",title:"دفعة عقد محالة لإصدار فاتورة",message:`${contract.referenceCode} - ${contract.clientName} - ${payment.title}`,severity:"warning",module:"finance",entityType:"contract-payment",entityId:payment.id,actionView:"finance",targetDepartment:"finance"}).catch(()=>undefined);return jsonNoStore({payment:updated});
  }
  if(action==="reschedule"){
    if (["cancelled","terminated"].includes(contract.status) || payment.cancellationDisposition) return jsonNoStore({error:"لا يمكن تغيير موعد دفعة عقد مغلق"},{status:409});
    if(!(await hasPortalPermission(access,"finance","write")))return jsonNoStore({error:"تعديل موعد الدفعة يتطلب صلاحية مالية"},{status:403});
    if(!["scheduled","due"].includes(payment.status)||payment.invoiceDocumentId||payment.financialRecordId)return jsonNoStore({error:"لا يمكن تعديل الموعد بعد الإحالة أو إصدار الفاتورة أو تسجيل السداد"},{status:409});
    const dueDate=cleanText(body.dueDate,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(dueDate))return jsonNoStore({error:"تاريخ الاستحقاق غير صحيح"},{status:400});
    const updated=await db.transaction(async tx=>{
      await tx.execute(sql`select id from workforce_contracts where id = ${contract.id} for update`);
      await tx.execute(sql`select id from contract_payment_schedules where id = ${payment.id} for update`);
      const currentContract=await tx.query.workforceContracts.findFirst({where:eq(workforceContracts.id,contract.id)});
      const current=await tx.query.contractPaymentSchedules.findFirst({where:eq(contractPaymentSchedules.id,payment.id)});
      if(!currentContract||!current||["cancelled","terminated"].includes(currentContract.status)||current.cancellationDisposition||current.invoiceDocumentId||current.financialRecordId)return null;
      const[row]=await tx.update(contractPaymentSchedules).set({dueDate,status:dueDate<=now.slice(0,10)?"due":"scheduled",servicePeriod:current.billingBasis==="monthly_salary"?dueDate.slice(0,7):current.servicePeriod,updatedAt:now}).where(and(eq(contractPaymentSchedules.id,payment.id),inArray(contractPaymentSchedules.status,["scheduled","due"]))).returning();return row;
    });
    if(!updated)return jsonNoStore({error:"تغيرت حالة الدفعة قبل الحفظ"},{status:409});
    await auditPortalAction({actorEmail:access.user.email,action:"contract-payment-rescheduled",entityType:"contract-payment",entityId:payment.id,before:payment,after:updated,correlationId:requestCorrelationId(request)});
    await emitPortalNotification({eventType:"contract-payment-rescheduled",title:"عُدّل موعد استحقاق دفعة",message:`${contract.referenceCode} - ${payment.title}: ${payment.dueDate} ← ${dueDate}`,severity:"warning",module:"finance",entityType:"contract-payment",entityId:payment.id,actionView:"finance",targetRole:"admin"}).catch(()=>undefined);
    return jsonNoStore({payment:updated});
  }
  if(action==="mark-paid"||action==="record-settlement"){
    if(!(await hasPortalPermission(access,"finance","pay")))return jsonNoStore({error:"تسجيل السداد يتطلب صلاحية الدفع المالي"},{status:403});
    if(!payment.financialRecordId)return jsonNoStore({error:"لا يمكن تسجيل السداد قبل إصدار الفاتورة أو الاستحقاق"},{status:409});
    const financial=await db.query.financialRecords.findFirst({where:eq(financialRecords.id,payment.financialRecordId)});if(!financial)return jsonNoStore({error:"السجل المالي المرتبط غير موجود"},{status:404});
    const allocations=settlementAllocations(body,Math.max(0,financial.amountHalalas-payment.paidAmountHalalas));
    try{return jsonNoStore(await recordContractPaymentSettlement({paymentId:payment.id,paymentDate:cleanText(body.paymentDate,10)||now.slice(0,10),allocations,notes:cleanText(body.notes,1000)||null,actorEmail:access.user.email,correlationId:requestCorrelationId(request)}),{status:201})}catch(error){return jsonNoStore({error:error instanceof Error?error.message:"تعذر تسجيل السداد"},{status:409})}
  }
  if(action==="reverse-settlement"){
    if(!(await hasPortalPermission(access,"finance","pay")))return jsonNoStore({error:"عكس السداد يتطلب صلاحية الدفع المالي"},{status:403});
    const settlementId=positiveId(body.settlementId);if(!settlementId)return jsonNoStore({error:"حدد سجل السداد المراد عكسه"},{status:400});
    try{return jsonNoStore(await reverseContractPaymentSettlement({paymentId:payment.id,settlementId,reason:cleanText(body.reason,1000),actorEmail:access.user.email,correlationId:requestCorrelationId(request)}))}catch(error){return jsonNoStore({error:error instanceof Error?error.message:"تعذر عكس السداد"},{status:409})}
  }
  if(action==="refer-legal"){
    if(contract.contractDirection==="dali_purchaser")return jsonNoStore({error:"عقد شراء العمالة لا يحال كملف عميل متأخر؛ عالج التزام المورد من المشتريات أو الشؤون القانونية"},{status:409});
    if(!owner(access))return jsonNoStore({error:"إحالة ملف العميل للشؤون القانونية من صلاحيات المالك فقط"},{status:403});
    if(!contract.approvedBy)return jsonNoStore({error:"لا يمكن إحالة عقد غير معتمد إلى الشؤون القانونية"},{status:409});
    const paymentFinancial=payment.financialRecordId?await db.query.financialRecords.findFirst({where:eq(financialRecords.id,payment.financialRecordId)}):null;const invoiceAmountHalalas=paymentFinancial?.amountHalalas??payment.amountHalalas;const remainingAmountHalalas=Math.max(0,invoiceAmountHalalas-payment.paidAmountHalalas);
    if(remainingAmountHalalas<=0||payment.dueDate>=now.slice(0,10))return jsonNoStore({error:"لا يمكن الإحالة القانونية قبل التأخر الفعلي في كامل الدفعة أو جزء منها"},{status:409});
    const reason=cleanText(body.reason,1000);
    if(reason.length<10)return jsonNoStore({error:"اكتب سبب إحالة واضحاً لا يقل عن 10 أحرف"},{status:400});
    const [client,finances,professions,assignments,allPayments]=await Promise.all([
      contract.clientId?db.query.clients.findFirst({where:eq(clients.id,contract.clientId)}):Promise.resolve(null),
      db.select().from(financialRecords).where(eq(financialRecords.contractId,contract.id)),
      db.select().from(contractProfessions).where(eq(contractProfessions.contractId,contract.id)),
      db.select().from(contractWorkerAssignments).where(eq(contractWorkerAssignments.contractId,contract.id)),
      db.select().from(contractPaymentSchedules).where(eq(contractPaymentSchedules.contractId,contract.id)),
    ]);
    const documents=await loadContractLegalDocuments(db,contract,[...finances.map(item=>item.documentId),...allPayments.map(item=>item.invoiceDocumentId)]);
    const allPaymentIds=allPayments.map(item=>item.id);const settlements=allPaymentIds.length?await db.select().from(contractPaymentSettlements).where(inArray(contractPaymentSettlements.paymentScheduleId,allPaymentIds)):[];const settlementIds=settlements.map(item=>item.id);const settlementAllocations=settlementIds.length?await db.select().from(contractPaymentSettlementAllocations).where(inArray(contractPaymentSettlementAllocations.settlementId,settlementIds)):[];
    const workerIds=[...new Set(assignments.map(item=>item.workerId))];
    const linkedWorkers=workerIds.length?await db.select().from(workers).where(inArray(workers.id,workerIds)):[];
    const snapshot={capturedAt:now,referral:{reason,referredBy:access.user.email,paymentId:payment.id,overdueSince:payment.dueDate,invoiceAmountHalalas,paidAmountHalalas:payment.paidAmountHalalas,remainingAmountHalalas},client,contract,documents,payments:allPayments,settlements,settlementAllocations,finances,professions,assignments,workers:linkedWorkers};
    let legal;
    try {
      const result=await db.transaction(async tx=>{
        await tx.execute(sql`select id from workforce_contracts where id = ${contract.id} for update`);
        await tx.execute(sql`select id from contract_payment_schedules where id = ${payment.id} for update`);
        const current=await tx.query.contractPaymentSchedules.findFirst({where:eq(contractPaymentSchedules.id,payment.id)});
        if(!current)throw new Error("الدفعة غير موجودة");
        const currentFinancial=current.financialRecordId?await tx.query.financialRecords.findFirst({where:eq(financialRecords.id,current.financialRecordId)}):null;
        const error=paymentLegalReferralError({...current,amountHalalas:currentFinancial?.amountHalalas??current.amountHalalas},now.slice(0,10));
        if(error)throw new Error(error);
        return registerLegalReferral(tx,{sourceType:"payment",sourceId:payment.id,contractId:contract.id,clientId:contract.clientId,reason,actorEmail:access.user.email,title:`تحصيل الدفعة ${payment.installmentNumber} — ${contract.referenceCode}`,counterparty:contract.clientName,now,snapshot:{...snapshot,referral:{...snapshot.referral,paidAmountHalalas:current.paidAmountHalalas,remainingAmountHalalas:(currentFinancial?.amountHalalas??current.amountHalalas)-current.paidAmountHalalas}}});
      });
      legal=result.matter;
    } catch(error) { return jsonNoStore({error:error instanceof Error?error.message:"تعذر تسجيل الإحالة"},{status:409}); }
    await auditPortalAction({actorEmail:access.user.email,action:"client-file-referred-legal",entityType:"legal-record",entityId:legal.id,after:{...legal,paymentId:payment.id,snapshotCounts:{documents:documents.length,payments:allPayments.length,finances:finances.length,workers:linkedWorkers.length}},reason,correlationId:requestCorrelationId(request)});
    await emitPortalNotification({eventType:"client-file-referred-legal",title:"أُحيل ملف عميل متأخر للشؤون القانونية",message:`${contract.clientName} - ${contract.referenceCode} — المتبقي ${(remainingAmountHalalas/100).toFixed(2)} ر.س — ${documents.length} مرفقات عقد: ${reason}`,severity:"critical",module:"legal",entityType:"legal-record",entityId:legal.id,actionView:"legal",targetDepartment:"legal"}).catch(()=>undefined);
    return jsonNoStore({legalRecord:legal});
  }
  return jsonNoStore({error:"الإجراء غير معروف"},{status:400});
}
