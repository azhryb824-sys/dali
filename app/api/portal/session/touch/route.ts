import { getChatGPTUser } from "@/app/chatgpt-auth";
import { verifyPortalSession } from "@/lib/portal-session";
import { jsonNoStore, rejectCrossSiteRequest } from "@/lib/security";

export async function POST(request: Request) {
  if (rejectCrossSiteRequest(request)) return jsonNoStore({ error: "مصدر الطلب غير مسموح." }, { status: 403 });
  const user = await getChatGPTUser();
  if (!user) return jsonNoStore({ error: "غير مصرح." }, { status: 401 });
  const session = await verifyPortalSession(user.email, { touch: true });
  if (session.status !== "valid") return jsonNoStore({ error: "انتهت الجلسة الآمنة." }, { status: 401 });
  return jsonNoStore({ active: true, absoluteExpiresAt: session.absoluteExpiresAt });
}
