import type { Metadata } from "next";
import PublicPageShell from "@/app/components/PublicPageShell";
import QuoteRequestForm from "@/app/components/QuoteRequestForm";
import LiveChatWidget from "@/app/LiveChatWidget";

export const metadata: Metadata = { title: "التواصل وطلب عرض سعر", description: "اطلب عرض سعر للقوى العاملة أو التشغيل والصيانة أو المقاولات في أي مدينة بالمملكة العربية السعودية.", alternates: { canonical: "/contact" } };

export default function ContactPage() {
  return <PublicPageShell>
    <section className="inner-hero contact-inner-hero"><p className="eyebrow light"><span/>تواصل معنا</p><h1>حدّثنا عن احتياجك،<br/><em>ودعنا نقترح الحل الأنسب.</em></h1><p>سواء كنت تبحث عن قوى عاملة، أو فريق فني، أو تشغيل وصيانة، أو مقاولات في أي مدينة بالمملكة؛ فريق دالي جاهز لمراجعة طلبك.</p></section>
    <section className="inner-content contact-layout" id="quote">
      <div className="inner-heading"><p className="eyebrow"><span/>طلب عرض سعر</p><h2>خطوتك الأولى نحو خدمة تناسب أعمالك</h2><p>شاركنا المعلومات الأساسية عن الموقع والمهن والأعداد والمدة، وسيتواصل معك المختص لفهم التفاصيل.</p></div>
      <QuoteRequestForm/>
      <div className="live-chat-explainer" id="live-chat"><h2>تفضّل الحديث الآن؟</h2><p>ابدأ محادثة مباشرة مع فريق دالي. يستقبل المساعد الآلي رسالتك فوراً، ويوجهها بحسب موضوعها، ويخبرك بموعد عودة الفريق إذا تواصلت خارج الدوام.</p><ul><li>استقبال فوري على مدار الساعة.</li><li>توجيه إلى التخصص الأنسب.</li><li>رقم متابعة يحفظ سياق حديثك.</li></ul></div>
    </section>
    <LiveChatWidget/>
  </PublicPageShell>;
}
