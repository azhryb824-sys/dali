"use client";
import { useEffect } from "react";
export default function PortalError({error,reset}:{error:Error&{digest?:string};reset:()=>void}){
  useEffect(()=>{console.error("portal-render-failed",error)},[error]);
  return <main className="portal-gate"><section className="gate-card secure-gate-card"><p className="gate-kicker">النظام الإداري الداخلي</p><h1>تعذّر تحميل مساحة العمل</h1><p className="gate-copy">الخادم يعمل، لكن إحدى وحدات البيانات لم تستجب في الوقت المحدد. أعد المحاولة دون فقدان أي بيانات.</p>{error.digest&&<div className="gate-account"><span>رقم المتابعة</span><strong dir="ltr">{error.digest}</strong></div>}<button className="language-save" onClick={reset}>إعادة المحاولة</button><a className="gate-signout" href="/api/portal/session/end?returnTo=%2Fportal">بدء جلسة جديدة</a></section></main>
}
