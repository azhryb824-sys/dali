import { createDesktopEntryToken, DESKTOP_ENTRY_SECONDS, desktopDeviceId } from "@/lib/desktop-entry";
import { externalRequestUrl } from "@/lib/request-origin";
import { enforcePublicRateLimit, jsonNoStore, rateLimitResponse, rejectCrossSiteRequest } from "@/lib/security";

export async function POST(request: Request) {
  if (rejectCrossSiteRequest(request) || !desktopDeviceId(request.headers)) {
    return jsonNoStore({ error: "طلب رابط الدخول غير صالح" }, { status: 403 });
  }

  const limit = await enforcePublicRateLimit(request, {
    scope: "desktop-entry-link",
    limit: 30,
    windowSeconds: 10 * 60,
    blockSeconds: 10 * 60,
  });
  if (!limit.allowed) return rateLimitResponse(limit.retryAfterSeconds);

  const token = await createDesktopEntryToken(request.headers);
  if (!token) return jsonNoStore({ error: "تعذّر إنشاء رابط الدخول" }, { status: 403 });
  return jsonNoStore({
    url: externalRequestUrl(request, `/desktop-access/${encodeURIComponent(token)}`).toString(),
    expiresInSeconds: DESKTOP_ENTRY_SECONDS,
  });
}
