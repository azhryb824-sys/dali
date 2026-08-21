"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";

type PublicChatMessage = {
  id: number;
  senderType: "visitor" | "staff" | "system";
  senderName: string;
  body: string;
  createdAt: string;
  readByStaffAt: string | null;
};

type PublicConversation = {
  trackingCode: string;
  visitorName: string;
  subject: string;
  status: string;
  assigned: boolean;
};

type BusinessHours = {
  isOpen: boolean;
  workingDays: number[];
  opensAt: string;
  closesAt: string;
  timezone: string;
  nextOpenLabel?: string;
};

function chatTime(value: string) {
  return new Intl.DateTimeFormat("ar-SA", { hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

export default function LiveChatWidget() {
  const [open, setOpen] = useState(false);
  const [conversation, setConversation] = useState<PublicConversation | null>(null);
  const [messages, setMessages] = useState<PublicChatMessage[]>([]);
  const [businessHours, setBusinessHours] = useState<BusinessHours | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const messagesRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const latestMessageId = useRef(0);
  const pendingMessageId = useRef(crypto.randomUUID());

  const loadConversation = useCallback(async (silent = false) => {
    try {
      const after = silent ? latestMessageId.current : 0;
      const response = await fetch(`/api/chat${after ? `?after=${after}` : ""}`, { cache: "no-store" });
      const result = await response.json() as { conversation?: PublicConversation | null; messages?: PublicChatMessage[]; businessHours?: BusinessHours; delta?: boolean; error?: string };
      if (!response.ok) throw new Error(result.error || "تعذّر تحميل المحادثة");
      setConversation(result.conversation || null);
      const incoming = result.messages || [];
      setMessages((current) => result.delta
        ? [...current, ...incoming.filter((message) => !current.some((item) => item.id === message.id))]
        : incoming);
      if (incoming.length) latestMessageId.current = Math.max(latestMessageId.current, ...incoming.map((message) => message.id));
      if (result.businessHours) setBusinessHours(result.businessHours);
      if (!silent) setError("");
    } catch (loadError) {
      if (!silent) setError(loadError instanceof Error ? loadError.message : "تعذّر تحميل المحادثة");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadConversation(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadConversation]);
  useEffect(() => {
    if (!conversation || !open) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadConversation(true);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [conversation, open, loadConversation]);
  useEffect(() => {
    messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open]);
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      window.setTimeout(() => launcherRef.current?.focus(), 0);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  async function startConversation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    setError("");
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "start", clientMessageId: pendingMessageId.current, ...Object.fromEntries(new FormData(event.currentTarget).entries()) }),
      });
      const result = await response.json() as { conversation?: PublicConversation; messages?: PublicChatMessage[]; businessHours?: BusinessHours; error?: string };
      if (!response.ok || !result.conversation) throw new Error(result.error || "تعذّر بدء المحادثة");
      setConversation(result.conversation);
      setMessages(result.messages || []);
      if (result.messages?.length) latestMessageId.current = Math.max(...result.messages.map((message) => message.id));
      pendingMessageId.current = crypto.randomUUID();
      if (result.businessHours) setBusinessHours(result.businessHours);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "تعذّر بدء المحادثة");
    } finally { setSending(false); }
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    setError("");
    const form = event.currentTarget;
    const message = String(new FormData(form).get("message") || "").trim();
    if (!message) { setSending(false); return; }
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "send", message, clientMessageId: pendingMessageId.current }),
      });
      const result = await response.json() as { message?: PublicChatMessage; autoReply?: PublicChatMessage | null; autoReplies?: PublicChatMessage[]; businessHours?: BusinessHours; error?: string };
      if (!response.ok || !result.message) throw new Error(result.error || "تعذّر إرسال الرسالة");
      const automated = result.autoReplies ?? (result.autoReply ? [result.autoReply] : []);
      setMessages((items) => [...items, result.message!, ...automated.filter((reply) => !items.some((item) => item.id === reply.id))]);
      latestMessageId.current = Math.max(latestMessageId.current, result.message.id, ...automated.map((reply) => reply.id), 0);
      pendingMessageId.current = crypto.randomUUID();
      if (result.businessHours) setBusinessHours(result.businessHours);
      form.reset();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "تعذّر إرسال الرسالة");
    } finally { setSending(false); }
  }

  return <div className={`live-chat ${open ? "open" : ""}`}>
    {open && <section ref={dialogRef} className="chat-window" role="dialog" aria-modal="false" aria-label="محادثة مباشرة مع شركة دالي">
      <header className="chat-header">
        <div className="chat-brand"><Image src="/dally-logo.jpg" alt="" width={545} height={280} sizes="48px"/><p><strong>فريق دالي</strong><span><i className={businessHours?.isOpen ? "online" : "offline"}/>{businessHours?.isOpen ? "متاحون الآن" : "خارج ساعات الدوام"}</span></p></div>
        <button ref={closeRef} onClick={() => { setOpen(false); window.setTimeout(() => launcherRef.current?.focus(), 0); }} aria-label="إغلاق المحادثة">×</button>
      </header>
      {businessHours && <div className={`chat-hours ${businessHours.isOpen ? "open" : "closed"}`}><span>{businessHours.isOpen ? "فريقنا جاهز لخدمتك الآن" : `موعد العودة: ${businessHours.nextOpenLabel || "خلال ساعات العمل القادمة"}`}</span><b>{businessHours.opensAt} — {businessHours.closesAt} · بتوقيت مكة</b></div>}
      {loading ? <div className="chat-loading"><span/><p>جارٍ تحميل المحادثة...</p></div> : conversation ? <>
        <div className="chat-conversation-meta"><span>{conversation.trackingCode}</span><strong>{conversation.subject}</strong></div>
        <div className="chat-messages" ref={messagesRef} aria-live="polite">
          <div className="chat-welcome"><strong>أهلاً {conversation.visitorName}</strong><span>شاركنا تفاصيل احتياجك، وسيصل حديثك إلى المختص الأنسب في فريق دالي.</span></div>
          {messages.map((message) => <article key={message.id} className={message.senderType}>
            <div><strong>{message.senderType === "visitor" ? "أنت" : message.senderType === "system" ? "مساعد دالي" : "فريق دالي"}</strong><time>{chatTime(message.createdAt)}</time></div>
            <p>{message.body}</p>
            {message.senderType === "visitor" && <small>{message.readByStaffAt ? "تمت القراءة" : "تم الإرسال"}</small>}
          </article>)}
        </div>
        <form className="chat-composer" onSubmit={sendMessage}><label><span className="sr-only">اكتب رسالتك</span><textarea name="message" required minLength={2} maxLength={2000} rows={2} placeholder="اكتب رسالتك هنا..."/></label><button type="submit" disabled={sending}>{sending ? "..." : "إرسال"}</button></form>
      </> : <form className="chat-start" onSubmit={startConversation}>
        <div><strong>كيف يمكننا مساعدتك؟</strong><p>ابدأ المحادثة، وسيستقبل مساعد دالي رسالتك فوراً ويوجّهها إلى الفريق المختص.</p></div>
        <label>الاسم الكامل<input name="visitorName" required minLength={2} maxLength={100} autoComplete="name" placeholder="اكتب اسمك"/></label>
        <label>رقم الجوال<input name="visitorMobile" required type="tel" inputMode="tel" maxLength={20} autoComplete="tel" placeholder="05xxxxxxxx"/></label>
        <label>البريد الإلكتروني <small>اختياري</small><input name="visitorEmail" type="email" maxLength={160} autoComplete="email" placeholder="name@example.com"/></label>
        <label>موضوع المحادثة<select name="subject" defaultValue="طلب قوى عاملة"><option>طلب قوى عاملة</option><option>طلب عرض سعر</option><option>تشغيل وصيانة</option><option>جاهزية موسم رمضان</option><option>جاهزية موسم الحج</option><option>جاهزية موسمي رمضان والحج</option><option>وظائف</option><option>شراكة أو توريد</option><option>شكوى أو اقتراح</option><option>متابعة طلب سابق</option><option>استفسار عام</option></select></label>
        <label>رسالتك<textarea name="message" required minLength={2} maxLength={2000} rows={4} placeholder="اكتب تفاصيل احتياجك أو استفسارك..."/></label>
        <label className="chat-website-field" aria-hidden="true">الموقع<input name="website" tabIndex={-1} autoComplete="off"/></label>
        <p className="chat-privacy-note">بالبدء تقر باطلاعك على <a href="/privacy">سياسة الخصوصية</a> وحفظ المحادثة لخدمتك ومتابعتها.</p>
        <button type="submit" disabled={sending}>{sending ? "جارٍ بدء المحادثة..." : "بدء المحادثة"}</button>
      </form>}
      {error && <p className="chat-error" role="alert">{error}</p>}
      <footer>محادثة محفوظة وآمنة · لا تشارك بيانات بنكية أو كلمات مرور</footer>
    </section>}
    <button ref={launcherRef} className="chat-launcher" onClick={() => setOpen((value) => !value)} aria-label={open ? "إغلاق المحادثة" : "فتح المحادثة المباشرة"} aria-expanded={open}>
      <span className="chat-launcher-icon">{open ? "×" : "◌"}</span>
      <span><strong>محادثة مباشرة</strong><small>{businessHours?.isOpen ? "الفريق متاح الآن" : "اترك رسالتك وسنرد في الدوام"}</small></span>
      {!open && (
        <i className={businessHours?.isOpen ? "online" : "offline"}/>
      )}
    </button>
  </div>;
}
