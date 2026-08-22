"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { workforceProfessions } from "@/lib/workforce-requirements";
import IntegrationManager from "./IntegrationManager";
import ContractBillingWorkspace from "./ContractBillingWorkspace";

type Client = { id: number; clientCode: string; legalName: string; tradeName: string | null; city: string; status: string; ownerEmail: string | null };
type Contact = { id: number; clientId: number; fullName: string; email: string | null; mobile: string | null };
type Opportunity = { id: number; opportunityCode: string; clientId: number | null; title: string; stage: string; expectedValueHalalas: number; probability: number; ownerEmail: string; version: number };
type Quote = { id: number; quoteCode: string; opportunityId: number; versionNumber: number; status: string; issueDate: string; validUntil: string; totalHalalas: number; createdBy: string; recordVersion: number };
type QuoteItem = { id: number; quoteVersionId: number; profession: string; quantity: number; durationMonths: number; unitPriceHalalas: number; lineTotalHalalas: number };
type WorkOrder = { id: number; workOrderCode: string; clientId: number; title: string; workSite: string; startDate: string; endDate: string | null; status: string; version: number };
type Requirement = { id: number; workOrderId: number; profession: string; requiredCount: number; filledCount: number; shiftName: string | null };
type Timesheet = { id: number; timesheetCode: string; workOrderId: number; periodStart: string; periodEnd: string; status: string; version: number };
type CapacityPlan = { id: number; planCode: string; seasonName: string; location: string; profession: string; requiredCount: number; availableCount: number; reservedCount: number; startDate: string; endDate: string; status: string };
type Approval = { id: number; entityType: string; entityId: string; step: string; status: string; requestedBy: string; createdAt: string };
type PrivacyRequest = { id: number; trackingCode: string; requestType: string; fullName: string; email: string; status: string; dueAt: string; assignedTo: string | null };
type ClientUser = { email: string; clientId: number; displayName: string; status: string; canApproveQuotes: boolean; canApproveTimesheets: boolean };
type WorkerUser = { email: string; workerId: number; displayName: string; status: string };
type Worker = { id: number; fullName: string; workerNumber: string; profession: string; status: string; clientId: number | null; workOrderId: number | null };
type OperationsData = { clients: Client[]; contacts: Contact[]; opportunities: Opportunity[]; quotes: Quote[]; quoteItems: QuoteItem[]; workOrders: WorkOrder[]; requirements: Requirement[]; timesheets: Timesheet[]; timeEntries: unknown[]; workers: Worker[]; capacityPlans: CapacityPlan[]; approvals: Approval[]; privacyRequests: PrivacyRequest[]; clientUsers: ClientUser[]; workerUsers: WorkerUser[] };
export type OperationsTab = "crm" | "quotes" | "contracts" | "orders" | "timesheets" | "capacity" | "privacy" | "clients" | "integrations";
type Tab = OperationsTab;
type CreateOperation = (action: string, form: HTMLFormElement, extra?: Record<string, unknown>) => Promise<void>;

const money = (halalas: number) => new Intl.NumberFormat("ar-SA", { style: "currency", currency: "SAR", maximumFractionDigits: 2 }).format(halalas / 100);
const fmt = (value: string) => new Intl.DateTimeFormat("ar-SA", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value.includes("T") ? value : `${value}T00:00:00`));

