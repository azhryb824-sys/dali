"use client";

import { readApiJson } from "@/lib/client-api";


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
  ratingSubmitted: boolean;
};

type BusinessHours = {
  isOpen: boolean;
  workingDays: number[];
  opensAt: string;
  closesAt: string;
  timezone: string;
  nextOpenLabel?: string;
};
type PublicVideoInterview={id:string;referenceCode:string;status:string;assignedName:string|null;requestedAt:string;expiresAt:string;joinUrl:string|null;ratingSubmitted:boolean};
// «طلب مقابلة مرئية» هو مسمى السجل المتوافق مع واجهة المكالمات الحالية.

function chatTime(value: string) {
  return new Intl.DateTimeFormat("ar-SA", { hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

export default function LiveChatWidget() {
  const [open, setOpen] = useState(false);
  const [conversation, setConversation] = useState<PublicConversation | null>(null);
  const [messages, setMessages] = useState<PublicChatMessage[]>([]);
  const [businessHours, setBusinessHours] = useState<BusinessHours | null>(null);
  const [videoInterview, setVideoInterview] = useState<PublicVideoInterview | null>(null);
  const [videoBusy, setVideoBusy] = useState(false);
  const [callOpen,setCallOpen]=useState(false);
  const [ratingBusy,setRatingBusy]=useState(false);
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
      const result = await readApiJson(response) as { conversation?: PublicConversation | null; messages?: PublicChatMessage[]; businessHours?: BusinessHours; delta?: boolean; error?: string };
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

  const loadVideoInterview=useCallback(async()=>{try{const response=await fetch("/api/video-interviews",{cache:"no-store"});const result=await readApiJson(response)as{interview?:PublicVideoInterview|null;businessHours?:BusinessHours};if(response.ok){setVideoInterview(result.interview||null);if(result.businessHours)setBusinessHours(result.businessHours)}}catch{/* Chat remains usable if video status refresh fails. */}},[]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadConversation(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadConversation]);
  useEffect(() => {
    if (!conversation || !open) return;
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      void loadConversation(true);
      void loadVideoInterview();
    };
    const first = window.setTimeout(refresh, 0);
    const timer = window.setInterval(refresh, 3000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [conversation, open, loadConversation, loadVideoInterview]);
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
      const result = await readApiJson(response) as { conversation?: PublicConversation; messages?: PublicChatMessage[]; businessHours?: BusinessHours; error?: string };
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
      const result = await readApiJson(response) as { message?: PublicChatMessage; autoReply?: PublicChatMessage | null; autoReplies?: PublicChatMessage[]; businessHours?: BusinessHours; error?: string };
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

  async function requestVideoInterview(){setVideoBusy(true);setError("");try{const response=await fetch("/api/video-interviews",{method:"POST",headers:{"content-type":"application/json"},body:"{}"});const result=await readApiJson(response)as{interview?:PublicVideoInterview;businessHours?:BusinessHours;error?:string};if(!response.ok||!result.interview)throw new Error(result.error||"تعذّر طلب المقابلة المرئية");setVideoInterview(result.interview);if(result.businessHours)setBusinessHours(result.businessHours)}catch(videoError){setError(videoError instanceof Error?videoError.message:"تعذّر طلب المقابلة المرئية")}finally{setVideoBusy(false)}}

  async function endConversation(){if(!window.confirm("هل تريد إنهاء المحادثة والانتقال إلى التقييم؟"))return;setSending(true);setError("");try{const response=await fetch("/api/chat",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"end"})});const result=await readApiJson(response)as{conversation?:PublicConversation;error?:string};if(!response.ok||!result.conversation)throw new Error(result.error||"تعذّر إنهاء المحادثة");setConversation(current=>current?{...current,...result.conversation}:current)}catch(endError){setError(endError instanceof Error?endError.message:"تعذّر إنهاء المحادثة")}finally{setSending(false)}}

  async function submitRating(event:FormEvent<HTMLFormElement>,channel:"chat"|"video"){event.preventDefault();setRatingBusy(true);setError("");try{const values=Object.fromEntries(new FormData(event.currentTarget));const endpoint=channel==="chat"?"/api/chat":"/api/video-interviews";const response=await fetch(endpoint,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"rate",...(channel==="video"?{interviewId:videoInterview?.id}:{}),...values})});const result=await readApiJson(response)as{error?:string};if(!response.ok)throw new Error(result.error||"تعذّر إرسال التقييم");if(channel==="chat")setConversation(current=>current?{...current,ratingSubmitted:true}:current);else setVideoInterview(null)}catch(ratingError){setError(ratingError instanceof Error?ratingError.message:"تعذّر إرسال التقييم")}finally{setRatingBusy(false)}}

  return <div className={`live-chat ${open ? "open" : ""}`}>
    {open && <section ref={dialogRef} className="chat-window" role="dialog" aria-modal="false" aria-label="محادثة مباشرة مع شركة دالي">
      <header className="chat-header">
        <div className="chat-brand"><Image src="/dally-logo.jpg" alt="" width={545} height={280} sizes="48px"/><p><strong>فريق دالي</strong><span><i className={businessHours?.isOpen ? "online" : "offline"}/>{businessHours?.isOpen ? "متاحون الآن" : "خارج ساعات الدوام"}</span></p></div>
        <button type="button" ref={closeRef} onClick={() => { setOpen(false); window.setTimeout(() => launcherRef.current?.focus(), 0); }} aria-label="إغلاق المحادثة">×</button>
      </header>
      {businessHours && <div className={`chat-hours ${businessHours.isOpen ? "open" : "closed"}`}><span>{businessHours.isOpen ? "فريقنا جاهز لخدمتك الآن" : `موعد العودة: ${businessHours.nextOpenLabel || "خلال ساعات العمل القادمة"}`}</span><b>{businessHours.opensAt} — {businessHours.closesAt} · بتوقيت مكة</b></div>}
      {loading ? <div className="chat-loading"><span/><p>جارٍ تحميل المحادثة...</p></div> : conversation ? <>
        <div className="chat-conversation-meta"><span>{conversation.trackingCode}</span><strong>{conversation.subject}</strong></div>
        <section className={`public-video-card ${videoInterview?.status||"idle"}`} aria-live="polite"><div><span>▣</span><p><strong>{videoInterview?videoInterview.status==="active"?"الموظف جاهز للمكالمة":videoInterview.status==="completed"?"انتهت المكالمة المرئية":"طلب المكالمة قيد المتابعة":"مكالمة مرئية مع فريق دالي"}</strong><small>{videoInterview?`${videoInterview.referenceCode}${videoInterview.assignedName?` · ${videoInterview.assignedName}`:" · جارٍ البحث عن موظف متاح"}`:businessHours?.isOpen?"متاحة الآن خلال ساعات العمل":"تتاح فقط خلال ساعات العمل"}</small></p></div>{videoInterview?.joinUrl?<button onClick={()=>setCallOpen(true)}>دخول المكالمة المرئية</button>:videoInterview?.status==="completed"?null:videoInterview?<button disabled>بانتظار قبول الموظف</button>:<button disabled={!businessHours?.isOpen||videoBusy} onClick={()=>void requestVideoInterview()}>{videoBusy?"جارٍ الطلب...":"طلب مكالمة مرئية"}</button>}<p className="video-consent">يمكنك إيقاف الكاميرا أو الميكروفون وإعادتهما في أي وقت من شريط المكالمة. النظام لا يسجل الصوت أو الصورة.</p></section>
        {videoInterview?.status==="completed"&&!videoInterview.ratingSubmitted&&<ServiceRating title="كيف كانت المكالمة المرئية؟" busy={ratingBusy} onSubmit={event=>void submitRating(event,"video")}/>} 
        <div className="chat-messages" ref={messagesRef} aria-live="polite">
          <div className="chat-welcome"><strong>أهلاً {conversation.visitorName}</strong><span>شاركنا تفاصيل احتياجك، وسيصل حديثك إلى المختص الأنسب في فريق دالي.</span></div>
          {messages.map((message) => <article key={message.id} className={message.senderType}>
            <div><strong>{message.senderType === "visitor" ? "أنت" : message.senderType === "system" ? "مساعد دالي" : "فريق دالي"}</strong><time>{chatTime(message.createdAt)}</time></div>
            <p>{message.body}</p>
            {message.senderType === "visitor" && <small>{message.readByStaffAt ? "تمت القراءة" : "تم الإرسال"}</small>}
          </article>)}
        </div>
        {conversation.status==="closed"?(conversation.ratingSubmitted?<div className="chat-rating-thanks"><strong>شكرًا لتقييمك</strong><span>تم حفظ تقييمك وسيساعدنا على تحسين الخدمة.</span></div>:<ServiceRating title="كيف كانت المحادثة النصية؟" busy={ratingBusy} onSubmit={event=>void submitRating(event,"chat")}/>):<><form className="chat-composer" onSubmit={sendMessage}><label><span className="sr-only">اكتب رسالتك</span><textarea name="message" required minLength={2} maxLength={2000} rows={2} placeholder="اكتب رسالتك هنا..."/></label><button type="submit" disabled={sending}>{sending ? "..." : "إرسال"}</button></form><button type="button" className="chat-end-button" disabled={sending} onClick={()=>void endConversation()}>إنهاء المحادثة</button></>}
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
    {callOpen&&videoInterview?.joinUrl&&<div className="video-call-modal"><button type="button" className="video-call-backdrop" onClick={()=>setCallOpen(false)} aria-label="إغلاق المكالمة"/><section role="dialog" aria-modal="true" aria-label="المكالمة المرئية"><header><div><strong>مكالمة دالي المرئية</strong><span>{videoInterview.referenceCode}</span></div><button type="button" onClick={()=>setCallOpen(false)}>إنهاء وإغلاق</button></header><iframe src={videoInterview.joinUrl} title="مكالمة مرئية مع فريق دالي" allow="camera; microphone; fullscreen; display-capture; autoplay"/></section></div>}
    <button type="button" ref={launcherRef} className="chat-launcher" onClick={() => setOpen((value) => !value)} aria-label={open ? "إغلاق المحادثة" : "فتح المحادثة المباشرة"} aria-expanded={open}>
      <span className="chat-launcher-icon">{open ? "×" : "◌"}</span>
      <span><strong>محادثة مباشرة</strong><small>{businessHours?.isOpen ? "الفريق متاح الآن" : "اترك رسالتك وسنرد في الدوام"}</small></span>
      {!open && (
        <i className={businessHours?.isOpen ? "online" : "offline"}/>
      )}
    </button>
  </div>;
}

function ServiceRating({title,busy,onSubmit}:{title:string;busy:boolean;onSubmit:(event:FormEvent<HTMLFormElement>)=>void}){
  return <form className="service-rating" onSubmit={onSubmit}><strong>{title}</strong><p>قيّم تجربتك من 1 إلى 5؛ 5 تعني ممتاز.</p><div><label>تقييم الموظف<select name="employeeRating" required defaultValue=""><option value="" disabled>اختر التقييم</option>{[5,4,3,2,1].map(value=><option key={value} value={value}>{value} من 5</option>)}</select></label><label>تقييم الشركة<select name="companyRating" required defaultValue=""><option value="" disabled>اختر التقييم</option>{[5,4,3,2,1].map(value=><option key={value} value={value}>{value} من 5</option>)}</select></label></div><textarea name="ratingComment" maxLength={1000} rows={2} placeholder="ملاحظتك (اختيارية)"/><button disabled={busy}>{busy?"جارٍ الإرسال...":"إرسال التقييم"}</button></form>
}
