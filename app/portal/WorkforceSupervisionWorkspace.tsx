"use client";

type Contract={id:number;referenceCode:string;clientName:string;title:string;workSite:string;startDate:string;endDate:string;status:string};
type Profession={id:number;contractId:number;profession:string;requiredCount:number};
type Assignment={id:number;contractId:number;contractProfessionId:number;workerId:number;status:string};
type Worker={id:number;fullName:string;profession:string;clientSite:string;status:string};

const statusLabels:Record<string,string>={draft:"مسودة",internal_review:"مراجعة داخلية",legal_review:"مراجعة قانونية",approved:"معتمد",sent:"مرسل",signed:"موقّع",active:"ساري",suspended:"معلّق",expired:"منتهي",terminated:"منهى",cancelled:"ملغى",superseded:"مستبدل"};

export default function WorkforceSupervisionWorkspace({contracts,professions,assignments,workers,onOpenContract}:{contracts:Contract[];professions:Profession[];assignments:Assignment[];workers:Worker[];onOpenContract:(id:number)=>void}){
  const operational=contracts.filter(contract=>!["terminated","cancelled","superseded"].includes(contract.status));
  return <section className="workforce-supervision-workspace">
    <header className="feature-heading"><div><span>التشغيل الميداني المرتبط بالعقود</span><h1>إدارة الإشراف على العمالة</h1><p>إسناد العمالة إلى موقع العقد، إعادة عامل أو جزء من العمالة، ومتابعة اكتمال التغطية التشغيلية.</p></div><b>{operational.length}<small>عقد قابل للإدارة</small></b></header>
    <section className="panel"><div className="panel-head"><div><h2>العقود ومواقع العمالة</h2><p>افتح العقد لتنفيذ الإسناد والإعادة، ويظهر تسجيل الغياب للمالك ومشرف النظام فقط.</p></div></div>
      <div className="feature-list">{operational.map(contract=>{const requirements=professions.filter(item=>item.contractId===contract.id),required=requirements.reduce((sum,item)=>sum+item.requiredCount,0),active=assignments.filter(item=>item.contractId===contract.id&&item.status==="active"),assignedWorkers=workers.filter(worker=>active.some(item=>item.workerId===worker.id));return <article key={contract.id}><div><strong>{contract.referenceCode} · {contract.clientName}</strong><small>{contract.workSite} · {contract.startDate} — {contract.endDate}</small><small>{requirements.map(item=>`${item.profession}: ${active.filter(row=>row.contractProfessionId===item.id).length}/${item.requiredCount}`).join("، ")||"لا توجد مهن مسجلة"}</small>{assignedWorkers.length>0&&<small>المسندون: {assignedWorkers.map(worker=>worker.fullName).join("، ")}</small>}</div><span className={`workflow-status ${contract.status}`}>{statusLabels[contract.status]||contract.status}</span><b>{active.length}/{required}</b><button className="admin-primary" type="button" onClick={()=>onOpenContract(contract.id)}>فتح إدارة الإسناد والإعادة</button></article>})}{!operational.length&&<div className="empty-operational">لا توجد عقود قابلة لإدارة العمالة حاليًا.</div>}</div>
    </section>
  </section>;
}
