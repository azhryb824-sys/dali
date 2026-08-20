import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PublicPageShell from "@/app/components/PublicPageShell";
import { ManagedCollectionIndex } from "@/app/components/ManagedContentPages";
import PublicRequestForm from "@/app/components/PublicRequestForm";
import { getWebsiteContent, publishedEntries } from "@/lib/website-content";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "الموردون والشركاء", description: "قناة الموردين ومقاولي الباطن والشركاء الراغبين في دعم أعمال شركة دالي في مناطق المملكة.", alternates: { canonical: "/partners" } };
export default async function PartnersPage() { const content = await getWebsiteContent(); if (!content.visibility.partners) notFound(); const entries = publishedEntries(content, "partners"); return <PublicPageShell><ManagedCollectionIndex content={content} collectionKey="partners" title="شراكات تصنع قيمة مشتركة" description="نرحب بالموردين والشركاء الذين يشاركوننا الالتزام بالجودة والموثوقية، ويمتلكون قدرة توريد أو تنفيذ تدعم أعمالنا في مناطق المملكة." entries={entries} emptyTitle="هل ترى فرصة للتعاون؟" emptyText="أرسل مقترحك، وسيدرس فريق دالي مدى ملاءمته لاحتياجاتنا وفرص الشراكة المتاحة."/><section className="inner-content public-request-section"><div className="inner-heading"><p className="eyebrow"><span/>طلب شراكة أو توريد</p><h2>لنصنع فرصة تعاون مثمرة</h2><p>عرّفنا بخدماتك وقدرتك التشغيلية ونطاق تغطيتك، مع تجنب إرسال أي معلومات سرية.</p></div><PublicRequestForm specialization="شراكة أو توريد" submitLabel="إرسال طلب الشراكة" detailsLabel="نطاق التوريد أو الشراكة" detailsPlaceholder="صف المنتج أو الخدمة، مناطق التغطية، القدرة التشغيلية وأفضل وقت للتواصل."/></section></PublicPageShell>; }
