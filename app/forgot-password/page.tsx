import Image from "next/image";

type ForgotPasswordQuery = {
  sent?: string;
  error?: string;
  requestId?: string;
  retryAfter?: string;
};

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<ForgotPasswordQuery> }) {
  const query = await searchParams;
  const retrySeconds = Number(query.retryAfter || 0);
  const retryMinutes = Number.isFinite(retrySeconds) && retrySeconds > 0 ? Math.max(1, Math.ceil(retrySeconds / 60)) : null;
  const errorMessage = query.error === "rate-limit"
    ? `تم تجاوز عدد الطلبات المسموح. حاول مجددًا${retryMinutes ? ` بعد نحو ${retryMinutes} دقيقة` : " لاحقًا"}.`
    : query.error === "service"
      ? "تعذر تنفيذ طلب الاستعادة حاليًا. لم يتم تغيير بيانات الحساب."
      : null;

  return <main className="portal-gate" dir="rtl"><section className="gate-card secure-gate-card">
    <Image src="/dally-logo.jpg" alt="شعار شركة دالي" className="gate-logo" width={545} height={280} sizes="180px" priority/>
    <p className="gate-kicker">استعادة الوصول</p><h1>نسيت كلمة المرور</h1>
    <p className="gate-copy">أدخل رقم الهوية الوطنية أو الإقامة. إذا كان الحساب مسجلًا فسيصل رابط صالح لمدة 30 دقيقة إلى البريد المرتبط به.</p>
    {query.sent && <p role="status" className="operations-notice">إذا كانت البيانات مطابقة فقد أرسلنا رابط إعادة التعيين إلى البريد المسجل.</p>}
    {errorMessage && <p role="alert" className="gate-status suspended">{errorMessage}{query.requestId && <small> رقم المتابعة: {query.requestId}</small>}</p>}
    <form className="access-request-form" method="post" action="/api/auth/forgot-password">
      <label><span>رقم الهوية / الإقامة</span><input name="identifier" inputMode="numeric" pattern="[0-9٠-٩۰-۹]{10}" minLength={10} maxLength={10} dir="ltr" required/></label>
      <button type="submit">إرسال رابط إعادة التعيين</button>
    </form><a className="gate-signout" href="/login">العودة إلى تسجيل الدخول</a>
  </section></main>;
}
