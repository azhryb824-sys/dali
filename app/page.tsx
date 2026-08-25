"use client";

import Image from "next/image";
import Link from "next/link";
import LiveChatWidget from "./LiveChatWidget";
import PublicHeader from "./components/PublicHeader";
import QuoteRequestForm from "./components/QuoteRequestForm";
import StructuredData from "./components/StructuredData";
import { useWebsiteContent } from "./components/WebsiteContentProvider";
import { absoluteUrl, SITE } from "@/lib/site";

const hajjCapabilities = [
  { n: "01", title: "لكل موسم خطته", text: "رمضان له ساعات ذروة مختلفة، والحج له مواقع ومراحل تعبئة متعددة." },
  { n: "02", title: "فريق يجمع أكثر من تخصص", text: "عمالة تشغيلية وفنيون ومشرفون بحسب ما يحتاجه كل موقع." },
  { n: "03", title: "الاستعداد قبل الازدحام", text: "نحسم الأعداد والورديات والبدائل قبل أن يبدأ ضغط الموسم." },
  { n: "04", title: "النقص يظهر مبكرًا", text: "نتابع المطلوب والمتاح والمحجوز حتى لا تفاجأ المنشأة بفجوة في التغطية." },
];

function Arrow() { return <span aria-hidden="true">←</span>; }

