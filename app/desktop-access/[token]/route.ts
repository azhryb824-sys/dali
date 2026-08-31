import { desktopEntryCookie, verifyDesktopEntryToken } from "@/lib/desktop-entry";
import { externalRequestUrl } from "@/lib/request-origin";

function unavailableResponse() {
  return new Response("رابط الدخول غير صالح أو انتهت صلاحيته. افتح تطبيق دالي من جديد.", {
    status: 404,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
    },
  });
}

export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const entry = await verifyDesktopEntryToken(request.headers, token);
  if (!entry) return unavailableResponse();

  return new Response(null, {
    status: 303,
    headers: {
      location: externalRequestUrl(request, "/login?returnTo=%2Fportal").toString(),
      "set-cookie": desktopEntryCookie(request, token),
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
    },
  });
}
