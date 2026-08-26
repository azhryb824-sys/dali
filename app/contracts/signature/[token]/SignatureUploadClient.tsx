"use client";

import { FormEvent, useEffect, useState } from "react";
import styles from "./signature.module.css";

type ContractInfo = { referenceCode: string; clientName: string; title: string; fileName: string; expiresAt: string };

export default function SignatureUploadClient({ token }: { token: string }) {
  const [contract, setContract] = useState<ContractInfo | null>(null);
  const [message, setMessage] = useState("جارٍ التحقق من رابط العقد...");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    let active = true;
    fetch(`/api/contracts/signature/${token}`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json() as { contract?: ContractInfo; error?: string };
        if (!response.ok || !data.contract) throw new Error(data.error || "تعذّر فتح رابط العقد");
        if (active) { setContract(data.contract); setMessage(""); }
      })
      .catch((reason) => { if (active) { setError(true); setMessage(reason instanceof Error ? reason.message : "تعذّر فتح الرابط"); } });
    return () => { active = false; };
  }, [token]);

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(false); setMessage("");
    try {
      const form = new FormData(event.currentTarget);
      const response = await fetch(`/api/contracts/signature/${token}`, { method: "POST", body: form });
      const data = await response.json() as { error?: string; referenceCode?: string };
      if (!response.ok) throw new Error(data.error || "تعذّر رفع العقد");
      setComplete(true);
      setMessage(`تم استلام العقد الموقع ${data.referenceCode || ""} وحفظه بنجاح.`);
    } catch (reason) {
      setError(true);
      setMessage(reason instanceof Error ? reason.message : "تعذّر رفع العقد");
    } finally { setBusy(false); }
  }

  return <main className={styles.page} dir="rtl">
    <section className={styles.card}>
      <div className={styles.brand}>DALLY CORPORATION</div>
      <span className={styles.eyebrow}>بوابة توقيع العقود الآمنة</span>
      <h1>{complete ? "تم استلام العقد" : "رفع العقد بعد توقيع العميل"}</h1>
      {contract && !complete && <div className={styles.details}>
        <p><span>مرجع العقد</span><strong>{contract.referenceCode}</strong></p>
        <p><span>العميل</span><strong>{contract.clientName}</strong></p>
        <p><span>العقد</span><strong>{contract.title}</strong></p>
        <p><span>صلاحية الرابط</span><strong>{new Date(contract.expiresAt).toLocaleString("ar-SA")}</strong></p>
      </div>}
      {contract && !complete && <form onSubmit={upload} className={styles.form}>
        <label htmlFor="signed-contract">اختر النسخة النهائية الموقعة من العميل والشركة بصيغة PDF</label>
        <input id="signed-contract" name="file" type="file" accept="application/pdf,.pdf" required disabled={busy}/>
        <small>الحد الأقصى 25 ميجابايت. يمكن استخدام الرابط مرة واحدة فقط.</small>
        <button disabled={busy}>{busy ? "جارٍ التحقق والحفظ..." : "رفع وحفظ العقد الموقع"}</button>
      </form>}
      {message && <p className={error ? styles.error : styles.success} role="status">{message}</p>}
      {complete && <p className={styles.note}>أصبحت النسخة الموقعة هي النسخة الحالية في النظام، مع الاحتفاظ بالنسخة الأصلية المعتمدة في سجل آمن.</p>}
    </section>
  </main>;
}
