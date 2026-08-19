import { chatGPTSignOutPath } from "@/app/chatgpt-auth";
import { clearPortalSessionCookies, revokeCurrentPortalSession } from "@/lib/portal-session";
import { externalRequestUrl } from "@/lib/request-origin";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const requestedReturn = url.searchParams.get("returnTo") || "/portal";
  const returnTo = requestedReturn.startsWith("/portal") && !requestedReturn.startsWith("//") ? requestedReturn : "/portal";
  const reason = (url.searchParams.get("reason") || "logout").slice(0, 40);
  await revokeCurrentPortalSession(request, reason).catch(() => undefined);
  const headers = new Headers({
    location: externalRequestUrl(request, chatGPTSignOutPath(returnTo)).toString(),
    "cache-control": "no-store",
  });
  for (const cookie of clearPortalSessionCookies(request)) headers.append("set-cookie", cookie);

  return new Response(null, { status: 303, headers });
}