export default function OperationsWorkspace({ canWrite, isAdmin, initialTab = "crm", initialQuery = "", onCreateContract }: { canWrite: boolean; isAdmin: boolean; initialTab?: OperationsTab; initialQuery?: string; onCreateContract: () => void }) {
  const [data, setData] = useState<OperationsData | null>(null);
  const [tab, setTab] = useState<Tab>(initialTab);
  const [query, setQuery] = useState(initialQuery);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const response = await fetch("/api/portal/operations?limit=100", { cache: "no-store" });
    const result = await response.json() as OperationsData & { error?: string };
    if (!response.ok) throw new Error(result.error || "تعذّر تحميل مساحة التشغيل");
    setData(result);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load().catch((error) => setNotice(error instanceof Error ? error.message : "تعذّر التحميل"));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function create(action: string, form: HTMLFormElement, extra: Record<string, unknown> = {}) {
    setBusy(action);
    setNotice("");
    try {
      const payload = { action, idempotencyKey: crypto.randomUUID(), ...Object.fromEntries(new FormData(form).entries()), ...extra };
      const response = await fetch("/api/portal/operations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "تعذّر إنشاء السجل");
      form.reset();
      setNotice("تم حفظ السجل وربطه بسير العمل والإشعارات.");
      await load();
    } catch (error) { setNotice(error instanceof Error ? error.message : "تعذّر تنفيذ العملية"); }
    finally { setBusy(""); }
  }

  async function createQuoteRevision(quote: Quote) {
    if (!window.confirm(`إنشاء إصدار جديد من ${quote.quoteCode} v${quote.versionNumber} ووضع الإصدار الحالي كمتجاوز؟`)) return;
    setBusy(`revision-${quote.id}`); setNotice("");
    try {
      const today = new Date();
      const validUntil = new Date(today.getTime() + 14 * 86400000);
      const response = await fetch("/api/portal/operations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "create-quote-revision", idempotencyKey: crypto.randomUUID(), sourceQuoteId: quote.id, issueDate: today.toISOString().slice(0, 10), validUntil: validUntil.toISOString().slice(0, 10) }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "تعذّر إنشاء إصدار العرض");
      setNotice("أُنشئ إصدار جديد وحُفظ الإصدار السابق كسجل متجاوز.");
      await load();
    } catch (error) { setNotice(error instanceof Error ? error.message : "تعذّر إنشاء الإصدار"); }
    finally { setBusy(""); }
  }

  async function transition(action: string, item: { id: number; version?: number; recordVersion?: number }, status: string) {
    if (!status) return;
    setBusy(`${action}-${item.id}`);
    setNotice("");
    try {
      const reason = ["lost", "rejected", "cancelled"].includes(status) ? window.prompt("اكتب سبب القرار") || "" : "";
      if (["lost", "rejected", "cancelled"].includes(status) && !reason) return;
      const response = await fetch("/api/portal/operations", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, id: item.id, status, version: item.recordVersion ?? item.version, reason }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "تعذّر تحديث الحالة");
      setNotice("تم تحديث الحالة وتسجيل القرار.");
      await load();
    } catch (error) { setNotice(error instanceof Error ? error.message : "تعذّر التحديث"); }
    finally { setBusy(""); }
  }

  async function updatePortalAccess(kind: "client" | "worker", email: string, status: string) {
    setBusy(`portal-access-${email}`); setNotice("");
    try {
      const response = await fetch("/api/portal/operations", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: `update-${kind}-portal-user`, email, status }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "تعذّر تحديث الوصول");
      setNotice("تم تحديث وصول البوابة وتسجيل التغيير.");
      await load();
    } catch (error) { setNotice(error instanceof Error ? error.message : "تعذّر تحديث الوصول"); }
    finally { setBusy(""); }
  }

  const search = query.trim().toLowerCase();
  const includes = (item: unknown) => !search || JSON.stringify(item).toLowerCase().includes(search);
  const metrics = useMemo(() => data ? {
    clients: data.clients.length,
    pipeline: data.opportunities.filter((item) => !["won", "lost"].includes(item.stage)).reduce((sum, item) => sum + item.expectedValueHalalas, 0),
    approvals: data.approvals.filter((item) => item.status === "pending").length,
    staffing: data.workOrders.filter((item) => item.status === "staffing").length,
  } : { clients: 0, pipeline: 0, approvals: 0, staffing: 0 }, [data]);

  if (!data) return <section className="operations-loading" aria-live="polite"><span/><p>جارٍ تحميل دورة العميل والتشغيل...</p></section>;

  return <>
    <div className="content-heading module-heading"><div><p className="admin-eyebrow">من الطلب إلى التحصيل</p><h1>المبيعات والتشغيل</h1><span>عملاء وفرص وعروض أسعار وأوامر تشغيل ودوام وخطط سعة ضمن مسار واحد.</span></div><button className="admin-secondary" onClick={() => void load()}>تحديث البيانات</button></div>
    {notice && <div className="operations-notice" role="status">{notice}</div>}
    <section className="metric-grid compact-metrics operations-metrics"><article><span>العملاء</span><strong>{metrics.clients}</strong><small>عميل وفرصة</small></article><article><span>قيمة المسار</span><strong>{money(metrics.pipeline)}</strong><small>فرص مفتوحة</small></article><article><span>موافقات معلقة</span><strong>{metrics.approvals}</strong><small>عروض ودوام</small></article><article><span>أوامر قيد التجهيز</span><strong>{metrics.staffing}</strong><small>تحتاج إسنادًا</small></article></section>
    <section className="operations-tabs" role="tablist" aria-label="وحدات المبيعات والتشغيل">
      {(["crm","quotes","contracts","orders","timesheets","capacity","privacy",...(isAdmin ? ["clients","integrations"] : [])] as Tab[]).map((value) => <button role="tab" aria-selected={tab === value} className={tab === value ? "active" : ""} key={value} onClick={() => setTab(value)}>{({ crm: "العملاء والفرص", quotes: "عروض الأسعار", contracts:"العقود والدفعات", orders: "أوامر التشغيل", timesheets: "الدوام", capacity: "السعة الموسمية", privacy: "طلبات الخصوصية", clients: "وصول البوابات", integrations: "التكامل والصيانة" } as Record<Tab,string>)[value]}</button>)}
    </section>
    <div className="operations-search"><label><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث داخل الوحدة الحالية"/></label></div>

    {tab === "crm" && <OperationsSection title="العملاء والفرص" count={data.clients.length + data.opportunities.length} form={canWrite ? <ClientAndOpportunityForms data={data} busy={busy} onCreate={create}/> : null}>
      <div className="operations-split"><article><h3>العملاء</h3><div className="operations-list">{data.clients.filter(includes).map((client) => <div key={client.id}><span className="record-code">{client.clientCode}</span><p><strong>{client.legalName}</strong><small>{client.city} · {client.status}</small></p><b>{data.opportunities.filter((item) => item.clientId === client.id).length} فرصة</b></div>)}</div></article><article><h3>مسار الفرص</h3><div className="operations-list">{data.opportunities.filter(includes).map((item) => <div key={item.id}><span className="record-code">{item.opportunityCode}</span><p><strong>{item.title}</strong><small>{item.stage} · احتمال {item.probability}% · {money(item.expectedValueHalalas)}</small></p>{canWrite && <TransitionSelect busy={busy === `transition-opportunity-${item.id}`} value={item.stage} options={opportunityNext[item.stage] || []} onChange={(status) => void transition("transition-opportunity", item, status)}/>}</div>)}</div></article></div>
    </OperationsSection>}

    {tab === "quotes" && <OperationsSection title="عروض الأسعار والإصدارات" count={data.quotes.length} form={canWrite ? <QuoteForm data={data} busy={busy} onCreate={create}/> : null}>
      <div className="operations-list wide">{data.quotes.filter(includes).map((quote) => <div key={quote.id}><span className="record-code">{quote.quoteCode}<small>v{quote.versionNumber}</small></span><p><strong>{data.opportunities.find((item) => item.id === quote.opportunityId)?.title || "فرصة"}</strong><small>{fmt(quote.issueDate)} · صالح حتى {fmt(quote.validUntil)} · {data.quoteItems.filter((item) => item.quoteVersionId === quote.id).length} بنود</small></p><b>{money(quote.totalHalalas)}</b><span className={`workflow-status ${quote.status}`}>{quote.status}</span><a className="quote-pdf" href={`/api/portal/operations/quotes/${quote.id}/pdf`}>تنزيل PDF</a>{canWrite && !["accepted","superseded"].includes(quote.status) && <button className="quote-revision" disabled={busy === `revision-${quote.id}`} onClick={() => void createQuoteRevision(quote)}>نسخة جديدة</button>}{canWrite && <TransitionSelect busy={busy === `transition-quote-${quote.id}`} value={quote.status} options={quoteNext[quote.status] || []} onChange={(status) => void transition("transition-quote", quote, status)}/>}</div>)}</div>
    </OperationsSection>}

    {tab === "contracts" && <><div className="contract-create-toolbar">{canWrite&&<button className="admin-primary" onClick={onCreateContract}>إنشاء عقد</button>}</div><ContractBillingWorkspace/></>}

    {tab === "orders" && <OperationsSection title="أوامر التشغيل" count={data.workOrders.length} form={canWrite ? <WorkOrderForms data={data} busy={busy} onCreate={create}/> : null}>
      <div className="operations-list wide">{data.workOrders.filter(includes).map((order) => { const reqs = data.requirements.filter((item) => item.workOrderId === order.id); const shortage = reqs.reduce((sum,item) => sum + Math.max(0,item.requiredCount-item.filledCount),0); return <div key={order.id}><span className="record-code">{order.workOrderCode}</span><p><strong>{order.title}</strong><small>{order.workSite} · {fmt(order.startDate)} · {reqs.map((item) => `${item.profession} ${item.requiredCount}`).join("، ")}</small></p><b className={shortage ? "shortage" : "complete"}>{shortage ? `نقص ${shortage}` : "مكتمل"}</b><span className={`workflow-status ${order.status}`}>{order.status}</span>{canWrite && <TransitionSelect busy={busy === `transition-work-order-${order.id}`} value={order.status} options={orderNext[order.status] || []} onChange={(status) => void transition("transition-work-order", order, status)}/>}</div>; })}</div>
    </OperationsSection>}

    {tab === "timesheets" && <OperationsSection title="كشوف الدوام والاعتماد" count={data.timesheets.length} form={canWrite ? <TimesheetForms data={data} workers={data.workers} busy={busy} onCreate={create}/> : null}>
      <div className="operations-list wide">{data.timesheets.filter(includes).map((sheet) => <div key={sheet.id}><span className="record-code">{sheet.timesheetCode}</span><p><strong>{data.workOrders.find((item) => item.id === sheet.workOrderId)?.title || "أمر تشغيل"}</strong><small>{fmt(sheet.periodStart)} — {fmt(sheet.periodEnd)}</small></p><span className={`workflow-status ${sheet.status}`}>{sheet.status}</span>{canWrite && <TransitionSelect busy={busy === `transition-timesheet-${sheet.id}`} value={sheet.status} options={timesheetNext[sheet.status] || []} onChange={(status) => void transition("transition-timesheet", sheet, status)}/>}</div>)}</div>
    </OperationsSection>}

    {tab === "capacity" && <OperationsSection title="تخطيط السعة لموسمي رمضان والحج" count={data.capacityPlans.length} form={canWrite ? <CapacityForm busy={busy} onCreate={create}/> : null}>
      <div className="operations-list wide">{data.capacityPlans.filter(includes).map((plan) => { const gap = plan.requiredCount-plan.availableCount-plan.reservedCount; return <div key={plan.id}><span className="record-code">{plan.planCode}</span><p><strong>{plan.seasonName} · {plan.profession}</strong><small>{plan.location} · {fmt(plan.startDate)} — {fmt(plan.endDate)}</small></p><b className={gap > 0 ? "shortage" : "complete"}>{gap > 0 ? `فجوة ${gap}` : `فائض ${Math.abs(gap)}`}</b><span className={`workflow-status ${plan.status}`}>{plan.status}</span>{canWrite && <TransitionSelect busy={busy === `transition-capacity-plan-${plan.id}`} value={plan.status} options={capacityNext[plan.status] || []} onChange={(status) => void transition("transition-capacity-plan", plan, status)}/>}</div>; })}</div>
    </OperationsSection>}

    {tab === "privacy" && <OperationsSection title="طلبات أصحاب البيانات" count={data.privacyRequests.length} form={null}>
      <div className="operations-list wide privacy-operations">{data.privacyRequests.filter(includes).map((item) => <div key={item.id}><span className="record-code">{item.trackingCode}</span><p><strong>{item.fullName}</strong><small>{item.requestType} · المستهدف {fmt(item.dueAt)}</small></p><span className={`workflow-status ${item.status}`}>{item.status}</span>{canWrite && <TransitionSelect busy={busy === `transition-privacy-request-${item.id}`} value={item.status} options={["verifying","processing","completed","rejected"].filter((status) => status !== item.status)} onChange={(status) => void transition("transition-privacy-request", { id: item.id }, status)}/>}</div>)}</div>
    </OperationsSection>}

    {tab === "clients" && isAdmin && <OperationsSection title="مستخدمو بوابات الخدمة الذاتية" count={data.clientUsers.length + data.workerUsers.length} form={<PortalUserForms data={data} workers={data.workers} busy={busy} onCreate={create}/> }>
      <PortalAccessLists data={data} workers={data.workers} busy={busy} query={query} onUpdate={updatePortalAccess}/>
    </OperationsSection>}
    {tab === "integrations" && isAdmin && <IntegrationManager/>}
  </>;
}

