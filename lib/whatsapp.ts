/** Normalize Saudi mobile numbers to the international format required by wa.me. */
export function normalizeSaudiWhatsAppNumber(value: string | null | undefined) {
  const western = String(value || "").replace(/[٠-٩۰-۹]/g, digit => String(digit.charCodeAt(0) - (digit >= "۰" ? 0x6f0 : 0x660)));
  if (/[^+0-9\s().-]/.test(western)) return null;
  let digits = western.replace(/\D/g, "");
  if (digits.startsWith("00966")) digits = digits.slice(2);
  if (digits.startsWith("9660")) digits = `966${digits.slice(4)}`;
  else if (digits.startsWith("05")) digits = `966${digits.slice(1)}`;
  else if (digits.startsWith("5") && digits.length === 9) digits = `966${digits}`;
  return /^9665\d{8}$/.test(digits) ? digits : null;
}

export function createWhatsAppUrl(value: string | null | undefined, message: string) {
  const mobile = normalizeSaudiWhatsAppNumber(value);
  return mobile ? `https://wa.me/${mobile}?text=${encodeURIComponent(message)}` : null;
}

export function createWhatsAppAppUrl(
  value: string | null | undefined,
  message: string,
) {
  const mobile = normalizeSaudiWhatsAppNumber(value);
  return mobile
    ? `whatsapp://send?phone=${mobile}&text=${encodeURIComponent(message)}`
    : null;
}

export function createWhatsAppWebUrl(
  value: string | null | undefined,
  message: string,
) {
  const mobile = normalizeSaudiWhatsAppNumber(value);
  if (!mobile) return null;
  const query = new URLSearchParams({
    phone: mobile,
    text: message,
    type: "phone_number",
    app_absent: "0",
  });
  return `https://web.whatsapp.com/send/?${query.toString()}`;
}
