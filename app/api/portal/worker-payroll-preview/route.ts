import { getDb } from "@/db";
import { calculateWorkerSalary } from "@/lib/worker-payroll";
import { WorkflowError } from "@/lib/quote-request-workflow";
import { hasPortalPermission, requirePortalApiRole } from "@/lib/portal-access";
import { jsonNoStore } from "@/lib/security";
export async function GET(request: Request) {
    const access = await requirePortalApiRole(["admin", "manager", "employee"]);
    if (!access || !await hasPortalPermission(access, "finance", "read"))
        return jsonNoStore({ error: "غير مصرح" }, { status: 403 });
    const p = new URL(request.url).searchParams;
    try {
        return jsonNoStore(await calculateWorkerSalary(getDb(), Number(p.get("workerId")), Number(p.get("contractId")), p.get("month") || ""));
    }
    catch (error) {
        return jsonNoStore({ error: error instanceof WorkflowError ? error.message : "تعذر احتساب الراتب" }, { status: error instanceof WorkflowError ? error.status : 500 });
    }
}