function PortalAccessLists({ data, workers, busy, query, onUpdate }: { data: OperationsData; workers: Worker[]; busy: string; query: string; onUpdate: (kind: "client" | "worker", email: string, status: string) => Promise<void> }) {
  const matches = (value: unknown) => !query.trim() || JSON.stringify(value).toLowerCase().includes(query.trim().toLowerCase());
  return <div className="operations-split"><article><h3>بوابة العميل</h3><div className="operations-list">{data.clientUsers.filter(matches).map((item) => <div key={item.email}><select className="portal-access-status" value={item.status} disabled={busy === `portal-access-${item.email}`} onChange={(event) => void onUpdate("client", item.email, event.target.value)} aria-label={`حالة وصول ${item.displayName}`}><option value="active">نشط</option><option value="pending">معلق</option><option value="suspended">موقوف</option></select><p><strong>{item.displayName}</strong><small>{item.email} · {data.clients.find((client) => client.id === item.clientId)?.legalName}</small></p><b>{[item.canApproveQuotes ? "العروض" : "", item.canApproveTimesheets ? "الدوام" : ""].filter(Boolean).join(" + ") || "عرض فقط"}</b></div>)}</div></article><article><h3>خدمة العامل</h3><div className="operations-list">{data.workerUsers.filter(matches).map((item) => <div key={item.email}><select className="portal-access-status" value={item.status} disabled={busy === `portal-access-${item.email}`} onChange={(event) => void onUpdate("worker", item.email, event.target.value)} aria-label={`حالة وصول ${item.displayName}`}><option value="active">نشط</option><option value="pending">معلق</option><option value="suspended">موقوف</option></select><p><strong>{item.displayName}</strong><small>{item.email} · {workers.find((worker) => worker.id === item.workerId)?.fullName}</small></p></div>)}</div></article></div>;
}

