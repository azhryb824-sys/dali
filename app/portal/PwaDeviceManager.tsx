"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type Device = {
  id: string;
  deviceName: string;
  platform: string;
  status: "active" | "revoked";
  enrolledBy: string;
  enrolledAt: string;
  lastSeenAt: string;
  revokedAt: string | null;
  revokedBy: string | null;
  revocationReason: string | null;
};

type PendingEnrollment = {
  id: string;
  deviceName: string;
  issuedBy: string;
  expiresAt: string;
  createdAt: string;
};

type Enrollment = PendingEnrollment & { code: string; setupUrl: string };

function dateTime(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("ar-SA", { timeZone: "Asia/Riyadh", dateStyle: "medium", timeStyle: "short" });
}

async function responseJson<T>(response: Response) {
  const payload = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || "تعذّر تنفيذ العملية");
  return payload;
}

export default function PwaDeviceManager() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [pending, setPending] = useState<PendingEnrollment[]>([]);
  const [issued, setIssued] = useState<Enrollment | null>(null);
  const [deviceName, setDeviceName] = useState("iPhone الإدارة");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [revokeId, setRevokeId] = useState<string | null>(null);
  const [revokeReason, setRevokeReason] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await responseJson<{ devices: Device[]; pendingEnrollments: PendingEnrollment[] }>(await fetch("/api/portal/pwa-devices", { cache: "no-store" }));
      setDevices(data.devices);
      setPending(data.pendingEnrollments);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "تعذّر تحميل الأجهزة");
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function issue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("issue");
    setError("");
    setNotice("");
    try {
      const data = await responseJson<{ enrollment: Enrollment }>(await fetch("/api/portal/pwa-devices", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deviceName }),
      }));
      setIssued(data.enrollment);
      setNotice("تم إصدار رمز تفعيل لمرة واحدة. أرسله إلى iPhone خلال عشرين دقيقة.");
      await load();
    } catch (issueError) {
      setError(issueError instanceof Error ? issueError.message : "تعذّر إصدار رمز التفعيل");
    } finally {
      setBusy("");
    }
  }

  async function copy(value: string, message: string) {
    await navigator.clipboard.writeText(value);
    setNotice(message);
  }

  async function revokeDevice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!revokeId) return;
    setBusy(`device:${revokeId}`);
    setError("");
    try {
      await responseJson(await fetch("/api/portal/pwa-devices", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "revoke-device", id: revokeId, reason: revokeReason }),
      }));
      setNotice("أُلغي اعتماد الجهاز، ولن يستطيع تجديد تصريح الدخول.");
      setRevokeId(null);
      setRevokeReason("");
      await load();
    } catch (revokeError) {
      setError(revokeError instanceof Error ? revokeError.message : "تعذّر إلغاء الجهاز");
    } finally {
      setBusy("");
    }
  }

  async function cancelEnrollment(id: string) {
    setBusy(`enrollment:${id}`);
    setError("");
    try {
      await responseJson(await fetch("/api/portal/pwa-devices", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "revoke-enrollment", id, reason: "إلغاء رمز التفعيل قبل استخدامه" }),
      }));
      if (issued?.id === id) setIssued(null);
      setNotice("أُلغي رمز التفعيل غير المستخدم.");
      await load();
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : "تعذّر إلغاء الرمز");
    } finally {
      setBusy("");
    }
  }

  return (
    <section className="panel pwa-device-manager">
      <header>
        <div>
          <span>دخول iPhone وiPad</span>
          <h2>الأجهزة المعتمدة لنسخة PWA</h2>
          <p>المتصفح العام يبقى محظوراً. كل جهاز يحتاج رمزاً مؤقتاً ومفتاح تشفير مستقلًا يمكن إلغاؤه من هنا.</p>
        </div>
        <strong>{devices.filter((device) => device.status === "active").length}<small>جهاز نشط</small></strong>
      </header>
      {notice && <p className="operations-notice" role="status">{notice}</p>}
      {error && <p className="operations-notice suspended" role="alert">{error}</p>}
      <form className="pwa-enrollment-form" onSubmit={(event) => void issue(event)}>
        <label>اسم الجهاز<input value={deviceName} onChange={(event) => setDeviceName(event.target.value)} minLength={2} maxLength={80} placeholder="مثال: iPhone المدير" required /></label>
        <button disabled={busy === "issue"}>{busy === "issue" ? "جارٍ إصدار الرمز..." : "إصدار رمز تثبيت مؤقت"}</button>
      </form>
      {issued && (
        <div className="pwa-issued-enrollment">
          <div><span>رمز التفعيل</span><strong dir="ltr">{issued.code}</strong><small>ينتهي: {dateTime(issued.expiresAt)}</small></div>
          <button onClick={() => void copy(issued.code, "تم نسخ رمز التفعيل.")}>نسخ الرمز</button>
          <button onClick={() => void copy(issued.setupUrl, "تم نسخ رابط تثبيت iPhone.")}>نسخ رابط التثبيت</button>
          <a href={`https://wa.me/?text=${encodeURIComponent(`تثبيت نظام دالي الخاص:\n${issued.setupUrl}\nرمز التفعيل: ${issued.code}`)}`} target="_blank" rel="noreferrer">إرسال عبر واتساب</a>
        </div>
      )}
      {pending.length > 0 && (
        <div className="pwa-pending-list">
          <h3>رموز لم تُستخدم بعد</h3>
          {pending.map((item) => <article key={item.id}><div><strong>{item.deviceName}</strong><small>ينتهي {dateTime(item.expiresAt)}</small></div><button disabled={busy === `enrollment:${item.id}`} onClick={() => void cancelEnrollment(item.id)}>إلغاء الرمز</button></article>)}
        </div>
      )}
      <div className="pwa-device-list">
        {devices.map((device) => (
          <article key={device.id} className={device.status === "revoked" ? "revoked" : ""}>
            <div className="pwa-device-icon" aria-hidden="true">{device.platform === "ipad-pwa" ? "▭" : "▯"}</div>
            <div><strong>{device.deviceName}</strong><small>{device.platform === "ipad-pwa" ? "iPad PWA" : "iPhone PWA"} · أضيف {dateTime(device.enrolledAt)}</small><small>آخر تحقق: {dateTime(device.lastSeenAt)}</small>{device.revocationReason && <em>{device.revocationReason}</em>}</div>
            <span className={`workflow-status ${device.status === "active" ? "active" : "cancelled"}`}>{device.status === "active" ? "معتمد" : "ملغى"}</span>
            {device.status === "active" && <button className="danger-action" onClick={() => { setRevokeId(device.id); setRevokeReason(""); }}>إلغاء الجهاز</button>}
          </article>
        ))}
        {!devices.length && <p className="empty-small">لم يُعتمد أي جهاز iPhone أو iPad بعد.</p>}
      </div>
      {revokeId && (
        <form className="pwa-revoke-form" onSubmit={(event) => void revokeDevice(event)}>
          <div><strong>إلغاء اعتماد الجهاز</strong><small>سيتوقف الجهاز عن تجديد تصريح الدخول خلال خمس دقائق كحد أقصى.</small></div>
          <textarea value={revokeReason} onChange={(event) => setRevokeReason(event.target.value)} minLength={10} maxLength={500} placeholder="اكتب سبب الإلغاء بوضوح" required />
          <div><button type="button" onClick={() => setRevokeId(null)}>تراجع</button><button className="danger-action" disabled={busy === `device:${revokeId}`}>تأكيد الإلغاء</button></div>
        </form>
      )}
    </section>
  );
}
