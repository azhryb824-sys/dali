import { and, desc, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { bankAccounts, chartOfAccounts, complianceObligations, employees, financialRecords, governmentPaymentRequests, governmentSites, journalEntries } from "@/db/schema";
import { createDraftJournal } from "@/lib/accounting";
import { auditPortalAction } from "@/lib/audit";
import { decryptCredential, encryptCredential } from "@/lib/credential-vault";
import { emitPortalNotification } from "@/lib/portal-notifications";
import { hasPortalPermission, requirePortalApiRole } from "@/lib/portal-access";
import { jsonNoStore, rejectCrossSiteRequest, requestCorrelationId } from "@/lib/security";

const clean=(value:unknown,max:number)=>typeof value==="string"?value.trim().slice(0,max):"";
const id=(value:unknown)=>{const n=Number(value);return Number.isSafeInteger(n)&&n>0?n:0};
const owner=(access:NonNullable<Awaited<ReturnType<typeof requirePortalApiRole>>>)=>access.role==="admin"||access.functionalRoles.some(role=>role==="system_owner"||role==="system_admin");
const reference=()=>`GOV-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0,5).toUpperCase()}`;

async function permitted(write=false){const access=await requirePortalApiRole(["admin","manager","employee"]);if(!access)return null;if(owner(access))return access;return await hasPortalPermission(access,"government",write?"write":"read")?access:null;}

export async function GET(request:Request){const access=await permitted();if(!access)return jsonNoStore({error:"غير مصرح"},{status:403});const correlationId=requestCorrelationId(request);try{const db=getDb();const[sites,payments,obligations,staff,banks]=await Promise.all([db.select().from(governmentSites).where(eq(governmentSites.status,"active")).orderBy(governmentSites.name),db.select().from(governmentPaymentRequests).orderBy(desc(governmentPaymentRequests.createdAt)).limit(500),db.select().from(complianceObligations).orderBy(complianceObligations.expiryDate).limit(1000),db.select().from(employees).where(isNull(employees.archivedAt)).orderBy(employees.fullName).limit(2000),db.select().from(bankAccounts).where(eq(bankAccounts.status,"active")).orderBy(bankAccounts.bankName)]);const renewalItems=staff.flatMap(employee=>[{key:`employee-${employee.id}-iqama`,employeeId:employee.id,employeeNumber:employee.employeeNumber,employeeName:employee.fullName,kind:"iqama",label:"تجديد الإقامة",expiryDate:employee.iqamaExpiry,actionUrl:"https://muqeem.sa/",platform:"مقيم"},...(employee.sponsorshipType==="dali"?[{key:`employee-${employee.id}-contract`,employeeId:employee.id,employeeNumber:employee.employeeNumber,employeeName:employee.fullName,kind:"employment_contract",label:"تجديد عقد العمل",expiryDate:employee.contractEndDate,actionUrl:"https://www.qiwa.sa/",platform:"قوى"},{key:`employee-${employee.id}-work-permit`,employeeId:employee.id,employeeNumber:employee.employeeNumber,employeeName:employee.fullName,kind:"work_permit",label:"تجديد رخصة العمل",expiryDate:employee.workPermitExpiry,actionUrl:"https://www.qiwa.sa/",platform:"قوى"}]:[])]).filter(item=>item.expiryDate).sort((a,b)=>String(a.expiryDate).localeCompare(String(b.expiryDate)));return jsonNoStore({banks,sites:sites.map(site=>({...site,usernameEnvelope:undefined,passwordEnvelope:undefined,hasUsername:Boolean(site.usernameEnvelope),hasPassword:Boolean(site.passwordEnvelope)})),payments,obligations,renewalItems,canReveal:owner(access),canPay:owner(access),canWrite:owner(access)||await hasPortalPermission(access,"government","write")});}catch(error){console.error("government-affairs-load-failed",{correlationId,error});return jsonNoStore({error:"تعذر تحميل العلاقات الحكومية بسبب عدم توافق قاعدة البيانات",correlationId},{status:500});}}

export async function POST(request:Request){if(rejectCrossSiteRequest(request))return jsonNoStore({error:"مصدر الطلب غير مسموح"},{status:403});const access=await permitted(true);if(!access)return jsonNoStore({error:"غير مصرح"},{status:403});try{const payload=await request.json() as Record<string,unknown>;const action=clean(payload.action,40);const db=getDb();const now=new Date().toISOString();
  if(action==="create-site"){const name=clean(payload.name,160),portalUrl=clean(payload.portalUrl,500),username=clean(payload.username,300),password=clean(payload.password,500);if(name.length<2||!/^https:\/\//i.test(portalUrl))return jsonNoStore({error:"اسم الموقع ورابط HTTPS مطلوبان"},{status:400});const[saved]=await db.insert(governmentSites).values({name,portalUrl,usernameEnvelope:username?encryptCredential(username):null,passwordEnvelope:password?encryptCredential(password):null,accountReference:clean(payload.accountReference,200)||null,notes:clean(payload.notes,2000)||null,createdBy:access.user.email,updatedBy:access.user.email,updatedAt:now}).returning();await auditPortalAction({actorEmail:access.user.email,action:"government-site-created",entityType:"government-site",entityId:saved.id,after:{...saved,usernameEnvelope:"[encrypted]",passwordEnvelope:"[encrypted]"},correlationId:requestCorrelationId(request)});return jsonNoStore({site:{...saved,usernameEnvelope:undefined,passwordEnvelope:undefined}},{status:201});}
  if(action==="reveal"){if(!owner(access))return jsonNoStore({error:"عرض بيانات الدخول متاح للمالك أو مشرف النظام فقط"},{status:403});const site=await db.query.governmentSites.findFirst({where:eq(governmentSites.id,id(payload.id))});if(!site)return jsonNoStore({error:"الموقع غير موجود"},{status:404});await auditPortalAction({actorEmail:access.user.email,action:"government-credential-revealed",entityType:"government-site",entityId:site.id,reason:"عرض يدوي مقيد",correlationId:requestCorrelationId(request)});return jsonNoStore({username:decryptCredential(site.usernameEnvelope),password:decryptCredential(site.passwordEnvelope)});}
  if(action==="create-payment"){const serviceName=clean(payload.serviceName,200),amountHalalas=Math.round(Number(payload.amount)*100),sadadNumber=clean(payload.sadadNumber,100),billerNumber=clean(payload.billerNumber,100),dueDate=clean(payload.dueDate,10);if(serviceName.length<2||!Number.isSafeInteger(amountHalalas)||amountHalalas<1||!sadadNumber||!billerNumber||!/^\d{4}-\d{2}-\d{2}$/.test(dueDate))return jsonNoStore({error:"بيانات طلب السداد غير مكتملة"},{status:400});const[saved]=await db.insert(governmentPaymentRequests).values({referenceCode:reference(),governmentSiteId:id(payload.governmentSiteId)||null,serviceName,amountHalalas,sadadNumber,billerNumber,dueDate,notes:clean(payload.notes,1000)||null,requestedBy:access.user.email,updatedAt:now}).returning();await auditPortalAction({actorEmail:access.user.email,action:"government-payment-requested",entityType:"government-payment",entityId:saved.id,after:saved});await emitPortalNotification({eventType:"government-payment-requested",title:"طلب سداد حكومي جديد",message:`${saved.serviceName} — ${(saved.amountHalalas/100).toFixed(2)} ر.س — رقم سداد ${saved.sadadNumber}`,severity:"warning",module:"finance",entityType:"government-payment",entityId:saved.id,actionView:"government",targetRole:"admin"}).catch(()=>undefined);return jsonNoStore({payment:saved},{status:201});}
  return jsonNoStore({error:"العملية غير مدعومة"},{status:400});
}catch(error){return jsonNoStore({error:error instanceof Error?error.message:"تعذر حفظ العملية"},{status:400});}}

export async function PATCH(request:Request){
  if(rejectCrossSiteRequest(request))return jsonNoStore({error:"مصدر الطلب غير مسموح"},{status:403});
  const access=await requirePortalApiRole(["admin","manager","employee"]);if(!access||!owner(access))return jsonNoStore({error:"تأكيد السداد متاح للمالك أو مشرف النظام فقط"},{status:403});
  let journalId=0,financialId=0;
  try{
    const payload=await request.json() as Record<string,unknown>;const paymentId=id(payload.id),bankAccountId=id(payload.bankAccountId),paymentReference=clean(payload.paymentReference,180),now=new Date().toISOString(),db=getDb();
    if(!bankAccountId)return jsonNoStore({error:"اختر الحساب البنكي الذي سُددت منه الخدمة الحكومية"},{status:400});
    const[payment,bank,expenseAccount]=await Promise.all([
      db.query.governmentPaymentRequests.findFirst({where:eq(governmentPaymentRequests.id,paymentId)}),
      db.query.bankAccounts.findFirst({where:and(eq(bankAccounts.id,bankAccountId),eq(bankAccounts.status,"active"))}),
      db.query.chartOfAccounts.findFirst({where:and(eq(chartOfAccounts.code,"5280"),eq(chartOfAccounts.status,"active"))}),
    ]);
    if(!payment||payment.status!=="pending")return jsonNoStore({error:"طلب السداد الحكومي غير متاح للمعالجة"},{status:409});
    if(!bank)return jsonNoStore({error:"الحساب البنكي غير موجود أو غير نشط"},{status:409});
    if(!expenseAccount||!expenseAccount.isPosting)return jsonNoStore({error:"حساب الرسوم الحكومية 5280 غير مهيأ للترحيل"},{status:409});
    const[financial]=await db.insert(financialRecords).values({referenceCode:`FIN-${payment.referenceCode}`,category:"government_fee",subCategory:"government_services",description:`رسوم حكومية — ${payment.serviceName} — مفوتر ${payment.billerNumber} — سداد ${payment.sadadNumber}`,amountHalalas:payment.amountHalalas,subtotalHalalas:payment.amountHalalas,vatHalalas:0,vatRateBps:0,dueDate:payment.dueDate,paymentMethod:"bank_transfer",bankAccountId:bank.id,notes:[payment.notes,paymentReference?`مرجع العملية: ${paymentReference}`:""].filter(Boolean).join("\n")||null,status:"paid",postingStatus:"unposted",updatedAt:now}).returning();financialId=financial.id;
    const journal=await createDraftJournal({entryDate:now.slice(0,10),description:`سداد خدمة حكومية — ${payment.serviceName} — ${payment.referenceCode}`,sourceType:"financial-record",sourceId:String(financial.id),actorEmail:access.user.email,lines:[
      {accountId:expenseAccount.id,debitHalalas:payment.amountHalalas,description:`رسوم حكومية — مفوتر ${payment.billerNumber} — سداد ${payment.sadadNumber}`},
      {accountId:bank.ledgerAccountId,bankAccountId:bank.id,creditHalalas:payment.amountHalalas,description:`سداد من ${bank.bankName} — ${bank.accountCode}${paymentReference?` — ${paymentReference}`:""}`},
    ]});journalId=journal.entry.id;
    const result=await db.transaction(async tx=>{
      await tx.update(financialRecords).set({journalEntryId:journal.entry.id,updatedAt:now}).where(eq(financialRecords.id,financial.id));
      const[updated]=await tx.update(governmentPaymentRequests).set({status:"paid",paidBy:access.user.email,paidAt:now,financialRecordId:financial.id,paymentMethod:"bank_transfer",paymentReference:paymentReference||null,bankAccountId:bank.id,journalEntryId:journal.entry.id,updatedAt:now}).where(and(eq(governmentPaymentRequests.id,payment.id),eq(governmentPaymentRequests.status,"pending"))).returning();
      if(!updated)throw new Error("تمت معالجة الطلب من مستخدم آخر");
      return{payment:updated,financial,journal:journal.entry,bank};
    });
    await auditPortalAction({actorEmail:access.user.email,action:"government-payment-paid",entityType:"government-payment",entityId:payment.id,before:payment,after:result,correlationId:requestCorrelationId(request)});
    await emitPortalNotification({eventType:"government-payment-paid",title:"تم سداد خدمة حكومية",message:`${payment.serviceName} — ${bank.bankName} — القيد ${journal.entry.entryNumber} بانتظار الاعتماد والترحيل`,severity:"success",module:"finance",entityType:"financial-record",entityId:financial.id,actionView:"finance",targetDepartment:"finance"}).catch(()=>undefined);
    return jsonNoStore(result);
  }catch(error){
    const db=getDb();if(journalId)await db.delete(journalEntries).where(eq(journalEntries.id,journalId)).catch(()=>undefined);if(financialId)await db.delete(financialRecords).where(eq(financialRecords.id,financialId)).catch(()=>undefined);
    return jsonNoStore({error:error instanceof Error?error.message:"تعذر تأكيد السداد الحكومي"},{status:400});
  }
}
