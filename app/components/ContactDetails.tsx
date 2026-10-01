import { localizedPublicTree } from "./LocalizedPublicTree";
import type { AppLocale } from "@/lib/i18n";
import type { WebsiteContent } from "@/lib/website-content";
import { companyMapUrl, safeMapUrl } from "@/lib/local-business";
export default function ContactDetails({ content, locale = "ar" }: { content: WebsiteContent; locale?: AppLocale }) {
  const site = content.site;
  return localizedPublicTree(<section className="contact-details inner-content" aria-label="بيانات التواصل">
    <div className="contact-intro"><p className="eyebrow"><span/>قنوات التواصل</p><h2>قريبون من أعمالك</h2><p>اختر الطريقة المناسبة للتواصل مع فريق دالي، أو شاركنا تفاصيل احتياجك في طلب عرض السعر.</p></div>
    <div className="contact-channel-grid">
      {site.phone && <article className="contact-channel"><span className="contact-channel-icon" aria-hidden="true">↗</span><h3>اتصل بنا</h3><p>للاستفسار عن الخدمات ومتابعة طلبك.</p><a href={`tel:${site.phone.replace(/[^+\d]/g, "")}`} dir="ltr">{site.phone}</a></article>}
      {site.email && <article className="contact-channel"><span className="contact-channel-icon" aria-hidden="true">@</span><h3>راسلنا</h3><p>للمراسلات الرسمية والاستفسارات العامة.</p><a href={`mailto:${site.email}`} dir="ltr">{site.email}</a></article>}
      <article className="contact-channel contact-location"><span className="contact-channel-icon" aria-hidden="true">⌖</span><h3>عنوان الشركة</h3><address>{site.address || [site.district, site.city].filter(Boolean).join("، ")}</address><a href={companyMapUrl(site)} target="_blank" rel="noopener noreferrer">{safeMapUrl(site.mapUrl) || safeMapUrl(site.googleBusinessUrl) ? "الموقع على خرائط جوجل" : "البحث عن العنوان في خرائط جوجل"}<span aria-hidden="true"> ↗</span></a></article>
      <article className="contact-channel"><span className="contact-channel-icon" aria-hidden="true">≡</span><h3>طلب عرض سعر</h3><p>حدد الخدمة والموقع والمدة ليتمكن المختص من مراجعة احتياجك.</p><a href="#quote">ابدأ طلبك <span aria-hidden="true">←</span></a></article>
    </div>
    {safeMapUrl(site.googleBusinessUrl) && <div className="contact-business-profile"><div><strong>{site.companyName}</strong><p>{site.city} · {site.district}</p></div><a href={safeMapUrl(site.googleBusinessUrl)} target="_blank" rel="noopener noreferrer">ملف الشركة على جوجل ↗</a></div>}
  </section>, locale, locale === "ar" ? {} : content.translations[locale]);
}
