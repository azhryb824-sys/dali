const SAUDI_WHATSAPP_PHONE = /^9665\d{8}$/;
const MAX_WHATSAPP_MESSAGE_LENGTH = 4000;

function parseWhatsAppTarget(value) {
  try {
    const url = new URL(value);
    let phone = "";

    if (url.protocol === "https:" && url.hostname === "wa.me") {
      phone = url.pathname.split("/").filter(Boolean)[0] || "";
    } else if (
      url.protocol === "https:" &&
      url.hostname === "api.whatsapp.com" &&
      url.pathname.replace(/\/+$/, "") === "/send"
    ) {
      phone = url.searchParams.get("phone") || "";
    } else if (
      url.protocol === "whatsapp:" &&
      url.hostname === "send" &&
      ["", "/"].includes(url.pathname)
    ) {
      phone = url.searchParams.get("phone") || "";
    } else {
      return null;
    }

    const normalizedPhone = phone.replace(/\D/g, "");
    if (!SAUDI_WHATSAPP_PHONE.test(normalizedPhone)) return null;

    const message = (url.searchParams.get("text") || "").slice(
      0,
      MAX_WHATSAPP_MESSAGE_LENGTH,
    );
    return { phone: normalizedPhone, message };
  } catch {
    return null;
  }
}

function whatsappQuery({ phone, message }) {
  const query = new URLSearchParams({ phone });
  if (message) query.set("text", message);
  return query.toString();
}

export function toWhatsAppAppUrl(value) {
  const target = parseWhatsAppTarget(value);
  return target ? `whatsapp://send?${whatsappQuery(target)}` : null;
}

export function toWhatsAppWebUrl(value) {
  const target = parseWhatsAppTarget(value);
  if (!target) return null;
  const text = target.message ? `?text=${encodeURIComponent(target.message)}` : "";
  return `https://wa.me/${target.phone}${text}`;
}

export function isTrustedPortalUrl(value, portalOrigin) {
  try {
    return new URL(value).origin === portalOrigin;
  } catch {
    return false;
  }
}

export function isSafeExternalHttpsUrl(value) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}
