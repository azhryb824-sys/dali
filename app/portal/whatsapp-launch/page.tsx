export const dynamic = "force-dynamic";

export default function WhatsAppLaunchPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "24px",
        background: "#f4f8f7",
        color: "#173f35",
        fontFamily: "Tajawal, sans-serif",
        textAlign: "center",
      }}
    >
      <section>
        <h1>جارٍ تجهيز واتساب...</h1>
        <p>اترك هذه النافذة مفتوحة لحظات حتى يكتمل إنشاء رابط المشاركة الآمن.</p>
      </section>
    </main>
  );
}
