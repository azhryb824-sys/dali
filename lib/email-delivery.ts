import { getRuntimeEnv } from "@/lib/runtime-env";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character]!);
}

function emailAddress(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function emailDeliveryConfigured() {
  const env = getRuntimeEnv();
  return Boolean(env.RESEND_API_KEY?.trim() && env.EMAIL_FROM?.trim());
}

export async function sendVisitorReplyEmail(input: {
  to: string;
  recipientName: string;
  subject: string;
  body: string;
  trackingCode: string;
  idempotencyKey: string;
}) {
  const env = getRuntimeEnv();
  const apiKey = env.RESEND_API_KEY?.trim();
  const from = env.EMAIL_FROM?.trim();
  const replyTo = env.EMAIL_REPLY_TO?.trim();
  if (!apiKey || !from) throw new Error("EMAIL_NOT_CONFIGURED");
  if (!emailAddress(input.to)) throw new Error("INVALID_RECIPIENT");

  const safeName = escapeHtml(input.recipientName);
  const safeBody = escapeHtml(input.body).replaceAll("\n", "<br/>");
  const safeTracking = escapeHtml(input.trackingCode);
  const html = `<!doctype html><html lang="ar" dir="rtl"><body style="margin:0;background:#f4f2ee;font-family:Tahoma,Arial,sans-serif;color:#102a38"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f2ee;padding:28px 12px"><tr><td align="center"><table role="presentation" width="620" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border:1px solid #dde3e6"><tr><td style="background:#001d2d;padding:24px 30px;color:#fff"><strong style="font-size:19px">شركة دالي للتشغيل والصيانة</strong><div style="font-size:12px;color:#b8c5ca;margin-top:6px">الرد على الطلب ${safeTracking}</div></td></tr><tr><td style="padding:32px 30px;line-height:1.9;font-size:15px"><p style="margin:0 0 18px">الأستاذ/ة ${safeName}،</p><div>${safeBody}</div><p style="margin:30px 0 0;color:#65747b;font-size:12px">هذا الرد مرتبط بطلبك رقم ${safeTracking}. يمكنك الرد مباشرة على هذه الرسالة عند توفر عنوان الرد.</p></td></tr><tr><td style="padding:18px 30px;background:#f7f8f8;border-top:3px solid #e21c25;font-size:11px;color:#65747b">شركة دالي للتشغيل والصيانة · مكة المكرمة · حي الرصيفة</td></tr></table></td></tr></table></body></html>`;

  const response = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      "idempotency-key": input.idempotencyKey,
    },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: input.subject,
      text: `الأستاذ/ة ${input.recipientName}،\n\n${input.body}\n\nرقم الطلب: ${input.trackingCode}\nشركة دالي للتشغيل والصيانة - مكة المكرمة`,
      html,
      ...(replyTo && emailAddress(replyTo) ? { reply_to: replyTo } : {}),
      tags: [{ name: "request", value: input.trackingCode.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 256) }],
    }),
  });

  const result = await response.json().catch(() => ({})) as { id?: string; message?: string; name?: string };
  if (!response.ok || !result.id) {
    const reason = [result.name, result.message].filter(Boolean).join(": ").slice(0, 500) || `HTTP ${response.status}`;
    throw new Error(`EMAIL_PROVIDER_ERROR:${reason}`);
  }
  return { providerMessageId: result.id };
}
