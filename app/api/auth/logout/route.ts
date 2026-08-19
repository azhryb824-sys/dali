import { clearIdentityCookies } from "@/lib/credential-auth";
import { externalRequestUrl } from "@/lib/request-origin";

export async function GET(request: Request) {
  const headers = new Headers({ location: externalRequestUrl(request, "/login").toString(), "cache-control": "no-store" });
  for (const cookie of clearIdentityCookies(request)) headers.append("set-cookie", cookie);
  return new Response(null, { status: 303, headers });
}
