"use client";
import { FormEvent, useCallback, useEffect, useState } from "react";

type Interview={id:string;referenceCode:string;conversationId:string;status:string;assignedTo:string|null;requestedAt:string;expiresAt:string;transferCount:number;visitorName:string;visitorMobile:string;subject:string;joinUrl:string|null};
type Staff={email:string;displayName:string;availability:string;owner:boolean};
type Payload={interviews?:Interview[];availableStaff?:Staff[];canViewQueue?:boolean;error?:string};

const statusLabel:Record<string,string>={requested:"بانتظار الاستلام",ringing:"مكالمة واردة",transferred:"محولة إليك",active:"جارية الآن"};

export default function VideoInterviewDesk(){
  const[data,setData]=useState<{interviews:Interview[];availableStaff:Staff[];canViewQueue:boolean}>({interviews:[],availableStaff:[],canViewQueue:false});
  const[authorized,setAuthorized]=useState<boolean|null>(null);const[open,setOpen]=useState(false);const[busy,setBusy]=useState("");const[error,setError]=useState("");const[availability,setAvailability]=useState<"online"|"away">("online");
  const load=useCallback(async()=>{try{const response=await fetch("/api/portal/video-interviews",{cache:"no-store"});const result=await response.json()as Payload;if(response.status===403){setAuthorized(false);return}if(!response.ok)throw new Error(result.error||"تعذّر تحديث المقابلات المرئية");setAuthorized(true);setData({interviews:result.interviews||[],availableStaff:result.availableStaff||[],canViewQueue:Boolean(result.canViewQueue)});setError("")}catch(loadError){setError(loadError instanceof Error?loadError.message:"تعذّر تحديث المقابلات المرئية")}},[]);
  useEffect(()=>{const kickoff=window.setTimeout(()=>void load(),0);const timer=window.setInterval(()=>{if(document.visibilityState==="visible")void load()},8000);return()=>{window.clearTimeout(kickoff);window.clearInterval(timer)}},[load]);
  async function action(actionName:string,interviewId?:string,extra:Record<string,unknown>={}){setBusy(`${actionName}:${interviewId||"presence"}`);setError("");try{const response=await fetch("/api/portal/video-interviews",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:actionName,interviewId,...extra})});const result=await response.json()as Payload;if(!response.ok)throw new Error(result.error||"تعذّر تنفيذ الإجراء");if(result.interviews)setData({interviews:result.interviews,availableStaff:result.availableStaff||[],canViewQueue:Boolean(result.canViewQueue)});return true}catch(actionError){setError(actionError instanceof Error?actionError.message:"تعذّر تنفيذ الإجراء");return false}finally{setBusy("")}}
  async function changeAvailability(next:"online"|"away"){setAvailability(next);await action("heartbeat",undefined,{availability:next})}
  async function transfer(event:FormEvent<HTMLFormElement>,interviewId:string){event.preventDefault();const form=event.currentTarget,formData=new FormData(form);if(await action("transfer",interviewId,{toEmail:formData.get("toEmail"),reason:formData.get("reason")}))form.reset()}
  const incoming=data.interviews.filter(item=>["requested","ringing","transferred"].includes(item.status)).length;
  if(authorized===false)return null;
  if(!data.interviews.length&&!open)return <button className="video-desk-launcher idle" onClick={()=>setOpen(true)} aria-label="فتح المقابلات المرئية"><span>▣</span><small>المقابلات المرئية</small></button>;
  return <aside className={`video-desk ${open?"open":""}`}>
    <button className={`video-desk-launcher ${incoming?"ringing":""}`} onClick={()=>setOpen(value=>!value)} aria-expanded={open}><span>▣</span><strong>{incoming||data.interviews.length}</strong><small>مقابلة مرئية</small></button>
    {open&&<section className="video-desk-panel" role="dialog" aria-label="مركز المقابلات المرئية"><header><div><span>اتصال آمن خلال الدوام</span><h2>المقابلات المرئية</h2></div><button onClick={()=>setOpen(false)} aria-label="إغلاق">×</button></header>
      <div className="video-presence"><strong>حالتك</strong><button className={availability==="online"?"active":""} onClick={()=>void changeAvailability("online")}>متاح</button><button className={availability==="away"?"active":""} onClick={()=>void changeAvailability("away")}>غير متاح مؤقتاً</button></div>
      {error&&<p className="video-error" role="alert">{error}</p>}
      <div className="video-call-list">{data.interviews.length?data.interviews.map(interview=><article key={interview.id} className={interview.status}><div className="video-call-head"><span>{statusLabel[interview.status]||interview.status}</span><b dir="ltr">{interview.referenceCode}</b></div><h3>{interview.visitorName}</h3><p>{interview.subject}</p><small dir="ltr">{interview.visitorMobile}</small><div className="video-call-actions">{interview.status!=="active"&&<button disabled={Boolean(busy)} onClick={()=>void action("accept",interview.id)}>قبول المقابلة</button>}{interview.joinUrl&&<a href={interview.joinUrl} target="_blank" rel="noopener noreferrer">فتح الاتصال المرئي</a>}{interview.status==="active"&&<button className="finish" disabled={Boolean(busy)} onClick={()=>void action("complete",interview.id)}>إنهاء المقابلة</button>}</div>
        {(interview.status==="active"||interview.status==="ringing"||interview.status==="transferred")&&<form className="video-transfer" onSubmit={event=>void transfer(event,interview.id)}><select name="toEmail" required defaultValue=""><option value="" disabled>تحويل إلى موظف متاح أو المالك</option>{data.availableStaff.map(staff=><option key={staff.email} value={staff.email}>{staff.displayName}{staff.owner?" — المالك":staff.availability==="online"?" — متاح":" — غير متصل"}</option>)}</select><input name="reason" required minLength={5} maxLength={500} placeholder="سبب التحويل المختصر"/><button disabled={Boolean(busy)||!data.availableStaff.length}>تحويل</button></form>}
      </article>):<div className="video-empty"><strong>لا توجد مقابلات واردة</strong><span>ستظهر طلبات الزوار هنا فوراً خلال ساعات العمل.</span></div>}</div>
      <footer>لا يسجل النظام الصوت أو الصورة. يبقى سجل الطلب والتحويلات فقط لأغراض المتابعة.</footer>
    </section>}
  </aside>;
}
