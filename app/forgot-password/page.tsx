import Image from "next/image";

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ sent?: string }> }) {
  const { sent } = await searchParams;
  return <main className="portal-gate" dir="rtl"><section className="gate-card secure-gate-card">
    <Image src="/dally-logo.jpg" alt="شعار شركة دالي" className="gate-logo" width={545} height={280} sizes="180px" priority/>
    <p className="gate-kicker">استعادة الوصول</p><h1>نسيت كلمة المرور</h1>
    <p className="gate-copy">أدخل رقم الهوية الوطنية أو الإقامة. إذا كان الحساب مسجلًا فسيصل رابط صالح لمدة 30 دقيقة إلى البريد المرتبط به.</p>
    {sent && <p role="status" className="operations-notice">إذا كانت البيانات مطابقة فقد أرسلنا رابط إعادة التعيين إلى البريد المسجل.</p>}
    <form className="access-request-form" method="post" action="/api/auth/forgot-password">
      <label><span>رقم الهوية / الإقامة</span><input name="identifier" inputMode="numeric" pattern="[0-9]{10}" minLength={10} maxLength={10} dir="ltr" required/></label>
      <button type="submit">إرسال رابط إعادة التعيين</button>
    </form><a className="gate-signout" href="/login">العودة إلى تسجيل الدخول</a>
  </section></main>;
}
