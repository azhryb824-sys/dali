"use client";
import { FormEvent, useEffect, useState } from "react";
import { readApiJson } from "@/lib/client-api";
import { annualContractEndDate } from "@/lib/payment-schedules";
import CommercialDetailsFields from "@/app/components/CommercialDetailsFields";
import CommercialLineItemsEditor, { newCommercialLine, type EditableCommercialLine } from "@/app/components/CommercialLineItemsEditor";
import RequestedPaymentSchedule from "@/app/components/RequestedPaymentSchedule";

type Contract = { id:number; referenceCode:string; clientName:string; clientCr:string|null; clientVat:string|null; title:string; workSite:string; issueDate:string; startDate:string; endDate:string; quantityMode:string; seasonType:string; vatRateBps:number; contractDirection:string; accommodationParty:string|null; transportParty:string|null; details:string; showPaymentSchedule:boolean; amountHalalas?:number; versionNumber?:number };
type Profession = { id?:number;contractId:number;profession:string;requiredCount:number;unitSalaryHalalas:number;actualSalaryHalalas:number;sponsorshipType:string|null;sponsorName:string|null;ajirContractStatus:string|null };
type Payment = { id:number;contractId:number;installmentNumber:number;title:string;titleEn?:string|null;dueDate:string;percentageBps:number;status:string;invoiceDocumentId:number|null };
type Snapshot = { contract:Contract;professions:Profession[];payments:Payment[];terms:Record<string,unknown> };
type Props = { contract:Contract;professions:Profession[];payments:Payment[];busy:boolean;onClose:()=>void;onSaved:()=>Promise<void>;onSubmit?:(payload:Record<string,unknown>)=>Promise<void> };

