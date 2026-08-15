import { getChatGPTUser, chatGPTSignInPath } from "@/app/chatgpt-auth";
import { resolvePortalAccess } from "@/lib/portal-access";
import { issuePortalSession, portalSessionCookie, portalSessionEndPath, verifyPortalSession } from "@/lib/portal-session";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const requestedReturn = url.searchParams.get("returnTo") || "/portal";
  const returnTo = requestedReturn.startsWith("/portal") && !requestedReturn.startsWith("//") ? requestedReturn : "/portal";
  const user = await getChatGPTUser();
  if (!user) {
    const callbackPath = `/api/portal/session/start?returnTo=${encodeURIComponent(returnTo)}`;
    return Response.redirect(new URL(chatGPTSignInPath(callbackPath), request.url), 303);
  }

  const existing = await verifyPortalSession(user.email);
  if (existing.status === "valid") return Response.redirect(new URL(returnTo, request.url), 303);
  if (existing.status === "invalid" || existing.status === "expired") {
    return Response.redirect(new URL(portalSessionEndPath(returnTo, "reauth-required"), request.url), 303);
  }

  await resolvePortalAccess(user, { markLogin: true });
  const session = await issuePortalSession(user, request);
  // Redirect responses created by Response.redirect() have immutable headers in
  // the Workers runtime, so the session cookie must be supplied at construction.
  return new Response(null, {
    status: 303,
    headers: {
      location: new URL(returnTo, request.url).toString(),
      "set-cookie": portalSessionCookie(request, session.token),
      "cache-control": "no-store",
    },
  });
}
