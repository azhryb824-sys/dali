"use client";

import { useCallback, useEffect, useState } from "react";

type IntegrationEvent = { id: string; eventType: string; aggregateType: string; aggregateId: string; status: string; attempts: number; availableAt: string; processedAt: string | null; lastError: string | null; createdAt: string };
const formatDate = (value: string) => new Intl.DateTimeFormat("ar-SA", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));

export default function IntegrationManager() {
  const [events, setEvents] = useState<IntegrationEvent[]>([]);
  const [configured, setConfigured] = useState(false);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const response = await fetch("/api/portal/integrations", { cache: "no-store" });
    const result = await response.json() as { events?: IntegrationEvent[]; configured?: boolean; error?: string };
    if (!response.ok || !result.events) throw new Error(result.error || "تعذّر تحميل حالة التكامل");
    setEvents(result.events);
    setConfigured(Boolean(result.configured));
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load().catch((error) => setNotice(error instanceof Error ? error.message : "تعذّر التحميل")), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function action(name: "dispatch" | "retry" | "cleanup-transient", id?: string) {
    if (name === "cleanup-transient" && !window.confirm("سيتم حذف سجلات التقييد والعمليات والجلسات المنتهية وأحداث التكامل المعالجة الأقدم من 90 يوماً. هل تريد المتابعة؟")) return;
    setBusy(id || name); setNotice("");
    try {
      const response = await fetch("/api/portal/integrations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: name, id }) });
      const result = await response.json() as { error?: string; processed?: number; failed?: number; cleaned?: Record<string, number> };
      if (!response.ok) throw new Error(result.error || "تعذّر تنفيذ العملية");
      setNotice(name === "dispatch" ? `عولج ${result.processed || 0} حدث، وتعذّر ${result.failed || 0}.` : name === "retry" ? "أُعيد الحدث إلى طابور المعالجة." : "اكتملت صيانة البيانات المؤقتة.");
      await load();
    } catch (error) { setNotice(error instanceof Error ? error.message : "تعذّر تنفيذ العملية"); }
    finally { setBusy(""); }
  }

  const pending = events.filter((item) => item.status === "pending").length;
  const failed = events.filter((item) => item.status === "failed").length;
  return <section className="panel integrations-panel"><header><div><h2>طابور التكامل والصيانة</h2><p>تسليم موثوق للأحداث عبر Webhook موقّع، مع إعادة محاولة تدريجية وصيانة للسجلات المؤقتة.</p></div><div className="integration-actions"><button className="admin-secondary" disabled={busy !== ""} onClick={() => void action("cleanup-transient")}>صيانة البيانات المؤقتة</button><button className="admin-primary" disabled={busy !== "" || !configured} onClick={() => void action("dispatch")}>{busy === "dispatch" ? "جارٍ الإرسال" : "معالجة الطابور"}</button></div></header><div className={`integration-config ${configured ? "ready" : "missing"}`}><strong>{configured ? "التكامل مهيأ" : "التكامل غير مهيأ"}</strong><span>{configured ? "سيُرسل كل حدث بتوقيع HMAC ومعرّف ثابت لمنع التكرار." : "يلزم ضبط INTEGRATION_WEBHOOK_URL وINTEGRATION_WEBHOOK_SECRET؛ تبقى الأحداث محفوظة حتى ذلك الحين."}</span><b>{pending} معلق · {failed} فاشل</b></div>{notice && <div className="operations-notice" role="status">{notice}</div>}<div className="operations-list wide integration-events">{events.map((item) => <div key={item.id}><span className="record-code">{item.eventType}</span><p><strong>{item.aggregateType} · {item.aggregateId}</strong><small>{formatDate(item.createdAt)} · المحاولات {item.attempts}{item.lastError ? ` · ${item.lastError}` : ""}</small></p><span className={`workflow-status ${item.status}`}>{item.status}</span>{item.status === "failed" && <button disabled={busy === item.id} onClick={() => void action("retry", item.id)}>إعادة المحاولة</button>}</div>)}</div></section>;
}
