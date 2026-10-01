import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { portalSettings, portalNotifications, workforceContracts } from "@/db/schema";
import { hasPortalPermission, requirePortalApiRole } from "@/lib/portal-access";
import { auditPortalAction } from "@/lib/audit";
import { emitPortalNotification } from "@/lib/portal-notifications";
import { clauseDefaultsKey } from "@/lib/contract-clause-defaults";
import { listClauseReviews, readClauseReview, reviewKey } from "@/lib/legal-clause-reviews";
import { validateContractClauses } from "@/lib/workforce-contract-clauses";
import { jsonNoStore, readLimitedJson, rejectCrossSiteRequest } from "@/lib/security";
export async function GET() {
  const actor=await requirePortalApiRole(["admin","manager","employee"]);
  if(!actor) return jsonNoStore({error:"غير مصرح"},{status:403});
  const canReadLegal=await hasPortalPermission(actor,"legal","read"), canReadContracts=await hasPortalPermission(actor,"contracts","read");
  if(!canReadLegal && !canReadContracts) return jsonNoStore({error:"غير مصرح بعرض المراجعات"},{status:403});
  const canReview=canReadLegal && await hasPortalPermission(actor,"legal","write");
  const reviews=await listClauseReviews();
  return jsonNoStore({reviews:canReadLegal ? reviews : reviews.filter(item=>item.createdBy===actor.user.email),canReview});
}
export async function PATCH(request:Request) {
  if(rejectCrossSiteRequest(request)) return jsonNoStore({error:"مصدر الطلب غير مسموح"},{status:403});
  const actor=await requirePortalApiRole(["admin","manager","employee"]);
  if(!actor || !await hasPortalPermission(actor,"legal","read") || !await hasPortalPermission(actor,"legal","write")) return jsonNoStore({error:"المراجعة تتطلب صلاحية الشؤون القانونية"},{status:403});
  const parsed=await readLimitedJson(request,30_000);if(!parsed.ok)return parsed.response;
  const payload=parsed.value as Record<string,unknown>;
  if(!payload || typeof payload.id!=="string" || !/^[a-zA-Z0-9-]{1,90}$/.test(payload.id) || typeof payload.recommendation!=="string" || payload.recommendation.trim().length<10 || payload.recommendation.length>6000 || !["approve","reject","recommend"].includes(String(payload.action))) return jsonNoStore({error:"اختر القرار وأدخل توصية قانونية واضحة"},{status:400});
  const db=getDb(),key=reviewKey(payload.id),now=new Date().toISOString();
  const result=await db.transaction(async tx=>{
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${key}))`);
    const saved=await tx.query.portalSettings.findFirst({where:eq(portalSettings.key,key)});
    if(!saved)return {error:"المراجعة غير موجودة",status:404};
    const review=readClauseReview(saved.valueJson);
    if(review.status!=="pending" || payload.revision!==review.revision)return {error:"تغيرت المراجعة؛ أعد تحميلها",status:409};
    if(review.kind==="defaults" && payload.action==="recommend" || review.kind==="contract" && payload.action!=="recommend")return {error:"القرار لا يطابق نوع المراجعة",status:400};
    if(review.kind==="defaults" && payload.action==="approve"){
      const activeKey=clauseDefaultsKey(review.direction);
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${activeKey}))`);
      const current=await tx.query.portalSettings.findFirst({where:eq(portalSettings.key,activeKey)});
      if((current?.updatedAt || "builtin")!==review.baseRevision)return {error:"تغير القالب المعتمد؛ أعد تقديم البنود للمراجعة",status:409};
      const error=validateContractClauses(review.clauses,true);if(error)return {error,status:400};
      await tx.insert(portalSettings).values({key:activeKey,valueJson:JSON.stringify(review.clauses),updatedBy:actor.user.email,updatedAt:now}).onConflictDoUpdate({target:portalSettings.key,set:{valueJson:JSON.stringify(review.clauses),updatedBy:actor.user.email,updatedAt:now}});
      const siblings=await listClauseReviews(tx);
      for(const sibling of siblings.filter(item=>item.kind==="defaults" && item.direction===review.direction && item.status==="pending" && item.id!==review.id))await tx.update(portalSettings).set({valueJson:JSON.stringify({...sibling,status:"superseded",revision:now}),updatedBy:actor.user.email,updatedAt:now}).where(eq(portalSettings.key,reviewKey(sibling.id)));
    }
    if(review.kind==="contract"){
      await tx.execute(sql`select id from workforce_contracts where id = ${review.contractId!} for update`);
      const contract=await tx.query.workforceContracts.findFirst({where:eq(workforceContracts.id,review.contractId!)});
      if(!contract || contract.versionNumber!==review.contractVersion)return {error:"هذه التوصية تخص نسخة قديمة من العقد؛ راجع النسخة الحالية",status:409};
    }
    const updated={...review,status:review.kind==="contract" ? "recommended" as const : payload.action==="approve" ? "approved" as const : "rejected" as const,reviewer:actor.user.email,reviewedAt:now,recommendation:payload.recommendation!.toString().trim(),revision:now};
    await tx.update(portalSettings).set({valueJson:JSON.stringify(updated),updatedBy:actor.user.email,updatedAt:now}).where(eq(portalSettings.key,key));
    return {review:updated};
  });
  if("error" in result)return jsonNoStore({error:result.error},{status:result.status});
  await auditPortalAction({actorEmail:actor.user.email,action:"legal-clause-review-completed",entityType:"clause-review",entityId:result.review.id,after:result.review});
  await emitPortalNotification({eventType:"legal-clause-review-completed",title:result.review.kind==="contract" ? "صدرت توصية قانونية للعقد" : result.review.status==="approved" ? "اعتمدت البنود بعد المراجعة القانونية" : "أعيدت البنود الافتراضية للتعديل",message:result.review.reference,module:"contractual-documents",entityType:"clause-review",entityId:result.review.id,actionView:"contractual-documents",targetEmail:result.review.createdBy,severity:"info"});
  await db.update(portalNotifications).set({status:"resolved",updatedAt:now}).where(eq(portalNotifications.dedupeKey,`clause-review:${result.review.id}`));
  // Refresh related pending reminders; history remains available in the review record.
  await db.update(portalSettings).set({updatedAt:"1970-01-01T00:00:00.000Z"}).where(eq(portalSettings.key,"operational-notifications-last-refresh"));
  return jsonNoStore({review:result.review});
}