export default function Home() {
  const content = useWebsiteContent();
  const services = content.collections.services.filter((item) => item.status === "published" && item.featured).slice(0, 6).map((item, index) => ({ n: String(index + 1).padStart(2, "0"), title: item.shortTitle, text: item.summary, href: `/services/${item.slug}` }));
  const sectors = content.collections.sectors.filter((item) => item.status === "published" && item.featured).slice(0, 6);
  const professions = content.home.professions;
  const steps = content.home.process.map((item, index) => ({ n: String(index + 1).padStart(2, "0"), ...item }));
  const faqs = content.faq.map((item) => ({ q: item.question, a: item.answer }));
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
      <Image className="hero-image" src="/images/dali-hero.webp" alt="منشأة صناعية حديثة ضمن مشروعات التشغيل والمقاولات في المملكة العربية السعودية" width={1983} height={793} sizes="100vw" priority/>
      <div className="hero-overlay"/>
      <div className="hero-copy">
        <p className="eyebrow light"><span/> {content.home.heroKicker}</p>
        <h1>{content.home.heroTitle}<br/><em>{content.home.heroAccent}</em></h1>
        <p>{content.home.heroDescription}</p>
        <div className="hero-actions"><a className="btn primary" href="#quote">اطلب عرض سعر <Arrow/></a><a className="text-link" href="#services">استكشف خدماتنا <Arrow/></a></div>
      </div>
      <div className="hero-note"><span>01</span><p><strong>نخدم المنشآت في جميع مدن المملكة</strong>أخبرنا أين يقع العمل ومتى تريد البدء، وسنوضح لك ما يمكن تنفيذه.</p></div>
    </section>

    <section className="assurance-strip" aria-label="مزايا الخدمة"><article><b>استجابة سريعة</b><span>فريق محلي يفهم احتياجك</span></article><article><b>خبرات متنوعة</b><span>كوادر تشغيلية وفنية</span></article><article><b>مرونة في الحل</b><span>بحسب المدة وحجم العمل</span></article><article><b>دعم مستمر</b><span>من البداية وطوال الخدمة</span></article></section>

    {content.visibility.hajj && <section className="hajj-readiness" id="hajj">
      <Image src="/images/hajj-readiness.webp" alt="بنية تحتية موسمية منظمة وخيام وممرات خدمة فارغة في تضاريس مكة المكرمة دون أي كائنات حية" width={1672} height={941} sizes="(max-width: 900px) 100vw, 55vw"/>
      <div className="hajj-shade"/>
      <div className="hajj-copy"><p className="eyebrow light"><span/> حلول موسمي رمضان والحج</p><h2>استمر في خدمة عملائك،<br/><em>حتى في أشد أيام الموسم.</em></h2><p>في رمضان يتركز العمل مساءً ويزداد في العشر الأواخر. وفي الحج تتوزع الفرق على مواقع وفترات متعددة. لهذا نجهز لكل موسم فريقًا وخطة عمل تخصه.</p><div className="hajj-actions"><a href="#quote" className="btn primary">اطلب حلاً للموسم <Arrow/></a><Link href="/seasons" className="text-link">استكشف حلول المواسم <Arrow/></Link></div></div>
      <div className="hajj-proof"><strong>رمضان والحج</strong><span>تخطيط مبكر · تخصصات متعددة · مرونة موسمية · متابعة للسعة</span></div>
    </section>}

    {content.visibility.hajj && <section className="hajj-operations section" id="hajj-operations"><div className="hajj-operations-copy"><p className="eyebrow"><span/> شريكك في مواسم الذروة</p><h2>فريقك يركز على الخدمة،<br/><em>ونحن نهتم بتغطية الاحتياج.</em></h2><p>نبدأ من مواقع العمل وساعات الازدحام، ثم نحدد المهن والأعداد المطلوبة لكل وردية. وإذا تغير الطلب أثناء الموسم، تكون الأولويات والبدائل معروفة مسبقًا.</p><div className="hajj-capability-grid">{hajjCapabilities.map((item) => <article key={item.n}><span>{item.n}</span><div><h3>{item.title}</h3><p>{item.text}</p></div></article>)}</div></div><div className="hajj-operations-image"><Image src="/images/hajj-operations.webp" alt="منطقة تجهيز وتشغيل موسمية منظمة وخالية من الكائنات الحية" width={1536} height={1024} sizes="(max-width: 900px) 100vw, 45vw"/><div><b>جاهزية تليق بكل موسم</b><span>قوى عاملة مرنة وخطة منفصلة لرمضان والحج</span></div></div></section>}

    <section className="about section" id="about">
      <div className="section-title"><p className="eyebrow"><span/> من نحن</p><h2>{content.home.aboutTitle}</h2></div>
      <div className="about-copy"><p>{content.site.description}</p><p>{content.home.aboutDescription}</p><div className="value-grid"><article><b>01</b><h3>فهم أسرع</h3><p>نستمع إلى احتياجك ونركز على ما يحقق هدف العمل.</p></article><article><b>02</b><h3>حل أنسب</h3><p>نقترح تخصصات وأعداداً تلائم الموقع والمدة.</p></article><article><b>03</b><h3>شراكة مستمرة</h3><p>نبقى قريبين للاستجابة ودعم جودة الخدمة.</p></article></div></div>
    </section>

    {content.visibility.services && <section className="services section" id="services"><div className="section-head"><div><p className="eyebrow light"><span/> خدمات دالي</p><h2>{content.home.servicesTitle}</h2></div><p>{content.home.servicesDescription}</p></div><div className="service-grid">{services.map((service) => <article key={service.n}><span>{service.n}</span><div className="service-mark" aria-hidden="true"/><h3>{service.title}</h3><p>{service.text}</p><Link href={service.href} aria-label={`تفاصيل ${service.title}`}><Arrow/></Link></article>)}</div></section>}

    <section className="professions section" id="professions"><div className="section-title"><p className="eyebrow"><span/> التخصصات المتاحة</p><h2>كل ما يحتاجه عملك،<br/><em>من شريك واحد.</em></h2></div><div><p className="professions-intro">اختر التخصصات التي يحتاجها موقعك، من العمالة التشغيلية إلى الفنيين والمشرفين، ودع فريقنا يساعدك في تكوين الحل المناسب.</p><div className="profession-grid">{professions.map((profession, index) => <article key={profession}><span>{String(index + 1).padStart(2, "0")}</span><strong>{profession}</strong></article>)}</div><a className="btn dark" href="#quote">اطلب تخصصاً محدداً <Arrow/></a></div></section>

    {content.visibility.locations && <section className="local-section"><Image src="/images/dali-mecca.webp" alt="مبانٍ وبنية تحتية حديثة في مكة المكرمة، حيث يقع مقر شركة دالي" width={1692} height={930} sizes="(max-width: 900px) 100vw, 50vw"/><div className="local-copy"><p className="eyebrow light"><span/> نخدم جميع مدن المملكة</p><h2>{content.home.localTitle}</h2><p>{content.home.localDescription}</p><ul><li>طلبات القوى العاملة من جميع مناطق المملكة</li><li>فرق تشغيل وصيانة وخدمات مساندة</li><li>مقاولات وأعمال إنشائية وإدارة مشروعات</li><li>خطة تعبئة أو تنفيذ مرتبطة بالمدينة والموقع</li></ul><Link href="/locations" className="btn primary">استعرض مناطق الخدمة <Arrow/></Link></div></section>}

    {content.visibility.sectors && <section className="sectors section"><div className="section-head dark-head"><div><p className="eyebrow"><span/> القطاعات التي نخدمها</p><h2>{content.home.sectorsTitle}</h2></div><p>{content.home.sectorsDescription}</p></div><div className="sector-grid">{sectors.map((sector, index) => <article key={sector.id}><span>{String(index + 1).padStart(2, "0")}</span><h3><Link href={`/sectors/${sector.slug}`}>{sector.shortTitle}</Link></h3><p>{sector.summary}</p></article>)}</div></section>}

    <section className="site-hubs section" aria-labelledby="site-hubs-title"><div className="section-title"><p className="eyebrow"><span/> تعرف على دالي أكثر</p><h2 id="site-hubs-title">معلومات تمنحك<br/><em>ثقة أكبر في قرارك.</em></h2></div><div className="site-hub-grid">{content.visibility.locations && <Link href="/locations"><span>01</span><strong>مناطق الخدمة</strong><p>تعرّف على تغطية دالي للمدن والمحافظات في مناطق المملكة الثلاث عشرة.</p></Link>}{content.visibility.projects && <Link href="/projects"><span>02</span><strong>المشروعات وسابقة الأعمال</strong><p>نماذج من الأعمال والنتائج التي حققناها لعملائنا.</p></Link>}{content.visibility.credentials && <Link href="/credentials"><span>03</span><strong>التراخيص والاعتمادات</strong><p>تعرف على بيانات الشركة والاعتمادات المتاحة للتحقق.</p></Link>}{content.visibility.articles && <Link href="/insights"><span>04</span><strong>مركز المعرفة</strong><p>أدلة تساعد منشأتك على الاستعداد واتخاذ قرارات أفضل.</p></Link>}{content.visibility.jobs && <Link href="/careers"><span>05</span><strong>الوظائف</strong><p>استكشف الفرص المتاحة وابدأ خطوتك المهنية معنا.</p></Link>}{content.visibility.partners && <Link href="/partners"><span>06</span><strong>الموردون والشركاء</strong><p>ابنِ معنا علاقة تعاون تحقق قيمة مشتركة.</p></Link>}</div></section>

    <section className="capabilities section"><div className="capability-image"><Image src="/images/dali-capabilities.webp" alt="مستودع صناعي حديث خالٍ من الأشخاص والكائنات الحية" width={1536} height={1024} sizes="(max-width: 900px) 100vw, 50vw"/><span>خدمة موثوقة · حضور محلي · حلول مرنة</span></div><div className="capability-copy"><p className="eyebrow"><span/> لماذا تختار دالي؟</p><h2>نتائج يلمسها فريقك،<br/><em>من اليوم الأول.</em></h2><p>نخفف عن منشأتك عبء البحث عن الكوادر والتنسيق اليومي، لتمنح فريقك وقتاً أكبر للتركيز على العملاء وجودة الأعمال والنمو.</p><div className="capability-list"><article><b>سرعة في فهم الاحتياج</b><span>تواصل مباشر مع فريق يعرف طبيعة السوق المحلي.</span></article><article><b>مرونة تناسب عملك</b><span>حلول للتخصصات والأعداد والمدد المختلفة.</span></article><article><b>متابعة تمنحك راحة البال</b><span>استجابة قريبة عند تغير الاحتياج أو ظروف الموقع.</span></article></div></div></section>

    <section className="process section" id="process"><div className="section-title"><p className="eyebrow"><span/> تجربة تعاون سهلة</p><h2>من أول حديث،<br/><em>إلى فريق يدعم أعمالك.</em></h2></div><div className="process-grid">{steps.map((step) => <article key={step.n}><span>{step.n}</span><h3>{step.title}</h3><p>{step.text}</p></article>)}</div></section>

    {content.visibility.faq && <section className="faq section" id="faq"><div className="section-title"><p className="eyebrow"><span/> الأسئلة الشائعة</p><h2>معلومات تساعدك<br/><em>قبل طلب الخدمة.</em></h2></div><div className="faq-list">{faqs.slice(0, 8).map((item, index) => <details key={item.q}><summary><span>{String(index + 1).padStart(2, "0")}</span>{item.q}<b>+</b></summary><p>{item.a}</p></details>)}</div><Link className="text-link" href="/faq">عرض جميع الأسئلة <Arrow/></Link></section>}

    <section className="quote section" id="quote"><div className="quote-intro"><p className="eyebrow light"><span/> طلب عرض سعر</p><h2>{content.home.quoteTitle}</h2><p>{content.home.quoteDescription}</p><div className="quote-address"><span>المقر</span><strong>{content.site.address}</strong></div><div className="quote-response-note"><b>بيانات منظمة من البداية</b><span>أدخل بنود الخدمة وشروط التشغيل لتصل إلى فريق دالي جاهزة لإعداد عرض السعر والعقد.</span></div></div><QuoteRequestForm embedded/></section>

    <LiveChatWidget/>

    <footer id="contact"><div className="footer-top"><a className="brand footer-brand" href="#home"><Image src="/dally-logo.jpg" alt={`شعار ${content.site.companyName}`} width={545} height={280} sizes="180px"/></a><h2>الكوادر المناسبة.<br/><em>حين يحتاجها عملك.</em></h2></div><div className="footer-grid"><div><b>المقر الرئيسي</b><p>{content.site.city}</p><p>{content.site.district}</p>{content.site.phone && <p dir="ltr">{content.site.phone}</p>}{content.site.email && <p dir="ltr">{content.site.email}</p>}</div>{content.visibility.services && <div><b>الخدمات</b>{services.slice(0, 4).map((service) => <Link href={service.href} key={service.href}>{service.title}</Link>)}</div>}<div><b>روابط سريعة</b><Link href="/about">من نحن</Link>{content.visibility.sectors && <Link href="/sectors">القطاعات</Link>}{content.visibility.locations && <Link href="/locations">مناطق الخدمة</Link>}{content.visibility.articles && <Link href="/insights">مركز المعرفة</Link>}<Link href="/contact">التواصل وطلب عرض سعر</Link><Link href="/feedback">الشكاوى والاقتراحات</Link><Link href="/privacy">سياسة الخصوصية</Link><Link href="/terms">الشروط والأحكام</Link></div></div><div className="copyright"><span>© 2026 {content.site.companyName}. جميع الحقوق محفوظة.</span><span>شركة سعودية · {content.site.address}</span></div></footer>
  </main>;
}
