import { redirect } from "next/navigation";
import Image from "next/image";
import { getChatGPTUser } from "@/app/chatgpt-auth";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ returnTo?: string; error?: string }> }) {
  const query = await searchParams;
  const returnTo = query.returnTo?.startsWith("/portal") && !query.returnTo.startsWith("//") ? query.returnTo : "/portal";
  if (await getChatGPTUser()) redirect(returnTo);
  return (
    <main className="portal-gate" dir="rtl">
      <section className="gate-card secure-gate-card">
        <Image src="/dally-logo.jpg" alt="شعار شركة دالي" className="gate-logo" width={545} height={280} sizes="180px" priority />
        <p className="gate-kicker">النظام الإداري الداخلي</p>
        <h1>تسجيل الدخول الآمن</h1>
        <p className="gate-copy">أدخل رقم الهوية الوطنية أو الإقامة وكلمة المرور. تُحد الجلسة تلقائيًا ويُسجل كل دخول في سجل النشاط.</p>
        {query.error && <p role="alert" className="gate-status suspended">بيانات الدخول غير صحيحة أو تجاوزت الحد المسموح.</p>}
        <form className="access-request-form" method="post" action="/api/auth/login">
          <input type="hidden" name="returnTo" value={returnTo} />
          <label><span>رقم الهوية / الإقامة</span><input name="identifier" inputMode="numeric" pattern="[0-9]{10}" minLength={10} maxLength={10} autoComplete="username" dir="ltr" required /></label>
          <label><span>كلمة المرور</span><input name="password" type="password" autoComplete="current-password" minLength={12} required /></label>
          <button type="submit">دخول آمن</button>
        </form>
      </section>
    </main>
  );
}
