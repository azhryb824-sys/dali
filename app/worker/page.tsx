import { Suspense } from "react";
import { desc, eq } from "drizzle-orm";
import Image from "next/image";
import { chatGPTSignOutPath, requireChatGPTUser } from "@/app/chatgpt-auth";
import { getDb } from "@/db";
import { timeEntries, timesheets, workerAttachments, workers, workOrders } from "@/db/schema";
import { resolveWorkerAccess } from "@/lib/client-access";

export const dynamic = "force-dynamic";
const date = (value: string | null) => value ? new Intl.DateTimeFormat("ar-SA", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value.includes("T") ? value : `${value}T00:00:00`)) : "—";

async function WorkerPortal() {
  const user = await requireChatGPTUser("/worker");
  const access = await resolveWorkerAccess(user, true);
  if (!access) return <main className="worker-gate"><section><Image src="/dally-logo.jpg" alt="شركة دالي" width={545} height={280} sizes="180px"/><h1>الحساب غير مخوّل</h1><p>يجب أن تربط الشركة بريدك بملف العامل قبل استخدام الخدمة الذاتية.</p><a href={chatGPTSignOutPath("/worker")}>تسجيل الخروج</a></section></main>;
  const db = getDb();
  const worker = await db.query.workers.findFirst({ where: eq(workers.id, access.workerId) });
  if (!worker) return <main className="worker-gate"><p>ملف العامل غير متاح.</p></main>;
  const [files, entries] = await Promise.all([
    db.select({ id: workerAttachments.id, title: workerAttachments.title, documentType: workerAttachments.documentType, fileName: workerAttachments.fileName, createdAt: workerAttachments.createdAt }).from(workerAttachments).where(eq(workerAttachments.workerId, worker.id)).orderBy(desc(workerAttachments.createdAt)).limit(200),
    db.select().from(timeEntries).where(eq(timeEntries.workerId, worker.id)).orderBy(desc(timeEntries.workDate)).limit(200),
  ]);
  const sheetIds = Array.from(new Set(entries.map((item) => item.timesheetId)));
  const sheets = await Promise.all(sheetIds.map((id) => db.query.timesheets.findFirst({ where: eq(timesheets.id, id) })));
  const workOrder = worker.workOrderId ? await db.query.workOrders.findFirst({ where: eq(workOrders.id, worker.workOrderId) }) : null;
  const attendance = entries.reduce((map, item) => map.set(item.attendanceStatus, (map.get(item.attendanceStatus) || 0) + 1), new Map<string,number>());
  return <main className="worker-shell"><header><Image src="/dally-logo.jpg" alt="شركة دالي" width={545} height={280} sizes="160px"/><div><span>الخدمة الذاتية للعامل</span><strong>{worker.fullName}</strong></div><a href={chatGPTSignOutPath("/worker")}>تسجيل الخروج</a></header><section><div className="worker-profile"><span>{worker.fullName.split(" ").slice(0,2).map((part) => part[0]).join("")}</span><div><p>{worker.workerNumber}</p><h1>{worker.fullName}</h1><small>{worker.profession} · {worker.nationality}</small></div><b className={`worker-status ${worker.status}`}>{worker.status}</b></div><div className="worker-cards"><article><span>الإقامة</span><strong dir="ltr">{worker.iqamaNumber || "غير مكتمل"}</strong><small>الانتهاء {date(worker.iqamaExpiry)}</small></article><article><span>الجهة المستفيدة</span><strong>{worker.beneficiaryName || "غير مسند"}</strong><small>{worker.clientSite || "دون موقع"}</small></article><article><span>أمر التشغيل</span><strong>{workOrder?.workOrderCode || "غير مرتبط"}</strong><small>{workOrder?.title || "—"}</small></article><article><span>سجلات الدوام</span><strong>{entries.length}</strong><small>حضور {attendance.get("present") || 0} · غياب {attendance.get("absent") || 0}</small></article></div><WorkerPanel title="آخر سجلات الدوام"><div className="worker-list">{entries.slice(0,30).map((entry) => <article key={entry.id}><span>{date(entry.workDate)}</span><p><strong>{entry.attendanceStatus}</strong><small>{Math.round(entry.regularMinutes/60)} ساعات · إضافي {Math.round(entry.overtimeMinutes/60)} ساعة · {sheets.find((sheet) => sheet?.id === entry.timesheetId)?.timesheetCode}</small></p></article>)}</div></WorkerPanel><WorkerPanel title="مستنداتي"><div className="worker-docs">{files.map((file) => <a href={`/api/worker/documents/${file.id}`} key={file.id}><span>ملف</span><p><strong>{file.title}</strong><small>{file.fileName} · {date(file.createdAt)}</small></p><b>تنزيل ←</b></a>)}</div></WorkerPanel></section></main>;
}
function WorkerPanel({ title, children }: { title: string; children: React.ReactNode }) { return <section className="worker-panel"><header><h2>{title}</h2></header>{children}</section>; }
export default function WorkerPage() { return <Suspense fallback={<main className="worker-gate"><p>جارٍ التحقق...</p></main>}><WorkerPortal/></Suspense>; }
