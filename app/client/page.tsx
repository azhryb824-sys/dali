import { Suspense } from "react";
import Image from "next/image";
import { desc, eq, inArray } from "drizzle-orm";
import { chatGPTSignOutPath, requireChatGPTUser } from "@/app/chatgpt-auth";
import { getDb } from "@/db";
import { clients, companyDocuments, financialRecords, quoteItems, quoteVersions, salesOpportunities, timeEntries, timesheets, workOrderRequirements, workOrders, workforceContracts } from "@/db/schema";
import { resolveClientAccess } from "@/lib/client-access";
import ClientTimesheetActions from "./ClientTimesheetActions";
import ClientQuoteActions from "./ClientQuoteActions";

export const dynamic = "force-dynamic";
const money = (value: number) => new Intl.NumberFormat("ar-SA", { style: "currency", currency: "SAR" }).format(value / 100);
const date = (value: string | null) => value ? new Intl.DateTimeFormat("ar-SA", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value.includes("T") ? value : `${value}T00:00:00`)) : "—";

async function ClientPortal() {
  const user = await requireChatGPTUser("/client");
  const access = await resolveClientAccess(user, true);
  if (!access) return <main className="client-gate"><section><Image src="/dally-logo.jpg" alt="شركة دالي" width={545} height={280} sizes="180px"/><p>بوابة العميل</p><h1>الحساب غير مخوّل</h1><span>يجب أن تدعو الشركة بريدك أولاً وتربطه بملف العميل.</span><a href={chatGPTSignOutPath("/client")}>تسجيل الخروج</a></section></main>;
  const db = getDb();
  const client = await db.query.clients.findFirst({ where: eq(clients.id, access.clientId) });
  if (!client) return <main className="client-gate"><section><h1>ملف العميل غير متاح</h1></section></main>;
  const [orders, sheets, opportunities, contracts] = await Promise.all([
    db.select().from(workOrders).where(eq(workOrders.clientId, client.id)).orderBy(desc(workOrders.updatedAt)).limit(200),
    db.select().from(timesheets).where(eq(timesheets.clientId, client.id)).orderBy(desc(timesheets.updatedAt)).limit(200),
    db.select().from(salesOpportunities).where(eq(salesOpportunities.clientId, client.id)).orderBy(desc(salesOpportunities.updatedAt)).limit(200),
    db.select().from(workforceContracts).where(eq(workforceContracts.clientId, client.id)).orderBy(desc(workforceContracts.updatedAt)).limit(200),
  ]);
  const opportunityIds = opportunities.map((item) => item.id);
  const orderIds = orders.map((item) => item.id);
  const sheetIds = sheets.map((item) => item.id);
  const contractIds = contracts.map((item) => item.id);
  const [quotes, requirements, entries, finance] = await Promise.all([
    opportunityIds.length ? db.select().from(quoteVersions).where(inArray(quoteVersions.opportunityId, opportunityIds)).orderBy(desc(quoteVersions.updatedAt)).limit(300) : Promise.resolve([]),
    orderIds.length ? db.select().from(workOrderRequirements).where(inArray(workOrderRequirements.workOrderId, orderIds)).limit(1000) : Promise.resolve([]),
    sheetIds.length ? db.select().from(timeEntries).where(inArray(timeEntries.timesheetId, sheetIds)).limit(5000) : Promise.resolve([]),
    contractIds.length ? db.select().from(financialRecords).where(inArray(financialRecords.contractId, contractIds)).orderBy(desc(financialRecords.updatedAt)).limit(300) : Promise.resolve([]),
  ]);
  const quoteIds = quotes.map((item) => item.id);
  const quoteRows = quoteIds.length ? await db.select().from(quoteItems).where(inArray(quoteItems.quoteVersionId, quoteIds)).limit(3000) : [];
  const documentIds = Array.from(new Set([...contracts.map((item) => item.documentId), ...quotes.map((item) => item.documentId).filter((id): id is number => Boolean(id))]));
  const documents = documentIds.length ? await db.select({ id: companyDocuments.id, referenceCode: companyDocuments.referenceCode, title: companyDocuments.title, fileName: companyDocuments.fileName, contentType: companyDocuments.contentType, sizeBytes: companyDocuments.sizeBytes, createdAt: companyDocuments.createdAt }).from(companyDocuments).where(inArray(companyDocuments.id, documentIds)).limit(500) : [];
  const receivables = finance.filter((item) => ["workforce_invoice", "invoice", "progress_claim"].includes(item.category));

  return <main className="client-shell"><header><a href="/client"><Image src="/dally-logo.jpg" alt="شركة دالي" width={545} height={280} sizes="160px"/></a><div><span>بوابة العميل</span><strong>{client.legalName}</strong></div><p><span>{access.displayName}</span><a href={chatGPTSignOutPath("/client")}>تسجيل الخروج</a></p></header><section className="client-content"><div className="client-heading"><p>متابعة الخدمة</p><h1>مرحباً، {access.displayName.split(" ")[0]}</h1><span>أوامر التشغيل وكشوف الدوام والعروض والمستندات المرتبطة بمنشأتك فقط.</span></div><section className="client-metrics"><article><span>أوامر نشطة</span><strong>{orders.filter((item) => item.status === "active").length}</strong></article><article><span>كشوف تنتظر الاعتماد</span><strong>{sheets.filter((item) => item.status === "submitted").length}</strong></article><article><span>عروض أسعار</span><strong>{quotes.length}</strong></article><article><span>مستندات</span><strong>{documents.length}</strong></article></section>
    <ClientPanel title="أوامر التشغيل"><div className="client-list">{orders.map((order) => <article key={order.id}><span>{order.workOrderCode}</span><p><strong>{order.title}</strong><small>{order.workSite} · {date(order.startDate)} — {date(order.endDate)}</small><small>{requirements.filter((item) => item.workOrderId === order.id).map((item) => `${item.profession}: ${item.filledCount}/${item.requiredCount}`).join(" · ")}</small></p><b className={`client-status ${order.status}`}>{order.status}</b></article>)}</div></ClientPanel>
    <ClientPanel title="كشوف الدوام"><div className="client-list">{sheets.map((sheet) => <article key={sheet.id}><span>{sheet.timesheetCode}</span><p><strong>{orders.find((item) => item.id === sheet.workOrderId)?.title || "أمر تشغيل"}</strong><small>{date(sheet.periodStart)} — {date(sheet.periodEnd)} · {entries.filter((item) => item.timesheetId === sheet.id).length} سجل حضور</small></p><ClientTimesheetActions id={sheet.id} status={sheet.status} canApprove={access.canApproveTimesheets}/></article>)}</div></ClientPanel>
    <ClientPanel title="العروض المقبولة والمرسلة"><div className="client-list">{quotes.filter((item) => ["sent","accepted","rejected"].includes(item.status)).map((quote) => <article key={quote.id}><span>{quote.quoteCode} v{quote.versionNumber}</span><p><strong>{money(quote.totalHalalas)}</strong><small>صالح حتى {date(quote.validUntil)} · {quoteRows.filter((item) => item.quoteVersionId === quote.id).map((item) => `${item.profession} × ${item.quantity}`).join("، ")}</small></p><ClientQuoteActions id={quote.id} status={quote.status} canApprove={access.canApproveQuotes}/></article>)}</div></ClientPanel>
    <ClientPanel title="الفواتير والمستخلصات"><div className="client-list">{receivables.map((item) => <article key={item.id}><span>{item.referenceCode}</span><p><strong>{item.description}</strong><small>الاستحقاق {date(item.dueDate)}</small></p><b>{money(item.amountHalalas)} · {item.status}</b></article>)}</div></ClientPanel>
    <ClientPanel title="المستندات"><div className="client-documents">{documents.map((document) => <a key={document.id} href={`/api/client/documents/${document.id}`}><span>PDF</span><p><strong>{document.title}</strong><small>{document.referenceCode} · {date(document.createdAt)}</small></p><b>تنزيل ←</b></a>)}</div></ClientPanel>
  </section></main>;
}

function ClientPanel({ title, children }: { title: string; children: React.ReactNode }) { return <section className="client-panel"><header><h2>{title}</h2></header>{children}</section>; }
export default function ClientPage() { return <Suspense fallback={<main className="client-gate"><p>جارٍ التحقق من الوصول...</p></main>}><ClientPortal/></Suspense>; }
