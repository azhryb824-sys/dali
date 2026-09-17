import assert from "node:assert/strict";
import test from "node:test";

import {
  isSafeExternalHttpsUrl,
  isTrustedPortalUrl,
  toWhatsAppAppUrl,
  toWhatsAppWebUrl,
} from "../desktop/external-navigation.mjs";

test("desktop converts a verified wa.me share into the installed WhatsApp protocol", () => {
  const appUrl = toWhatsAppAppUrl(
    "https://wa.me/966501234567?text=%D9%85%D9%84%D9%81%20%D8%A7%D9%84%D8%B9%D9%82%D8%AF",
  );
  assert.equal(
    appUrl,
    "whatsapp://send?phone=966501234567&text=%D9%85%D9%84%D9%81+%D8%A7%D9%84%D8%B9%D9%82%D8%AF",
  );
});

test("desktop preserves a safe web fallback when the WhatsApp protocol is unavailable", () => {
  const webUrl = toWhatsAppWebUrl(
    "whatsapp://send?phone=966501234567&text=%D9%85%D8%B1%D8%AD%D8%A8%D8%A7",
  );
  assert.equal(
    webUrl,
    "https://wa.me/966501234567?text=%D9%85%D8%B1%D8%AD%D8%A8%D8%A7",
  );
});

test("desktop rejects unverified WhatsApp schemes and lookalike portal origins", () => {
  assert.equal(toWhatsAppAppUrl("whatsapp://call?phone=966501234567"), null);
  assert.equal(toWhatsAppAppUrl("whatsapp://send?phone=12025550123"), null);
  assert.equal(toWhatsAppAppUrl("javascript:alert(1)"), null);
  assert.equal(
    isTrustedPortalUrl("https://www.dally.info/portal", "https://www.dally.info"),
    true,
  );
  assert.equal(
    isTrustedPortalUrl("https://www.dally.info.evil.example/", "https://www.dally.info"),
    false,
  );
  assert.equal(isSafeExternalHttpsUrl("https://example.com/file.pdf"), true);
  assert.equal(isSafeExternalHttpsUrl("file:///etc/passwd"), false);
});
