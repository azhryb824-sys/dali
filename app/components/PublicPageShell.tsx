import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { getWebsiteContent, publishedEntries } from "@/lib/website-content";
import PublicHeader from "./PublicHeader";

export default async function PublicPageShell({ children }: { children: ReactNode }) {
  const content = await getWebsiteContent();
  const services = publishedEntries(content, "services").slice(0, 4);
  return <main className="public-inner-page">
    <PublicHeader content={content}/>
    {children}
    <footer className="inner-footer"><div><Link className="brand footer-brand" href="/"><Image src="/dally-logo.jpg" alt={content.site.companyName} width={545} height={280} sizes="180px"/></Link><p>{content.site.tagline}</p></div>{content.visibility.services && <div><b>الخدمات</b><Link href="/construction">المقاولات وإدارة المشروعات</Link>{services.map((service) => <Link href={`/services/${service.slug}`} key={service.id}>{service.shortTitle}</Link>)}{content.visibility.sectors && <Link href="/sectors">القطاعات</Link>}{content.visibility.locations && <Link href="/locations">مناطق الخدمة</Link>}</div>}<div><b>الشركة</b><Link href="/about">من نحن</Link>{content.visibility.projects && <Link href="/projects">المشروعات</Link>}{content.visibility.credentials && <Link href="/credentials">التراخيص والاعتمادات</Link>}{content.visibility.articles && <Link href="/insights">مركز المعرفة</Link>}{content.visibility.jobs && <Link href="/careers">الوظائف</Link>}</div><div><b>التواصل والحوكمة</b><Link href="/contact#quote">طلب عرض سعر</Link><Link href="/contact#live-chat">محادثة مباشرة</Link>{content.visibility.partners && <Link href="/partners">الموردون والشركاء</Link>}<Link href="/feedback">الشكاوى والاقتراحات</Link>{content.visibility.faq && <Link href="/faq">الأسئلة الشائعة</Link>}<Link href="/privacy">سياسة الخصوصية</Link><Link href="/terms">الشروط والأحكام</Link></div><div className="inner-footer-bottom"><span>© 2026 {content.site.companyName}. جميع الحقوق محفوظة.</span><span>شركة سعودية · {content.site.address}</span></div></footer>
  </main>;
}
