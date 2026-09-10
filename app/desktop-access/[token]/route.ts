import {
  desktopAccessCookie,
  desktopEntryCookie,
  issueDesktopAccessToken,
  verifyDesktopEntryToken,
} from "@/lib/desktop-entry";
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
  const accessToken = await issueDesktopAccessToken(request.headers);
  if (!accessToken) return unavailableResponse();

  const responseHeaders = new Headers({
    location: externalRequestUrl(request, "/login?returnTo=%2Fportal").toString(),
    "cache-control": "no-store",
    "referrer-policy": "no-referrer",
  });
  responseHeaders.append("set-cookie", desktopEntryCookie(request, token));
  responseHeaders.append("set-cookie", desktopAccessCookie(request, accessToken));

  return new Response(null, {
    status: 303,
    headers: responseHeaders,
  });
}
