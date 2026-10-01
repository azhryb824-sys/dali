"use client";
import { lazy, Suspense, useEffect, useState } from "react";
import { readApiJson } from "@/lib/client-api";

const ContractWizard = lazy(() => import("./PortalDashboard").then(module => ({ default: module.IssueDocumentModal })));

type Contract = { id:number; referenceCode:string; clientName:string; clientCr:string|null; clientVat:string|null; title:string; workSite:string; issueDate:string; startDate:string; endDate:string; quantityMode:string; seasonType:string; vatRateBps:number; contractDirection:string; accommodationParty:string|null; transportParty:string|null; details:string; showPaymentSchedule:boolean; amountHalalas?:number; versionNumber?:number };
type Profession = { id?:number;contractId:number;profession:string;requiredCount:number;unitSalaryHalalas:number;actualSalaryHalalas:number;sponsorshipType:string|null;sponsorName:string|null;ajirContractStatus:string|null };
type Payment = { id:number;contractId:number;installmentNumber:number;title:string;titleEn?:string|null;dueDate:string;percentageBps:number;status:string;invoiceDocumentId:number|null };
export type ContractEditSnapshot = { contract:Contract;professions:Profession[];payments:Payment[];terms:Record<string,unknown> };
type Props = { contract:Contract;professions:Profession[];payments:Payment[];busy:boolean;onClose:()=>void;onSaved:()=>Promise<void>;onSubmit?:(payload:Record<string,unknown>)=>Promise<void> };

export default function ContractFullEditDialog(props:Props) {
  const [snapshot,setSnapshot]=useState<ContractEditSnapshot|null>(null),[error,setError]=useState(""),[saving,setSaving]=useState(false);
  useEffect(()=>{let current=true;fetch(`/api/portal/contracts/${props.contract.id}`,{cache:"no-store"}).then(async response=>{const data=await readApiJson(response) as ContractEditSnapshot & {error?:string};if(!response.ok)throw new Error(data.error||"تعذر تحميل بيانات العقد");if(current)setSnapshot(data)}).catch(error=>{if(current)setError(error instanceof Error?error.message:"تعذر تحميل بيانات العقد")});return()=>{current=false}},[props.contract.id]);
  async function save(form:HTMLFormElement) {
    if(!snapshot)return;
    setSaving(true);
    try {
      const fields=Object.fromEntries(new FormData(form).entries());
      const professions=JSON.parse(String(fields.professions || "[]")) as Array<Record<string,unknown>>;
      const payload={...fields,versionNumber:snapshot.contract.versionNumber,vatRateBps:Math.round(Number(fields.vatRate || 0)*100),
        professions:professions.map(row=>({...row,unitSalaryHalalas:Math.round(Number(row.unitSalary)*100),actualSalaryHalalas:Math.round(Number(row.actualSalary)*100)})),
      };
      if(props.onSubmit)await props.onSubmit(payload);
      else {const response=await fetch(`/api/portal/contracts/${snapshot.contract.id}`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});const data=await readApiJson(response) as {error?:string};if(!response.ok)throw new Error(data.error||"تعذر حفظ العقد");}
      await props.onSaved();props.onClose();
    } finally {setSaving(false);}
  }
  const loading=<div className="modal-layer"><section className="issue-modal" role="dialog" aria-modal="true" aria-label="تعديل العقد بالكامل"><button type="button" onClick={props.onClose}>إغلاق</button><p role={error?"alert":"status"}>{error||"جارٍ تحميل بيانات العقد..."}</p></section></div>;
  return snapshot?<Suspense fallback={loading}><ContractWizard editSnapshot={snapshot} initialType="workforce_contract" initialQuoteId={null} conversionMode="modified" canIssueContracts canIssueFinance={false} assetsReady busy={props.busy||saving} workers={[]} contracts={[]} requests={[]} onClose={props.onClose} onSubmit={save}/></Suspense>:loading;
}
