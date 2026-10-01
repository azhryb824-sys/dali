"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { calendarCandidate, setCalendarInputValue, type CalendarType } from "@/lib/calendar-input";
const supported=new Set(["date","datetime-local","month"]);
const iso=(year:number,month:number,day:number)=>`${year}-${String(month+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
export default function SystemCalendar() {
  const [target,setTarget]=useState<HTMLInputElement|null>(null),[month,setMonth]=useState({year:2026,month:0}),[time,setTime]=useState("00:00");
  const panel=useRef<HTMLDivElement>(null),opener=useRef<HTMLInputElement|null>(null);
  const language=target?.closest("[lang]")?.getAttribute("lang") || (typeof document!=="undefined" ? document.documentElement.lang:"ar");
  const locale=language?.startsWith("en") ? "en" : language?.startsWith("bn") ? "bn" : "ar";
  const words=locale==="en" ? {title:"Choose a date",close:"Close",previous:"Previous month",next:"Next month",today:"Today",clear:"Clear",time:"Time",year:"Year",month:"Month"} : locale==="bn" ? {title:"তারিখ নির্বাচন করুন",close:"বন্ধ",previous:"আগের মাস",next:"পরের মাস",today:"আজ",clear:"মুছুন",time:"সময়",year:"বছর",month:"মাস"} : {title:"اختيار التاريخ",close:"إغلاق",previous:"الشهر السابق",next:"الشهر التالي",today:"اليوم",clear:"مسح",time:"الوقت",year:"السنة",month:"الشهر"};
  useEffect(()=>{
    const open=(input:HTMLInputElement)=>{if(input.disabled || input.readOnly)return;opener.current=input;const current=input.value?.slice(0,10),now=new Date(),parts=current?.split("-");setMonth({year:Number(parts?.[0]) || now.getFullYear(),month:parts?.[1] ? Number(parts[1])-1 : now.getMonth()});setTime(input.value.split("T")[1]?.slice(0,5)||"00:00");setTarget(input);};
    const click=(event:MouseEvent)=>{const input=event.target;if(input instanceof HTMLInputElement && supported.has(input.type) && !input.disabled && !input.readOnly){event.preventDefault();open(input);}};
    const key=(event:KeyboardEvent)=>{const input=event.target;if(input instanceof HTMLInputElement && supported.has(input.type) && event.key==="ArrowDown"){event.preventDefault();open(input);}};
    document.addEventListener("click",click,true);document.addEventListener("keydown",key,true);
    return ()=>{document.removeEventListener("click",click,true);document.removeEventListener("keydown",key,true);};
  },[]);
  useEffect(()=>{
    if(!target)return;
    const focus=window.setTimeout(()=>panel.current?.querySelector<HTMLButtonElement>("button")?.focus(),0);
    const outside=(event:PointerEvent)=>{if(panel.current && event.target instanceof Node && !panel.current.contains(event.target) && event.target!==target)setTarget(null);};
    const key=(event:KeyboardEvent)=>{if(event.key==="Escape"){event.preventDefault();event.stopPropagation();setTarget(null);opener.current?.focus();}if(event.key==="Tab" && panel.current){const items=Array.from(panel.current.querySelectorAll<HTMLElement>("button:not(:disabled),input:not(:disabled),select:not(:disabled)"));const first=items[0],last=items.at(-1);if(event.shiftKey && document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first?.focus();}}};
    document.addEventListener("pointerdown",outside);document.addEventListener("keydown",key,true);return ()=>{clearTimeout(focus);document.removeEventListener("pointerdown",outside);document.removeEventListener("keydown",key,true);};
  },[target]);
  if(!target)return null;
  const close=()=>{setTarget(null);opener.current?.focus();};
  const choose=(day:string)=>{if(!target.isConnected){close();return;}setCalendarInputValue(target,calendarCandidate(target.type as CalendarType,day,time,target.min,target.max));close();};
  const move=(offset:number)=>{const date=new Date(month.year,month.month+offset,1);setMonth({year:date.getFullYear(),month:date.getMonth()});};
  const firstDay=new Date(month.year,month.month,1).getDay(),days=new Date(month.year,month.month+1,0).getDate();
  const minimum=target.min.slice(0,target.type==="month" ? 7:10),maximum=target.max.slice(0,target.type==="month" ? 7:10);
  const disabled=(value:string)=>!!(minimum && value<minimum || maximum && value>maximum);
  const now=new Date(),today=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Riyadh",year:"numeric",month:"2-digit",day:"2-digit"}).format(now);
  const selected=target.value.slice(0,10),years=Array.from({length:161},(_,index)=>month.year-80+index);
  return createPortal(<div className="system-calendar-layer"><div ref={panel} className="system-calendar" role="dialog" aria-modal="true" aria-label={words.title} dir={locale==="ar" ? "rtl":"ltr"}><header><strong>{words.title}</strong><button type="button" aria-label={words.close} onClick={close}>×</button></header><nav><button type="button" aria-label={words.previous} onClick={()=>move(-1)}>‹</button><select aria-label={words.month} value={month.month} onChange={event=>setMonth({...month,month:Number(event.target.value)})}>{Array.from({length:12},(_,index)=><option key={index} value={index}>{new Intl.DateTimeFormat(locale,{month:"long",calendar:"gregory"}).format(new Date(2026,index,1))}</option>)}</select><select aria-label={words.year} value={month.year} onChange={event=>setMonth({...month,year:Number(event.target.value)})}>{years.map(year=><option key={year}>{year}</option>)}</select><button type="button" aria-label={words.next} onClick={()=>move(1)}>›</button></nav>
    {target.type==="month" ? <div className="system-calendar-months">{Array.from({length:12},(_,index)=>{const value=iso(month.year,index,1).slice(0,7);return <button type="button" key={index} disabled={disabled(value)} aria-pressed={target.value===value} onClick={()=>choose(`${value}-01`)}>{new Intl.DateTimeFormat(locale,{month:"short",calendar:"gregory"}).format(new Date(month.year,index,1))}</button>;})}</div> : <><div className="system-calendar-weekdays">{Array.from({length:7},(_,index)=><span key={index}>{new Intl.DateTimeFormat(locale,{weekday:"short"}).format(new Date(2026,0,4+index))}</span>)}</div><div className="system-calendar-days">{Array.from({length:firstDay},(_,index)=><span key={`empty-${index}`}/>)}{Array.from({length:days},(_,index)=>{const value=iso(month.year,month.month,index+1);return <button type="button" key={value} disabled={disabled(value)} aria-label={value} aria-pressed={selected===value} className={value===today ? "today":""} onClick={()=>choose(value)}>{index+1}</button>;})}</div></>}
    {target.type==="datetime-local" && <label className="system-calendar-time">{words.time}<input type="time" value={time} onChange={event=>setTime(event.target.value)}/></label>}
    <footer><button type="button" disabled={disabled(target.type==="month" ? today.slice(0,7):today)} onClick={()=>choose(today)}>{words.today}</button>{!target.required && <button type="button" onClick={()=>{setCalendarInputValue(target,"");close();}}>{words.clear}</button>}</footer>
  </div></div>,document.body);
}
