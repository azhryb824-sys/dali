export const MOBILE_APP_MARKER = "DaliMobile/1";

export function isDaliMobileUserAgent(userAgent: string | null | undefined) {
  return (userAgent ?? "").split(/\s+/).includes(MOBILE_APP_MARKER);
}
