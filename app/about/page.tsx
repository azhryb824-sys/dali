import PublicPageShell from "@/app/components/PublicPageShell";
import { getWebsiteContent } from "@/lib/website-content";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const content = await getWebsiteContent();
  return { title: `عن ${content.site.companyName}`, description: content.site.description, alternates: { canonical: "/about" } };
}

export default async function AboutPage() {
  const content = await getWebsiteContent();
  return <PublicPageShell>
    <section className="inner-hero about-inner-hero">
      <p className="eyebrow light"><span/>عن الشركة</p>
      <h1>شريك محلي،<br/><em>ينمو مع أعمالك.</em></h1>
      <p>{content.site.description}</p>
    </section>
    <section className="inner-content prose-content">
      <h2>قيمة تبدأ من فهم احتياجك</h2>
      <p>{content.home.aboutDescription}</p>
      <p>في دالي نؤمن أن الخدمة الجيدة تمنح العميل راحة البال قبل أن تبدأ الأعمال. لذلك نستمع إلى أهداف منشأتك، ونقترح قوى عاملة وفرق تشغيل وصيانة تلائم طبيعة الموقع والمدة ومستوى الخدمة الذي تتطلع إليه.</p>
      <div className="inner-card-grid">
        <article><span>01</span><h3>نصل إلى موقعك</h3><p>نخدم المشروعات والمنشآت في مدن المملكة بخطة تعبئة وتنفيذ تناسب الموقع.</p></article>
        <article><span>02</span><h3>مرنون مع احتياجك</h3><p>حلول لمختلف التخصصات والأعداد والمدد ومواسم الذروة.</p></article>
        <article><span>03</span><h3>ملتزمون بالخدمة</h3><p>تواصل واضح واستجابة مستمرة طوال فترة التعاون.</p></article>
        <article><span>04</span><h3>نركز على نجاحك</h3><p>كوادر تساعد فريقك على الاستمرار ورفع جودة الأعمال.</p></article>
      </div>
      <h2>مقر سعودي وخدمة على مستوى المملكة</h2>
      <p>يقع مقرنا في {content.site.address}، وتمتد خدماتنا للمنشآت والمشروعات ومواقع العمل في جميع مدن المملكة وفق نطاق المشروع وخطة الجاهزية والتنفيذ.</p>
    </section>
  </PublicPageShell>;
}
