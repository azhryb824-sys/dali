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
      <h1>نعرف قيمة الفريق،<br/><em>الذي يمكنك الاعتماد عليه.</em></h1>
      <p>{content.site.description}</p>
    </section>
    <section className="inner-content prose-content">
      <h2>نبدأ بالسؤال الصحيح: ما الذي يحتاجه موقعك فعلًا؟</h2>
      <p>{content.home.aboutDescription}</p>
      <p>قد تحتاج منشأة إلى فني واحد، بينما يحتاج مشروع آخر إلى فريق كامل يعمل على ورديتين. لهذا لا نقدم حزمة واحدة للجميع؛ نفهم العمل أولًا، ثم نحدد الأشخاص والخدمة المناسبة له.</p>
      <div className="inner-card-grid">
        <article><span>01</span><h3>نصل إلى موقعك</h3><p>نخدم المشروعات والمنشآت في مدن المملكة بخطة تعبئة وتنفيذ تناسب الموقع.</p></article>
        <article><span>02</span><h3>مرنون مع احتياجك</h3><p>حلول لمختلف التخصصات والأعداد والمدد ومواسم الذروة.</p></article>
        <article><span>03</span><h3>ملتزمون بالخدمة</h3><p>تواصل واضح واستجابة مستمرة طوال فترة التعاون.</p></article>
        <article><span>04</span><h3>نركز على نجاحك</h3><p>كوادر تساعد فريقك على الاستمرار ورفع جودة الأعمال.</p></article>
      </div>
      <h2>مقر سعودي وخدمة على مستوى المملكة</h2>
      <p>مقرنا في {content.site.address}، ونخدم المنشآت والمشروعات في جميع مدن المملكة. تختلف ترتيبات البدء من مدينة إلى أخرى، لذلك نؤكد الموعد والفريق بعد معرفة موقع العمل وتفاصيله.</p>
    </section>
  </PublicPageShell>;
}
