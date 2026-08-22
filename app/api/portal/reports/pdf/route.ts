import { getDb } from "@/db";
import { companyAssets } from "@/db/schema";
import { generateFinancialReportPdf } from "@/lib/pdf-generator";
import { auditPortalAction } from "@/lib/audit";
import { hasPortalPermission, requirePortalApiRole } from "@/lib/portal-access";
import { GET as getReport } from "../route";
import { attachmentHeaders } from "@/lib/company-documents";

export async function GET(request:Request){
  const access=await requirePortalApiRole(["admin","manager","employee"]);if(!access||!(await hasPortalPermission(access,"finance","read")))return Response.json({error:"غير مصرح"},{status:403});
  const url=new URL(request.url);const reportResponse=await getReport(new Request(`https://reports.local/api/portal/reports?${url.searchParams.toString()}`));if(!reportResponse.ok)return reportResponse;const report=await reportResponse.json() as {from:string;to:string;trialBalance:Array<{code:string;nameAr:string;debitHalalas:number;creditHalalas:number;netHalalas:number}>;income:{revenueHalalas:number;expenseHalalas:number;netIncomeHalalas:number};balanceSheet:{assetsHalalas:number;liabilitiesHalalas:number;equityHalalas:number;currentEarningsHalalas:number;differenceHalalas:number};profitability:Array<{referenceCode:string;clientName:string;revenueHalalas:number;costHalalas:number;profitHalalas:number;marginPercent:number}>};
  const db=getDb();const assetRows=await db.select().from(companyAssets);const assets=assetRows.filter((asset):asset is typeof asset&{slot:"stamp"|"signature"}=>asset.slot==="stamp"||asset.slot==="signature");const referenceCode=`RPT-${report.from.replaceAll("-","")}-${report.to.replaceAll("-","")}`;const bytes=await generateFinancialReportPdf({...report,referenceCode},assets);await auditPortalAction({actorEmail:access.user.email,action:"financial-report-pdf-generated",entityType:"financial-report",entityId:referenceCode,after:{from:report.from,to:report.to}});return new Response(bytes as BodyInit,{headers:attachmentHeaders(`${referenceCode}.pdf`,"application/pdf")});
}
