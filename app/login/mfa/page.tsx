import { headers } from "next/headers";
import Image from "next/image";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { portalAuthCredentials } from "@/db/schema";
import { decryptMfaValue, readMfaChallenge, totpUri } from "@/lib/portal-mfa";

export const dynamic = "force-dynamic";

type Query = { returnTo?: string; mode?: string; error?: string };

export default async function MfaPage({ searchParams }: { searchParams: Promise<Query> }) {
  const query = await searchParams;
  const incoming = await headers();
  const challenge = await readMfaChallenge(new Request("https://dali.local/login/mfa", { headers: incoming }));
  if (!challenge) redirect("/login?error=mfa-expired");
  const credential = await getDb().query.portalAuthCredentials.findFirst({ where: eq(portalAuthCredentials.identifier, challenge.identifier) });
  if (!credential) redirect("/login?error=credentials");
  const enrollment = challenge.purpose === "enroll";
  const secret = enrollment && challenge.pendingSecretEncrypted ? await decryptMfaValue(challenge.pendingSecretEncrypted) : "";
  const recoveryCodes = enrollment && challenge.pendingRecoveryCodesEncrypted
    ? JSON.parse(await decryptMfaValue(challenge.pendingRecoveryCodesEncrypted)) as string[] : [];
  const error = query.error === "code" ? "الرمز غير صحيح أو انتهت صلاحيته. تحقق من وقت جهازك وحاول مجددًا."
    : query.error === "attempts" ? "تم إيقاف هذا التحدي بعد محاولات متعددة. أعد تسجيل الدخول لبدء تحقق جديد."
      : null;
  return <main className="portal-gate" dir="rtl"><section className="gate-card secure-gate-card mfa-card">
    <Image src="/dally-logo.jpg" alt="شعار شركة دالي" className="gate-logo" width={545} height={280} sizes="180px" priority/>
    <p className="gate-kicker">حماية الحسابات الحساسة</p>
    <h1>{enrollment ? "إعداد التحقق بخطوتين" : "أدخل رمز التحقق"}</h1>
    <p className="gate-copy">{enrollment
      ? "أضف الحساب إلى تطبيق مصادقة متوافق مع TOTP، ثم أدخل الرمز المكوّن من ستة أرقام. سيصبح التحقق إلزاميًا لهذا الحساب بعد نجاح الإعداد."
      : "أدخل الرمز الحالي من تطبيق المصادقة. يمكنك استخدام أحد رموز الاسترداد عند تعذر الوصول إلى جهازك."}</p>
    {error && <p role="alert" className="gate-status suspended">{error}</p>}
    {enrollment && <div className="mfa-enrollment">
      <div><span>مفتاح الإعداد اليدوي</span><code dir="ltr">{secret.match(/.{1,4}/g)?.join(" ")}</code><a href={totpUri(secret, credential.email)}>فتح في تطبيق المصادقة</a></div>
      <div className="mfa-recovery"><strong>رموز الاسترداد — تُعرض مرة واحدة</strong><p>احفظها في مكان آمن خارج النظام. كل رمز صالح للاستخدام مرة واحدة.</p><ul dir="ltr">{recoveryCodes.map((code) => <li key={code}><code>{code}</code></li>)}</ul></div>
    </div>}
    <form className="login-credentials-form" method="post" action="/api/auth/mfa/verify">
      <input type="hidden" name="returnTo" value={challenge.returnTo}/>
      <label><span>{enrollment ? "رمز التطبيق" : "رمز التطبيق أو الاسترداد"}</span><input name="code" inputMode={enrollment ? "numeric" : "text"} autoComplete="one-time-code" minLength={6} maxLength={19} dir="ltr" required autoFocus/></label>
      <button type="submit">{enrollment ? "تفعيل ودخول" : "تحقق ودخول"}</button>
    </form>
    <a className="gate-signout" href="/api/auth/logout">إلغاء وتسجيل الخروج</a>
  </section></main>;
}
