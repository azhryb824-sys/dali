import { getChatGPTUser } from "@/app/chatgpt-auth";
import { desktopAccessCookie, isLegacyDesktopRequest, issueDesktopAccessToken } from "@/lib/desktop-entry";
import { clearPortalSessionCookies, revokeCurrentPortalSession } from "@/lib/portal-session";
import { externalRequestUrl } from "@/lib/request-origin";
import { rejectCrossSiteRequest } from "@/lib/security";

function safePortalReturnPath(value: string | null) {
  return value?.startsWith("/portal") && !value.startsWith("//") ? value : "/portal";
}

export async function GET(request: Request) {
  if (rejectCrossSiteRequest(request) || !isLegacyDesktopRequest(request.headers)) {
    return new Response(null, { status: 403, headers: { "cache-control": "no-store" } });
  }

  const returnTo = safePortalReturnPath(new URL(request.url).searchParams.get("returnTo"));
  const user = await getChatGPTUser();
  if (!user) {
    return Response.redirect(externalRequestUrl(request, `/login?returnTo=${encodeURIComponent(returnTo)}`), 303);
  }

  const token = await issueDesktopAccessToken(request.headers);
  if (!token) return new Response(null, { status: 403, headers: { "cache-control": "no-store" } });

  await revokeCurrentPortalSession(request, "legacy-desktop-upgrade").catch(() => undefined);
  const responseHeaders = new Headers({
    location: externalRequestUrl(request, returnTo).toString(),
    "cache-control": "no-store",
  });
  for (const cookie of clearPortalSessionCookies(request)) responseHeaders.append("set-cookie", cookie);
  responseHeaders.append("set-cookie", desktopAccessCookie(request, token));
  return new Response(null, { status: 303, headers: responseHeaders });
}
