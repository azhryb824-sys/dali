import { createWhatsAppAppUrl, createWhatsAppUrl, createWhatsAppWebUrl } from "@/lib/whatsapp";
import { externalRequestUrl } from "@/lib/request-origin";
import { createWhatsAppLaunchToken } from "@/lib/whatsapp-launch";
import type { DaliShareFileDescriptor } from "@/lib/file-share-runtime";

export function whatsappSharePayload(request: Request, actor: string, mobile: string, message: string, files: DaliShareFileDescriptor[]) {
  return {
    mobile, shareMessage: message, files,
    whatsappUrl: createWhatsAppUrl(mobile, message),
    whatsappAppUrl: createWhatsAppAppUrl(mobile, message),
    whatsappWebUrl: createWhatsAppWebUrl(mobile, message),
    whatsappLaunchUrl: externalRequestUrl(request, `/api/portal/whatsapp-launch?token=${encodeURIComponent(createWhatsAppLaunchToken(actor, mobile, message))}`).toString(),
  };
}
