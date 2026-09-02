"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { isStandalonePwa, rememberEnrollmentCode } from "@/app/components/pwa-device-client";

export function PwaSetupClient({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const normalized = code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
  const formatted = normalized.replace(/(.{4})(?=.)/g, "$1-");

  useEffect(() => {
    if (normalized) rememberEnrollmentCode(normalized);
    if (isStandalonePwa()) window.location.replace("/pwa/launch");
  }, [normalized]);

  async function copyCode() {
    await navigator.clipboard.writeText(formatted).catch(() => undefined);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <main className="pwa-shell" dir="rtl">
      <section className="pwa-card pwa-install-card">
        <Image src="/pwa/icon-192.png" width="88" height="88" alt="أيقونة نظام دالي" />
        <p className="pwa-kicker">تثبيت خاص بجهاز معتمد</p>
        <h1>إضافة نظام دالي إلى iPhone</h1>
        <ol className="pwa-steps">
          <li><b>1</b><span>افتح هذه الصفحة في Safari واضغط زر المشاركة.</span></li>
          <li><b>2</b><span>اختر «إضافة إلى الشاشة الرئيسية» ثم اضغط «إضافة».</span></li>
          <li><b>3</b><span>افتح أيقونة نظام دالي الجديدة وأدخل رمز التفعيل عند طلبه.</span></li>
        </ol>
        {formatted ? (
          <div className="pwa-code-box">
            <span>رمز تفعيل لمرة واحدة</span>
            <strong dir="ltr">{formatted}</strong>
            <button type="button" onClick={() => void copyCode()}>{copied ? "تم النسخ" : "نسخ الرمز"}</button>
            <small>تنتهي صلاحية الرمز بعد المدة المحددة في تطبيق الإدارة.</small>
          </div>
        ) : <p className="pwa-alert">افتح رابط التثبيت الذي أصدره المالك أو مشرف النظام.</p>}
        <p className="pwa-security-note">لا تعرض هذه الصفحة تسجيل الدخول ولا تمنح أي صلاحية قبل اعتماد مفتاح الجهاز.</p>
      </section>
    </main>
  );
}
