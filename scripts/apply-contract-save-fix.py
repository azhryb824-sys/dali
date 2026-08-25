from __future__ import annotations

from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")


def replace_once(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected one match, found {count}")
    return source.replace(old, new, 1)


def replace_regex_once(source: str, pattern: str, replacement: str, label: str) -> str:
    updated, count = re.subn(pattern, replacement, source, count=1, flags=re.S)
    if count != 1:
        raise RuntimeError(f"{label}: expected one regex match, found {count}")
    return updated


# Shared annual-contract date and percentage rules.
payment_path = "lib/payment-schedules.ts"
payment = read(payment_path)
payment = replace_once(
    payment,
    'export type SeasonType = "regular" | "ramadan" | "hajj";\n',
    'export type SeasonType = "regular" | "ramadan" | "hajj";\n\nexport const ANNUAL_CONTRACT_MONTHS = 12;\n',
    "annual months constant",
)
payment = replace_once(
    payment,
    '''export function annualApprovalSchedule(approvedAt: string, installments: number) {
  const approvalDate = approvedAt.slice(0, 10);
  return Array.from({ length: Math.max(0, installments) }, (_, index) => addUtcMonths(approvalDate, index + 1));
}
''',
    '''export function annualContractEndDate(startDate: string) {
  return addUtcMonths(startDate, ANNUAL_CONTRACT_MONTHS);
}

export function annualInstallmentPercentages(installments = ANNUAL_CONTRACT_MONTHS) {
  const count = Math.max(1, Math.floor(installments));
  const base = Math.floor(10000 / count);
  return Array.from({ length: count }, (_, index) => index === count - 1 ? 10000 - base * (count - 1) : base);
}

export function annualApprovalSchedule(approvedAt: string, installments = ANNUAL_CONTRACT_MONTHS) {
  const approvalDate = approvedAt.slice(0, 10);
  return Array.from({ length: Math.max(0, installments) }, (_, index) => addUtcMonths(approvalDate, index + 1));
}
''',
    "annual schedule helpers",
)
write(payment_path, payment)


# Contract creation: derive annual end date, always create all twelve installments,
# and improve rollback for partial saves without changing the existing workflow.
generate_path = "app/api/portal/documents/generate/route.ts"
generate = read(generate_path)
generate = replace_once(
    generate,
    'import { addUtcMonths, parsePaymentSchedule, validateSeasonalSchedule } from "@/lib/payment-schedules";',
    'import { ANNUAL_CONTRACT_MONTHS, addUtcMonths, annualContractEndDate, annualInstallmentPercentages, parsePaymentSchedule, validateSeasonalSchedule } from "@/lib/payment-schedules";',
    "generate payment imports",
)
generate = replace_once(
    generate,
    '    const endDate = cleanDate(payload.endDate, true);',
    '    let endDate = cleanDate(payload.endDate, true);',
    "mutable contract end date",
)
generate = replace_once(
    generate,
    '''function monthlyDueDates(firstDueDate: string, endDate: string) {
  const dates: string[] = [];
  const [year, month, day] = firstDueDate.split("-").map(Number);
  if (!year || !month || !day) return dates;
  for (let offset = 0; offset < 240; offset += 1) {
    const base = new Date(Date.UTC(year, month - 1 + offset, 1));
    const lastDay = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).getUTCDate();
    const value = `${base.getUTCFullYear()}-${String(base.getUTCMonth() + 1).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
    if (value > endDate) break;
    dates.push(value);
  }
  return dates;
}

''',
    "",
    "remove obsolete variable-length monthly dates",
)
generate = replace_once(
    generate,
    '    const seasonType = payload.seasonType === "ramadan" || payload.seasonType === "hajj" ? payload.seasonType : "regular";\n    const billingMode = quantityMode === "open" ? "actual_usage" : seasonType === "regular" ? "monthly" : "seasonal_installments";',
    '    const seasonType = payload.seasonType === "ramadan" || payload.seasonType === "hajj" ? payload.seasonType : "regular";\n    if (documentType === "workforce_contract" && seasonType === "regular" && startDate) endDate = annualContractEndDate(startDate);\n    const billingMode = quantityMode === "open" ? "actual_usage" : seasonType === "regular" ? "monthly" : "seasonal_installments";',
    "derive annual end date",
)
generate = replace_once(
    generate,
    '''      if (quantityMode === "fixed" && seasonType === "regular") {
        const provisionalFirstDueDate = firstPaymentDueDate || addUtcMonths(issueDate, 1);
        if (!provisionalFirstDueDate || !endDate || provisionalFirstDueDate > endDate) return Response.json({ error: "مدة العقد لا تسمح بإنشاء الدفعة الشهرية الأولى بعد شهر من الاعتماد" }, { status: 400 });
        const monthlySubtotal = professionInputs.reduce((sum, item) => sum + item.requiredCount * item.unitSalaryHalalas, 0);
        const dueDates = monthlyDueDates(provisionalFirstDueDate, endDate);
        if (!dueDates.length) return Response.json({ error: "تعذر إنشاء جدول الدفعات الشهرية من التاريخ المحدد" }, { status: 400 });
        paymentSchedule = dueDates.map((dueDate) => { const vatHalalas = Math.round(monthlySubtotal * vatRateBpsForSchedule / 10000); return { title: `استحقاق رواتب شهر ${dueDate.slice(0,7)}`, dueDate, percentageBps: Math.round(10000 / dueDates.length), subtotalHalalas: monthlySubtotal, vatHalalas, amountHalalas: monthlySubtotal + vatHalalas, billingBasis: "monthly_salary", servicePeriod: dueDate.slice(0,7) }; });
        contractAmountHalalas = monthlySubtotal * dueDates.length;
      } else if (quantityMode === "fixed") {
''',
    '''      if (quantityMode === "fixed" && seasonType === "regular") {
        const provisionalFirstDueDate = firstPaymentDueDate || addUtcMonths(issueDate, 1);
        if (!provisionalFirstDueDate || !endDate) return Response.json({ error: "تعذر حساب مدة العقد السنوي وجدول دفعاته" }, { status: 400 });
        const monthlySubtotal = professionInputs.reduce((sum, item) => sum + item.requiredCount * item.unitSalaryHalalas, 0);
        const dueDates = Array.from({ length: ANNUAL_CONTRACT_MONTHS }, (_, index) => addUtcMonths(provisionalFirstDueDate, index));
        if (dueDates.some((dueDate) => !dueDate)) return Response.json({ error: "تعذر إنشاء الدفعات الشهرية الاثنتي عشرة" }, { status: 400 });
        const percentages = annualInstallmentPercentages(dueDates.length);
        paymentSchedule = dueDates.map((dueDate, index) => {
          const vatHalalas = Math.round(monthlySubtotal * vatRateBpsForSchedule / 10000);
          return {
            title: `الدفعة الشهرية ${index + 1} من ${dueDates.length} — ${dueDate.slice(0, 7)}`,
            dueDate,
            percentageBps: percentages[index],
            subtotalHalalas: monthlySubtotal,
            vatHalalas,
            amountHalalas: monthlySubtotal + vatHalalas,
            billingBasis: "monthly_salary",
            servicePeriod: dueDate.slice(0, 7),
          };
        });
        contractAmountHalalas = monthlySubtotal * ANNUAL_CONTRACT_MONTHS;
      } else if (quantityMode === "fixed") {
''',
    "twelve annual installments",
)
generate = replace_once(
    generate,
    '  let createdClientId: number | null = null;\n  const auxiliaryStorageKeys: string[] = [];',
    '  let createdClientId: number | null = null;\n  let createdSupplierId: number | null = null;\n  let convertedRepresentativeRequestId: number | null = null;\n  const auxiliaryStorageKeys: string[] = [];',
    "rollback tracking variables",
)
generate = replace_once(
    generate,
    '        else [supplier] = await db.insert(suppliers).values({ supplierCode: makeReference("SUP"), legalName: clientName, commercialRegistration: clientCr, vatNumber: clientVat, address: clientAddress, status: "active", createdBy: access.user.email }).returning();',
    '        else { [supplier] = await db.insert(suppliers).values({ supplierCode: makeReference("SUP"), legalName: clientName, commercialRegistration: clientCr, vatNumber: clientVat, address: clientAddress, status: "active", createdBy: access.user.email }).returning(); createdSupplierId = supplier.id; }',
    "track created supplier",
)
generate = replace_once(
    generate,
    '      if (representativeRequestId) await db.update(representativeRequests).set({ status: "converted", updatedAt: new Date().toISOString() }).where(eq(representativeRequests.id, representativeRequestId));',
    '      if (representativeRequestId) { await db.update(representativeRequests).set({ status: "converted", updatedAt: new Date().toISOString() }).where(eq(representativeRequests.id, representativeRequestId)); convertedRepresentativeRequestId = representativeRequestId; }',
    "track representative conversion",
)
generate = replace_once(
    generate,
    '''    if (savedContractId) {
      await db.delete(contractWorkerAssignments).where(eq(contractWorkerAssignments.contractId, savedContractId)).catch(() => undefined);
      await db.delete(contractProfessions).where(eq(contractProfessions.contractId, savedContractId)).catch(() => undefined);
      await db.delete(contractPaymentSchedules).where(eq(contractPaymentSchedules.contractId, savedContractId)).catch(() => undefined);
      await db.delete(workforceContracts).where(eq(workforceContracts.id, savedContractId)).catch(() => undefined);
    }
''',
    '''    if (savedContractId) {
      await db.delete(contractWorkerAssignments).where(eq(contractWorkerAssignments.contractId, savedContractId)).catch(() => undefined);
      await db.delete(contractProfessions).where(eq(contractProfessions.contractId, savedContractId)).catch(() => undefined);
      await db.delete(contractClauses).where(eq(contractClauses.contractId, savedContractId)).catch(() => undefined);
      await db.delete(contractPaymentSchedules).where(eq(contractPaymentSchedules.contractId, savedContractId)).catch(() => undefined);
      await db.delete(workforceContracts).where(eq(workforceContracts.id, savedContractId)).catch(() => undefined);
    }
''',
    "rollback contract clauses",
)
generate = replace_once(
    generate,
    '''    if (createdClientId) await db.delete(clients).where(eq(clients.id, createdClientId)).catch(() => undefined);
    if (storageKey) await getRuntimeEnv().BUCKET.delete(storageKey).catch(() => undefined);
''',
    '''    if (createdClientId) await db.delete(clients).where(eq(clients.id, createdClientId)).catch(() => undefined);
    if (createdSupplierId) await db.delete(suppliers).where(eq(suppliers.id, createdSupplierId)).catch(() => undefined);
    if (convertedRepresentativeRequestId) await db.update(representativeRequests).set({ status: "approved", updatedAt: new Date().toISOString() }).where(eq(representativeRequests.id, convertedRepresentativeRequestId)).catch(() => undefined);
    if (storageKey) await getRuntimeEnv().BUCKET.delete(storageKey).catch(() => undefined);
''',
    "rollback related records",
)
generate = replace_once(
    generate,
    '''    const message = error instanceof Error ? error.message : "";
    return Response.json({ error: message || "تعذّر إصدار ملف PDF حالياً" }, { status: 500 });
''',
    '''    const rawMessage = error instanceof Error ? error.message : "";
    const databaseCode = error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code || "") : "";
    console.error("issued-document-save-failed", { databaseCode, error });
    const safeMessage = rawMessage && /^[\\u0600-\\u06FF]/.test(rawMessage)
      ? rawMessage
      : databaseCode === "23505"
        ? "تعذر الحفظ لوجود سجل آخر بالقيمة المرجعية نفسها. حدّث الصفحة ثم أعد المحاولة."
        : databaseCode === "23503"
          ? "تعذر الحفظ لأن أحد السجلات المرتبطة تغير أو لم يعد موجودًا. حدّث البيانات ثم أعد المحاولة."
          : databaseCode === "42P01" || databaseCode === "42703"
            ? "تعذر حفظ العقد بسبب عدم اكتمال بنية قاعدة البيانات على الخادم."
            : "تعذر إتمام حفظ العقد ومرفقاته. لم يعتمد النظام عملية جزئية. أعد المحاولة بعد تحديث الصفحة.";
    return Response.json({ error: safeMessage }, { status: 500 });
''',
    "friendly contract save error",
)
write(generate_path, generate)


# Approval keeps the current rule (first payment one month after approval), while
# updating every installment title/date/percentage together.
status_path = "app/api/portal/contracts/[id]/status/route.ts"
status = read(status_path)
status = replace_once(
    status,
    'import { annualApprovalSchedule } from "@/lib/payment-schedules";',
    'import { annualApprovalSchedule, annualInstallmentPercentages } from "@/lib/payment-schedules";',
    "status payment imports",
)
status = replace_once(
    status,
    '''      const dueDates = annualApprovalSchedule(now, editable.length);
      for (const [index, payment] of editable.entries()) {
        await db.update(contractPaymentSchedules).set({ dueDate: dueDates[index], servicePeriod: dueDates[index].slice(0, 7), status: "scheduled", updatedAt: now }).where(eq(contractPaymentSchedules.id, payment.id));
      }
''',
    '''      const dueDates = annualApprovalSchedule(now, editable.length);
      const percentages = annualInstallmentPercentages(editable.length);
      for (const [index, payment] of editable.entries()) {
        await db.update(contractPaymentSchedules).set({
          title: `الدفعة الشهرية ${index + 1} من ${editable.length} — ${dueDates[index].slice(0, 7)}`,
          dueDate: dueDates[index],
          percentageBps: percentages[index],
          servicePeriod: dueDates[index].slice(0, 7),
          status: "scheduled",
          updatedAt: now,
        }).where(eq(contractPaymentSchedules.id, payment.id));
      }
''',
    "reschedule every annual installment",
)
write(status_path, status)


# Safe JSON response reader used by portal save operations.
client_api_path = "lib/client-api.ts"
write(client_api_path, '''export async function readApiJson<T>(response: Response): Promise<T> {
  const body = await response.text();
  if (!body.trim()) {
    throw new Error(`لم يُرجع الخادم تفاصيل العملية (HTTP ${response.status}). حدّث الصفحة ثم أعد المحاولة.`);
  }
  try {
    return JSON.parse(body) as T;
  } catch {
    throw new Error(`استجابة الخادم غير مكتملة أو غير صالحة (HTTP ${response.status}). لم يعتبر النظام العملية ناجحة.`);
  }
}
''')


# Contract wizard UX and annual schedule preview.
dashboard_path = "app/portal/PortalDashboard.tsx"
dashboard = read(dashboard_path)
dashboard = replace_once(
    dashboard,
    'import { defaultWorkforceContractClauses, type WorkforceContractClause, type WorkforceContractDirection } from "@/lib/workforce-contract-clauses";\n',
    'import { defaultWorkforceContractClauses, type WorkforceContractClause, type WorkforceContractDirection } from "@/lib/workforce-contract-clauses";\nimport { ANNUAL_CONTRACT_MONTHS, annualContractEndDate, annualInstallmentPercentages } from "@/lib/payment-schedules";\nimport { readApiJson } from "@/lib/client-api";\n',
    "dashboard imports",
)
section_start = dashboard.index("function IssueDocumentModal")
section_end = dashboard.index("function StatusControl", section_start)
prefix = dashboard[:section_start]
section = dashboard[section_start:section_end]
suffix = dashboard[section_end:]
section = replace_once(
    section,
    '  const [firstPaymentDueDate]=useState("");\n  const [contractAmount,setContractAmount]=useState("");',
    '  const [contractStartDate,setContractStartDate]=useState("");\n  const [contractAmount,setContractAmount]=useState("");',
    "contract start date state",
)
section = replace_once(
    section,
    '  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void onSubmit(event.currentTarget); }\n\n  function changeContractDirection',
    '''  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void onSubmit(event.currentTarget); }
  function validateAndSetStep(target: 1 | 2 | 3 | 4) {
    if (target <= step) { setStep(target); return; }
    if (target > step + 1) return;
    const form = document.querySelector<HTMLFormElement>(".issue-modal form");
    const requiredFields = form ? Array.from(form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input[required], select[required], textarea[required]")).filter((field) => field.type !== "hidden" && field.offsetParent !== null) : [];
    const invalid = requiredFields.find((field) => !field.checkValidity());
    if (invalid) { invalid.reportValidity(); invalid.focus(); return; }
    if (step === 1 && seasonType === "regular" && !annualEndDate) {
      const start = form?.elements.namedItem("startDate");
      if (start instanceof HTMLInputElement) { start.setCustomValidity("حدد تاريخ بداية العقد ليحسب النظام تاريخ النهاية السنوي."); start.reportValidity(); start.setCustomValidity(""); start.focus(); }
      return;
    }
    setStep(target);
  }

  function changeContractDirection''',
    "wizard validation",
)
section = replace_once(
    section,
    '  const serializedProfessions = JSON.stringify(professions.map((item) => ({ profession: item.profession === "أخرى" ? (item.customProfession || "").trim() : item.profession, requiredCount: quantityMode==="open"?0:item.requiredCount, unitSalary:item.unitSalary || 0, sponsorshipType:item.sponsorshipType, sponsorName:item.sponsorshipType==="other"?item.sponsorName:null, ajirContractStatus:item.sponsorshipType==="dali"?"not_applicable":item.ajirContractStatus, workerIds: quantityMode==="open"?[]:(selectedWorkers[item.key] || []) })));',
    '''  const annualEndDate = seasonType === "regular" ? annualContractEndDate(contractStartDate) : "";
  const annualMonthlySubtotalHalalas = professions.reduce((sum, item) => sum + (quantityMode === "fixed" ? item.requiredCount : 0) * Math.round((item.unitSalary || 0) * 100), 0);
  const annualVatRateBps = contractVatEnabled ? Math.round((Number(contractVatRate) || 0) * 100) : 0;
  const annualMonthlyVatHalalas = Math.round(annualMonthlySubtotalHalalas * annualVatRateBps / 10000);
  const annualPercentages = annualInstallmentPercentages(ANNUAL_CONTRACT_MONTHS);
  const annualInstallments = Array.from({ length: ANNUAL_CONTRACT_MONTHS }, (_, index) => ({ number: index + 1, percentageBps: annualPercentages[index], subtotalHalalas: annualMonthlySubtotalHalalas, vatHalalas: annualMonthlyVatHalalas, amountHalalas: annualMonthlySubtotalHalalas + annualMonthlyVatHalalas }));
  const serializedProfessions = JSON.stringify(professions.map((item) => ({ profession: item.profession === "أخرى" ? (item.customProfession || "").trim() : item.profession, requiredCount: quantityMode==="open"?0:item.requiredCount, unitSalary:item.unitSalary || 0, sponsorshipType:item.sponsorshipType, sponsorName:item.sponsorshipType==="other"?item.sponsorName:null, ajirContractStatus:item.sponsorshipType==="dali"?"not_applicable":item.ajirContractStatus, workerIds: quantityMode==="open"?[]:(selectedWorkers[item.key] || []) })));''',
    "annual preview calculations",
)
section = replace_once(
    section,
    '{isContract&&<><input type="hidden" name="seasonType" value={seasonType}/><input type="hidden" name="firstPaymentDueDate" value={seasonType==="regular"?firstPaymentDueDate:""}/></>}',
    '{isContract&&<><input type="hidden" name="seasonType" value={seasonType}/><input type="hidden" name="firstPaymentDueDate" value=""/></>}',
    "automatic first payment field",
)
section = replace_once(
    section,
    '{isContract && <div className="contract-wizard-steps"><button type="button" className={step === 1 ? "active" : "done"} onClick={() => setStep(1)}>1 بيانات العقد</button><button type="button" className={step === 2 ? "active" : step > 2 ? "done" : ""} onClick={() => setStep(2)}>2 المهن والأعداد</button><button type="button" className={step === 3 ? "active" : step > 3 ? "done" : ""} onClick={() => setStep(3)}>3 اختيار العمالة</button><button type="button" className={step === 4 ? "active" : ""} onClick={() => setStep(4)}>4 الدفعات والمرفقات</button></div>}',
    '{isContract && <div className="contract-wizard-steps"><button type="button" className={step === 1 ? "active" : "done"} onClick={() => validateAndSetStep(1)}>1 بيانات العقد</button><button type="button" className={step === 2 ? "active" : step > 2 ? "done" : ""} onClick={() => validateAndSetStep(2)}>2 المهن والأعداد</button><button type="button" className={step === 3 ? "active" : step > 3 ? "done" : ""} onClick={() => validateAndSetStep(3)}>3 اختيار العمالة</button><button type="button" className={step === 4 ? "active" : ""} onClick={() => validateAndSetStep(4)}>4 الدفعات والمرفقات</button></div>}',
    "wizard navigation",
)
section = replace_once(
    section,
    '{isContract ? <><label>موقع العمل<input name="workSite" required maxLength={180}/></label><label>بداية العقد<input name="startDate" required type="date"/></label><label>نهاية العقد<input name="endDate" required type="date"/></label></> :',
    '''{isContract ? <><label>موقع العمل<input name="workSite" required maxLength={180}/></label><label>بداية العقد<input name="startDate" required type="date" value={contractStartDate} onChange={event=>setContractStartDate(event.target.value)}/></label>{seasonType==="regular"?<><input name="endDate" type="hidden" value={annualEndDate}/><div className="annual-contract-period"><span>مدة العقد السنوي</span><strong>{annualEndDate?formatDate(annualEndDate):"تُحسب بعد تحديد تاريخ البداية"}</strong><small>يحسب النظام تاريخ النهاية تلقائيًا بعد 12 شهرًا ويظهره في العقد وملف PDF.</small></div></>:<label>نهاية العقد<input name="endDate" required type="date"/></label>}</> :''',
    "automatic annual end date UI",
)
section = replace_once(
    section,
    'seasonType==="regular"?"ينشئ النظام دفعات شهرية تلقائياً من رواتب المهن وتاريخ الاستحقاق المحدد.":',
    'seasonType==="regular"?"ينشئ النظام الدفعات الشهرية الاثنتي عشرة تلقائياً من رواتب المهن، وتُثبت مواعيدها عند اعتماد العقد.":',
    "annual payment heading",
)
section = replace_once(
    section,
    '<span>عدد العمال × راتب العامل × أشهر العقد، وتبدأ الدفعة الأولى بعد شهر من الاعتماد.</span>',
    '<span>عدد العمال × راتب العامل × 12 شهرًا، وتبدأ الدفعة الأولى بعد شهر من اعتماد العقد.</span>',
    "annual calculated value copy",
)
section = replace_once(
    section,
    'seasonType==="regular"?<div className="billing-mode-summary success"><b>فوترة شهرية آلية</b><span>ستُربط كل دفعة برواتب العمالة والضريبة والنظام المالي وفق تاريخ أول استحقاق.</span></div>:<>',
    '''seasonType==="regular"?<div className="annual-payment-plan"><div className="annual-payment-summary"><div><span>قيمة الدفعة الشهرية</span><strong>{formatMoney(annualMonthlySubtotalHalalas+annualMonthlyVatHalalas)}</strong><small>{contractVatEnabled?`تشمل ضريبة ${Number(contractVatRate)||0}%` : "بدون ضريبة"}</small></div><div><span>إجمالي السنة</span><strong>{formatMoney((annualMonthlySubtotalHalalas+annualMonthlyVatHalalas)*ANNUAL_CONTRACT_MONTHS)}</strong><small>{ANNUAL_CONTRACT_MONTHS} دفعة شهرية متساوية</small></div></div><div className="annual-payment-installments">{annualInstallments.map(installment=><article key={installment.number}><span>{installment.number}</span><div><strong>الدفعة الشهرية {installment.number}</strong><small>بعد {installment.number} شهر من اعتماد العقد</small></div><b>{formatMoney(installment.amountHalalas)}</b></article>)}</div><p>يحدد النظام تاريخ كل دفعة تلقائيًا عند اعتماد العقد، ثم يعكس الدفعات كاملة في المالية وملف PDF.</p></div>:<>''',
    "annual twelve-payment preview",
)
section = replace_once(
    section,
    'onClick={() => setStep((step + 1) as 2 | 3 | 4)}>التالي</button>',
    'onClick={() => validateAndSetStep((step + 1) as 2 | 3 | 4)}>التالي</button>',
    "validated next button",
)
dashboard = prefix + section + suffix
# All client portal save paths get a safe parser instead of failing with Unexpected end of JSON input.
dashboard = dashboard.replace("await response.json()", "await readApiJson(response)")
write(dashboard_path, dashboard)


# Apply the same safe response parser to the remaining client-side app forms.
patched_clients = 1
for path in sorted((ROOT / "app").rglob("*.tsx")):
    relative = path.relative_to(ROOT).as_posix()
    if relative == dashboard_path:
        continue
    source = path.read_text(encoding="utf-8")
    if '"use client"' not in source or "await response.json()" not in source:
        continue
    if 'from "@/lib/client-api"' not in source:
        source = replace_once(source, '"use client";\n', '"use client";\n\nimport { readApiJson } from "@/lib/client-api";\n', f"client api import {relative}")
    source = source.replace("await response.json()", "await readApiJson(response)")
    path.write_text(source, encoding="utf-8")
    patched_clients += 1


# Layout styling: readable seasonal rows plus a complete annual schedule preview.
css_path = "app/portal/portal.css"
css = read(css_path)
marker = "/* annual-contract-payment-plan-v1 */"
if marker in css:
    raise RuntimeError("annual contract CSS marker already exists")
css += '''

/* annual-contract-payment-plan-v1 */
.annual-contract-period{grid-column:1/-1;min-height:82px;padding:15px 17px;border:1px solid #c9e2d5;border-radius:12px;background:linear-gradient(135deg,#f2faf6,#fff);display:grid;grid-template-columns:auto 1fr;gap:5px 16px;align-items:center}.annual-contract-period span{font-size:9px;color:#687b73}.annual-contract-period strong{font-size:16px;color:#176f49}.annual-contract-period small{grid-column:1/-1;color:#6d7d76;font-size:8px;line-height:1.7}.annual-payment-plan{display:grid;gap:14px}.annual-payment-summary{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.annual-payment-summary>div{padding:14px;border:1px solid #d8e5df;border-radius:11px;background:#f7fbf9;display:grid;gap:4px}.annual-payment-summary span,.annual-payment-summary small{font-size:8px;color:#718079}.annual-payment-summary strong{font-size:18px;color:#176f49}.annual-payment-installments{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.annual-payment-installments article{min-height:72px;padding:11px;border:1px solid #dce6e2;border-radius:10px;background:#fff;display:grid;grid-template-columns:28px 1fr auto;gap:9px;align-items:center}.annual-payment-installments article>span{width:28px;height:28px;border-radius:50%;background:#001d2d;color:#fff;display:grid;place-items:center;font-size:9px;font-weight:800}.annual-payment-installments article div{display:grid;gap:3px}.annual-payment-installments article strong{font-size:9px;color:#18343f}.annual-payment-installments article small{font-size:7px;color:#7b898f}.annual-payment-installments article>b{font-size:9px;color:#176f49;white-space:nowrap}.annual-payment-plan>p{margin:0;padding:10px 12px;border-radius:8px;background:#edf7f2;color:#2c6e50;font-size:8px;line-height:1.8}.contract-payment-builder article{grid-template-columns:40px minmax(190px,1.45fr) minmax(160px,1fr) minmax(140px,.75fr) auto;gap:12px;padding:15px}.contract-payment-builder input{font-size:11px}.remove-payment{min-width:72px}
@media(max-width:1200px){.contract-payment-builder article{grid-template-columns:40px minmax(0,1fr) minmax(0,1fr);align-items:start}.contract-payment-builder article>.payment-index{grid-row:1/3}.contract-payment-builder article>label:nth-of-type(1){grid-column:2/4}.contract-payment-builder article>label:nth-of-type(2){grid-column:2}.contract-payment-builder article>label:nth-of-type(3){grid-column:3}.contract-payment-builder article>.remove-payment{grid-column:2/4;width:100%}.annual-payment-installments{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:680px){.annual-payment-summary,.annual-payment-installments{grid-template-columns:1fr}.annual-payment-installments article{grid-template-columns:28px 1fr}.annual-payment-installments article>b{grid-column:2}.contract-payment-builder article{grid-template-columns:1fr;padding-top:48px}.contract-payment-builder article>.payment-index{position:absolute;top:11px;left:11px}.contract-payment-builder article>label:nth-of-type(1),.contract-payment-builder article>label:nth-of-type(2),.contract-payment-builder article>label:nth-of-type(3),.contract-payment-builder article>.remove-payment{grid-column:1}.annual-contract-period{grid-template-columns:1fr}}
'''
write(css_path, css)


# Regression tests for annual terms, all installments, safe response parsing and rollback.
test_path = "tests/annual-contract-save-reliability.test.mjs"
write(test_path, '''import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("annual contract end date and all twelve installments are derived by the system", async () => {
  const helpers = await readFile("lib/payment-schedules.ts", "utf8");
  const route = await readFile("app/api/portal/documents/generate/route.ts", "utf8");
  assert.match(helpers, /ANNUAL_CONTRACT_MONTHS = 12/);
  assert.match(helpers, /annualContractEndDate\(startDate: string\)/);
  assert.match(route, /endDate = annualContractEndDate\(startDate\)/);
  assert.match(route, /Array\.from\(\{ length: ANNUAL_CONTRACT_MONTHS \}/);
  assert.match(route, /الدفعة الشهرية \$\{index \+ 1\} من \$\{dueDates\.length\}/);
  assert.match(route, /contractAmountHalalas = monthlySubtotal \* ANNUAL_CONTRACT_MONTHS/);
});

test("annual payment dates, titles and percentages are refreshed together on approval", async () => {
  const route = await readFile("app/api/portal/contracts/[id]/status/route.ts", "utf8");
  assert.match(route, /annualInstallmentPercentages\(editable\.length\)/);
  assert.match(route, /title: `الدفعة الشهرية \$\{index \+ 1\} من \$\{editable\.length\}/);
  assert.match(route, /percentageBps: percentages\[index\]/);
});

test("contract wizard hides manual annual end date and previews every monthly payment", async () => {
  const dashboard = await readFile("app/portal/PortalDashboard.tsx", "utf8");
  const css = await readFile("app/portal/portal.css", "utf8");
  assert.match(dashboard, /seasonType==="regular"\?<><input name="endDate" type="hidden" value=\{annualEndDate\}/);
  assert.match(dashboard, /annualContractEndDate\(contractStartDate\)/);
  assert.match(dashboard, /annualInstallments\.map/);
  assert.match(dashboard, /validateAndSetStep/);
  assert.match(css, /annual-contract-payment-plan-v1/);
  assert.match(css, /annual-payment-installments/);
});

test("save operations handle empty or malformed server responses without raw JSON parser failures", async () => {
  const helper = await readFile("lib/client-api.ts", "utf8");
  const dashboard = await readFile("app/portal/PortalDashboard.tsx", "utf8");
  assert.match(helper, /if \(!body\.trim\(\)\)/);
  assert.match(helper, /استجابة الخادم غير مكتملة أو غير صالحة/);
  assert.match(dashboard, /readApiJson\(response\)/);
  assert.doesNotMatch(dashboard, /await response\.json\(\)/);
});

test("failed contract saves clean dependent contract data and temporary related records", async () => {
  const route = await readFile("app/api/portal/documents/generate/route.ts", "utf8");
  assert.match(route, /delete\(contractClauses\)/);
  assert.match(route, /createdSupplierId/);
  assert.match(route, /convertedRepresentativeRequestId/);
  assert.match(route, /لم يعتمد النظام عملية جزئية/);
});
''')

print({"status": "patched", "clientFiles": patched_clients})