function OperationsSection({ title, count, form, children }: { title: string; count: number; form: React.ReactNode; children: React.ReactNode }) {
  return <section className="panel operations-section"><header><div><h2>{title}</h2><p>{count} سجل ضمن الصلاحية الحالية</p></div>{form}</header>{children}</section>;
}

function FormDetails({ title, children }: { title: string; children: React.ReactNode }) { return <details className="operations-form"><summary>＋ {title}</summary>{children}</details>; }
function submit(handler: (form: HTMLFormElement) => void) { return (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); handler(event.currentTarget); }; }
function lines(value: FormDataEntryValue | null, kind: "quote" | "requirements") { return String(value || "").split("\n").map((line) => line.trim()).filter(Boolean).map((line) => { const parts = line.split("|").map((item) => item.trim()); return kind === "quote" ? { profession: parts[0], quantity: Number(parts[1]), durationMonths: Number(parts[2]), unitPrice: Number(parts[3]), notes: parts[4] || "" } : { profession: parts[0], requiredCount: Number(parts[1]), shiftName: parts[2] || "", startTime: parts[3] || "", endTime: parts[4] || "" }; }); }

function ClientAndOpportunityForms({ data, busy, onCreate }: { data: OperationsData; busy: string; onCreate: CreateOperation }) { return <div className="operations-form-group"><FormDetails title="عميل"><form onSubmit={submit((form) => void onCreate("create-client",form))}><input name="legalName" required placeholder="الاسم النظامي"/><input name="commercialRegistration" placeholder="السجل التجاري"/><input name="city" defaultValue="مكة المكرمة" placeholder="المدينة"/><input name="contactName" placeholder="جهة الاتصال"/><input name="contactMobile" placeholder="الجوال"/><input name="contactEmail" type="email" placeholder="البريد"/><button disabled={busy === "create-client"}>حفظ العميل</button></form></FormDetails><FormDetails title="فرصة"><form onSubmit={submit((form) => void onCreate("create-opportunity",form))}><select name="clientId" required defaultValue=""><option value="" disabled>العميل</option>{data.clients.map((item) => <option key={item.id} value={item.id}>{item.legalName}</option>)}</select><input name="title" required placeholder="عنوان الفرصة"/><input name="expectedValue" type="number" min="0" step="0.01" placeholder="القيمة المتوقعة"/><input name="expectedCloseDate" type="date"/><button disabled={busy === "create-opportunity"}>حفظ الفرصة</button></form></FormDetails></div>; }
function QuoteForm({ data, busy, onCreate }: { data: OperationsData; busy: string; onCreate: CreateOperation }) {
  const [activity, setActivity] = useState("توريد وتشغيل القوى العاملة");
  const examples: Record<string,string> = { "توريد وتشغيل القوى العاملة":"فني كهرباء | 5 | 12 | 4500 | يشمل الإقامة والنقل حسب الاتفاق", "التشغيل والصيانة":"تشغيل وصيانة المرافق | 1 | 12 | 25000 | زيارة شهرية وتقارير أداء", "النظافة وإدارة المرافق":"خدمة النظافة المتكاملة | 10 | 12 | 3200 | مواد النظافة حسب النطاق", "المقاولات والأعمال الإنشائية":"تنفيذ بند الأعمال المدنية | 1 | 1 | 75000 | وفق المخططات والكميات المعتمدة", "خدمات موسمية للحج ورمضان":"عامل خدمة موسمية | 40 | 2 | 5800 | يشمل التجهيز والإشراف" };
  return <FormDetails title="إنشاء عرض سعر احترافي"><form onSubmit={submit((form) => { const fd = new FormData(form); void onCreate("create-quote",form,{items:lines(fd.get("itemLines"),"quote")}); })}><select name="opportunityId" required defaultValue=""><option value="" disabled>اختر العميل والفرصة</option>{data.opportunities.filter((item) => !["won","lost"].includes(item.stage)).map((item) => <option value={item.id} key={item.id}>{item.opportunityCode} · {item.title}</option>)}</select><select name="activityLabel" value={activity} onChange={(event)=>setActivity(event.target.value)}><option>توريد وتشغيل القوى العاملة</option><option>التشغيل والصيانة</option><option>النظافة وإدارة المرافق</option><option>المقاولات والأعمال الإنشائية</option><option>خدمات موسمية للحج ورمضان</option><option>خدمة أخرى</option></select><input name="workSite" required placeholder="موقع تقديم الخدمة"/><input name="issueDate" type="date" required/><input name="validUntil" type="date" required/><textarea name="itemLines" required rows={6} placeholder={`كل بند في سطر: الخدمة | الكمية | المدة بالأشهر | سعر الوحدة | ملاحظات\nمثال: ${examples[activity] || "اسم الخدمة | 1 | 1 | 1000 | تفاصيل النطاق"}`}/><input name="discount" type="number" min="0" step="0.01" defaultValue="0" placeholder="الخصم بالريال"/><select name="vatRate" defaultValue="15"><option value="0">بدون ضريبة</option><option value="15">ضريبة 15%</option></select><textarea name="terms" required rows={3} placeholder="شروط الدفع (مثال: 50% مقدم و50% عند بدء الخدمة)"/><textarea name="assumptions" rows={3} placeholder="الافتراضات والاستثناءات ومتطلبات العميل"/><button disabled={busy === "create-quote"}>إنشاء وحفظ عرض السعر</button></form></FormDetails>;
}
function WorkOrderForms({ data, busy, onCreate }: { data: OperationsData; busy: string; onCreate: CreateOperation }) {
  const [selectedRequirementId, setSelectedRequirementId] = useState(0);
  const openRequirements = data.requirements.filter((requirement) => requirement.filledCount < requirement.requiredCount && data.workOrders.some((order) => order.id === requirement.workOrderId && ["staffing", "active"].includes(order.status)));
  const selectedRequirement = openRequirements.find((item) => item.id === selectedRequirementId);
  const matchingWorkers = data.workers.filter((item) => item.status === "available" && !item.workOrderId && (!selectedRequirement || item.profession === selectedRequirement.profession));
  return <div className="operations-form-group"><WorkOrderForm data={data} busy={busy} onCreate={onCreate}/><FormDetails title="إسناد عامل"><form onSubmit={submit((form) => void onCreate("assign-worker-to-work-order", form).then(() => setSelectedRequirementId(0)))}><select name="requirementId" required value={selectedRequirementId || ""} onChange={(event) => setSelectedRequirementId(Number(event.target.value))}><option value="" disabled>المتطلب</option>{openRequirements.map((item) => { const order = data.workOrders.find((candidate) => candidate.id === item.workOrderId); return <option value={item.id} key={item.id}>{order?.workOrderCode} · {item.profession} · متبقٍ {item.requiredCount - item.filledCount}</option>; })}</select><select name="workerId" required defaultValue="" disabled={!selectedRequirement}><option value="" disabled>{selectedRequirement ? "العامل المطابق المتاح" : "اختر المتطلب أولاً"}</option>{matchingWorkers.map((item) => <option value={item.id} key={item.id}>{item.fullName} · {item.profession}</option>)}</select><button disabled={busy === "assign-worker-to-work-order" || !selectedRequirement || !matchingWorkers.length}>تأكيد الإسناد</button></form></FormDetails><FormDetails title="فك إسناد"><form onSubmit={submit((form) => void onCreate("release-worker-from-work-order", form))}><select name="workerId" required defaultValue=""><option value="" disabled>العامل المسند</option>{data.workers.filter((item) => Boolean(item.workOrderId)).map((item) => <option value={item.id} key={item.id}>{item.fullName} · {data.workOrders.find((order) => order.id === item.workOrderId)?.workOrderCode}</option>)}</select><textarea name="reason" required minLength={3} maxLength={1000} placeholder="سبب فك الإسناد"/><button disabled={busy === "release-worker-from-work-order"}>فك الإسناد</button></form></FormDetails></div>;
}
function WorkOrderForm({ data, busy, onCreate }: { data: OperationsData; busy: string; onCreate: CreateOperation }) { return <FormDetails title="أمر تشغيل"><form onSubmit={submit((form) => { const fd = new FormData(form); void onCreate("create-work-order",form,{requirements:lines(fd.get("requirementLines"),"requirements")}); })}><select name="clientId" required defaultValue=""><option value="" disabled>العميل</option>{data.clients.map((item) => <option value={item.id} key={item.id}>{item.legalName}</option>)}</select><select name="quoteVersionId" defaultValue=""><option value="">دون عرض مرتبط</option>{data.quotes.filter((item) => item.status === "accepted").map((item) => <option value={item.id} key={item.id}>{item.quoteCode}</option>)}</select><input name="title" required placeholder="عنوان أمر التشغيل"/><input name="workSite" required placeholder="موقع العمل"/><input name="startDate" required type="date"/><input name="endDate" type="date"/><textarea name="requirementLines" required rows={4} placeholder="المهنة | العدد | الوردية | 08:00 | 17:00"/><button disabled={busy === "create-work-order"}>إنشاء الأمر</button></form></FormDetails>; }
function TimesheetForms({ data, workers, busy, onCreate }: { data: OperationsData; workers: Worker[]; busy: string; onCreate: CreateOperation }) {
  const [selectedTimesheetId, setSelectedTimesheetId] = useState(0);
  const selectedTimesheet = data.timesheets.find((item) => item.id === selectedTimesheetId);
  const assignedWorkers = workers.filter((item) => selectedTimesheet && item.workOrderId === selectedTimesheet.workOrderId);
  return <div className="operations-form-group"><FormDetails title="كشف دوام"><form onSubmit={submit((form) => void onCreate("create-timesheet",form))}><select name="workOrderId" required defaultValue=""><option value="" disabled>أمر التشغيل</option>{data.workOrders.filter((item) => ["active","staffing"].includes(item.status)).map((item) => <option value={item.id} key={item.id}>{item.workOrderCode} · {item.title}</option>)}</select><input name="periodStart" type="date" required/><input name="periodEnd" type="date" required/><button disabled={busy === "create-timesheet"}>إنشاء الكشف</button></form></FormDetails><FormDetails title="سجل حضور"><form onSubmit={submit((form) => void onCreate("add-time-entry",form).then(() => setSelectedTimesheetId(0)))}><select name="timesheetId" required value={selectedTimesheetId || ""} onChange={(event) => setSelectedTimesheetId(Number(event.target.value))}><option value="" disabled>كشف الدوام</option>{data.timesheets.filter((item) => item.status === "draft").map((item) => <option value={item.id} key={item.id}>{item.timesheetCode}</option>)}</select><select name="workerId" required defaultValue="" disabled={!selectedTimesheet}><option value="" disabled>{selectedTimesheet ? "العامل المسند إلى الأمر" : "اختر الكشف أولاً"}</option>{assignedWorkers.map((item) => <option value={item.id} key={item.id}>{item.fullName} · {item.profession}</option>)}</select><input name="workDate" type="date" required min={selectedTimesheet?.periodStart} max={selectedTimesheet?.periodEnd}/><input name="regularMinutes" type="number" min="0" max="1440" defaultValue="480" placeholder="الدقائق العادية"/><input name="overtimeMinutes" type="number" min="0" max="1440" defaultValue="0" placeholder="الإضافي"/><select name="attendanceStatus"><option value="present">حاضر</option><option value="absent">غائب</option><option value="leave">إجازة</option><option value="sick">مرضي</option><option value="holiday">عطلة</option></select><button disabled={busy === "add-time-entry" || !selectedTimesheet || !assignedWorkers.length}>حفظ الدوام</button></form></FormDetails></div>;
}
function CapacityForm({ busy, onCreate }: { busy: string; onCreate: CreateOperation }) { return <FormDetails title="خطة سعة"><form onSubmit={submit((form) => void onCreate("create-capacity-plan",form))}><select name="seasonName" required defaultValue=""><option value="" disabled>اختر الموسم</option><option>موسم رمضان</option><option>العشر الأواخر من رمضان</option><option>موسم الحج</option><option>موسما رمضان والحج</option><option>موسم تشغيلي آخر</option></select><input name="location" required defaultValue="مكة المكرمة"/><input name="profession" required list="capacity-professions" placeholder="المهنة"/><datalist id="capacity-professions">{workforceProfessions.map((item) => <option value={item.label} key={item.label}/>)}</datalist><input name="requiredCount" type="number" min="1" required placeholder="المطلوب"/><input name="availableCount" type="number" min="0" defaultValue="0" placeholder="المتاح"/><input name="reservedCount" type="number" min="0" defaultValue="0" placeholder="المحجوز"/><input name="startDate" type="date" required/><input name="endDate" type="date" required/><button disabled={busy === "create-capacity-plan"}>حفظ الخطة</button></form></FormDetails>; }
function PortalUserForms({ data, workers, busy, onCreate }: { data: OperationsData; workers: Worker[]; busy: string; onCreate: CreateOperation }) { return <div className="operations-form-group"><FormDetails title="مستخدم عميل"><form onSubmit={submit((form) => { const formData = new FormData(form); void onCreate("invite-client-user",form,{canApproveQuotes:formData.get("canApproveQuotes") === "on",canApproveTimesheets:formData.get("canApproveTimesheets") === "on"}); })}><select name="clientId" required defaultValue=""><option value="" disabled>العميل</option>{data.clients.map((item) => <option value={item.id} key={item.id}>{item.legalName}</option>)}</select><input name="displayName" required placeholder="الاسم"/><input name="email" type="email" required placeholder="البريد"/><label><input name="canApproveQuotes" type="checkbox"/> قبول عروض الأسعار</label><label><input name="canApproveTimesheets" type="checkbox"/> اعتماد الدوام</label><button disabled={busy === "invite-client-user"}>تفعيل الوصول</button></form></FormDetails><FormDetails title="مستخدم عامل"><form onSubmit={submit((form) => void onCreate("invite-worker-user",form))}><select name="workerId" required defaultValue=""><option value="" disabled>العامل</option>{workers.map((item) => <option value={item.id} key={item.id}>{item.fullName} · {item.workerNumber}</option>)}</select><input name="displayName" required placeholder="الاسم"/><input name="email" type="email" required placeholder="البريد"/><button disabled={busy === "invite-worker-user"}>تفعيل الخدمة الذاتية</button></form></FormDetails></div>; }
function TransitionSelect({ options, busy, onChange }: { options: string[]; value: string; busy: boolean; onChange: (status: string) => void }) { if (!options.length) return null; return <select className="workflow-transition" disabled={busy} defaultValue="" aria-label="تغيير حالة السجل" onChange={(event) => { onChange(event.target.value); event.currentTarget.value = ""; }}><option value="" disabled>{busy ? "جارٍ التحديث" : "الإجراء التالي"}</option>{options.map((option) => <option value={option} key={option}>{option}</option>)}</select>; }
const opportunityNext: Record<string,string[]> = { new:["qualified","lost"],qualified:["proposal","lost"],proposal:["negotiation","won","lost"],negotiation:["won","lost"],lost:["new"] };
const quoteNext: Record<string,string[]> = { draft:["pending_approval"],pending_approval:["approved","rejected"],approved:["sent"],sent:["accepted","rejected","expired"] };
const orderNext: Record<string,string[]> = { planned:["staffing","cancelled"],staffing:["active","paused","cancelled"],active:["paused","completed"],paused:["active","cancelled"] };
const timesheetNext: Record<string,string[]> = { draft:["submitted"],submitted:["approved","rejected"],rejected:["draft"],approved:["invoiced"] };
const capacityNext: Record<string,string[]> = { planning:["approved","cancelled"],approved:["active","cancelled"],active:["completed","cancelled"] };
