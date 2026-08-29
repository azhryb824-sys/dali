import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { payrollItems, payrollRuns } from "@/db/schema";
import { hasPortalPermission, requirePortalApiRole } from "@/lib/portal-access";
const csv = (value: unknown) =>
  `"${String(value ?? "").replaceAll('"', '""')}"`;
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await requirePortalApiRole(["admin", "manager", "employee"]);
  if (!actor || !(await hasPortalPermission(actor, "employees", "approve")))
    return new Response("غير مصرح بتصدير ملف حماية الأجور", { status: 403 });
  const runId = Number((await params).id),
    db = getDb(),
    run = await db.query.payrollRuns.findFirst({
      where: eq(payrollRuns.id, runId),
    });
  if (!run) return new Response("المسير غير موجود", { status: 404 });
  const items = await db
    .select()
    .from(payrollItems)
    .where(eq(payrollItems.payrollRunId, run.id));
  if (items.some((item) => !item.ibanSnapshot))
    return new Response(
      "لا يمكن إنشاء الملف: يوجد موظف دون آيبان مجمد في المسير",
      { status: 409 },
    );
  const rows = [
      [
        "EMPLOYEE_NUMBER",
        "EMPLOYEE_NAME",
        "IBAN",
        "NET_AMOUNT_SAR",
        "PERIOD",
        "PAYMENT_DATE",
        "STATUS",
        "REFERENCE",
      ],
      ...items
        .filter((item) => item.paymentStatus !== "excluded")
        .map((item) => [
          item.employeeNumberSnapshot || item.employeeId,
          item.employeeNameSnapshot || "",
          item.ibanSnapshot || "",
          (item.netPayHalalas / 100).toFixed(2),
          run.periodMonth,
          run.paymentDate,
          item.paymentStatus,
          item.paymentReference || "",
        ]),
    ],
    content = "\uFEFF" + rows.map((row) => row.map(csv).join(",")).join("\r\n");
  return new Response(content, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="WPS-${run.runNumber}.csv"`,
      "cache-control": "private, no-store",
    },
  });
}
