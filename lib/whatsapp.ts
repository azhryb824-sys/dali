/** Normalize Saudi mobile numbers to the international format required by wa.me. */
export function normalizeSaudiWhatsAppNumber(value: string | null | undefined) {
  let digits = String(value || "").replace(/\D/g, "");
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
