import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { companyAssets, companyDocuments, contractPaymentSchedules, financialRecords } from "@/db/schema";
import { auditPortalAction } from "@/lib/audit";
import { makeReference, objectKey } from "@/lib/company-documents";
import { generateIssuedPdf } from "@/lib/pdf-generator";
import { getRuntimeEnv } from "@/lib/runtime-env";

export async function issueDueContractInvoice(paymentId:number,actorEmail:string){
  const db=getDb();
  const payment=await db.query.contractPaymentSchedules.findFirst({where:eq(contractPaymentSchedules.id,paymentId)});
  if(!payment)throw new Error("الدفعة غير موجودة");
  if(payment.invoiceDocumentId)return{alreadyIssued:true,payment};
  if(!["due","referred"].includes(payment.status))throw new Error("لم يحن موعد الدفعة بعد");
  const contract=await db.query.workforceContracts.findFirst({where:(table,{eq})=>eq(table.id,payment.contractId)});
  if(!contract)throw new Error("العقد غير موجود");
  const assets=await db.select().from(companyAssets);
  if(!assets.some(a=>a.slot==="stamp")||!assets.some(a=>a.slot==="signature"))throw new Error("يجب اعتماد الختم والتوقيع قبل إصدار الفاتورة");
  const absenceDeductionHalalas=payment.absenceDeductionHalalas||0;const netSubtotalHalalas=Math.max(0,payment.subtotalHalalas-absenceDeductionHalalas);const netVatHalalas=Math.round(netSubtotalHalalas*payment.vatRateBps/10000);const netAmountHalalas=netSubtotalHalalas+netVatHalalas;
  const purchaser=contract.contractDirection==="dali_purchaser";const referenceCode=makeReference(purchaser?"PAY":"INV");const documentType=purchaser?"payment_voucher":"invoice";const documentTitle=purchaser?`استحقاق مورّد ${payment.title}`:`فاتورة ${payment.title}`;
  const bytes=await generateIssuedPdf({documentType,referenceCode,clientName:contract.clientName,clientCr:contract.clientCr||undefined,clientVat:contract.clientVat||undefined,title:`${documentTitle} - ${contract.referenceCode}`,issueDate:new Date().toISOString().slice(0,10),expiryDate:payment.dueDate,amountHalalas:netAmountHalalas,subtotalHalalas:netSubtotalHalalas,vatHalalas:netVatHalalas,vatRateBps:payment.vatRateBps,details:`خصم غياب العمالة قبل الضريبة: ${(absenceDeductionHalalas/100).toFixed(2)} ر.س.\n`+(purchaser?`استحقاق المورد للدفعة رقم ${payment.installmentNumber} (${payment.title}) من عقد شراء العمالة ${contract.referenceCode}.`:`فاتورة الدفعة رقم ${payment.installmentNumber} (${payment.title}) من العقد ${contract.referenceCode}.`),assets.map(a=>({slot:a.slot as "stamp"|"signature",storageKey:a.storageKey,contentType:a.contentType})));
  const fileName=`${referenceCode}.pdf`;const storageKey=objectKey("issued-pdfs",fileName);
  await getRuntimeEnv().BUCKET.put(storageKey,bytes,{httpMetadata:{contentType:"application/pdf"},customMetadata:{issuedBy:actorEmail,referenceCode,contractPaymentId:String(payment.id),automatic:"true"}});
  try{
    const result=await db.transaction(async tx=>{
      const[document]=await tx.insert(companyDocuments).values({referenceCode,title:documentTitle,category:"finance",documentType,counterparty:contract.clientName,fileName,storageKey,contentType:"application/pdf",sizeBytes:bytes.byteLength,expiryDate:payment.dueDate,source:"generated",metadataJson:JSON.stringify({clientId:contract.clientId,supplierId:contract.supplierId,contractDirection:contract.contractDirection,contractId:contract.id,contractReference:contract.referenceCode,paymentScheduleId:payment.id,installmentNumber:payment.installmentNumber,billingBasis:payment.billingBasis,servicePeriod:payment.servicePeriod,automaticAtDueDate:true,absenceDeductionHalalas,netSubtotalHalalas,netVatHalalas,netAmountHalalas}),createdBy:actorEmail}).returning();
      const[financial]=await tx.insert(financialRecords).values({referenceCode:makeReference("FIN"),category:purchaser?"workforce_supplier_payable":"workforce_invoice",description:`${documentTitle} - ${contract.referenceCode} - ${contract.clientName}`,amountHalalas:netAmountHalalas,subtotalHalalas:netSubtotalHalalas,vatHalalas:netVatHalalas,vatRateBps:payment.vatRateBps,dueDate:payment.dueDate,periodMonth:payment.servicePeriod,contractId:contract.id,documentId:document.id,status:"pending",postingStatus:"unposted"}).returning();
      const[updated]=await tx.update(contractPaymentSchedules).set({status:"invoiced",invoiceDocumentId:document.id,financialRecordId:financial.id,invoicedBy:actorEmail,invoicedAt:new Date().toISOString(),updatedAt:new Date().toISOString()}).where(and(eq(contractPaymentSchedules.id,payment.id),isNull(contractPaymentSchedules.invoiceDocumentId))).returning();
      if(!updated)throw new Error("سبق إصدار فاتورة الدفعة");return{document,financial,payment:updated,contract};
    });
    await auditPortalAction({actorEmail,action:"contract-payment-auto-invoiced",entityType:"contract-payment",entityId:payment.id,before:payment,after:result.payment});
    return result;
  }catch(error){await getRuntimeEnv().BUCKET.delete(storageKey).catch(()=>undefined);throw error}
}
