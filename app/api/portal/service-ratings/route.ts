import { desc, isNotNull } from "drizzle-orm";
import { getDb } from "@/db";
import { videoInterviews, visitorConversations } from "@/db/schema";
import { canManagePortalConversations, requirePortalApiRole } from "@/lib/portal-access";
import { jsonNoStore } from "@/lib/security";

export async function GET(){
  const access=await requirePortalApiRole(["admin","manager","employee"]);
  if(!access||!canManagePortalConversations(access))return jsonNoStore({error:"غير مصرح بعرض تقييمات الخدمة"},{status:403});
  const db=getDb();
  const chat=await db.select({referenceCode:visitorConversations.trackingCode,employeeEmail:visitorConversations.assignedTo,employeeRating:visitorConversations.employeeRating,companyRating:visitorConversations.companyRating,comment:visitorConversations.ratingComment,ratedAt:visitorConversations.ratedAt}).from(visitorConversations).where(isNotNull(visitorConversations.ratedAt)).orderBy(desc(visitorConversations.ratedAt)).limit(100);
  const video=await db.select({referenceCode:videoInterviews.referenceCode,employeeEmail:videoInterviews.assignedTo,employeeRating:videoInterviews.employeeRating,companyRating:videoInterviews.companyRating,comment:videoInterviews.ratingComment,ratedAt:videoInterviews.ratedAt}).from(videoInterviews).where(isNotNull(videoInterviews.ratedAt)).orderBy(desc(videoInterviews.ratedAt)).limit(100);
  const ratings=[...chat.map(item=>({...item,channel:"chat" as const})),...video.map(item=>({...item,channel:"video" as const}))].sort((a,b)=>(b.ratedAt||"").localeCompare(a.ratedAt||""));
  const groups=new Map<string,{employeeEmail:string;total:number;count:number;low:number}>();
  for(const item of ratings){if(!item.employeeEmail||!item.employeeRating)continue;const row=groups.get(item.employeeEmail)||{employeeEmail:item.employeeEmail,total:0,count:0,low:0};row.total+=item.employeeRating;row.count+=1;if(item.employeeRating<=2)row.low+=1;groups.set(item.employeeEmail,row)}
  return jsonNoStore({ratings:ratings.slice(0,100),employees:[...groups.values()].map(row=>({...row,average:Number((row.total/row.count).toFixed(2))})),companyAverage:ratings.length?Number((ratings.reduce((sum,item)=>sum+(item.companyRating||0),0)/ratings.length).toFixed(2)):null});
}
