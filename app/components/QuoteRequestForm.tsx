"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

export default function QuoteRequestForm() {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [trackingCode, setTrackingCode] = useState("");
  const [submittedEmail,setSubmittedEmail]=useState("");
  const formRef=useRef<HTMLFormElement>(null);
  const idempotencyKey = useRef(crypto.randomUUID());

  useEffect(()=>{try{const saved=JSON.parse(localStorage.getItem("dali-quote-draft")||"{}") as Record<string,string>;const form=formRef.current;if(!form)return;for(const [name,value] of Object.entries(saved)){const field=form.elements.namedItem(name) as HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement|null;if(field&&name!=="website")field.value=value}}catch{}},[]);
  function autosave(form:HTMLFormElement){const values=Object.fromEntries(new FormData(form).entries());delete values.website;localStorage.setItem("dali-quote-draft",JSON.stringify(values))}

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    setError("");
    const form = event.currentTarget;
    try {
      const response = await fetch("/api/workforce-requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...Object.fromEntries(new FormData(form).entries()), requestType: "quotation", specialization: "طلب عرض سعر", idempotencyKey: idempotencyKey.current }),
      });
      const result = await response.json() as { error?: string; trackingCode?: string };
      if (!response.ok) throw new Error(result.error || "تعذّر إرسال الطلب");
      setSubmittedEmail(String(new FormData(form).get("email")||""));
      setTrackingCode(result.trackingCode || "");
      form.reset();
      localStorage.removeItem("dali-quote-draft");
      idempotencyKey.current = crypto.randomUUID();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "تعذّر إرسال الطلب حالياً.");
    } finally {
      setSending(false);
    }
  }

  if (trackingCode) return <QuoteConfirmation trackingCode={trackingCode} email={submittedEmail} onReset={()=>setTrackingCode("")}/>;

  return <><form ref={formRef} className="public-quote-form" onSubmit={submit} onInput={event=>autosave(event.currentTarget)}>
    <label>الاسم الكامل<input name="fullName" required minLength={2} maxLength={100} autoComplete="name"/></label>
    <label>اسم المنشأة<input name="companyName" required minLength={2} maxLength={160} autoComplete="organization"/></label>
    <label>رقم الجوال<input name="mobile" required type="tel" maxLength={20} autoComplete="tel"/></label>
    <label>البريد الإلكتروني<input name="email" required type="email" maxLength={160} autoComplete="email"/></label>
    <label>موقع العمل<input name="workSite" required minLength={2} maxLength={180} placeholder="المدينة، الحي أو موقع المشروع"/></label>
    <label>تاريخ البداية المتوقع<input name="requiredStartDate" type="date"/></label>
    <label>عدد العمالة<input name="requestedCount" required type="number" min={1} max={100000}/></label>
    <label>المدة<select name="duration" required defaultValue=""><option value="" disabled>اختر المدة</option><option>أقل من شهر</option><option>من شهر إلى 3 أشهر</option><option>من 3 إلى 6 أشهر</option><option>من 6 إلى 12 شهراً</option><option>أكثر من سنة</option><option>غير محدد</option></select></label>
    <label>وسيلة التواصل<select name="preferredContact" defaultValue="either"><option value="either">الهاتف أو البريد</option><option value="phone">الهاتف</option><option value="email">البريد</option></select></label>
    <label className="span-two">تفاصيل المهن والأعداد<textarea name="details" required minLength={10} maxLength={2000} rows={6} placeholder="اذكر كل مهنة والعدد المطلوب وأي اشتراطات تشغيلية."/></label>
    <label className="public-honeypot" aria-hidden="true">الموقع<input name="website" tabIndex={-1} autoComplete="off"/></label>
    <p className="form-consent span-two">بإرسال الطلب تقر بأنك اطلعت على <a href="/privacy">سياسة الخصوصية</a>، وأن البيانات ستستخدم لمراجعة الاحتياج والتواصل معك.</p>
    {error && <p className="public-form-error span-two" role="alert">{error}</p>}
    <button className="btn primary span-two" disabled={sending}>{sending ? "جارٍ الإرسال..." : "إرسال طلب عرض السعر"}</button>
    <small className="quote-autosave span-two">يُحفظ ما تكتبه تلقائيًا على هذا الجهاز حتى ترسل الطلب.</small>
  </form><QuoteStatusLookup/></>;
}

function QuoteConfirmation({trackingCode,email,onReset}:{trackingCode:string;email:string;onReset:()=>void}){const[message,setMessage]=useState("");const[files,setFiles]=useState<Array<{id:number;fileName:string;sizeBytes:number}>>([]);async function upload(event:FormEvent<HTMLFormElement>){event.preventDefault();const form=event.currentTarget;setMessage("جارٍ رفع المرفق...");const data=new FormData(form);data.set("trackingCode",trackingCode);data.set("email",email);try{const response=await fetch("/api/quote-requests",{method:"POST",body:data});const result=await response.json() as {attachment?:{id:number;fileName:string;sizeBytes:number};error?:string};if(!response.ok)throw new Error(result.error||"تعذّر رفع المرفق");if(result.attachment)setFiles(current=>[...current,result.attachment!]);form.reset();setMessage("تم ربط المرفق بالطلب بأمان.")}catch(error){setMessage(error instanceof Error?error.message:"تعذّر رفع المرفق")}}return <div className="public-form-success quote-confirmation" role="status"><span>✓</span><h3>استلمنا طلب عرض السعر</h3><p>رقم المتابعة: <strong dir="ltr">{trackingCode}</strong></p><form onSubmit={upload}><label>أرفق نطاق العمل أو جدول الكميات أو المخططات<input name="file" type="file" required accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"/></label><button className="btn secondary">رفع المرفق</button></form>{message&&<small>{message}</small>}{files.map(file=><small key={file.id}>✓ {file.fileName} · {Math.ceil(file.sizeBytes/1024)} ك.ب</small>)}<button type="button" onClick={onReset}>إرسال طلب آخر</button></div>}

function QuoteStatusLookup(){const[result,setResult]=useState("");const[error,setError]=useState("");async function lookup(event:FormEvent<HTMLFormElement>){event.preventDefault();const data=new FormData(event.currentTarget);setError("");setResult("");const response=await fetch(`/api/quote-requests?trackingCode=${encodeURIComponent(String(data.get("trackingCode")||""))}&email=${encodeURIComponent(String(data.get("email")||""))}`,{cache:"no-store"});const body=await response.json() as {statusLabel?:string;updatedAt?:string;attachments?:unknown[];error?:string};if(!response.ok){setError(body.error||"تعذّر التحقق");return}setResult(`${body.statusLabel} · ${body.attachments?.length||0} مرفق`)}return <details className="quote-status-lookup"><summary>لديك طلب سابق؟ تابع حالته</summary><form onSubmit={lookup}><input name="trackingCode" required dir="ltr" placeholder="DAL-..."/><input name="email" required type="email" placeholder="البريد المستخدم في الطلب"/><button>عرض الحالة</button></form>{error&&<p role="alert">{error}</p>}{result&&<strong role="status">{result}</strong>}</details>}