export default function ContractFullEditDialog(props:Props) {
  const [snapshot,setSnapshot]=useState<Snapshot|null>(null),[error,setError]=useState("");
  useEffect(()=>{let current=true;fetch(`/api/portal/contracts/${props.contract.id}`,{cache:"no-store"}).then(async response=>{const data=await readApiJson(response) as Snapshot & {error?:string};if(!response.ok)throw new Error(data.error||"تعذر تحميل بيانات العقد");if(current)setSnapshot(data)}).catch(error=>{if(current)setError(error instanceof Error?error.message:"تعذر تحميل بيانات العقد")});return()=>{current=false}},[props.contract.id]);
  return <div className="modal-layer"><button className="modal-backdrop" type="button" onClick={props.onClose} aria-label="إغلاق تعديل العقد"/><section className="issue-modal contract-edit-issue-modal full-contract-editor" role="dialog" aria-modal="true" aria-label="تعديل العقد بالكامل"><header className="modal-head"><div><span dir="ltr">{props.contract.referenceCode}</span><h2>تعديل العقد بالكامل</h2></div><button type="button" onClick={props.onClose}>إغلاق</button></header>{error?<p role="alert" className="form-error">{error}</p>:snapshot?<ContractFields {...props} snapshot={snapshot}/>:<p role="status">جارٍ تحميل بيانات العقد...</p>}</section></div>;
}
function ContractFields({snapshot,busy,onClose,onSaved,onSubmit}:Props & {snapshot:Snapshot}) {
  const {contract,professions,payments,terms}=snapshot;
  const [quantityMode,setQuantityMode]=useState<"fixed"|"open">(contract.quantityMode === "open"?"open":"fixed");
  const [season,setSeason]=useState<"regular"|"hajj"|"ramadan">(contract.seasonType === "hajj"?"hajj":contract.seasonType === "ramadan"?"ramadan":"regular");
  const [startDate,setStartDate]=useState(contract.startDate),[endDate,setEndDate]=useState(contract.endDate);
  const [saving,setSaving]=useState(false),[error,setError]=useState("");
  const [lines,setLines]=useState<EditableCommercialLine[]>(()=>professions.map(row=>({...newCommercialLine(),key:String(row.id),profession:row.profession,quantity:row.requiredCount||1,unitPrice:row.unitSalaryHalalas/100,actualSalary:row.actualSalaryHalalas/100,sponsorshipType:row.sponsorshipType === "other"?"other":"dali",sponsorName:row.sponsorName||"",ajirContractStatus:row.ajirContractStatus === "with_ajir"?"with_ajir":row.ajirContractStatus === "without_ajir"?"without_ajir":"not_applicable"})));
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();setSaving(true);setError("");
    const fields=Object.fromEntries(new FormData(event.currentTarget).entries());
    const payload={...fields,versionNumber:contract.versionNumber,quantityMode,seasonType:season,vatRateBps:Math.round(Number(fields.vatRate)*100),
      professions:lines.map(row=>({profession:row.profession,requiredCount:quantityMode === "open"?0:row.quantity,unitSalaryHalalas:Math.round(row.unitPrice*100),actualSalaryHalalas:Math.round(row.actualSalary*100),sponsorshipType:row.sponsorshipType,sponsorName:row.sponsorshipType === "other"?row.sponsorName:null,ajirContractStatus:row.ajirContractStatus})),
    };
    try { if(onSubmit)await onSubmit(payload);else {const response=await fetch(`/api/portal/contracts/${contract.id}`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});const data=await readApiJson(response) as {error?:string};if(!response.ok)throw new Error(data.error||"تعذر حفظ العقد");}await onSaved();onClose(); }
    catch(error){setError(error instanceof Error?error.message:"تعذر حفظ العقد")}finally{setSaving(false)}
  }
  return <form className="feature-form commercial-full-edit-form" onSubmit={submit}>
    <p className="readonly-note span-two">تُحفظ جميع الحقول والبنود والدفعات مع العقد. يُعاد العقد للمسودة ويلزم اعتماده مجددًا. لا تتغير القيود المالية المنفذة.</p>
    <CommercialDetailsFields defaults={{...terms,...contract}} omit={["startDate","endDate"]}/>
    <label>تاريخ الإصدار<input name="issueDate" type="date" required defaultValue={contract.issueDate}/></label>
    <label>تاريخ البداية<input name="startDate" type="date" required value={startDate} onChange={event=>setStartDate(event.target.value)}/></label>
    <label>تاريخ النهاية<input name="endDate" type="date" required readOnly={season === "regular"} value={season === "regular"?annualContractEndDate(startDate):endDate} onChange={event=>setEndDate(event.target.value)}/>{season === "regular"&&<small>العقد السنوي مدته 12 شهرًا؛ يتحدث تاريخ النهاية عند تعديل البداية.</small>}</label>
    <label>نطاق العدد<select value={quantityMode} onChange={event=>setQuantityMode(event.target.value as typeof quantityMode)}><option value="fixed">عدد محدد</option><option value="open">عدد مفتوح</option></select></label>
    <RequestedPaymentSchedule defaults={{seasonType:contract.seasonType,paymentSchedule:payments}} onSeasonChange={setSeason} required={quantityMode === "fixed"}/>
    <h3 className="span-two">المهن والأعداد والأسعار</h3><p className="span-two">يمكن تعديل جهة الكفالة وحالة عقد أجير لكل توزيع قبل بدء الإسناد.</p>
    <CommercialLineItemsEditor lines={lines} onChange={setLines} quantityMode={quantityMode} annual={season === "regular"}/>
    <label>نسبة الضريبة %<input name="vatRate" type="number" min={0} max={100} step="0.01" required defaultValue={contract.vatRateBps/100}/></label>
    {quantityMode === "fixed"&&season !== "regular"&&<label>قيمة العقد قبل الضريبة<input name="amount" type="number" min="0.01" step="0.01" required defaultValue={(contract.amountHalalas || 0)/(1+contract.vatRateBps/10000)/100}/></label>}
    <label>السكن على<select name="accommodationParty" defaultValue={contract.accommodationParty || "توفره دالي"}><option>توفره دالي</option><option>يوفره الطرف الثاني</option><option>لا ينطبق</option>{contract.accommodationParty && !["توفره دالي","يوفره الطرف الثاني","لا ينطبق"].includes(contract.accommodationParty)&&<option>{contract.accommodationParty}</option>}</select></label>
    <label>النقل على<select name="transportParty" defaultValue={contract.transportParty || "توفره دالي"}><option>توفره دالي</option><option>يوفره الطرف الآخر</option><option>لا ينطبق</option>{contract.transportParty && !["توفره دالي","يوفره الطرف الآخر","لا ينطبق"].includes(contract.transportParty)&&<option>{contract.transportParty}</option>}</select></label>
    {error&&<p className="form-error span-two" role="alert">{error}</p>}<footer className="modal-actions span-two"><button type="button" disabled={saving} onClick={onClose}>إلغاء</button><button type="submit" className="admin-primary" disabled={busy||saving}>{saving?"جارٍ الحفظ...":"حفظ جميع التعديلات"}</button></footer>
  </form>;
}
