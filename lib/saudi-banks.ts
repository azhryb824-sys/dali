// Banks and licensed foreign bank branches operating in Saudi Arabia.
// Keep this list aligned with the Saudi Central Bank licensed entities register.
export const saudiBanks = [
  "البنك الأهلي السعودي",
  "مصرف الراجحي",
  "بنك الرياض",
  "البنك السعودي الأول",
  "البنك السعودي الفرنسي",
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
