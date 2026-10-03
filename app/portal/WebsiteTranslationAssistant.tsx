"use client";
import { useRef, useState } from "react";
import { readApiJson } from "@/lib/client-api";

export default function WebsiteTranslationAssistant({ source, target, disabled, onApply, onBusy }: { source: string; target: "en" | "bn"; disabled: boolean; onApply: (value: string, locale: "en" | "bn") => void; onBusy: (busy: boolean) => void }) {
  const [language, setLanguage] = useState(target);
  const [result, setResult] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  async function translate() {
    if (disabled || lock.current || !source.trim()) return;
    lock.current = true; setBusy(true); onBusy(true); setError("");
    try {
      const response = await fetch("/api/portal/translate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ values: [source], target: language }) });
      const data = await readApiJson(response) as { translated?: string[]; error?: string };
      if (!response.ok || !data.translated?.[0]) throw new Error(data.error || "تعذّر إنشاء الترجمة");
      setResult(data.translated[0]);
    } catch (err) { setError(err instanceof Error ? err.message : "تعذّر إنشاء الترجمة"); }
    finally { lock.current = false; setBusy(false); onBusy(false); }
  }
  return <section className="website-translation-assistant" aria-label="مساعد الترجمة الفوري">
    <h4>مساعد الترجمة الفوري</h4>
    <p>راجع الترجمة ثم طبّقها على الحقل. تظهر في المعاينة قبل النشر.</p>
    <label>لغة المسودة<select value={language} disabled={disabled || busy} onChange={event=>{setLanguage(event.target.value === "bn" ? "bn" : "en");setResult("");setError("");}}><option value="en">English</option><option value="bn">বাংলা</option></select></label>
    <div className="translation-assistant-actions"><button type="button" disabled={disabled || busy || !source.trim() || source.length > 6000} onClick={() => void translate()}>{busy ? "جارٍ إنشاء المسودة..." : "ترجمة النص المحدد"}</button><a href={`https://translate.google.com/?sl=ar&tl=${language}&text=${encodeURIComponent(source)}&op=translate`} target="_blank" rel="noopener noreferrer">فتح النص في ترجمة Google</a></div>
    <p>يفتح Google في نافذة مستقلة؛ انسخ النتيجة هنا لتطبيقها.</p>
    <textarea aria-label="مسودة الترجمة" placeholder="مسودة الترجمة" value={result} onChange={event => setResult(event.target.value)} maxLength={6000} dir="ltr" lang={language} disabled={disabled || busy}/>
    <button type="button" disabled={disabled || busy || !result.trim() || /[\u0600-\u06ff]/.test(result)} onClick={() => onApply(result.trim(),language)}>تطبيق الترجمة على الحقل</button>
    {error && <p role="alert">{error}</p>}
  </section>;
}
