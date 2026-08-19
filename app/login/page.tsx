import { redirect } from "next/navigation";
import Image from "next/image";
import { getChatGPTUser } from "@/app/chatgpt-auth";

export const dynamic = "force-dynamic";

type LoginQuery = {
  returnTo?: string;
  error?: string;
  reset?: string;
  requestId?: string;
  retryAfter?: string;
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<LoginQuery> }) {
  const query = await searchParams;
  const returnTo = query.returnTo?.startsWith("/portal") && !query.returnTo.startsWith("//") ? query.returnTo : "/portal";
  if (await getChatGPTUser()) redirect(returnTo);

  const retrySeconds = Number(query.retryAfter || 0);
  const retryMinutes = Number.isFinite(retrySeconds) && retrySeconds > 0 ? Math.max(1, Math.ceil(retrySeconds / 60)) : null;
  const errorMessage = query.error === "rate-limit"
    ? `تم تجاوز عدد المحاولات المسموح. حاول مجددًا${retryMinutes ? ` بعد نحو ${retryMinutes} دقيقة` : " لاحقًا"}.`
    : query.error === "service"
      ? "تعذر الاتصال بخدمة تسجيل الدخول حاليًا. لم يتم تغيير بيانات حسابك."
      : query.error
        ? "رقم الهوية أو الإقامة أو كلمة المرور غير صحيحة."
        : null;

  return (
    <main className="portal-gate" dir="rtl">
      <section className="gate-card secure-gate-card">
        <Image src="/dally-logo.jpg" alt="شعار شركة دالي" className="gate-logo" width={545} height={280} sizes="180px" priority />
        <p className="gate-kicker">النظام الإداري الداخلي</p>
        <h1>تسجيل الدخول الآمن</h1>
        <p className="gate-copy">أدخل رقم الهوية الوطنية أو الإقامة وكلمة المرور. تُحد الجلسة تلقائيًا ويُسجل كل دخول في سجل النشاط.</p>
        {errorMessage && (
          <p role="alert" className="gate-status suspended">
            {errorMessage}
            {query.error === "service" && query.requestId && <small> رقم المتابعة: {query.requestId}</small>}
          </p>
        )}
        {query.reset && <p role="status" className="operations-notice">تم تحديث كلمة المرور. يمكنك تسجيل الدخول الآن.</p>}
        <form className="login-credentials-form" method="post" action="/api/auth/login">
          <input type="hidden" name="returnTo" value={returnTo} />
          <label><span>رقم الهوية / الإقامة</span><input name="identifier" inputMode="numeric" pattern="[0-9٠-٩۰-۹]{10}" minLength={10} maxLength={10} autoComplete="username" dir="ltr" required /></label>
          <label><span>كلمة المرور</span><input name="password" type="password" autoComplete="current-password" minLength={12} required /></label>
          <button type="submit">دخول آمن</button>
        </form>
        <a className="gate-signout" href="/forgot-password">نسيت كلمة المرور؟</a>
      </section>
    </main>
  );
}
