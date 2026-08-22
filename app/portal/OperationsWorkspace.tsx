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
      <div className="operations-list wide">{data.quotes.filter(includes).map((quote) => <div key={quote.id}><span className="record-code">{quote.quoteCode}<small>v{quote.versionNumber}</small></span><p><strong>{data.opportunities.find((item) => item.id === quote.opportunityId)?.title || "فرصة"}</strong><small>{fmt(quote.issueDate)} · صالح حتى {fmt(quote.validUntil)} · {data.quoteItems.filter((item) => item.quoteVersionId === quote.id).length} بنود</small></p><b>{money(quote.totalHalalas)}</b><span className={`workflow-status ${quote.status}`}>{quote.status}</span>{canWrite && !["accepted","superseded"].includes(quote.status) && <button className="quote-revision" disabled={busy === `revision-${quote.id}`} onClick={() => void createQuoteRevision(quote)}>نسخة جديدة</button>}{canWrite && <TransitionSelect busy={busy === `transition-quote-${quote.id}`} value={quote.status} options={quoteNext[quote.status] || []} onChange={(status) => void transition("transition-quote", quote, status)}/>}</div>)}</div>
    </OperationsSection>}

    {tab === "contracts" && <><div className="contract-create-toolbar">{canWrite&&<button className="admin-primary" onClick={onCreateContract}>إنشاء عقد</button>}</div><ContractBillingWorkspace/></>}

    {tab === "orders" && <OperationsSection title="أوامر التشغيل" count={data.workOrders.length} form={canWrite ? <WorkOrderForms data={data} busy={busy} onCreate={create}/> : null}>
      <div className="operations-list wide">{data.workOrders.filter(includes).map((order) => { const reqs = data.requirements.filter((item) => item.workOrderId === order.id); const shortage = reqs.reduce((sum,item) => sum + Math.max(0,item.requiredCount-item.filledCount),0); return <div key={order.id}><span className="record-code">{order.workOrderCode}</span><p><strong>{order.title}</strong><small>{order.workSite} · {fmt(order.startDate)} · {reqs.map((item) => `${item.profession} ${item.requiredCount}`).join("، ")}</small></p><b className={shortage ? "shortage" : "complete"}>{shortage ? `نقص ${shortage}` : "مكتمل"}</b><span className={`workflow-status ${order.status}`}>{order.status}</span>{canWrite && <TransitionSelect busy={busy === `transition-work-order-${order.id}`} value={order.status} options={orderNext[order.status] || []} onChange={(status) => void transition("transition-work-order", order, status)}/>}</div>; })}</div>
    </OperationsSection>}

    {tab === "timesheets" && <OperationsSection title="كشوف الدوام والاعتماد" count={data.timesheets.length} form={canWrite ? <TimesheetForms data={data} workers={data.workers} busy={busy} onCreate={create}/> : null}>
      <div className="operations-list wide">{data.timesheets.filter(includes).map((sheet) => <div key={sheet.id}><span className="record-code">{sheet.timesheetCode}</span><p><strong>{data.workOrders.find((item) => item.id === sheet.workOrderId)?.title || "أمر تشغيل"}</strong><small>{fmt(sheet.periodStart)} — {fmt(sheet.periodEnd)}</small></p><span className={`workflow-status ${sheet.status}`}>{sheet.status}</span>{canWrite && <TransitionSelect busy={busy === `transition-timesheet-${sheet.id}`} value={sheet.status} options={timesheetNext[sheet.status] || []} onChange={(status) => void transition("transition-timesheet", sheet, status)}/>}</div>)}</div>
    </OperationsSection>}

    {tab === "capacity" && <Opes�7�Kh��춻�q�^vعات والتشغيل */
.operations-loading{min-height:420px;display:grid;place-items:center;align-content:center;gap:14px;color:#6e7e86}.operations-loading span{width:34px;height:34px;border:3px solid #dfe6e9;border-top-color:var(--admin-red);border-radius:50%;animation:spin .8s linear infinite}.operations-notice{margin-bottom:15px;padding:13px 16px;border:1px solid #cadde3;background:#f3fafc;color:var(--admin-navy);font-size:13px}.operations-metrics{grid-template-columns:repeat(4,1fr)}.operations-tabs{margin:18px 0 0;display:flex;gap:5px;overflow-x:auto;padding-bottom:2px}.operations-tabs button{min-height:43px;padding:0 15px;border:1px solid var(--admin-border);border-radius:6px 6px 0 0;background:#fff;color:#617179;font-size:13px;white-space:nowrap;cursor:pointer}.operations-tabs button.active{background:var(--admin-navy);border-color:var(--admin-navy);color:#fff}.operations-search{padding:12px 14px;border:1px solid var(--admin-border);background:#fff}.operations-search label{height:42px;padding:0 12px;display:flex;align-items:center;gap:9px;border:1px solid var(--admin-border);background:#f8fafb}.operations-search input{width:100%;border:0;outline:0;background:transparent;font-size:14px}.operations-section{margin-top:15px;overflow:visible}.operations-section>header{min-height:72px;padding:15px 18px;border-bottom:1px solid var(--admin-border);display:flex;align-items:center;justify-content:space-between;gap:15px}.operations-section>header h2,.operations-split h3{margin:0;color:var(--admin-navy);font-size:18px}.operations-section>header p{margin:5px 0 0;color:#819098;font-size:12px}.operations-form-group{display:flex;gap:8px}.operations-form{position:relative}.operations-form summary{min-height:40px;padding:0 13px;border:1px solid var(--admin-border);border-radius:5px;display:flex;align-items:center;background:#fff;color:var(--admin-red);font-size:13px;font-weight:700;cursor:pointer;list-style:none}.operations-form[open] summary{background:var(--admin-navy);color:#fff}.operations-form form{position:absolute;z-index:55;top:calc(100% + 7px);left:0;width:min(520px,calc(100vw - 60px));max-height:65vh;overflow:auto;padding:17px;border:1px solid var(--admin-border);border-radius:8px;background:#fff;box-shadow:0 18px 55px rgba(0,29,45,.18);display:grid;grid-template-columns:1fr 1fr;gap:10px}.operations-form input,.operations-form select,.operations-form textarea{width:100%;min-height:42px;padding:9px 10px;border:1px solid var(--admin-border);border-radius:5px;background:#fff;color:var(--admin-navy);font:inherit;font-size:13px}.operations-form textarea,.operations-form button,.operations-form form>label{grid-column:1/-1}.operations-form button{min-height:42px;border:0;border-radius:5px;background:var(--admin-red);color:#fff;font:inherit;font-size:13px;font-weight:700}.operations-form form>label{display:flex;align-items:center;gap:8px;font-size:13px}.operations-form form>label input{width:17px;min-height:17px}.operations-split{display:grid;grid-template-columns:1fr 1fr}.operations-split>article{min-width:0}.operations-split>article:first-child{border-left:1px solid var(--admin-border)}.operations-split h3{padding:16px 18px;border-bottom:1px solid var(--admin-border);font-size:15px}.operations-list>div{min-height:77px;padding:12px 16px;border-bottom:1px solid #edf1f3;display:grid;grid-template-columns:auto minmax(0,1fr) auto auto auto;align-items:center;gap:12px}.operations-list>div:last-child{border-bottom:0}.operations-list p{min-width:0;margin:0;display:grid;gap:5px}.operations-list p strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--admin-navy);font-size:14px}.operations-list p small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#7c8b92;font-size:12px}.record-code{min-width:76px;color:var(--admin-red);font-size:12px;font-weight:700}.record-code small{display:block;margin-top:4px;color:#88959b}.operations-list>div>b{font-size:13px;color:var(--admin-navy);white-space:nowrap}.operations-list>div>b.shortage{color:#b26c11}.operations-list>div>b.complete{color:#267c52}.workflow-status{padding:6px 9px;border-radius:14px;background:#edf2f4;color:#63747c;font-size:12px;white-space:nowrap}.workflow-status.approved,.workflow-status.accepted,.workflow-status.active,.workflow-status.completed{background:#eaf6ef;color:#247c51}.workflow-status.pending_approval,.workflow-status.submitted,.workflow-status.staffing,.workflow-status.planning{background:#fff5e5;color:#98651b}.workflow-status.rejected,.workflow-status.cancelled,.workflow-status.lost{background:#fff0f0;color:#b72830}.workflow-transition{min-width:125px;height:36px;border:1px solid var(--admin-border);border-radius:5px;background:#fff;color:var(--admin-navy);font-size:12px}.privacy-operations p small{direction:rtl}.operations-section .empty-small{padding:35px}.operations-section input:focus,.operations-section select:focus,.operations-section textarea:focus{border-color:var(--admin-red);outline:2px solid rgba(225,42,52,.12)}
@media(max-width:1000px){.operations-metrics{grid-template-columns:1fr 1fr}.operations-split{grid-template-columns:1fr}.operations-split>article:first-child{border-left:0;border-bottom:1px solid var(--admin-border)}}
@media(max-width:700px){.operations-section>header{align-items:flex-start;flex-direction:column}.operations-form-group{width:100%;display:grid;grid-template-columns:1fr 1fr}.operations-form summary{justify-content:center}.operations-form form{position:fixed;top:80px;right:12px;left:12px;width:auto;max-height:calc(100vh - 100px);grid-template-columns:1fr}.operations-form form>*{grid-column:1!important}.operations-list>div{grid-template-columns:auto 1fr}.operations-list>div>*:nth-child(n+3){grid-column:2}.workflow-transition{width:100%}}

/* حوكمة روابط مشاركة المستندات */
.share-manager{margin-top:18px}.share-manager>form{display:grid;grid-template-columns:minmax(220px,2fr) 1fr 1fr auto;gap:10px;align-items:end;padding:18px;border-bottom:1px solid var(--admin-border)}.share-manager form label{display:grid;gap:5px;color:var(--admin-muted);font-size:12px}.share-manager select,.share-manager input{min-height:42px;border:1px solid var(--admin-border);background:#fff;padding:0 11px;font:inherit}.share-manager-notice{margin:12px 18px;padding:10px 12px;background:#eef8f2;color:#286b4a}.share-link-list article{display:grid;grid-template-columns:70px minmax(0,1fr) 100px auto;align-items:center;gap:14px;padding:13px 18px;border-top:1px solid #edf1f2}.share-link-list article>span{padding:5px 8px;text-align:center;border-radius:14px;font-size:11px}.share-link-list article>span.active{background:#eaf6ef;color:#237a50}.share-link-list article>span.inactive{background:#f1f3f4;color:#6c777c}.share-link-list p{margin:0;display:grid;gap:3px}.share-link-list p small{color:var(--admin-muted)}.share-link-list article>b{font-size:12px}.share-link-list button{border:0;background:#fff0f0;color:#a6232c;padding:8px 11px;font:inherit;font-weight:700}
@media(max-width:800px){.share-manager>form{grid-template-columns:1fr}.share-link-list article{grid-template-columns:1fr}.share-link-list article>span{width:max-content}}
/* Brand identity center */
.brand-heading .admin-primary{min-width:190px}.brand-hero{margin-bottom:18px;min-height:260px;display:grid;grid-template-columns:minmax(260px,38%) 1fr;overflow:hidden}.brand-logo-stage{display:grid;place-items:center;padding:34px;background:linear-gradient(135deg,#f5f8f9,#fff)}.brand-logo-stage img{width:min(330px,100%);height:auto;mix-blend-mode:multiply}.brand-hero>div:last-child{padding:38px;display:flex;flex-direction:column;justify-content:center}.brand-hero p{margin:0 0 8px;color:var(--admin-red);font-size:12px;font-weight:700}.brand-hero h2{margin:0;color:var(--admin-navy);font-size:27px}.brand-hero>div>span{margin-top:12px;max-width:680px;color:#65767e;font-size:14px;line-height:1.9}.brand-swatches{display:flex;gap:8px;margin-top:23px;direction:ltr}.brand-swatches i{width:42px;height:42px;border-radius:50%;border:4px solid #fff;box-shadow:0 0 0 1px #dae2e5}.brand-swatches .navy{background:#001d2d}.brand-swatches .red{background:#e21c25}.brand-swatches .pale{background:#f4f7f8}.brand-swatches .white{background:#fff}.brand-asset-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.brand-asset-card{min-height:240px;padding:20px;display:flex;flex-direction:column}.brand-asset-card header{display:flex;align-items:center;justify-content:space-between}.brand-asset-card header span{padding:6px 8px;border-radius:4px;background:#fff0f0;color:var(--admin-red);font-size:10px;font-weight:700}.brand-asset-card header small{color:#819097;font-size:11px}.brand-asset-card>div{padding:24px 0;flex:1}.brand-asset-card h2{margin:0 0 9px;color:var(--admin-navy);font-size:18px}.brand-asset-card p{margin:0;color:#718188;font-size:12px;line-height:1.8}.brand-asset-card footer{padding-top:14px;border-top:1px solid var(--admin-border);display:flex;align-items:center;justify-content:space-between;gap:10px}.brand-asset-card footer>span{color:#8a979d;font-size:10px}.brand-asset-card footer div{display:flex;gap:6px}.brand-asset-card footer a,.brand-asset-card footer button{min-height:34px;padding:0 10px;border:1px solid var(--admin-border);border-radius:5px;background:#fff;color:var(--admin-navy);font:inherit;font-size:11px;text-decoration:none;display:inline-flex;align-items:center;cursor:pointer}.brand-asset-card footer button{border-color:var(--admin-navy);background:var(--admin-navy);color:#fff}.brand-rules{margin-top:18px;overflow:hidden}.brand-rules>header{padding:20px 22px;border-bottom:1px solid var(--admin-border)}.brand-rules h2{margin:0;color:var(--admin-navy);font-size:18px}.brand-rules header p{margin:5px 0 0;color:#829098;font-size:12px}.brand-rules>div{display:grid;grid-template-columns:repeat(4,1fr)}.brand-rules article{min-height:150px;padding:20px;border-left:1px solid var(--admin-border);display:flex;flex-direction:column}.brand-rules article:last-child{border-left:0}.brand-rules b{color:var(--admin-red);font-size:11px}.brand-rules strong{margin-top:17px;color:var(--admin-navy);font-size:15px}.brand-rules span{margin-top:7px;color:#75848b;font-size:11px;line-height:1.7}@media(max-width:1050px){.brand-asset-grid{grid-template-columns:repeat(2,1fr)}.brand-rules>div{grid-template-columns:repeat(2,1fr)}}@media(max-width:700px){.brand-hero{grid-template-columns:1fr}.brand-logo-stage{min-height:210px}.brand-hero>div:last-child{padding:25px}.brand-asset-grid{grid-template-columns:1fr}.brand-rules>div{grid-template-columns:1fr}.brand-rules article{border-left:0;border-bottom:1px solid var(--admin-border)}}
.contract-form-error{padding:12px 14px;border:1px solid #efc4c6;border-right:4px solid var(--admin-red);border-radius:6px;background:#fff3f3;color:#a51f26;font-size:10px;line-height:1.7;font-weight:700}
.contract-create-toolbar{display:flex;justify-content:flex-end;margin-bottom:10px}
.role-definition-manager{display:grid;gap:18px}.role-definition-manager>header{display:flex;align-items:flex-start;justify-content:space-between;gap:20px}.role-definition-manager>header h2{margin:0 0 6px}.role-definition-manager>header p{margin:0;color:var(--admin-muted,#68777f)}.role-definition-form{display:grid;gap:16px}.role-definition-fields{display:grid;grid-template-columns:1fr 1.25fr 2fr auto;gap:10px}.role-definition-fields input,.role-definition-form textarea{min-height:44px;border:1px solid #d9e2e6;border-radius:10px;padding:10px 12px;background:#fff}.role-active{display:flex;align-items:center;gap:7px;white-space:nowrap}.role-definition-form fieldset{border:1px solid #dce5e8;border-radius:14px;padding:14px}.role-definition-form legend{padding:0 8px;font-weight:700}.role-permission-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.role-permission-grid label{display:grid;grid-template-columns:auto 1fr;gap:2px 8px;align-items:center;border:1px solid #e3eaed;border-radius:10px;padding:9px;background:#f9fbfc}.role-permission-grid label small{grid-column:2;color:#718087;font-size:11px}.role-definition-actions{display:flex;gap:8px}.role-definition-actions button,.role-definition-list button{border:0;border-radius:9px;padding:10px 16px;cursor:pointer}.role-definition-actions button:first-child{background:#001d2d;color:#fff}.role-definition-list{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.role-definition-list article{display:flex;justify-content:space-between;gap:12px;border:1px solid #dde5e8;border-radius:12px;padding:14px}.role-definition-list article.inactive{opacity:.58}.role-definition-list strong,.role-definition-list code,.role-definition-list small{display:block}.role-definition-list p{margin:7px 0;color:#627178}.role-definition-list code{direction:ltr;text-align:right;color:#8a5555}@media(max-width:950px){.role-definition-fields,.role-permission-grid,.role-definition-list{grid-template-columns:1fr}.role-definition-manager>header{flex-direction:column}}
.contract-payment-builder,.client-document-files{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.contract-payment-builder article{display:grid;grid-template-columns:1.5fr 1fr 1fr auto;gap:8px;align-items:end;border:1px solid #dfe7ea;border-radius:12px;padding:12px}.contract-payment-builder input,.client-document-files input{width:100%;min-height:42px;border:1px solid #d9e2e6;border-radius:9px;padding:8px}.contract-payment-builder small{grid-column:1/-1;color:#708087}.contract-billing{display:grid;gap:18px}.contract-billing>header{display:flex;justify-content:space-between}.contract-billing-list{display:grid;gap:14px}.contract-billing-list>article{border:1px solid #dce5e8;border-radius:14px;overflow:hidden}.contract-billing-list>article>header{display:flex;justify-content:space-between;padding:15px;background:#f7fafb}.contract-billing-list h3,.contract-billing-list p{margin:3px 0}.payment-schedule-list>div{display:grid;grid-template-columns:2fr 1fr 1fr 3fr;align-items:center;gap:10px;padding:12px 15px;border-top:1px solid #e4eaed}.payment-schedule-list small{display:block;color:#6c7c83}.payment-actions{display:flex;gap:6px;flex-wrap:wrap}.payment-actions button,.payment-actions a{border:1px solid #ccd8dc;border-radius:8px;background:#fff;color:#173440;padding:7px 9px;text-decoration:none;cursor:pointer}.payment-actions .legal-referral{border-color:#e9b2b5;color:#9e1e25}@media(max-width:900px){.contract-payment-builder,.client-document-files{grid-template-columns:1fr}.contract-payment-builder article,.payment-schedule-list>div{grid-template-columns:1fr}}
