"use client";
import { useState } from "react";

export default function VideoDeviceCheck({ joinUrl, host = false }: { joinUrl?: string; host?: boolean }) {
  const [result, setResult] = useState("");
  const [busy, setBusy] = useState(false);
  async function check() {
    setBusy(true); setResult("");
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("استخدم التطبيق المحدّث أو متصفحًا يدعم الكاميرا عبر اتصال آمن.");
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      const ready = stream.getVideoTracks().some(track => track.readyState === "live") && stream.getAudioTracks().some(track => track.readyState === "live");
      stream.getTracks().forEach(track => track.stop());
      setResult(ready ? "الكاميرا والميكروفون جاهزان على هذا الجهاز." : "تعذّر تشغيل الكاميرا أو الميكروفون على هذا الجهاز.");
    } catch (cause) {
      setResult(cause instanceof DOMException && cause.name === "NotAllowedError" ? "اسمح للتطبيق باستخدام الكاميرا والميكروفون من إعدادات الجهاز ثم أعد الاختبار." : cause instanceof DOMException && cause.name === "NotFoundError" ? "لم يتم العثور على كاميرا وميكروفون متاحين." : cause instanceof Error ? cause.message : "تعذّر فحص أجهزة المكالمة.");
    } finally { setBusy(false); }
  }
  return <div className="video-device-check"><button type="button" disabled={busy} onClick={() => void check()}>{busy ? "جارٍ فحص الأجهزة…" : "اختبار الكاميرا والميكروفون"}</button>{joinUrl && <a href={joinUrl} target="_blank" rel="noopener noreferrer">فتح المكالمة في نافذة مستقلة</a>}{host && <p>لبدء غرفة Jitsi قد تحتاج إلى تسجيل الدخول لدى مزود المكالمة. استخدم النافذة المستقلة إذا ظهر طلب تسجيل الدخول.</p>}{result && <p role="status">{result}</p>}</div>;
}
