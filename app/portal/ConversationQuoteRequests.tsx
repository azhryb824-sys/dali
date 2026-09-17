"use client";
import { useEffect, useState } from "react";
import QuoteRequestForm from "@/app/components/QuoteRequestForm";
import WhatsAppMessageDialog from "./WhatsAppMessageDialog";
import { readApiJson } from "@/lib/client-api";
type Row = Record<string, unknown> & {
    id: number;
    version: number;
    trackingCode: string;
    approvalStatus: string;
    approvalReason: string | null;
    mobile: string;
    originConversationId: string | null;
};
export default function ConversationQuoteRequests({ conversationId, fullName, mobile, email }: {
    conversationId: string;
    fullName: string;
    mobile: string;
    email: string;
}) {
    const [rows, setRows] = useState<Row[]>([]), [editing, setEditing] = useState<Row | null>(null), [open, setOpen] = useState(false), [message, setMessage] = useState<Row | null>(null), [error, setError] = useState("");
    async function load() { const r = await fetch("/api/portal/quote-requests", { cache: "no-store" }); const d = await readApiJson<{
        requests?: Row[];
        error?: string;
    }>(r); if (!r.ok)
        throw new Error(d.error); setRows((d.requests || []).filter(row => row.originConversationId === conversationId)); }
    useEffect(() => { let active = true; void fetch("/api/portal/quote-requests", { cache: "no-store" }).then(r => readApiJson<{
        requests?: Row[];
    }>(r)).then(d => { if (active)
        setRows((d.requests || []).filter(row => row.originConversationId === conversationId)); }).catch(() => setError("تعذر تحميل الطلبات")); return () => { active = false; }; }, [conversationId]);
    return <details className="drawer-section"><summary>طلبات عرض السعر من المحادثة</summary><button onClick={() => { setEditing(null); setOpen(true); }}>إنشاء طلب عرض سعر</button>{error && <p role="alert">{error}</p>}{rows.map(row => <article key={row.id}><strong>{row.trackingCode}</strong><p>{({ pending: "بانتظار الاعتماد", approved: "معتمد", changes_requested: "مطلوب تعديل", rejected: "رفض بدون تعديلات" })[row.approvalStatus]} {row.approvalReason}</p>{row.approvalStatus === "changes_requested" && <><button onClick={() => { setEditing(row); setOpen(true); }}>تعديل وإعادة الإرسال</button><button onClick={() => setMessage(row)}>إرسال التعديلات واتساب</button></>}</article>)}{open && <><button onClick={() => setOpen(false)}>إغلاق النموذج</button><QuoteRequestForm key={editing?.id || "new"} embedded endpoint="/api/portal/quote-requests" draftKey={`dali-conversation-quote:${conversationId}:${editing?.id || "new"}`} initialValues={editing || { fullName, mobile, email }} extraPayload={{ conversationId, requestId: editing?.id, version: editing?.version }} onSubmitted={() => { setOpen(false); void load().catch(e => setError(e.message)); }}/></>}{message && <WhatsAppMessageDialog mobile={message.mobile} message={`${message.trackingCode}\n${message.approvalReason || ""}`} onClose={() => setMessage(null)}/>}</details>;
}
