import type { Metadata } from "next";
import Link from "next/link";
import StructuredData from "@/app/components/StructuredData";
import ConstructionSubpage from "../ConstructionSubpage";
import { constructionServices } from "@/lib/construction-content";
import { absoluteUrl } from "@/lib/site";

export const metadata: Metadata = { title: "تخصصات وخدمات المقاولات في السعودية | دالي", description: "تعرف على نطاقات المباني والتشطيبات والترميم والأعمال المدنية والكهروميكانيكية وإدارة المشروعات.", alternates: { canonical: "/construction/services" } };
export default function Page(){const schema={"@context":"https://schema.org","@type":"ItemList",itemListElement:constructionServices.map((service,index)=>({"@type":"ListItem",position:index+1,name:service.title,url:absoluteUrl(`/construction/services#${service.slug}`)}))};return <ConstructionSubpage eyebrow="تخصصات المقاولات" title="نطاقات واضحة قبل التسعير والتنفيذ" intro="لا نعرض تخصصاً بوصفه وعداً عاماً؛ بل نحدد مدخلاته ومخرجاته ونقاط اعتماده وما يتطلبه من وثائق ومعاينة."><StructuredData data={schema}/><section className="inner-content construction-discipline-list">{constructionServices.map(service=><article id={service.slug} key={service.slug}><div><span>خدمة مقاولات</span><h2>{service.title}</h2><p>{service.summary}</p></div><ul>{service.details.map(item=><li key={item}>{item}</li>)}</ul></article>)}</section><section className="construction-band"><h2>لديك نطاق أولي أو جدول كميات؟</h2><p>أرسله للفريق مع موقع المشروع وموعده المستهدف لبدء المراجعة.</p><Link className="btn primary" href="/construction/request">اطلب دراسة المشروع</Link></section></ConstructionSubpage>}
