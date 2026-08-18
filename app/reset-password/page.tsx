import Image from "next/image";

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
  const query = await searchParams;
  const token = typeof query.token === "string" ? query.token : "";
  return <main className="portal-gate" dir="rtl"><section className="gate-card secure-gate-card">
    <Image src="/dally-logo.jpg" alt="شعار شركة دالي" className="gate-logo" width={545} height={280} sizes="180px" priority/>
    <p className="gate-kicker">حماية الحساب</p><h1>تعيين كلمة مرور جديدة</h1>
    <p className="gate-copy">استخدم كلمة مرور قوية لا تقل عن 12 حرفًا وتجنب إعادة استخدام كلمات المرور السابقة.</p>
    {query.error && <p role="alert" className="gate-status suspended">الرابط غير صالح أو منتهي، أو كلمة المرور لا تستوفي المتطلبات.</p>}
    <form className="access-request-form" method="post" action="/api/auth/reset-password">
      <input type="hidden" name="token" value={token}/>
      <label><span>كلمة المرور الجديدة</span><input name="password" type="password" minLength={12} autoComplete="new-password" required/></label>
      <label><span>تأكيد كلمة المرور</span><input name="confirmPassword" type="password" minLength={12} autoComplete="new-password" required/></label>
      <button type="submit">حفظ كلمة المرور</button>
    </form>
  </section></main>;
}
