export type DaliWhatsAppRuntime = "mobile-app" | "desktop-app" | "browser";

const DALI_MOBILE_MARKER = /(?:^|\s)DaliMobile\/1(?:\s|$)/;

export function detectDaliWhatsAppRuntime(
  userAgent: string,
  hasDesktopBridge: boolean,
): DaliWhatsAppRuntime {
  if (DALI_MOBILE_MARKER.test(userAgent)) return "mobile-app";
  if (hasDesktopBridge) return "desktop-app";
  return "browser";
}

export function currentDaliWhatsAppRuntime(): DaliWhatsAppRuntime {
  if (typeof window === "undefined" || typeof navigator === "undefined")
    return "browser";
  return detectDaliWhatsAppRuntime(
    navigator.userAgent,
    "daliDesktop" in window,
  );
}
