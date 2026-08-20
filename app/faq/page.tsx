import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import PublicPageShell from "@/app/components/PublicPageShell";
import StructuredData from "@/app/components/StructuredData";
import { getWebsiteContent } from "@/lib/website-content";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "الأسئلة الشائعة عن القوى العاملة والتشغيل والمقاولات", description: "إجابات واضحة عن خدمات القوى العاملة والتشغيل والصيانة والمقاولات في مدن المملكة، ونطاق الطلب والتكلفة والوثائق.", alternates: { canonical: "/faq" } };

export default async function FaqPage() {
  const content = await getWebsiteContent();
  if (!content.visibility.faq) notFound();
  const data = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: content.faq.map((item) => ({ "@type": "Question", name: item.question, acceptedAnswer: { "@type": "Answer", text: item.answer } })) };
  return <PublicPageShell><StructuredData data={data}/><section className="inner-hero"><nav className="page-breadcrumbs" aria-label="مسار الصفحة"><Link href="/">الرئيسية</Link><span aria-hidden="true">/</span><span>الأسئلة الشائعة</span></nav><p className="eyebrow light"><span/>الأسئلة الشائعة</p><h1>إجابات مباشرة<br/><em>قبل طلب الخدمة.</em></h1><p>معلومات عن القوى العاملة والتشغيل والصيانة والمقاولات في مدن المملكة، وكيفية تجهيز طلب واضح.</p></section><section className="inner-content"><div className="faq-list managed-faq-list">{content.faq.map((item, index) => <details key={item.question}><summary><span>{String(index + 1).padStart(2, "0")}</span>{item.question}<b>+</b></summary><p>{item.answer}</p></details>)}</div><Link className="inner-callout" href="/contact#quote"><strong>لم تجد إجابة مناسبة؟</strong><span>أرسل استفسارك أو ابدأ محادثة مباشرة مع فريق الشركة.</span><b>تواصل معنا ←</b></Link></section></PublicPageShell>;
}
