import { and, asc, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { getDb } from "@/db";
import { chartOfAccounts, costCenters, financialRecords, journalEntries, journalLines, workforceContracts } from "@/db/schema";
import { auditPortalAction } from "@/lib/audit";
import { hasPortalPermission, requirePortalApiRole } from "@/lib/portal-access";
import { jsonNoStore, rejectCrossSiteRequest } from "@/lib/security";

function validDate(value:string|null,fallback:string){return value&&/^\d{4}-\d{2}-\d{2}$/.test(value)?value:fallback;}
function clean(value:unknown,length:number){return typeof value==="string"?value.trim().slice(0,length):"";}

export async function GET(request:Request){
  const access=await requirePortalApiRole(["admin","manager","employee"]);if(!access||!(await hasPortalPermission(access,"finance","read")))return jsonNoStore({error:"غير مصرح"},{status:403});
  const url=new URL(request.url);const year=new Date().getUTCFullYear();const from=validDate(url.searchParams.get("from"),`${year}-01-01`);const to=validDate(url.searchParams.get("to"),`${year}-12-31`);if(to<from)return jsonNoStore({error:"تاريخ النهاية يسبق البداية"},{status:400});
  const db=getDb();const [accounts,entries,entriesToDate,contracts,centers,postedRecords]=await Promise.all([
    db.select().from(chartOfAccounts).where(eq(chartOfAccounts.status,"active")).orderBy(asc(chartOfAccounts.code)),
    db.select().from(journalEntries).where(and(eq(journalEntries.status,"posted"),gte(journalEntries.entryDate,from),lte(journalEntries.entryDate,to))).orderBy(journalEntries.entryDate),
    db.select().from(journalEntries).where(and(eq(journalEntries.status,"posted"),lte(journalEntries.entryDate,to))).orderBy(journalEntries.entryDate),
    db.select().from(workforceContracts).orderBy(desc(workforceContracts.id)).limit(1000),
    db.select().from(costCenters).orderBy(costCenters.code).limit(1000),
    db.select().from(financialRecords).where(and(eq(financialRecords.postingStatus,"posted"),gte(financialRecords.dueDate,from),lte(financialRecords.dueDate,to))).limit(5000),
  ]);
  const lines=entries.length?await db.select().from(journalLines).where(inArray(journalLines.journalEntryId,entries.map(item=>item.id))).limit(20000):[];
  const balanceLines=entriesToDate.length?await db.select().from(journalLines).where(inArray(journalLines.journalEntryId,entriesToDate.map(item=>item.id))).limit(30000):[];
  const trialBalance=accounts.map(account=>{const rows=lines.filter(line=>line.accountId===account.id);const debitHalalas=rows.reduce((sum,line)=>sum+line.debitHalalas,0);const creditHalalas=rows.reduce((sum,line)=>sum+line.creditHalalas,0);const netHalalas=account.normalBalance==="debit"?debitHalalas-creditHalalas:creditHalalas-debitHalalas;return {accountId:account.id,code:account.code,nameAr:account.nameAr,accountType:account.accountType,debitHalalas,creditHalalas,netHalalas};}).filter(item=>item.debitHalalas||item.creditHalalas);
  const total=(type:string)=>trialBalance.filter(item=>item.accountType===type).reduce((sum,item)=>sum+item.netHalalas,0);const income={revenueHalalas:total("revenue"),expenseHalalas:total("expense"),netIncomeHalalas:total("revenue")-total("expense")};const balanceTotal=(type:string)=>accounts.filter(account=>account.accountType===type).reduce((sum,account)=>{const rows=balanceLines.filter(line=>line.accountId===account.id);const debit=rows.reduce((value,line)=>value+line.debitHalalas,0);const credit=rows.reduce((value,line)=>value+line.creditHalalas,0);return sum+(account.normalBalance==="debit"?debit-credit:credit-debit);},0);const cumulativeEarnings=balanceTotal("revenue")-balanceTotal("expense");const balanceSheet={assetsHalalas:balanceTotal("asset"),liabilitiesHalalas:balanceTotal("liability"),equityHalalas:balanceTotal("equity"),currentEarningsHalalas:cumulativeEarnings,differenceHalalas:balanceTotal("asset")-balanceTotal("liability")-balanceTotal("equity")-cumulativeEarnings};
  const revenueCategories=new Set(["workforce_invoice","invoice","progress_claim"]);const expenseCategories=new Set(["payment_voucher","worker_expense","expense"]);const profitability=contracts.map(contract=>{const rows=postedRecords.filter(record=>record.contractId===contract.id);const revenueHalalas=rows.filter(record=>revenueCategories.has(record.category)).reduce((sum,record)=>sum+record.amountHalalas,0);const costHalalas=rows.filter(record=>expenseCategories.has(record.category)).reduce((sum,record)=>sum+record.amountHalalas,0);return {contractId:contract.id,referenceCode:contract.referenceCode,clientName:contract.clientName,title:contract.title,revenueHalalas,costHalalas,profitHalalas:revenueHalalas-costHalalas,marginPercent:revenueHalalas?Math.round(((revenueHalalas-costHalalas)/revenueHalalas)*10000)/100:0,costCenter:centers.find(center=>center.contractId===contract.id)||null};}).filter(item=>item.revenueHalalas||item.costHalalas);
  return jsonNoStore({from,to,trialBalance,income,balanceSheet,profitability,costCenters:centers,postedEntries:entries.length});
}

export async function POST(request:Request){
  if(rejectCrossSiteRequest(request))return jsonNoStore({error:"مصدر الطلب غير مسموح"},{status:403});const access=await requirePortalApiRole(["admin","manager","employee"]);if(!access||!(await hasPortalPermission(access,"finance","write")))return jsonNoStore({error:"غير مصرح"},{status:403});
  try{const payload=await request.json() as Record<string,unknown>;const contractId=Number(payload.contractId);const code=clean(payload.code,30).toUpperCase();const nameAr=clean(payload.nameAr,160);if(!Number.isSafeInteger(contractId)||contractId<1||!code||nameAr.length<2)return jsonNoStore({error:"بيانات مركز التكلفة غير صحيحة"},{status:400});const db=getDb();const contract=await db.query.workforceContracts.findFirst({where:eq(workforceContracts.id,contractId)});if(!contract)return jsonNoStore({error:"العقد غير موجود"},{status:404});const [saved]=await db.insert(costCenters).values({code,nameAr,centerType:"contract",contractId,createdBy:access.user.email}).returning();await auditPortalAction({actorEmail:access.user.email,action:"cost-center-created",entityType:"cost-center",entityId:saved.id,after:saved});return jsonNoStore({costCenter:saved},{status:201});}catch(error){const message=error instanceof Error?error.message:"تعذّر إنشاء مركز التكلفة";return jsonNoStore({error:message.toLowerCase().includes("unique")?"العقد أو الرمز مرتبط بمركز تكلفة مسبقًا":message},{status:message.toLowerCase().includes("unique")?409:400});}
}
