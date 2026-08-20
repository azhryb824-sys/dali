import { and, desc, eq, isNull, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { bankAccounts, chartOfAccounts, financialRecords, journalEntries, workforceContracts } from "@/db/schema";
import { createDraftJournal, type JournalLineInput } from "@/lib/accounting";
import { auditPortalAction } from "@/lib/audit";
import { hasPortalPermission, requirePortalApiRole } from "@/lib/portal-access";
import { jsonNoStore, rejectCrossSiteRequest } from "@/lib/security";

function positiveId(value: unknown) { const id=Number(value); return Number.isSafeInteger(id)&&id>0?id:0; }

export async function GET() {
  const access=await requirePortalApiRole(["admin","manager","employee"]);
  if(!access||!(await hasPortalPermission(access,"finance","read")))return jsonNoStore({error:"غير مصرح"},{status:403});
  const db=getDb();
  const [records,entries,contracts]=await Promise.all([
    db.select().from(financialRecords).where(ne(financialRecords.postingStatus,"not_applicable")).orderBy(desc(financialRecords.id)).limit(500),
    db.select().from(journalEntries).orderBy(desc(journalEntries.id)).limit(1000),
    db.select({id:workforceContracts.id,referenceCode:workforceContracts.referenceCode,clientName:workforceContracts.clientName}).from(workforceContracts).orderBy(desc(workforceContracts.id)).limit(500),
  ]);
  return jsonNoStore({records,entries,contracts});
}

export async function POST(request:Request){
  if(rejectCrossSiteRequest(request))return jsonNoStore({error:"مصدر الطلب غير مسموح"},{status:403});
  const access=await requirePortalApiRole(["admin","manager"]);
  if(!access||!(await hasPortalPermission(access,"finance","write")))return jsonNoStore({error:"غير مصرح"},{status:403});
  try{
    const payload=await request.json() as Record<string,unknown>;const recordId=positiveId(payload.recordId);const db=getDb();
    const record=await db.query.financialRecords.findFirst({where:and(eq(financialRecords.id,recordId),isNull(financialRecords.journalEntryId))});
    if(!record)return jsonNoStore({error:"السجل غير موجود أو سبق إنشاء قيده"},{status:409});
    const accounts=await db.select().from(chartOfAccounts).where(and(eq(chartOfAccounts.isPosting,true),eq(chartOfAccounts.status,"active")));
    const account=(code:string)=>accounts.find(item=>item.code===code);let debitCode="";let creditCode="";let description=record.description;
    const isRevenue=["workforce_invoice","invoice","progress_claim"].includes(record.category);const isExpense=["payment_voucher","worker_expense","expense"].includes(record.category);
    if(isRevenue){debitCode="1300";creditCode=record.contractId?"4000":"4100";description=`إثبات إيراد — ${record.description}`;}
    else if(record.category==="receipt_voucher"){debitCode=record.paymentMethod==="cash"?"1100":"1200";creditCode="1300";description=`تحصيل من عميل — ${record.description}`;}
    else if(isExpense){debitCode=record.category==="worker_expense"?"5100":"5200";creditCode=record.paymentMethod==="cash"?"1100":record.paymentMethod==="bank_transfer"?"1200":"2100";description=`إثبات مصروف — ${record.description}`;}
    else return jsonNoStore({error:"هذه الحركة تُرحّل من وحدتها المتخصصة ولا تقبل قيدًا يدويًا هنا"},{status:409});
    let bankAccountId:number|null=null;let bankLedgerAccountId:number|null=null;
    if(debitCode==="1200"||creditCode==="1200"){if(!record.bankAccountId)return jsonNoStore({error:"اختر الحساب البنكي قبل إنشاء القيد"},{status:409});const bank=await db.query.bankAccounts.findFirst({where:and(eq(bankAccounts.id,record.bankAccountId),eq(bankAccounts.status,"active"))});if(!bank)return jsonNoStore({error:"الحساب البنكي غير صالح"},{status:409});bankAccountId=bank.id;bankLedgerAccountId=bank.ledgerAccountId;}
    const debit=debitCode==="1200"&&bankLedgerAccountId?accounts.find(item=>item.id===bankLedgerAccountId):account(debitCode);const credit=creditCode==="1200"&&bankLedgerAccountId?accounts.find(item=>item.id===bankLedgerAccountId):account(creditCode);const taxPayable=account("2300");const taxRecoverable=account("1400");
    if(!debit||!credit||(record.vatHalalas>0&&isRevenue&&!taxPayable)||(record.vatHalalas>0&&isExpense&&!taxRecoverable))return jsonNoStore({error:"يجب تهيئة دليل الحسابات والضريبة قبل إنشاء القيد"},{status:409});
    const subtotal=record.subtotalHalalas||record.amountHalalas-record.vatHalalas;const lines:JournalLineInput[]=isRevenue?[{accountId:debit.id,debitHalalas:record.amountHalalas,description},{accountId:credit.id,creditHalalas:subtotal,description:`إيراد قبل الضريبة — ${record.description}`}]:isExpense?[{accountId:debit.id,debitHalalas:subtotal,description:`مصروف قبل الضريبة — ${record.description}`},{accountId:credit.id,creditHalalas:record.amountHalalas,description}]:[{accountId:debit.id,debitHalalas:record.amountHalalas,description},{accountId:credit.id,creditHalalas:record.amountHalalas,description}];
    if(record.vatHalalas>0&&isRevenue&&taxPayable)lines.push({accountId:taxPayable.id,creditHalalas:record.vatHalalas,description:`ضريبة مخرجات — ${record.description}`});if(record.vatHalalas>0&&isExpense&&taxRecoverable)lines.push({accountId:taxRecoverable.id,debitHalalas:record.vatHalalas,description:`ضريبة مدخلات — ${record.description}`});if(bankAccountId){for(const line of lines){if(line.accountId===bankLedgerAccountId)line.bankAccountId=bankAccountId;}}
    const journal=await createDraftJournal({entryDate:record.dueDate,description,sourceType:"financial-record",sourceId:String(record.id),actorEmail:access.user.email,lines});
    const [updated]=await db.update(financialRecords).set({journalEntryId:journal.entry.id,postingStatus:"draft",updatedAt:new Date().toISOString()}).where(and(eq(financialRecords.id,record.id),isNull(financialRecords.journalEntryId))).returning();
    if(!updated){await db.delete(journalEntries).where(eq(journalEntries.id,journal.entry.id));return jsonNoStore({error:"أنشأ مستخدم آخر قيدًا لهذا السجل"},{status:409});}
    await auditPortalAction({actorEmail:access.user.email,action:"financial-journal-created",entityType:"financial-record",entityId:record.id,before:record,after:updated});return jsonNoStore({record:updated,journal:journal.entry},{status:201});
  }catch(error){return jsonNoStore({error:error instanceof Error?error.message:"تعذّر إنشاء القيد"},{status:400});}
}

export async function PATCH(request:Request){
  if(rejectCrossSiteRequest(request))return jsonNoStore({error:"مصدر الطلب غير مسموح"},{status:403});
  const access=await requirePortalApiRole(["admin","manager"]);if(!access||!(await hasPortalPermission(access,"finance","write")))return jsonNoStore({error:"غير مصرح"},{status:403});
  try{const payload=await request.json() as Record<string,unknown>;const recordId=positiveId(payload.recordId);const db=getDb();const record=await db.query.financialRecords.findFirst({where:eq(financialRecords.id,recordId)});if(!record?.journalEntryId)return jsonNoStore({error:"لا يوجد قيد مرتبط"},{status:404});const journal=await db.query.journalEntries.findFirst({where:eq(journalEntries.id,record.journalEntryId)});if(!journal)return jsonNoStore({error:"القيد المرتبط غير موجود"},{status:404});const postingStatus=journal.status==="posted"?"posted":journal.status==="reversed"?"reversed":"draft";const [updated]=await db.update(financialRecords).set({postingStatus,postedAt:postingStatus==="posted"?journal.postedAt:null,updatedAt:new Date().toISOString()}).where(eq(financialRecords.id,record.id)).returning();await auditPortalAction({actorEmail:access.user.email,action:"financial-posting-synchronized",entityType:"financial-record",entityId:record.id,before:record,after:updated});return jsonNoStore({record:updated});}catch(error){return jsonNoStore({error:error instanceof Error?error.message:"تعذّر مزامنة الترحيل"},{status:400});}
}
