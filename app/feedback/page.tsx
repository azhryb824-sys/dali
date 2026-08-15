import type { Metadata } from "next";
import PublicPageShell from "@/app/components/PublicPageShell";
import PublicRequestForm from "@/app/components/PublicRequestForm";

export const metadata: Metadata = { title: "الشكاوى والاقتراحات", description: "شارك شركة دالي للتشغيل والصيانة شكواك أو اقتراحك بسرية، واحصل على رقم لمتابعة الملاحظة.", alternates: { canonical: "/feedback" }, robots: { index: false, follow: true } };

export default function FeedbackPage() {
  return <PublicPageShell>
    <section className="inner-hero contact-inner-hero"><p className="eyebrow light"><span/>الشكاوى والاقتراحات</p><h1>صوتك يساعدنا<br/><em>على تقديم خدمة أفضل.</em></h1><p>نستمع إلى ملاحظتك باهتمام، ونوجّهها بسرية إلى الفريق المختص، لأن جودة تجربتك جزء أساسي من نجاحنا.</p></section>
    <section className="inner-content public-request-section"><div className="inner-heading"><p className="eyebrow"><span/>شاركنا ملاحظتك</p><h2>صف الموضوع والنتيجة التي تتطلع إليها</h2><p>ستحصل على رقم متابعة. تجنب إرسال بيانات حساسة غير لازمة، واستخدم صفحة الخصوصية للطلبات المتعلقة ببياناتك الشخصية.</p></div><PublicRequestForm specialization="شكاوى واقتراحات" submitLabel="إرسال الملاحظة" detailsLabel="تفاصيل الشكوى أو الاقتراح" detailsPlaceholder="اذكر موضوع الملاحظة، وما حدث أو ما تقترحه، وطريقة التواصل المناسبة."/></section>
  </PublicPageShell>;
}
