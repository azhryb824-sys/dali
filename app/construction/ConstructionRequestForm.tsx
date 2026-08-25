"use client";

import { readApiJson } from "@/lib/client-api";


import { FormEvent, useRef, useState } from "react";

const cities = [
  ["riyadh", "الرياض"], ["jeddah", "جدة"], ["makkah", "مكة المكرمة"], ["madinah", "المدينة المنورة"], ["dammam", "الدمام"], ["khobar", "الخبر"], ["dhahran", "الظهران"], ["jubail", "الجبيل"], ["taif", "الطائف"], ["tabuk", "تبوك"], ["abha", "أبها"], ["khamis-mushait", "خميس مشيط"], ["jazan", "جازان"], ["najran", "نجران"], ["hail", "حائل"], ["buraydah", "بريدة"], ["sakaka", "سكاكا"], ["arar", "عرعر"], ["al-baha", "الباحة"], ["yanbu", "ينبع"], ["al-ahsa", "الأحساء"]
];

export default function ConstructionRequestForm() {
  const [sending,setSending]=useState(false); const [error,setError]=useState(""); const [tracking,setTracking]=useState(""); const formRef=useRef<HTMLFormElement>(null);
  async function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();setSending(true);setError("");try{const response=await fetch("/api/construction-requests",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(Object.fromEntries(new FormData(event.currentTarget).entries()))});const result=await readApiJson(response) as {error?:string;trackingCode?:string};if(!response.ok)throw new Error(result.error||"تعذر إرسال الطلب");setTracking(result.trackingCode||"");formRef.current?.reset()}catch(e){setError(e instanceof Error?e.message:"تعذر إرسال الطلب") }finally{setSending(false)}}
  if(tracking)return <div className="public-form-success"><span>✓</span><h3>وصل طلب المشروع إلى فريق المقاولات</h3><p>رقم المتابعة: <strong>{tracking}</strong>. سيُراجع المختص النطاق والموقع قبل التواصل، ولا يُعد الإرسال قبولاً أو عرضاً ملزماً.</p><button onClick={()=>setTracking("")}>إرسال طلب آخر</button></div>;
  return <form ref={formRef} className="public-quote-form construction-request-form" onSubmit={submit}>
    <label>اسم جهة الاتصال<input name="contactName" required minLength={2} autoComplete="name"/></label><label>الشركة أو الجهة<input name="clientName" required minLength={2} autoComplete="organization"/></label>
    <label>رقم الجوال<input name="contactMobile" required inputMode="tel" autoComplete="tel"/></label><label>البريد الإلكتروني<input name="contactEmail" type="email" required autoComplete="email"/></label>
    <label>مدينة المشروع<select name="cityCode" required><option value="">اختر المدينة</option>{cities.map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label>
    <label>نوع المشروع<select name="projectType" required><option value="">اختر النوع</option>{["مبانٍ","تشطيبات","أعمال مدنية","ترميم وتأهيل","بنية تحتية","أعمال كهروميكانيكية","أخرى"].map(v=><option key={v}>{v}</option>)}</select></label>
    <label>اسم أو وصف مختصر للمشروع<input name="title" required minLength={3}/></label><label>موعد البدء المتوقع<input name="expectedStartDate" type="date"/></label>
    <label className="span-two">النطاق المتاح حالياً<textarea name="scopeSummary" required minLength={20} placeholder="اذكر طبيعة الأعمال، مساحة أو كميات تقريبية، حالة الموقع، والمدة المستهدفة. لا ترسل مستندات سرية هنا."/></label>
    <label className="public-honeypot" aria-hidden="true">اترك هذا الحقل فارغاً<input name="website" tabIndex={-1} autoComplete="off"/></label>
    {error&&<p className="public-form-error span-two">{error}</p>}<p className="form-consent span-two">بإرسال الطلب فإنك توافق على استخدام البيانات للتواصل ودراسة نطاق المشروع وفق سياسة الخصوصية.</p><button className="btn primary span-two" disabled={sending}>{sending?"جارٍ إرسال الطلب...":"إرسال طلب دراسة المشروع ←"}</button>
  </form>
}
