import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read=(path)=>fs.readFileSync(new URL(`../${path}`,import.meta.url),"utf8");

test("workforce supervisor has exact movement permissions without approvals",()=>{
  const migration=read("drizzle-pg/0049_workforce_supervision_absence_deductions.sql");
  const users=read("app/api/portal/users/route.ts");
  const dashboard=read("app/portal/PortalDashboard.tsx");
  assert.match(migration,/'workforce_supervisor'/);
  assert.match(migration,/workforce\.read.*workforce\.write.*contracts\.read.*contracts\.write/);
  assert.doesNotMatch(migration,/workforce_supervisor[^\n]*\.(approve|post|pay|administer)/);
  assert.match(users,/workforce_supervisor/);
  assert.match(dashboard,/مشرف العمالة/);
  assert.match(dashboard,/view === "contractual-documents" && canAccessContracts/);
  assert.doesNotMatch(dashboard,/view === "contractual-documents" && canAccessDocuments/);
});

test("supervisor can assign and release individual workers at the contract site",()=>{
  const route=read("app/api/portal/contracts/[id]/workers/route.ts");
  assert.match(route,/hasPortalPermission\(access, "contracts", "write"\)/);
  assert.match(route,/clientSite: contract\.workSite/);
  assert.match(route,/contract-worker-assigned/);
  assert.match(route,/export async function DELETE/);
  assert.match(route,/status: "released"/);
  assert.match(route,/status: "available"/);
  assert.match(route,/assignmentId/);
});

test("owner records named or profession-count absence with an idempotent daily deduction",()=>{
  const route=read("app/api/portal/contracts/[id]/attendance/route.ts");
  const schema=read("db/schema.ts");
  assert.match(route,/owner\(access\)/);
  assert.match(route,/workerId/);
  assert.match(route,/absentCount/);
  assert.match(route,/contractProfessionId/);
  assert.match(route,/Math\.round\(monthlyRate\/30\)/);
  assert.match(route,/absenceDeductionHalalas/);
  assert.match(route,/DEDUCTION_EXCEEDS_PAYMENT/);
  assert.match(route,/dedupeKey/);
  assert.match(route,/export async function DELETE/);
  assert.match(schema,/contractWorkerAbsences/);
  assert.match(schema,/absenceDeductionHalalas/);
});

test("absence deductions reduce invoice subtotal VAT total and financial record",()=>{
  for(const path of ["lib/contract-payment-invoicing.ts","app/api/portal/contract-payments/route.ts"]){
    const source=read(path);
    assert.match(source,/netSubtotalHalalas/);
    assert.match(source,/netVatHalalas/);
    assert.match(source,/netAmountHalalas/);
    assert.match(source,/absenceDeductionHalalas/);
    assert.match(source,/amountHalalas:netAmountHalalas/);
    assert.match(source,/subtotalHalalas:netSubtotalHalalas/);
  }
  const ui=read("app/portal/ContractBillingWorkspace.tsx");
  assert.match(ui,/خصم غياب/);
});

test("contract approval loads active stamps and sends the selected stamp id",()=>{
  const dashboard=read("app/portal/PortalDashboard.tsx");
  const status=read("app/api/portal/contracts/[id]/status/route.ts");
  const stamps=read("app/api/portal/document-stamps/route.ts");
  assert.match(dashboard,/fetch\("\/api\/portal\/document-stamps"/);
  assert.match(dashboard,/stampId/);
  assert.match(dashboard,/لا يوجد ختم اعتماد نشط/);
  assert.match(status,/اختيار ختم الاعتماد إلزامي/);
  assert.match(status,/eq\(documentStamps\.active, true\)/);
  assert.match(stamps,/where\(eq\(documentStamps\.active, true\)\)/);
});


test("document edit buttons open system forms and draft delete actions remain available",()=>{
  const billing=read("app/portal/ContractBillingWorkspace.tsx");
  const operations=read("app/portal/OperationsWorkspace.tsx");
  const letters=read("app/portal/ContractualDocumentsWorkspace.tsx");
  const dashboard=read("app/portal/PortalDashboard.tsx");
  assert.match(billing,/setEditingContract\(contract\)/);
  assert.match(billing,/aria-label="تعديل العقد"/);
  assert.match(billing,/setEditingPayment\(payment\)/);
  assert.match(operations,/setEditingQuote\(quote\)/);
  assert.match(operations,/aria-label="تعديل عرض السعر"/);
  assert.match(letters,/setEditingLetter\(letter\)/);
  assert.match(letters,/aria-label="تعديل الخطاب الرسمي"/);
  assert.match(dashboard,/setShowEditForm\(true\)/);
  assert.match(dashboard,/submitContractEdit/);
  assert.match(billing,/method:"DELETE"/);
  assert.match(operations,/method: "DELETE"/);
  assert.match(letters,/method:"DELETE"/);
  assert.match(billing,/>حذف<\/button>/);
  assert.match(operations,/>حذف<\/button>/);
  assert.match(letters,/>حذف<\/button>/);
});
