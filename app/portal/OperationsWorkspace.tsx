"use client";
/* eslint-disable @next/next/no-img-element -- authenticated stamp previews use a protected API route */

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { workforceNationalities, workforceProfessions } from "@/lib/workforce-requirements";
import IntegrationManager from "./IntegrationManager";
import ContractBillingWorkspace from "./ContractBillingWorkspace";
import PaymentManagementDashboard from "./PaymentManagementDashboard";
import { createWhatsAppUrl } from "@/lib/whatsapp";

type Client = { id: number; clientCode: string; legalName: string; tradeName: string | null; city: string; status: string; ownerEmail: string | null; salesRepresentativeId: number | null };
type Contact = { id: number; clientId: number; fullName: string; email: string | null; mobile: string | null };
type Opportunity = { id: number; opportunityCode: string; clientId: number | null; salesRepresentativeId: number | null; title: string; stage: string; expectedValueHalalas: number; probability: number; ownerEmail: string; version: number };
type Representative = { id: number; representativeCode: string; fullName: string; status: string };
type Quote = { id: number; quoteCode: string; opportunityId: number; versionNumber: number; status: string; issueDate: string; validUntil: string; totalHalalas: number; quantityMode: "fixed"|"open"; seasonType: "regular"|"ramadan"|"hajj"; paymentScheduleJson: string|null; vatRateBps: number; approvedBy: string | null; createdBy: string; recordVersion: number };
type QuoteItem = { id: number; quoteVersionId: number; profession: string; quantity: number; durationMonths: number; unitPriceHalalas: number; lineTotalHalalas: number; sponsorshipType: "dali" | "other" | null; sponsorName: string | null; ajirContractStatus: "not_applicable" | "with_ajir" | "without_ajir" | null };
type WorkOrder = { id: number; workOrderCode: string; clientId: number; title: string; workSite: string; startDate: string; endDate: string | null; status: string; version: number };
type Requirement = { id: number; workOrderId: number; profession: string; requiredCount: number; filledCount: number; shiftName: string | null };
type Timesheet = { id: number; timesheetCode: string; workOrderId: number; periodStart: string; periodEnd: string; status: string; version: number };
type CapacityPlan = { id: number; planCode: string; seasonName: string; location: string; profession: string; requiredCount: number; availableCount: number; reservedCount: number; startDate: string; endDate: string; status: string };
type Approval = { id: number; entityType: string; entityId: string; step: string; status: string; requestedBy: string; createdAt: string };
type PrivacyRequest = { id: number; trackingCode: string; requestType: string; fullName: string; email: string; status: string; dueAt: string; assignedTo: string | null };
type ClientUser = { email: string; clientId: number; displayName: string; status: string; canApproveQuotes: boolean; canApproveTimesheets: boolean };
type WorkerUser = { email: string; workerId: number; displayName: string; status: string };
type Worker = { id: number; fullName: string; workerNumber: string; profession: string; status: string; clientId: number | null; workOrderId: number | null };
type DocumentStamp = { id: number; name: string; fileName: string; updatedAt: string };
type OperationsData = { clients: Client[]; contacts: Contact[]; opportunities: Opportunity[]; representatives: Representative[]; quotes: Quote[]; quoteItems: QuoteItem[]; workOrders: WorkOrder[]; requirements: Requirement[]; timesheets: Timesheet[]; timeEntries: unknown[]; workers: Worker[]; capacityPlans: CapacityPlan[]; approvals: Approval[]; privacyRequests: PrivacyRequest[]; clientUsers: ClientUser[]; workerUsers: WorkerUser[] };
export type OperationsTab = "crm" | "quotes" | "contracts" | "orders" | "timesheets" | "capacity" | "privacy" | "clients" | "integrations";
type Tab = OperationsTab;
type CreateOperation = (action: string, form: HTMLFormElement, extra?: Record<string, unknown>) => Promise<void>;

const money = (halalas: number) => new Intl.NumberFormat("ar-SA", { style: "currency", currency: "SAR", maximumFractionDigits: 2 }).format(halalas / 100);
const fmt = (value: string) => new Intl.DateTimeFormat("ar-SA", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value.includes("T") ? value : `${value}T00:00:00`));

