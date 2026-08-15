import { clearIdentityCookies } from "@/lib/credential-auth";

export async function GET(request: Request) {
  const headers = new Headers({ location: new URL("/login", request.url).toString(), "cache-control": "no-store" });
  for (const cookie of clearIdentityCookies(request)) headers.append("set-cookie", cookie);
  return new Response(null, { status: 303, headers });
}
