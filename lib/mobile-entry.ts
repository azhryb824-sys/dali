export const MOBILE_APP_USER_AGENT_MARKER = "DaliMobile/1";

const mobileAppUserAgentPattern = /(?:^|\s)DaliMobile\/1(?:\s|$)/;

type HeaderReader = Pick<Headers, "get">;
export type MobilePlatform = "android" | "ios" | "mobile";

export function isDaliMobileRequest(source: HeaderReader) {
  return mobileAppUserAgentPattern.test(source.get("user-agent") ?? "");
}

export function mobileAppPlatform(source: HeaderReader): MobilePlatform | null {
  if (!isDaliMobileRequest(source)) return null;
  const userAgent = source.get("user-agent") || "";
  if (/Android/i.test(userAgent)) return "android";
  if (/iPhone|iPad|iPod/i.test(userAgent)) return "ios";
  return "mobile";
}