export default function OperationsWorkspace({ canWrite, isAdmin, isOwner, initialTab = "crm", initialQuery = "", onCreateContract }: { canWrite: boolean; isAdmin: boolean; isOwner: boolean; initialTab?: OperationsTab; initialQuery?: string; onCreateContract: (quoteId?:number) => void }) {
  const [data, setData] = useState<OperationsData | null>(null);
  const [tab, setTab] = useState<Tab>(initialTab);
  const [query, setQuery] = useState(initialQuery);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [stamps, setStamps] = useState<DocumentStamp[]>([]);
  const [pendingQuoteApproval, setPendingQuoteApproval] = useState<{ id: number; recordVersion?: number } | null>(null);
  const canApproveQuotes = isOwner || isAdmin;

  const load = useCallback(async () => {
    const [response, stampResponse] = await Promise.all([fetch("/api/portal/operations?limit=100", { cache: "no-store" }), fetch("/api/portal/document-stamps", { cache: "no-store" })]);
    const result = await response.json() as OperationsData & { error?: string };
    if (!response.ok) throw new Error(result.error || "تعذّر تحميل مساحة التشغيل");
    setData(result);
    if (stampResponse.ok) setStamps(((await stampResponse.json()) as { stamps: DocumentStamp[] }).stamps);
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

  async function editQuote(quote: Quote) {
    const issueDate = window.prompt("تاريخ إصدار العرض (YYYY-MM-DD)", quote.issueDate);
    if (issueDate === null) return;
    const validUntil = window.prompt("تاريخ انتهاء صلاحية العرض (YYYY-MM-DD)", quote.validUntil);
    if (validUntil === null) return;
    setBusy(`edit-quote-${quote.id}`); setNotice("");
    try {
      const response = await fetch(`/api/portal/operations/quotes/${quote.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ issueDate, validUntil }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "تعذّر تعديل عرض السعر");
      setNotice("تم تعديل عرض السعر وإعادته للمسودة لاعتماده مجددًا."); await load();
    } catch (error) { setNotice(error instanceof Error ? error.message : "تعذّر تعديل العرض"); }
    finally { setBusy(""); }
  }

  async function deleteQuote(quote: Quote) {
    if (!window.confirm(`حذف مسودة عرض السعر ${quote.quoteCode} نهائيًا؟`)) return;
    setBusy(`delete-quote-${quote.id}`); setNotice("");
    try {
      const response = await fetch(`/api/portal/operations/quotes/${quote.id}`, { method: "DELETE" });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "تعذّر حذف عرض السعر");
      setNotice("تم حذف عرض السعر وتحديث سجل العمليات."); await load();
    } catch (error) { setNotice(error instanceof Error ? error.message : "تعذّر حذف العرض"); }
    finally { setBusy(""); }
  }

  async function shareQuoteWhatsApp(quote:Quote){setBusy(`share-quote-${quote.id}`);setNotice("");try{const response=await fetch(`/api/portal/operations/quotes/${quote.id}/share`,{method:"POST"});const result=await response.json()as{shareUrl?:string;mobile?:string;clientName?:string;error?:string};if(!response.ok||!result.shareUrl||!result.mobile)throw new Error(result.error||"تعذر تجهيز رابط العرض");const message=`السلام عليكم ${result.clientName||""}، نرفق لكم عرض السعر ${quote.quoteCode}. رابط PDF الآمن: ${result.shareUrl}`;const whatsappUrl=createWhatsAppUrl(result.mobile,message);if(!whatsappUrl)throw new Error("رقم جوال العميل غير صحيح");const opened=window.open(whatsappUrl,"_blank","noopener,noreferrer");if(!opened)window.location.assign(whatsappUrl);setNotice("فُتحت محادثة العميل مباشرة في واتساب مع رابط عرض السعر الآمن.")}catch(error){setNotice(error instanceof Error?error.message:"تعذر مشاركة العرض")}finally{setBusy("")}}

  async function transition(action: string, item: { id: number; version?: number; recordVersion?: number }, status: string, stampId?: number) {
    if (!status) return;
    if (action === "transition-quote" && status === "approved" && !stampId) { setPendingQuoteApproval(item); return; }
    setBusy(`${action}-${item.id}`);
    setNotice("");
    try {
      const reason = ["lost", "rejected", "cancelled"].includes(status) ? window.prompt("اكتب سبب القرار (10 أحرف على الأقل)") || "" : "";
      if (["lost", "rejected", "cancelled"].includes(status) && reason.trim().length < 10) { setNotice("سبب القرار يجب ألا يقل عن 10 أحرف."); return; }
      const response = await fetch("/api/portal/operations", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, id: item.id, status, version: item.recordVersion ?? item.version, reason, stampId }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "تعذّر تحديث الحالة");
      setNotice("تم تحديث الحالة وتسجيل القرار.");
      setPendingQuoteApproval(null); await load();
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
      <div className="operations-list quote-record-list">{data.quotes.filter(includes).map((quote) => <article className="quote-record" key={quote.id}><span className="record-code">{quote.quoteCode}<small>v{quote.versionNumber}</small></span><p><strong>{data.opportunities.find((item) => item.id === quote.opportunityId)?.title || "فرصة"}</strong><small>{fmt(quote.issueDate)} · صالح حتى {fmt(quote.validUntil)} · {data.quoteItems.filter((item) => item.quoteVersionId === quote.id).length} بنود</small></p><b>{quote.quantityMode==="open"?"عدد مفتوح":money(quote.totalHalalas)}</b><span className={`workflow-status ${quote.status}`}>{quoteStatusLabels[quote.status] || quote.status}</span><div className="quote-record-actions">{quote.approvedBy ? <span className="pdf-language-actions"><a className="quote-pdf" href={`/api/portal/operations/quotes/${quote.id}/pdf?language=ar`}>PDF عربي</a><a className="quote-pdf" href={`/api/portal/operations/quotes/${quote.id}/pdf?language=bilingual`}>PDF عربي/English</a></span> : <span className="quote-pdf locked">التنزيل بعد الاعتماد</span>}{canWrite && ["draft","rejected"].includes(quote.status) && <button className="quote-revision" disabled={busy === `edit-quote-${quote.id}`} onClick={() => void editQuote(quote)}>تعديل</button>}{canWrite && ["draft","rejected"].includes(quote.status) && <button className="quote-revision danger-action" disabled={busy === `delete-quote-${quote.id}`} onClick={() => void deleteQuote(quote)}>حذف</button>}{canWrite && canApproveQuotes && !["accepted","expired","superseded","cancelled"].includes(quote.status) && <button className="quote-revision cancel-action" disabled={busy === `transition-quote-${quote.id}`} onClick={() => void transition("transition-quote", quote, "cancelled")}>إلغاء عرض السعر</button>}{canWrite && !["accepted","superseded","cancelled"].includes(quote.status) && <button className="quote-revision" disabled={busy === `revision-${quote.id}`} onClick={() => void createQuoteRevision(quote)}>نسخة جديدة</button>}{canWrite && canApproveQuotes && ["draft","pending_approval"].includes(quote.status) && <button className="admin-primary quote-approve" disabled={busy === `transition-quote-${quote.id}`} onClick={() => void transition("transition-quote", quote, "approved")}>{busy === `transition-quote-${quote.id}` ? "جارٍ الاعتماد..." : "اعتماد عرض السعر"}</button>}{canWrite && !canApproveQuotes && quote.status === "draft" && <button className="admin-primary quote-submit-approval" disabled={busy === `transition-quote-${quote.id}`} onClick={() => void transition("transition-quote", quote, "pending_approval")}>إرسال للاعتماد</button>}{canWrite && <TransitionSelect busy={busy === `transition-quote-${quote.id}`} value={quote.status} options={(quoteNext[quote.status] || []).filter(status => status !== "approved" && status !== "pending_approval")} onChange={(status) => void transition("transition-quote", quote, status)}/>}</div></article>)}</div>
    </OperationsSection>}
    {tab==="quotes"&&data.quotes.some(quote=>quote.approvedBy&&["approved","sent","accepted"].includes(quote.status))&&<section className="panel approved-quote-actions"><header><div><h2>إجراءات العروض المعتمدة</h2><p>مشاركة العرض مع العميل أو تحويله مباشرة إلى عقد مطابق.</p></div></header>{data.quotes.filter(quote=>quote.approvedBy&&["approved","sent","accepted"].includes(quote.status)).map(quote=><article key={quote.id}><div><strong>{quote.quoteCode} — الإصدار {quote.versionNumber}</strong><span>{quoteStatusLabels[quote.status]}</span></div><span className="pdf-language-actions"><a href={`/api/portal/operations/quotes/${quote.id}/pdf?language=ar`}>PDF عربي</a><a href={`/api/portal/operations/quotes/${quote.id}/pdf?language=bilingual`}>PDF عربي/English</a></span><button disabled={busy===`share-quote-${quote.id}`} onClick={()=>void shareQuoteWhatsApp(quote)}>مشاركة واتساب</button><button className="admin-primary" onClick={()=>onCreateContract(quote.id)}>تحويل إلى عقد</button></article>)}</section>}

    {tab === "contracts" && <><div className="contract-create-toolbar">{canWrite&&<button className="admin-primary" onClick={()=>onCreateContract()}>إنشاء عقد</button>}</div><PaymentManagementDashboard/><ContractBillingWorkspace/></>}

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
    {pendingQuoteApproval && <div className="stamp-picker-backdrop" role="presentation"><section className="stamp-picker-dialog" role="dialog" aria-modal="true" aria-label="اختيار ختم الاعتماد"><header><div><span>اعتماد رسمي</span><h2>اختر ختم عرض السعر</h2><p>سيثبت الختم المختار في سجل الاعتماد، ولن ينشأ أي أثر رسمي قبل التأكيد.</p></div><button type="button" onClick={() => setPendingQuoteApproval(null)}>×</button></header><div className="stamp-picker-grid">{stamps.map((stamp) => <button type="button" className="stamp-choice-card" key={stamp.id} disabled={busy === `transition-quote-${pendingQuoteApproval.id}`} onClick={() => void transition("transition-quote", pendingQuoteApproval, "approved", stamp.id)}><img src={`/api/portal/document-stamps?id=${stamp.id}`} alt={stamp.name}/><strong>{stamp.name}</strong><small>{stamp.fileName}</small></button>)}</div>{!stamps.length && <p className="empty-operational">لا يوجد ختم نشط. أضف ختمًا من مكتبة الأختام أولاً.</p>}</section></div>}
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

function ClientAndOpportunityForms({ data, busy, onCreate }: { data: OperationsData; busy: string; onCreate: CreateOperation }) {
  const activeRepresentatives=data.representatives.filter(item=>item.status==="active");
  const representativeSelect=<><option value="">دون مندوب</option>{activeRepresentatives.map(item=><option key={item.id} value={item.id}>{item.representativeCode} — {item.fullName}</option>)}</>;
  return <div className="operations-form-group"><FormDetails title="عميل"><form onSubmit={submit((form) => void onCreate("create-client",form))}><input name="legalName" required placeholder="الاسم النظامي"/><input name="commercialRegistration" placeholder="السجل التجاري"/><input name="city" defaultValue="مكة المكرمة" placeholder="المدينة"/><select name="salesRepresentativeId" defaultValue="" aria-label="المندوب المسؤول">{representativeSelect}</select><input name="contactName" placeholder="جهة الاتصال"/><input name="contactMobile" placeholder="الجوال"/><input name="contactEmail" type="email" placeholder="البريد"/><button disabled={busy === "create-client"}>حفظ العميل</button></form></FormDetails><FormDetails title="فرصة"><form onSubmit={submit((form) => void onCreate("create-opportunity",form))}><select name="clientId" required defaultValue=""><option value="" disabled>العميل</option>{data.clients.map((item) => <option key={item.id} value={item.id}>{item.legalName}</option>)}</select><select name="salesRepresentativeId" defaultValue="" aria-label="المندوب المسؤول">{representativeSelect}</select><input name="title" required placeholder="عنوان الفرصة"/><input name="expectedValue" type="number" min="0" step="0.01" placeholder="القيمة المتوقعة"/><input name="expectedCloseDate" type="date"/><button disabled={busy === "create-opportunity"}>حفظ الفرصة</button></form></FormDetails></div>;
}
function QuoteForm({ data, busy, onCreate, embedded = false }: { data: OperationsData; busy: string; onCreate: CreateOperation; embedded?: boolean }) {
  type Activity="workforce"|"construction"|"maintenance"|"seasonal";
  type Line={key:string;profession:string;quantity:number;durationMonths:number;unitPrice:number;notes:string;nature:string;nationality:string;unit:string;shift:string;sponsorshipType:"dali"|"other";sponsorName:string;ajirContractStatus:"not_applicable"|"with_ajir"|"without_ajir"};
  const activities:Record<Activity,{label:string;hint:string;seed:Omit<Line,"key">}>={
    workforce:{label:"توريد العمالة",hint:"المهنة والجنسية والكفالة وأجير والعدد وراتب العامل والمدة والوردية",seed:{profession:workforceProfessions[0].label,quantity:1,durationMonths:12,unitPrice:0,notes:"",nature:"عمالة",nationality:"أي جنسية",unit:"عامل/شهر",shift:"وردية واحدة",sponsorshipType:"dali" as const,sponsorName:"",ajirContractStatus:"not_applicable" as const}},
    construction:{label:"المقاولات",hint:"بند الأعمال والوحدة والكمية ونطاق التنفيذ",seed:{profession:"بند أعمال إنشائية",quantity:1,durationMonths:1,unitPrice:0,notes:"",nature:"مقاولات",nationality:"",unit:"م²",shift:"",sponsorshipType:"dali" as const,sponsorName:"",ajirContractStatus:"not_applicable" as const}},
    maintenance:{label:"التشغيل والصيانة",hint:"الأصل أو النظام ومستوى الخدمة والزيارات",seed:{profession:"خدمة تشغيل وصيانة",quantity:1,durationMonths:12,unitPrice:0,notes:"استجابة للأعطال وتقارير أداء دورية",nature:"تشغيل وصيانة",nationality:"",unit:"شهر",shift:"حسب اتفاقية مستوى الخدمة",sponsorshipType:"dali" as const,sponsorName:"",ajirContractStatus:"not_applicable" as const}},
    seasonal:{label:"الخدمات الموسمية",hint:"الموقع والموسم والعدد وفترة التشغيل",seed:{profession:"خدمة موسمية",quantity:1,durationMonths:1,unitPrice:0,notes:"يشمل التجهيز والإشراف خلال الموسم",nature:"موسمي",nationality:"أي جنسية",unit:"عامل/موسم",shift:"حسب الخطة التشغيلية",sponsorshipType:"dali" as const,sponsorName:"",ajirContractStatus:"not_applicable" as const}},
  };
  const [activity,setActivity]=useState<Activity>("workforce");
  const [quantityMode,setQuantityMode]=useState<"fixed"|"open">("fixed");
  const [seasonType,setSeasonType]=useState<"regular"|"ramadan"|"hajj">("regular");
  const [payments,setPayments]=useState([{key:"payment-1",title:"الدفعة الأولى",percentage:50,dueDate:""},{key:"payment-2",title:"الدفعة الثانية",percentage:50,dueDate:""}]);
  const [items,setItems]=useState<Line[]>([{key:"line-1",...activities.workforce.seed}]);
  const changeActivity=(value:Activity)=>{setActivity(value);setItems([{key:`line-${value}`,...activities[value].seed}]);};
  const update=(key:string,field:keyof Omit<Line,"key">,value:string|number)=>setItems(rows=>rows.map(row=>row.key===key?{...row,[field]:value}:row));
  const subtotal=items.reduce((sum,item)=>sum+item.quantity*item.durationMonths*item.unitPrice,0);
  const payloadItems=items.map(item=>({profession:item.profession,quantity:quantityMode==="open"?0:item.quantity,durationMonths:item.durationMonths,unitPrice:item.unitPrice,sponsorshipType:activity==="workforce"?item.sponsorshipType:null,sponsorName:activity==="workforce"&&item.sponsorshipType==="other"?item.sponsorName:null,ajirContractStatus:activity==="workforce"?item.ajirContractStatus:null,notes:[item.nationality&&`الجنسية: ${item.nationality}`,item.unit&&`الوحدة: ${item.unit}`,item.shift&&`الوردية/الخدمة: ${item.shift}`,item.notes].filter(Boolean).join(" | ")}));
  const form=<form className={`professional-quote-form quote-${activity} quote-${quantityMode}`} onSubmit={submit((form) => void onCreate("create-quote",form,{items:payloadItems,quantityMode,seasonType,paymentSchedule:seasonType==="regular"?[]:payments.map(({title,percentage,dueDate})=>({title,percentage,dueDate}))}))}>
    <div className="quote-form-section span-two"><strong>1. نوع طلب العميل</strong><p>اختر المسار؛ تتغير الحقول والبنود والتسعير بما يناسب النشاط.</p></div>
    <div className="quote-activity-tabs span-two" role="tablist">{(Object.entries(activities) as [Activity,(typeof activities)[Activity]][]).map(([key,meta])=><button type="button" role="tab" aria-selected={activity===key} className={activity===key?"active":""} key={key} onClick={()=>changeActivity(key)}><strong>{meta.label}</strong><small>{meta.hint}</small></button>)}</div>
    <label className="span-two">نطاق العدد<select value={quantityMode} onChange={event=>setQuantityMode(event.target.value as "fixed"|"open")}><option value="fixed">عدد محدد — يحسب إجمالي العرض والضريبة</option><option value="open">عدد مفتوح — دون قيمة إجمالية، والضريبة عند الفوترة الفعلية</option></select></label>
    <label className="span-two">نوع المدة والفوترة<select value={seasonType} onChange={event=>setSeasonType(event.target.value as "regular"|"ramadan"|"hajj")}><option value="regular">سنوي — دفعات شهرية تبدأ بعد شهر من اعتماد العقد</option><option value="ramadan">موسم رمضان — دفعات بالنسب والتواريخ</option><option value="hajj">موسم الحج — دفعات بالنسب والتواريخ</option></select></label>
    <label>العميل والفرصة<select name="opportunityId" required defaultValue=""><option value="" disabled>اختر العميل والفرصة</option>{data.opportunities.filter((item) => !["won","lost"].includes(item.stage)).map((item) => <option value={item.id} key={item.id}>{item.opportunityCode} · {item.title}</option>)}</select></label>
    <input type="hidden" name="activityLabel" value={activities[activity].label}/>
    <label>موقع تقديم الخدمة<input name="workSite" required placeholder="المدينة، الموقع أو المشروع"/></label><label>تاريخ الإصدار<input name="issueDate" type="date" required/></label><label>العرض صالح حتى<input name="validUntil" type="date" required/></label>
    <div className="quote-form-section span-two"><strong>2. بنود {activities[activity].label}</strong><p>{activities[activity].hint}. يمكن إضافة أكثر من بند.</p></div>
    <div className="quote-line-builder span-two">{items.map((item,index)=><article key={item.key}><header><strong>البند {index+1}</strong>{items.length>1&&<button type="button" onClick={()=>setItems(rows=>rows.filter(row=>row.key!==item.key))}>حذف</button>}</header><label className="quote-line-name">{activity==="workforce"?"المهنة":activity==="construction"?"بند الأعمال":"الخدمة أو الأصل"}{activity==="workforce"?<select required value={item.profession} onChange={e=>update(item.key,"profession",e.target.value)}>{workforceProfessions.map(option=><option key={option.label}>{option.label}</option>)}</select>:<input required value={item.profession} onChange={e=>update(item.key,"profession",e.target.value)}/>}</label>{(activity==="workforce"||activity==="seasonal")&&<label>الجنسية<select value={item.nationality} onChange={e=>update(item.key,"nationality",e.target.value)}><option>أي جنسية</option>{workforceNationalities.map(option=><option key={option}>{option}</option>)}</select></label>}{activity==="workforce"&&<><label>جهة الكفالة<select value={item.sponsorshipType} onChange={e=>update(item.key,"sponsorshipType",e.target.value)}><option value="dali">على كفالة شركة دالي</option><option value="other">على كفالة جهة أخرى</option></select></label>{item.sponsorshipType==="other"&&<><label>اسم الكفيل<input required minLength={2} value={item.sponsorName} onChange={e=>update(item.key,"sponsorName",e.target.value)}/></label><label>حالة عقد أجير<select required value={item.ajirContractStatus} onChange={e=>update(item.key,"ajirContractStatus",e.target.value)}><option value="with_ajir">بعقد أجير</option><option value="without_ajir">بدون عقد أجير</option></select></label></>}</>}<label>الوحدة<input required value={item.unit} onChange={e=>update(item.key,"unit",e.target.value)}/></label><label>{activity==="construction"?"الكمية":"العدد"}<input required type="number" min="1" value={item.quantity} onChange={e=>update(item.key,"quantity",Number(e.target.value))}/></label><label>{activity==="construction"?"معامل/مدة التنفيذ":"المدة بالأشهر"}<input required type="number" min="1" value={item.durationMonths} onChange={e=>update(item.key,"durationMonths",Number(e.target.value))}/></label><label>{activity==="construction"?"سعر الوحدة":"السعر الشهري/الوحدة"}<input required type="number" min="0.01" step="0.01" value={item.unitPrice||""} onChange={e=>update(item.key,"unitPrice",Number(e.target.value))}/></label>{activity!=="construction"&&<label>الوردية أو مستوى الخدمة<input value={item.shift} onChange={e=>update(item.key,"shift",e.target.value)}/></label>}<label className="quote-line-notes">نطاق البند والاستثناءات<input value={item.notes} onChange={e=>update(item.key,"notes",e.target.value)}/></label><b>{money(item.quantity*item.durationMonths*item.unitPrice*100)}</b></article>)}<button className="quote-add-line" type="button" onClick={()=>setItems(rows=>[...rows,{key:`line-${Date.now()}`,...activities[activity].seed}])}>+ إضافة بند {activities[activity].label}</button></div>
    <div className="quote-form-section span-two"><strong>3. التسعير والشروط</strong>{quantityMode==="fixed"&&activity!=="workforce"?<p>الإجمالي الأولي للبنود: {new Intl.NumberFormat("ar-SA",{style:"currency",currency:"SAR"}).format(subtotal)}</p>:<p>{quantityMode==="open"?"العدد مفتوح؛ لا تعرض قيمة إجمالية وتطبق الضريبة عند إصدار الفاتورة الفعلية.":"يعرض المستند عدد العمال لكل مهنة وراتب العامل دون إجماليات تجميعية."}</p>}</div>
    {quantityMode==="fixed"&&seasonType!=="regular"&&<div className="quote-payment-builder span-two"><header><strong>جدول دفعات {seasonType==="hajj"?"موسم الحج":"موسم رمضان"}</strong><small>أدخل النسبة وتاريخ الاستحقاق، ويجب أن يكون مجموع النسب 100%.</small></header>{payments.map((payment,index)=><div key={payment.key}><input aria-label={`عنوان الدفعة ${index+1}`} required value={payment.title} onChange={event=>setPayments(rows=>rows.map(row=>row.key===payment.key?{...row,title:event.target.value}:row))}/><label>النسبة %<input type="number" min="0.01" max="100" step="0.01" required value={payment.percentage} onChange={event=>setPayments(rows=>rows.map(row=>row.key===payment.key?{...row,percentage:Number(event.target.value)}:row))}/></label><label>تاريخ الاستحقاق<input type="date" required value={payment.dueDate} onChange={event=>setPayments(rows=>rows.map(row=>row.key===payment.key?{...row,dueDate:event.target.value}:row))}/></label>{payments.length>1&&<button type="button" onClick={()=>setPayments(rows=>rows.filter(row=>row.key!==payment.key))}>حذف</button>}</div>)}<footer><button type="button" onClick={()=>setPayments(rows=>[...rows,{key:`payment-${Date.now()}`,title:`الدفعة ${rows.length+1}`,percentage:0,dueDate:""}])}>+ إضافة دفعة</button><b>مجموع النسب: {payments.reduce((sum,row)=>sum+Number(row.percentage||0),0).toFixed(2)}%</b></footer></div>}
    {quantityMode==="fixed"&&activity!=="workforce"&&<label>الخصم بالريال<input name="discount" type="number" min="0" step="0.01" defaultValue="0"/></label>}<label>ضريبة القيمة المضافة<select name="vatRate" defaultValue="15"><option value="0">بدون ضريبة</option><option value="15">ضريبة 15%</option></select></label><label className="span-two">شروط الدفع<textarea name="terms" required rows={3} placeholder="مثال: دفعة مقدمة ثم دفعات مرحلية مرتبطة بالإنجاز"/></label><label className="span-two">نطاق العرض والافتراضات والاستثناءات<textarea name="assumptions" rows={3} placeholder={`تفاصيل خاصة بمسار ${activities[activity].label}`}/></label><button className="quote-submit span-two" disabled={busy === "create-quote"}>{busy === "create-quote"?"جارٍ حفظ المسودة...":"حفظ مسودة عرض السعر للاعتماد"}</button>
  </form>;
  return embedded?form:<FormDetails title="إنشاء عرض سعر حسب نوع الطلب">{form}</FormDetails>;
}

export function QuotationIssueModal({ onClose, onCreated }: { onClose: () => void; onCreated: (message: string) => void }) {
  const [data,setData]=useState<OperationsData|null>(null);const [busy,setBusy]=useState("");const [error,setError]=useState("");
  useEffect(()=>{void fetch("/api/portal/operations?limit=100",{cache:"no-store"}).then(async response=>{const result=await response.json() as OperationsData&{error?:string};if(!response.ok)throw new Error(result.error||"تعذّر تحميل بيانات عرض السعر");setData(result);}).catch(problem=>setError(problem instanceof Error?problem.message:"تعذّر تحميل بيانات عرض السعر"));},[]);
  const create:CreateOperation=async(action,form,extra={})=>{setBusy(action);setError("");try{const payload={action,idempotencyKey:crypto.randomUUID(),...Object.fromEntries(new FormData(form).entries()),...extra};const response=await fetch("/api/portal/operations",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});const result=await response.json() as {error?:string};if(!response.ok)throw new Error(result.error||"تعذّر حفظ عرض السعر");onCreated("تم حفظ مسودة عرض السعر. يظهر الاعتماد للمالك أو مشرف النظام، ويتاح PDF بعد الاعتماد فقط.");onClose();}catch(problem){setError(problem instanceof Error?problem.message:"تعذّر حفظ عرض السعر");}finally{setBusy("");}};
  return <div className="modal-layer"><button className="drawer-backdrop" aria-label="إغلاق نموذج عرض السعر" onClick={onClose}/><section className="record-modal quotation-document-modal" role="dialog" aria-modal="true" aria-label="إنشاء عرض سعر"><div className="drawer-head"><div><span>نموذج المستندات المعتمد</span><h2>إنشاء عرض سعر احترافي</h2></div><button onClick={onClose} aria-label="إغلاق"><span aria-hidden>×</span></button></div>{error&&<div className="contract-form-error">{error}</div>}{data?<QuoteForm data={data} busy={busy} onCreate={create} embedded/>:<div className="operations-loading"><span/><p>جارٍ تجهيز نموذج عرض السعر...</p></div>}</section></div>;
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
const quoteStatusLabels: Record<string,string> = { draft:"مسودة",pending_approval:"بانتظار الاعتماد",approved:"معتمد",sent:"مرسل للعميل",accepted:"مقبول",rejected:"مرفوض",expired:"منتهي الصلاحية",superseded:"إصدار سابق",cancelled:"ملغى" };
const orderNext: Record<string,string[]> = { planned:["staffing","cancelled"],staffing:["active","paused","cancelled"],active:["paused","completed"],paused:["active","cancelled"] };
const timesheetNext: Record<string,string[]> = { draft:["submitted"],submitted:["approved","rejected"],rejected:["draft"],approved:["invoiced"] };
const capacityNext: Record<string,string[]> = { planning:["approved","cancelled"],approved:["active","cancelled"],active:["completed","cancelled"] };
