import { redirect } from "next/navigation";
import Image from "next/image";
import { getChatGPTUser } from "@/app/chatgpt-auth";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ returnTo?: string; error?: string }> }) {
  const query = await searchParams;
  const returnTo = query.returnTo?.startsWith("/portal") && !query.returnTo.startsWith("//") ? query.returnTo : "/portal";
  if (await getChatGPTUser()) redirect(returnTo);

  return (
    <main className="portal-gate login-page" dir="rtl">
      <section className="gate-card secure-gate-card login-card">
        <Image src="/dally-logo.jpg" alt="شعار شركة دالي" className="gate-logo" width={545} height={280} sizes="180px" priority />
        <p className="gate-kicker">النظام الإداري الداخلي</p>
        <h1>تسجيل الدخول الآمن</h1>
        <p className="gate-copy">أدخل بيانات حساب الإدارة. تُحد الجلسة تلقائيًا ويُسجل كل دخول في سجل النشاط.</p>
        {query.error && <p role="alert" className="gate-status suspended login-error">بيانات الدخول غير صحيحة أو تجاوزت الحد المسموح.</p>}
        <form className="access-request-form login-form" method="post" action="/api/auth/login">
          <input type="hidden" name="returnTo" value={returnTo} />
          <label htmlFor="login-email">
            <span>البريد الإلكتروني</span>
            <input id="login-email" name="email" type="email" inputMode="email" autoComplete="username" dir="ltr" required />
          </label>
          <label htmlFor="login-password">
            <span>كلمة المرور</span>
            <input id="login-password" name="password" type="password" autoComplete="current-password" dir="ltr" minLength={12} required />
          </label>
          <button type="submit">دخول آمن</button>
        </form>
      </section>

      <style>{`
        .login-page {
          min-height: 100svh;
          padding: 32px 20px;
          display: grid;
          place-items: center;
        }
        .login-card {
          width: min(100%, 520px);
          margin: 0;
        }
        .login-form {
          width: 100%;
          margin-top: 24px;
          display: grid;
          grid-template-columns: 1fr;
          gap: 18px;
        }
        .login-form label {
          width: 100%;
          min-width: 0;
          display: grid;
          grid-template-columns: 1fr;
          gap: 8px;
          color: #52636c;
          font-size: 14px;
          font-weight: 700;
          text-align: right;
        }
        .login-form input:not([type="hidden"]) {
          display: block;
          width: 100%;
          min-width: 0;
          height: 52px;
          margin: 0;
          padding: 0 16px;
          border: 1px solid #ccd6da;
          border-radius: 6px;
          background: #fff;
          color: #001d2d;
          font-size: 16px;
          line-height: 52px;
          text-align: left;
          outline: none;
          appearance: none;
        }
        .login-form input:not([type="hidden"]):focus {
          border-color: #e21c25;
          box-shadow: 0 0 0 3px rgba(226, 28, 37, .12);
        }
        .login-form button {
          width: 100%;
          min-height: 52px;
          margin: 4px 0 0;
          padding: 0 18px;
          border: 0;
          border-radius: 6px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: #e21c25;
          color: #fff;
          font-size: 15px;
          font-weight: 800;
          cursor: pointer;
        }
        .login-error {
          width: 100%;
          height: auto;
          min-height: 44px;
          margin: 18px 0 0;
          padding: 10px 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          text-align: center;
        }
        @media (max-width: 560px) {
          .login-page { padding: 18px 14px; }
          .login-card { padding-inline: 22px; }
          .login-form { gap: 15px; }
          .login-form input:not([type="hidden"]),
          .login-form button { min-height: 50px; height: 50px; }
        }
      `}</style>
    </main>
  );
}
