"use client";

import { FormEvent, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import LiveChatWidget from "./LiveChatWidget";
import PublicHeader from "./components/PublicHeader";
import StructuredData from "./components/StructuredData";
import { useWebsiteContent } from "./components/WebsiteContentProvider";
import { absoluteUrl, SITE } from "@/lib/site";

const hajjCapabilities = [
  { n: "01", title: "استجابة تواكب الموسم", text: "حلول مرنة للمواقع والفترات التي ترتفع فيها وتيرة العمل." },
  { n: "02", title: "تخصصات في فريق واحد", text: "كوادر تشغيلية وفنية وإشرافية تلائم احتياج كل موقع." },
  { n: "03", title: "جاهزية قبل الانطلاق", text: "عناية بمتطلبات كل دور لتبدأ الخدمة بثقة وفي الوقت المناسب." },
  { n: "04", title: "دعم مستمر للميدان", text: "متابعة قريبة واستجابة للتغيرات طوال فترة الموسم." },
];

function Arrow() { return <span aria-hidden="true">←</span>; }

export default function Home() {
  const content = useWebsiteContent();
  const services = content.collections.services.filter((item) => item.status === "published" && item.featured).slice(0, 6).map((item, index) => ({ n: String(index + 1).padStart(2, "0"), title: item.shortTitle, text: item.summary, href: `/services/${item.slug}` }));
  const sectors = content.collections.sectors.filter((item) => item.status === "published" && item.featured).slice(0, 6);
  const professions = content.home.professions;
  const steps = content.home.process.map((item, index) => ({ n: String(index + 1).padStart(2, "0"), ...item }));
  const faqs = content.faq.map((item) => ({ q: item.question, a: item.answer }));
  const [sent, setSent] = useState(false);
  const [trackingCode, setTrackingCode] = useState("");
  const [sending, setSending] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const requestIdempotencyKey = useRef(crypto.randomUUID());

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    setSubmitError("");
    const form = event.currentTarget;
    try {
      const response = await fetch("/api/workforce-requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...Object.fromEntries(new FormData(form).entries()), idempotencyKey: requestIdempotencyKey.current }),
      });
      const result = await response.json().catch(() => ({})) as { error?: string; trackingCode?: string };
      if (!response.ok) throw new Error(result.error || "تعذّر إرسال الطلب");
      form.reset();
      setTrackingCode(result.trackingCode || "");
      setSent(true);
      requestIdempotencyKey.current = crypto.randomUUID();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "تعذّر إرسال الطلب حالياً. يرجى المحاولة مرة أخرى.");
    } finally { setSending(false); }
  }

  const businessSchema = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": ["Organization", "ProfessionalService"],
        "@id": `${SITE.url}/#organization`,
        name: content.site.companyName,
        alternateName: content.site.shortName,
        url: SITE.url,
        logo: { "@type": "ImageObject", url: absoluteUrl(SITE.logoPath) },
        image: absoluteUrl("/images/dali-hero.webp"),
        description: content.seo.organizationDescription,
        address: { "@type": "PostalAddress", addressLocality: content.site.city, streetAddress: content.site.district, addressCountry: SITE.countryCode },
        areaServed: { "@type": "Country", name: "Saudi Arabia" },
        ...(content.site.phone ? { telephone: content.site.phone } : {}),
        ...(content.site.email ? { email: content.site.email } : {}),
        hasOfferCatalog: {
          "@type": "OfferCatalog",
          name: "خدمات القوى العاملة والمقاولات",
          itemListElement: services.slice(0, 5).map((service) => ({ "@type": "Offer", itemOffered: { "@type": "Service", name: service.title, url: absoluteUrl(service.href), areaServed: "المملكة العربية السعودية" } })),
        },
      },
      {
        "@type": "WebSite",
        "@id": `${SITE.url}/#website`,
        url: SITE.url,
        name: content.site.companyName,
        inLanguage: SITE.language,
        publisher: { "@id": `${SITE.url}/#organization` },
        potentialAction: { "@type": "SearchAction", target: `${SITE.url}/search?q={search_term_string}`, "query-input": "required name=search_term_string" },
      },
    ],
  };
  const faqSchema = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faqs.map((item) => ({ "@type": "Question", name: item.q, acceptedAnswer: { "@type": "Answer", text: item.a } })) };

  return <main>
    <StructuredData data={businessSchema}/>
    {content.visibility.faq && <StructuredData data={faqSchema}/>}

    <PublicHeader content={content}/>

    <section className="hero" id="home">
      <Image className="hero-image" src="/images/dali-hero.webp" alt="منشأة صناعية حديثة خالية من الكائنات الحية في بيئة منطقة مكة المكرمة" width={1983} height={793} sizes="100vw" priority/>
      <div className="hero-overlay"/>
      <div className="hero-copy">
        <p className="eyebrow light"><span/> {content.home.heroKicker}</p>
        <h1>{content.home.heroTitle}<br/><em>{content.home.heroAccent}</em></h1>
        <p>{content.home.heroDescription}</p>
        <div className="hero-actions"><a className="btn primary" href="#quote">اطلب عرض سعر <Arrow/></a><a className="text-link" href="#services">استكشف خدماتنا <Arrow/></a></div>
      </div>
      <div className="hero-note"><span>01</span><p><strong>نستقبل احتياجك من جميع مناطق المملكة</strong>نراجع المدينة والنطاق والموعد قبل تأكيد خطة التعبئة أو التنفيذ.</p></div>
    </section>

    <section className="assurance-strip" aria-label="مزايا الخدمة"><article><b>استجابة سريعة</b><span>فريق محلي يفهم احتياجك</span></article><article><b>خبرات متنوعة</b><span>كوادر تشغيلية وفنية</span></article><article><b>مرونة في الحل</b><span>بحسب المدة وحجم العمل</span></article><article><b>دعم مستمر</b><span>من البداية وطوال الخدمة</span></article></section>

    {content.visibility.hajj && <section className="hajj-readiness" id="hajj">
      <Image src="/images/hajj-readiness.webp" alt="بنية تحتية موسمية منظمة وخيام وممرات خدمة فارغة في تضاريس مكة المكرمة دون أي كائنات حية" width={1672} height={941} sizes="(max-width: 900px) 100vw, 55vw"/>
      <div className="hajj-shade"/>
      <div className="hajj-copy"><p className="eyebrow light"><span/> حلول القوى العاملة لموسم الحج في مكة</p><h2>أداء ثابت،<br/><em>في أكثر المواسم حيوية.</em></h2><p>عندما تتسارع الأعمال في موسم الحج، تحتاج منشأتك إلى شريك قريب يستجيب بسرعة ويهيئ فرقاً تناسب المواقع والفترات والورديات. دالي تمنحك مرونة أكبر لتواصل تقديم خدمتك بثقة.</p><div className="hajj-actions"><a href="#quote" className="btn primary">اطلب حلاً للموسم <Arrow/></a><a href="#hajj-operations" className="text-link">اكتشف مزايا الخدمة <Arrow/></a></div></div>
      <div className="hajj-proof"><strong>موسم الحج</strong><span>استجابة أسرع · تخصصات متعددة · مرونة موسمية · دعم محلي</span></div>
    </section>}

    {content.visibility.hajj && <section className="hajj-operations section" id="hajj-operations"><div className="hajj-operations-copy"><p className="eyebrow"><span/> شريكك خلال الموسم</p><h2>مرونة أكبر،<br/><em>وضغط أقل على فريقك.</em></h2><p>نساعدك على الاستعداد مبكراً والاستجابة للمتغيرات بثقة، عبر حلول قوى عاملة تناسب طبيعة الموقع وحجم الطلب وتوقيت العمل في مكة المكرمة.</p><div className="hajj-capability-grid">{hajjCapabilities.map((item) => <article key={item.n}><span>{item.n}</span><div><h3>{item.title}</h3><p>{item.text}</p></div></article>)}</div></div><div className="hajj-operations-image"><Image src="/images/hajj-operations.webp" alt="منطقة تجهيز وتشغيل موسمية منظمة في مكة مع حواجز وممرات ومرافق خالية من الكائنات الحية" width={1536} height={1024} sizes="(max-width: 900px) 100vw, 45vw"/><div><b>جاهزية تليق بالموسم</b><span>قوى عاملة مرنة ودعم قريب</span></div></div></section>}

    <section className="about section" id="about">
      <div className="section-title"><p className="eyebrow"><span/> من نحن</p><h2>{content.home.aboutTitle}</h2></div>
      <div className="about-copy"><p>{content.site.description}</p><p>{content.home.aboutDescription}</p><div className="value-grid"><article><b>01</b><h3>فهم أسرع</h3><p>نستمع إلى احتياجك ونركز على ما يحقق هدف العمل.</p></article><article><b>02</b><h3>حل أنسب</h3><p>نقترح تخصصات وأعداداً تلائم الموقع والمدة.</p></article><article><b>03</b><h3>شراكة مستمرة</h3><p>نبقى قريبين للاستجابة ودعم جودة الخدمة.</p></article></div></div>
    </section>

    {content.visibility.services && <section className="services section" id="services"><div className="section-head"><div><p className="eyebrow light"><span/> خدمات دالي</p><h2>{content.home.servicesTitle}</h2></div><p>{content.home.servicesDescription}</p></div><div className="service-grid">{services.map((service) => <article key={service.n}><span>{service.n}</span><div className="service-mark" aria-hidden="true"/><h3>{service.title}</h3><p>{service.text}</p><Link href={service.href} aria-label={`تفاصيل ${service.title}`}><Arrow/></Link></article>)}</div></section>}

    <section className="professions section" id="professions"><div className="section-title"><p className="eyebrow"><span/> التخصصات المتاحة</p><h2>كل ما يحتاجه عملك،<br/><em>من شريك واحد.</em></h2></div><div><p className="professions-intro">اختر التخصصات التي يحتاجها موقعك، من العمالة التشغيلية إلى الفنيين والمشرفين، ودع فريقنا يساعدك في تكوين الحل المناسب.</p><div className="profession-grid">{professions.map((profession, index) => <article key={profession}><span>{String(index + 1).padStart(2, "0")}</span><strong>{profession}</strong></article>)}</div><a className="btn dark" href="#quote">اطلب تخصصاً محدداً <Arrow/></a></div></section>

    {content.visibility.locations && <section className="local-section"><Image src="/images/dali-mecca.webp" alt="مبانٍ وبنية تحتية حديثة في مكة المكرمة، حيث يقع مقر شركة دالي" width={1692} height={930} sizes="(max-width: 900px) 100vw, 50vw"/><div className="local-copy"><p className="eyebrow light"><span/> نخدم جميع مدن المملكة</p><h2>{content.home.localTitle}</h2><p>{content.home.localDescription}</p><ul><li>طلبات القوى العاملة من جميع مناطق المملكة</li><li>فرق تشغيل وصيانة وخدمات مساندة</li><li>مقاولات وأعمال إنشائية وإدارة مشروعات</li><li>خطة تعبئة أو تنفيذ مرتبطة بالمدينة والموقع</li></ul><Link href="/locations" className="btn primary">استعرض مناطق الخدمة <Arrow/></Link></div></section>}

    {content.visibility.sectors && <section className="sectors section"><div className="section-head dark-head"><div><p className="eyebrow"><span/> القطاعات التي نخدمها</p><h2>{content.home.sectorsTitle}</h2></div><p>{content.home.sectorsDescription}</p></div><div className="sector-grid">{sectors.map((sector, index) => <article key={sector.id}><span>{String(index + 1).padStart(2, "0")}</span><h3><Link href={`/sectors/${sector.slug}`}>{sector.shortTitle}</Link></h3><p>{sector.summary}</p></article>)}</div></section>}

    <section className="site-hubs section" aria-labelledby="site-hubs-title"><div className="section-title"><p className="eyebrow"><span/> تعرف على دالي أكثر</p><h2 id="site-hubs-title">معلومات تمنحك<br/><em>ثقة أكبر في قرارك.</em></h2></div><div className="site-hub-grid">{content.visibility.locations && <Link href="/locations"><span>01</span><strong>مناطق الخدمة</strong><p>اكتشف نطاق خدماتنا وحضورنا المحلي في مكة المكرمة.</p></Link>}{content.visibility.projects && <Link href="/projects"><span>02</span><strong>المشروعات وسابقة الأعمال</strong><p>نماذج من الأعمال والنتائج التي حققناها لعملائنا.</p></Link>}{content.visibility.credentials && <Link href="/credentials"><span>03</span><strong>التراخيص والاعتمادات</strong><p>تعرف على بيانات الشركة والاعتمادات المتاحة للتحقق.</p></Link>}{content.visibility.articles && <Link href="/insights"><span>04</span><strong>مركز المعرفة</strong><p>أدلة تساعد منشأتك على الاستعداد واتخاذ قرارات أفضل.</p></Link>}{content.visibility.jobs && <Link href="/careers"><span>05</span><strong>الوظائف</strong><p>استكشف الفرص المتاحة وابدأ خطوتك المهنية معنا.</p></Link>}{content.visibility.partners && <Link href="/partners"><span>06</span><strong>الموردون والشركاء</strong><p>ابنِ معنا علاقة تعاون تحقق قيمة مشتركة.</p></Link>}</div></section>

    <section className="capabilities section"><div className="capability-image"><Image src="/images/dali-capabilities.webp" alt="مستودع صناعي حديث خالٍ من الأشخاص والكائنات الحية" width={1536} height={1024} sizes="(max-width: 900px) 100vw, 50vw"/><span>خدمة موثوقة · حضور محلي · حلول مرنة</span></div><div className="capability-copy"><p className="eyebrow"><span/> لماذا تختار دالي؟</p><h2>نتائج يلمسها فريقك،<br/><em>من اليوم الأول.</em></h2><p>نخفف عن منشأتك عبء البحث عن الكوادر والتنسيق اليومي، لتمنح فريقك وقتاً أكبر للتركيز على العملاء وجودة الأعمال والنمو.</p><div className="capability-list"><article><b>سرعة في فهم الاحتياج</b><span>تواصل مباشر مع فريق يعرف طبيعة السوق المحلي.</span></article><article><b>مرونة تناسب عملك</b><span>حلول للتخصصات والأعداد والمدد المختلفة.</span></article><article><b>متابعة تمنحك راحة البال</b><span>استجابة قريبة عند تغير الاحتياج أو ظروف الموقع.</span></article></div></div></section>

    <section className="process section" id="process"><div className="section-title"><p className="eyebrow"><span/> تجربة تعاون سهلة</p><h2>من أول حديث،<br/><em>إلى فريق يدعم أعمالك.</em></h2></div><div className="process-grid">{steps.map((step) => <article key={step.n}><span>{step.n}</span><h3>{step.title}</h3><p>{step.text}</p></article>)}</div></section>

    {content.visibility.faq && <section className="faq section" id="faq"><div className="section-title"><p className="eyebrow"><span/> الأسئلة الشائعة</p><h2>معلومات تساعدك<br/><em>قبل طلب الخدمة.</em></h2></div><div className="faq-list">{faqs.slice(0, 8).map((item, index) => <details key={item.q}><summary><span>{String(index + 1).padStart(2, "0")}</span>{item.q}<b>+</b></summary><p>{item.a}</p></details>)}</div><Link className="text-link" href="/faq">عرض جميع الأسئلة <Arrow/></Link></section>}

    <section className="quote section" id="quote"><div className="quote-intro"><p className="eyebrow light"><span/> طلب عرض سعر</p><h2>{content.home.quoteTitle}</h2><p>{content.home.quoteDescription}</p><div className="quote-address"><span>المقر</span><strong>{content.site.address}</strong></div><div className="quote-response-note"><b>تحتاج إلى مساعدة الآن؟</b><span>استخدم زر المحادثة المباشرة أسفل الصفحة للتحدث مع فريق دالي خلال ساعات العمل.</span></div></div>{sent ? <div className="success"><b>✓</b><h3>تم استلام طلب عرض السعر</h3><p>سيراجع فريق دالي البيانات ويتواصل معك بالطريقة التي اخترتها.</p>{trackingCode && <strong className="success-tracking" dir="ltr">{trackingCode}</strong>}<button onClick={() => { setSent(false); setTrackingCode(""); }}>إرسال طلب آخر</button></div> : <form onSubmit={submit} className="quote-request-form"><input type="hidden" name="requestType" value="quotation"/><label>اسم الشركة أو الجهة<input required name="companyName" maxLength={160} placeholder="اسم المنشأة الطالبة"/></label><label>اسم المسؤول<input required name="fullName" autoComplete="name" maxLength={100} placeholder="الاسم الكامل"/></label><label>رقم الجوال<input required name="mobile" autoComplete="tel" type="tel" inputMode="tel" maxLength={20} placeholder="05xxxxxxxx"/></label><label>البريد الإلكتروني<input required name="email" autoComplete="email" type="email" maxLength={160} placeholder="name@example.com"/></label><label>موقع العمل<input required name="workSite" maxLength={180} placeholder="المدينة والحي أو موقع المشروع"/></label><label>نوع الاحتياج<select required name="specialization" defaultValue=""><option value="" disabled>اختر نوع الاحتياج</option><option>جاهزية موسم الحج</option><option>عمالة إنشائية</option><option>فنيون متخصصون</option><option>تشغيل وصيانة</option><option>فريق متكامل</option></select></label><label>العدد التقريبي<input required name="requestedCount" type="number" min="1" max="100000" inputMode="numeric" placeholder="مثال: 25"/></label><label>تاريخ البدء المتوقع<input name="requiredStartDate" type="date"/></label><label>مدة التعاقد<select required name="duration" defaultValue=""><option value="" disabled>اختر المدة</option><option>أقل من شهر</option><option>من شهر إلى 3 أشهر</option><option>من 3 إلى 6 أشهر</option><option>من 6 إلى 12 شهراً</option><option>أكثر من سنة</option><option>غير محدد</option></select></label><label>طريقة التواصل المفضلة<select required name="preferredContact" defaultValue="either"><option value="either">الجوال أو البريد</option><option value="phone">الاتصال الهاتفي</option><option value="email">البريد الإلكتروني</option></select></label><label className="full">تفاصيل المهن ونطاق العمل<textarea required name="details" minLength={10} maxLength={2000} placeholder="اذكر المهن المطلوبة وعدد كل مهنة وساعات العمل وأي متطلبات خاصة..."/></label><label className="website-field" aria-hidden="true">الموقع الإلكتروني<input name="website" tabIndex={-1} autoComplete="off"/></label><p className="form-consent full">بإرسال الطلب تقر باطلاعك على <a href="/privacy">سياسة الخصوصية</a> واستخدام البيانات لمراجعة الاحتياج والتواصل وإعداد العرض.</p>{submitError && <p className="form-error full" role="alert">{submitError}</p>}<button className="btn primary full" type="submit" disabled={sending}>{sending ? "جارٍ إرسال الطلب..." : "إرسال طلب عرض السعر"} {!sending && <Arrow/>}</button></form>}</section>

    <LiveChatWidget/>

    <footer id="contact"><div className="footer-top"><a className="brand footer-brand" href="#home"><Image src="/dally-logo.jpg" alt={`شعار ${content.site.companyName}`} width={545} height={280} sizes="180px"/></a><h2>الكوادر المناسبة.<br/><em>حين يحتاجها عملك.</em></h2></div><div className="footer-grid"><div><b>المقر الرئيسي</b><p>{content.site.city}</p><p>{content.site.district}</p>{content.site.phone && <p dir="ltr">{content.site.phone}</p>}{content.site.email && <p dir="ltr">{content.site.email}</p>}</div>{content.visibility.services && <div><b>الخدمات</b>{services.slice(0, 4).map((service) => <Link href={service.href} key={service.href}>{service.title}</Link>)}</div>}<div><b>روابط سريعة</b><Link href="/about">من نحن</Link>{content.visibility.sectors && <Link href="/sectors">القطاعات</Link>}{content.visibility.locations && <Link href="/locations">مناطق الخدمة</Link>}{content.visibility.articles && <Link href="/insights">مركز المعرفة</Link>}<Link href="/contact">التواصل وطلب عرض سعر</Link><Link href="/feedback">الشكاوى والاقتراحات</Link><Link href="/privacy">سياسة الخصوصية</Link><Link href="/terms">الشروط والأحكام</Link></div></div><div className="copyright"><span>© 2026 {content.site.companyName}. جميع الحقوق محفوظة.</span><span>شركة سعودية · {content.site.address}</span></div></footer>
  </main>;
}
