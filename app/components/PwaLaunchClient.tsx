"use client";

import { FormEvent, useEffect, useState } from "react";
import Image from "next/image";
import { enrollPwaDevice, isStandalonePwa, rememberedEnrollmentCode, refreshPwaAccess } from "@/app/components/pwa-device-client";

type Stage = "checking" | "activate" | "activating" | "error" | "not-installed";

export function PwaLaunchClient() {
  const [stage, setStage] = useState<Stage>("checking");
  const [code, setCode] = useState("");
  const [deviceName, setDeviceName] = useState("iPhone دالي");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let disposed = false;
    const initialize = async () => {
      await Promise.resolve();
      if (disposed) return;
      if (!isStandalonePwa()) {
        setStage("not-installed");
        return;
      }
      const remembered = rememberedEnrollmentCode();
      if (remembered) setCode(remembered.replace(/(.{4})(?=.)/g, "$1-"));
      const ipad = /iPad/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
      setDeviceName(ipad ? "iPad دالي" : "iPhone دالي");
      try {
        const result = await refreshPwaAccess();
        if (disposed) return;
        if (result.status === "ready") window.location.replace("/login?returnTo=%2Fportal&source=pwa");
        else {
          if (result.status === "revoked") setMessage("أُلغي اعتماد هذا الجهاز. اطلب رمز تفعيل جديداً من المالك أو مشرف النظام.");
          setStage("activate");
        }
      } catch {
        if (!disposed) {
          setMessage("تعذّر الاتصال بالخادم. تحقق من الإنترنت ثم أعد المحاولة.");
          setStage("error");
        }
      }
    };
    void initialize();
    return () => { disposed = true; };
  }, []);

  async function activate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStage("activating");
    setMessage("");
    try {
      const result = await enrollPwaDevice(code, deviceName.trim());
      if (result.status !== "ready") throw new Error("تعذّر إنشاء جلسة الجهاز");
      window.location.replace("/login?returnTo=%2Fportal&source=pwa");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "تعذّر تفعيل الجهاز");
      setStage("error");
    }
  }

  if (stage === "checking") return <main className="pwa-shell"><section className="pwa-card pwa-loading" aria-live="polite"><span/><p>جارٍ التحقق من اعتماد الجهاز...</p></section></main>;
  if (stage === "not-installed") return <main className="pwa-shell" dir="rtl"><section className="pwa-card"><Image src="/pwa/icon-192.png" width="84" height="84" alt="أيقونة نظام دالي"/><h1>افتح التطبيق من الشاشة الرئيسية</h1><p>هذه الصفحة لا تفتح النظام داخل Safari. أضف نظام دالي إلى الشاشة الرئيسية أولاً ثم افتح الأيقونة الجديدة.</p><a href="/pwa/setup">عرض تعليمات التثبيت</a></section></main>;

  return (
    <main className="pwa-shell" dir="rtl">
      <section className="pwa-card">
        <Image src="/pwa/icon-192.png" width="84" height="84" alt="أيقونة نظام دالي" />
        <p className="pwa-kicker">اعتماد جهاز جديد</p>
        <h1>تفعيل نظام دالي</h1>
        <p>أدخل الرمز المؤقت الصادر من المالك أو مشرف النظام. لن تُفتح صفحة تسجيل الدخول قبل التحقق من مفتاح هذا الجهاز.</p>
        {message && <p className="pwa-alert" role="alert">{message}</p>}
        <form className="pwa-activation-form" onSubmit={(event) => void activate(event)}>
          <label>اسم الجهاز<input value={deviceName} onChange={(event) => setDeviceName(event.target.value)} minLength={2} maxLength={80} required /></label>
          <label>رمز التفعيل<input value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} autoCapitalize="characters" autoCorrect="off" inputMode="text" placeholder="XXXX-XXXX-XXXX" dir="ltr" minLength={12} maxLength={14} required /></label>
          <button disabled={stage === "activating"}>{stage === "activating" ? "جارٍ اعتماد الجهاز..." : "اعتماد الجهاز والدخول"}</button>
        </form>
        <small className="pwa-footnote">كل مستخدم سيظل مطالباً برقم هويته وكلمة مروره وصلاحيات حسابه المعتادة.</small>
      </section>
    </main>
  );
}
