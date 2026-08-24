import { getRuntimeEnv } from "@/lib/runtime-env";
import { sendEmail } from "@/lib/godaddy-email";

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
  return true;
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
  const replyTo = env.EMAIL_REPLY_TO?.trim();
  if (!emailAddress(input.to)) throw new Error("INVALID_RECIPIENT");

  const safeName = escapeHtml(input.recipientName);
  const safeBody = escapeHtml(input.body).replaceAll("\n", "<br/>");
  const safeTracking = escapeHtml(input.trackingCode);
  const html = `<!doctype html><html lang="ar" dir="rtl"><body style="margin:0;background:#f4f2ee;font-family:Tahoma,Arial,sans-serif;color:#102a38"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f2ee;padding:28px 12px"><tr><td align="center"><table role="presentation" width="620" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border:1px solid #dde3e6"><tr><td style="background:#001d2d;padding:24px 30px;color:#fff"><strong style="font-size:19px">شركة دالي للتشغيل والصيانة</strong><div style="font-size:12px;color:#b8c5ca;margin-top:6px">الرد على الطلب ${safeTracking}</div></td></tr><tr><td style="padding:32px 30px;line-height:1.9;font-size:15px"><p style="margin:0 0 18px">الأستاذ/ة ${safeName}،</p><div>${safeBody}</div><p style="margin:30px 0 0;color:#65747b;font-size:12px">هذا الرد مرتبط بطلبك رقم ${safeTracking}. يمكنك الرد مباشرة على هذه الرسالة عند توفر عنوان الرد.</p></td></tr><tr><td style="padding:18px 30px;background:#f7f8f8;border-top:3px solid #e21c25;font-size:11px;color:#65747b">شركة دالي للتشغيل والصيانة · مكة المكرمة · حي الرصيفة</td></tr></table></td></tr></table></body></html>`;

  const result = await sendEmail({
    to: input.to,
    subject: input.subject,
    text: `الأستاذ/ة ${input.recipientName}،\n\n${input.body}\n\nرقم الطلب: ${input.trackingCode}\nشركة دالي للتشغيل والصيانة - مكة المكرمة`,
    html,
    ...(replyTo && emailAddress(replyTo) ? { replyTo } : {}),
  });
  return { providerMessageId: result.messageId };
}

export async function sendPasswordResetEmail(input: { to: string; recipientName: string; resetUrl: string; idempotencyKey: string }) {
  if (!emailAddress(input.to)) throw new Error("INVALID_RECIPIENT");
  const safeName = escapeHtml(input.recipientName);
  const safeUrl = escapeHtml(input.resetUrl);
  const result = await sendEmail({
    to: input.to,
    subject: "إعادة تعيين كلمة مرور بوابة دالي",
    text: `مرحباً ${input.recipientName}،\n\nاستخدم الرابط التالي لإعادة تعيين كلمة المرور خلال 30 دقيقة:\n${input.resetUrl}\n\nإذا لم تطلب ذلك فتجاهل الرسالة.`,
    html: `<!doctype html><html lang="ar" dir="rtl"><body style="font-family:Tahoma,Arial;background:#f4f7f8;padding:30px"><main style="max-width:600px;margin:auto;background:#fff;border-top:6px solid #001d2d;padding:30px"><h2>إعادة تعيين كلمة المرور</h2><p>مرحباً ${safeName}،</p><p>اضغط الرابط التالي خلال 30 دقيقة. يُستخدم الرابط مرة واحدة فقط.</p><p><a href="${safeUrl}" style="background:#e21c25;color:#fff;padding:12px 22px;text-decoration:none;display:inline-block">تعيين كلمة مرور جديدة</a></p><p style="color:#65747b;font-size:12px">إذا لم تطلب إعادة التعيين فتجاهل هذه الرسالة.</p></main></body></html>`,
  });
  return result.messageId;
}
