import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  companyAssets,
  employees,
  payrollItems,
  payrollRuns,
} from "@/db/schema";
import { generateIssuedPdf } from "@/lib/pdf-generator";
import { hasPortalPermission, requirePortalApiRole } from "@/lib/portal-access";
import { attachmentHeaders } from "@/lib/company-documents";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await requirePortalApiRole(["admin", "manager", "employee"]);
  if (!actor) return new Response("غير مصرح", { status: 403 });
  const itemId = Number((await params).id),
    db = getDb(),
    item = await db.query.payrollItems.findFirst({
      where: eq(payrollItems.id, itemId),
    });
  if (!item) return new Response("بند الراتب غير موجود", { status: 404 });
  const [run, employee] = await Promise.all([
    db.query.payrollRuns.findFirst({
      where: eq(payrollRuns.id, item.payrollRunId),
    }),
    db.query.employees.findFirst({ where: eq(employees.id, item.employeeId) }),
  ]);
  if (!run || !employee)
    return new Response("بيانات المسير غير مكتملة", { status: 404 });
  const canRead = await hasPortalPermission(actor, "employees", "read"),
    self =
      employee.portalUserEmail?.toLowerCase() ===
      actor.user.email.toLowerCase();
  if (!canRead && !self)
    return new Response("غير مصرح بعرض القسيمة", { status: 403 });
  const assets = await db.select().from(companyAssets),
    gross = item.baseSalaryHalalas + item.allowancesHalalas + item.bonusHalalas,
    details = [
      `رقم الموظف: ${item.employeeNumberSnapshot || employee.employeeNumber}`,
      `الفترة: ${run.periodMonth}`,
      `الراتب الأساسي: ${(item.baseSalaryHalalas / 100).toFixed(2)} ر.س`,
      `البدلات: ${(item.allowancesHalalas / 100).toFixed(2)} ر.س`,
      `المكافآت: ${(item.bonusHalalas / 100).toFixed(2)} ر.س`,
      `إجمالي الاستحقاق: ${(gross / 100).toFixed(2)} ر.س`,
      `التأمينات - حصة الموظف: ${(item.gosiEmployeeHalalas / 100).toFixed(2)} ر.س`,
      `الإجازة دون راتب: ${(item.unpaidLeaveDeductionHalalas / 100).toFixed(2)} ر.س`,
      `إجمالي الخصومات: ${(item.deductionsHalalas / 100).toFixed(2)} ر.س`,
      `صافي الراتب: ${(item.netPayHalalas / 100).toFixed(2)} ر.س`,
      `البنك: ${item.bankNameSnapshot || "غير مسجل"}`,
      `الآيبان المجمد عند إنشاء المسير: ${item.ibanSnapshot || "غير مسجل"}`,
      `حالة التحويل: ${item.paymentStatus}${item.paymentReference ? ` - المرجع: ${item.paymentReference}` : ""}`,
    ].join("\n");
  const bytes = await generateIssuedPdf(
    {
      documentType: "payslip",
      referenceCode: `${run.runNumber}-${item.employeeNumberSnapshot || item.employeeId}`,
      clientName: item.employeeNameSnapshot || employee.fullName,
      title: `قسيمة راتب ${run.periodMonth}`,
      issueDate: run.paymentDate,
      amountHalalas: item.netPayHalalas,
      subtotalHalalas: gross,
      details,
    },
    assets
      .filter((asset) => asset.slot === "stamp" || asset.slot === "signature")
      .map((asset) => ({
        slot: asset.slot as "stamp" | "signature",
        storageKey: asset.storageKey,
        contentType: asset.contentType,
      })),
  );
  return new Response(bytes as BodyInit, {
    headers: attachmentHeaders(
      `payslip-${run.periodMonth}-${item.employeeNumberSnapshot || item.employeeId}.pdf`,
      "application/pdf",
    ),
  });
}
