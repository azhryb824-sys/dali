import Image from "next/image";

type ResetPasswordQuery = {
  token?: string;
  error?: string;
  requestId?: string;
  retryAfter?: string;
};

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<ResetPasswordQuery> }) {
  const query = await searchParams;
  const token = typeof query.token === "string" ? query.token : "";
  const retrySeconds = Number(query.retryAfter || 0);
  const retryMinutes = Number.isFinite(retrySeconds) && retrySeconds > 0 ? Math.max(1, Math.ceil(retrySeconds / 60)) : null;
  const errorMessage = query.error === "rate-limit"
    ? `تم تجاوز عدد المحاولات المسموح. حاول مجددًا${retryMinutes ? ` بعد نحو ${retryMinutes} دقيقة` : " لاحقًا"}.`
    : query.error === "service"
      ? "تعذر حفظ كلمة المرور حاليًا. لم يتم تغيير بيانات الحساب."
      : query.error
        ? "الرابط غير صالح أو منتهي، أو كلمة المرور لا تستوفي المتطلبات."
        : null;

  return <main className="portal-gate" dir="rtl"><section className="gate-card secure-gate-card">
    <Image src="/dally-logo.jpg" alt="شعار شركة دالي" className="gate-logo" width={545} height={280} sizes="180px" priority/>
    <p className="gate-kicker">حماية الحساب</p><h1>تعيين كلمة مرور جديدة</h1>
    <p className="gate-copy">استخدم كلمة مرور قوية لا تقل عن 12 حرفًا وتجنب إعادة استخدام كلمات المرور السابقة.</p>
    {errorMessage && <p role="alert" className="gate-status suspended">{errorMessage}{query.requestId && <small> رقم المتابعة: {query.requestId}</small>}</p>}
    <form className="access-request-form" method="post" action="/api/auth/reset-password">
      <input type="hidden" name="token" value={token}/>
      <label><span>كلمة المرور الجديدة</span><input name="password" type="password" minLength={12} autoComplete="new-password" required/></label>
      <label><span>تأكيد كلمة المرور</span><input name="confirmPassword" type="password" minLength={12} autoComplete="new-password" required/></label>
      <button type="submit">حفظ كلمة المرور</button>
    </form>
  </section></main>;
}
