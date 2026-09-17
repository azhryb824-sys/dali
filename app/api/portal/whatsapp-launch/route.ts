import { requirePortalApiRole } from "@/lib/portal-access";
import { jsonNoStore } from "@/lib/security";
import { createWhatsAppUrl } from "@/lib/whatsapp";
import { readWhatsAppLaunchToken } from "@/lib/whatsapp-launch";

export async function GET(request: Request) {
  const access = await requirePortalApiRole(["admin", "manager", "employee"]);
  if (!access)
    return jsonNoStore(
      { error: "يلزم تسجيل الدخول لفتح رابط واتساب" },
      { status: 401 },
    );

  const token = new URL(request.url).searchParams.get("token") || "";
  const payload = readWhatsAppLaunchToken(token, access.user.email);
  if (!payload)
    return jsonNoStore(
      { error: "انتهت صلاحية فتح واتساب؛ أعد تنفيذ المشاركة من النظام" },
      { status: 410 },
    );
  const whatsappUrl = createWhatsAppUrl(payload.phone, payload.message);
  if (!whatsappUrl)
    return jsonNoStore(
      { error: "رقم واتساب غير صحيح" },
      { status: 400 },
    );

  return new Response(null, {
    status: 302,
    headers: {
      location: whatsappUrl,
      "cache-control": "private, no-store, max-age=0",
      "referrer-policy": "no-referrer",
      "x-robots-tag": "noindex, nofollow, noarchive",
    },
  });
}
