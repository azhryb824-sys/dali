export const MOBILE_APP_USER_AGENT_MARKER = "DaliMobile/1";

const mobileAppUserAgentPattern = /(?:^|\s)DaliMobile\/1(?:\s|$)/;

type HeaderReader = Pick<Headers, "get">;

export function isDaliMobileRequest(source: HeaderReader) {
  return mobileAppUserAgentPattern.test(source.get("user-agent") ?? "");
}
