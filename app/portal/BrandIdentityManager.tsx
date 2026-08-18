"use client";

import Image from "next/image";
import { useState } from "react";
import { brandIdentityAssets } from "@/lib/brand-identity";

export default function BrandIdentityManager() {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const download = (id: string) => {
    const anchor = document.createElement("a");
    anchor.href = `/api/portal/brand-identity/${id}`;
    anchor.download = `dali-${id}.pdf`;
    document.body.appendChild(anchor); anchor.click(); anchor.remove();
  };
  async function downloadAll() {
    setBusy(true); setNotice("جارٍ تجهيز جميع ملفات الهوية...");
    for (const [index, item] of brandIdentityAssets.entries()) {
      download(item.id);
      if (index < brandIdentityAssets.length - 1) await new Promise((resolve) => window.setTimeout(resolve, 550));
    }
    setBusy(false); setNotice("بدأ تنزيل جميع ملفات الهوية بصيغة PDF.");
  }
  return <>
    <div className="content-heading module-heading brand-heading"><div><p className="admin-eyebrow">النظام المؤسسي المعتمد</p><h1>الهوية البصرية</h1><span>مكتبة مركزية لقواعد العلامة والشعار والألوان والخطوط والتطبيقات، مبنية على الشعار الرسمي الموجود.</span></div><button className="admin-primary" disabled={busy} onClick={() => void downloadAll()}>{busy ? "جارٍ التنزيل..." : "تنزيل جميع ملفات PDF"}</button></div>
    {notice && <div className="operations-notice" role="status">{notice}</div>}
    <section className="brand-hero panel"><div className="brand-logo-stage"><Image src="/dally-logo.jpg" alt="الشعار الرسمي لشركة دالي" width={545} height={280} sizes="320px" priority/></div><div><p>الإصدار المعتمد 1.0</p><h2>شركة دالي للتشغيل والصيانة</h2><span>هوية سعودية مهنية تعبّر عن الاعتمادية والجاهزية والجودة والسلامة، وتُطبّق باتساق في جميع نقاط الاتصال.</span><div className="brand-swatches" aria-label="ألوان الهوية"><i className="navy" title="#001D2D"/><i className="red" title="#E21C25"/><i className="pale" title="#F4F7F8"/><i className="white" title="#FFFFFF"/></div></div></section>
    <section className="brand-asset-grid">{brandIdentityAssets.map((item) => <article className="panel brand-asset-card" key={item.id}><header><span>PDF</span><small>{item.category}</small></header><div><h2>{item.title}</h2><p>{item.description}</p></div><footer><span>{item.pages} · إصدار 1.0</span><div><a href={`/api/portal/brand-identity/${item.id}`} target="_blank" rel="noreferrer">معاينة</a><button onClick={() => download(item.id)}>تنزيل PDF</button></div></footer></article>)}</section>
    <section className="panel brand-rules"><header><h2>مرتكزات الهوية المعتمدة</h2><p>تُطبق هذه القواعد في الموقع والنظام والمستندات والمطبوعات.</p></header><div><article><b>01</b><strong>الشعار الحالي</strong><span>يحفظ تكوينه ونسبه وألوانه دون إعادة رسم.</span></article><article><b>02</b><strong>ألوان وظيفية</strong><span>أزرق مؤسسي وأحمر للإبراز مع تباين واضح.</span></article><article><b>03</b><strong>خط Tajawal</strong><span>نظام طباعي عربي موحّد للواجهات والمستندات.</span></article><article><b>04</b><strong>صور منضبطة</strong><span>محتوى مهني خالٍ من الكائنات الحية.</span></article></div></section>
  </>;
}

