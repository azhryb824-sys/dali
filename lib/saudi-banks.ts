// Banks and licensed foreign bank branches operating in Saudi Arabia.
// Keep this list aligned with the Saudi Central Bank licensed entities register.
export const saudiBanks = [
  "البنك الأهلي السعودي",
  "مصرف الراجحي",
  "بنك الرياض",
  "البنك السعودي الأول",
  "البنك السعودي الفرنسي",
  "البنك السعودي للاستثمار",
  "البنك العربي الوطني",
  "مصرف الإنماء",
  "بنك البلاد",
  "بنك الجزيرة",
  "بنك الخليج الدولي - السعودية",
  "بنك الإمارات دبي الوطني",
  "بنك البحرين الوطني",
  "بنك الكويت الوطني",
  "بنك مسقط",
  "دويتشه بنك",
  "بي إن بي باريبا",
  "جي بي مورغان تشيس",
  "البنك الوطني الباكستاني",
  "بنك زراعات التركي",
  "بنك الصين المحدود",
  "البنك الصناعي والتجاري الصيني",
  "بنك قطر الوطني",
  "بنك أبوظبي الأول",
  "بنك المشرق",
] as const;

export function isSaudiBank(value: string): value is (typeof saudiBanks)[number] {
  return (saudiBanks as readonly string[]).includes(value);
}

const ibanBankCodes: Record<string, (typeof saudiBanks)[number]> = {
  "05": "مصرف الإنماء", "10": "البنك الأهلي السعودي", "15": "بنك البلاد",
  "20": "بنك الرياض", "30": "البنك العربي الوطني", "45": "البنك السعودي الأول",
  "50": "البنك السعودي الأول", "55": "البنك السعودي الفرنسي", "60": "بنك الجزيرة",
  "65": "البنك السعودي للاستثمار", "71": "بنك البحرين الوطني", "75": "بنك الكويت الوطني",
  "76": "بنك مسقط", "80": "مصرف الراجحي", "81": "دويتشه بنك",
  "82": "البنك الوطني الباكستاني", "84": "بنك زراعات التركي", "86": "جي بي مورغان تشيس",
  "87": "البنك الصناعي والتجاري الصيني", "90": "بنك الخليج الدولي - السعودية",
  "95": "بنك الإمارات دبي الوطني",
};

export function normalizeSaudiIban(value: unknown) {
  const digits = String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^SA*/, "");
  return `SA${digits.slice(0, 22)}`;
}

export function formatSaudiIban(value: unknown) {
  return normalizeSaudiIban(value).match(/.{1,4}/g)?.join(" ") || "SA";
}

export function bankNameFromSaudiIban(value: unknown) {
  const iban = normalizeSaudiIban(value);
  return iban.length >= 6 ? ibanBankCodes[iban.slice(4, 6)] || null : null;
}

export function isValidSaudiIban(value: unknown) {
  const iban = normalizeSaudiIban(value);
  if (!/^SA\d{22}$/.test(iban) || !bankNameFromSaudiIban(iban)) return false;
  const rearranged = `${iban.slice(4)}${iban.slice(0, 4)}`.replace(/[A-Z]/g, letter => String(letter.charCodeAt(0) - 55));
  let remainder = 0;
  for (const digit of rearranged) remainder = (remainder * 10 + Number(digit)) % 97;
  return remainder === 1;
}
