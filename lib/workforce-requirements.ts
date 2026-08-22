export type ProfessionRequirement = { code: string; label: string };

export const workforceNationalities = [
  "السعودية", "السودانية", "المصرية", "اليمنية", "السورية", "الأردنية", "الفلسطينية", "اللبنانية",
  "الباكستانية", "الهندية", "البنغلاديشية", "النيبالية", "الفلبينية", "السريلانكية", "الإندونيسية",
  "الإثيوبية", "الإريترية", "الأوغندية", "الكينية", "الغانية", "المغربية", "التونسية", "الجزائرية",
  "الموريتانية", "التركية", "الأفغانية", "النيجيرية", "الصومالية", "أخرى",
] as const;

export const workforceProfessions: Array<{ label: string; requirements: ProfessionRequirement[] }> = [
  { label: "عامل تنظيف فندقي", requirements: [{ code: "hygiene_certificate", label: "شهادة النظافة والصحة المهنية" }, { code: "fitness_certificate", label: "شهادة اللياقة الطبية" }] },
  { label: "ويتر", requirements: [{ code: "food_safety_certificate", label: "شهادة سلامة الغذاء" }, { code: "fitness_certificate", label: "شهادة اللياقة الطبية" }] },
  { label: "عامل نظافة", requirements: [{ code: "hygiene_certificate", label: "شهادة النظافة والصحة المهنية" }, { code: "fitness_certificate", label: "شهادة اللياقة الطبية" }] },
  { label: "عامل ضيافة", requirements: [{ code: "food_safety_certificate", label: "شهادة سلامة الغذاء أو الضيافة" }, { code: "fitness_certificate", label: "شهادة اللياقة الطبية" }] },
  { label: "طباخ", requirements: [{ code: "food_safety_certificate", label: "شهادة سلامة الغذاء" }, { code: "fitness_certificate", label: "شهادة اللياقة الطبية" }] },
  { label: "مساعد طباخ", requirements: [{ code: "food_safety_certificate", label: "شهادة سلامة الغذاء" }, { code: "fitness_certificate", label: "شهادة اللياقة الطبية" }] },
  { label: "عامل مغسلة", requirements: [{ code: "safety_certificate", label: "شهادة السلامة المهنية" }] },
  { label: "عامل تحميل وتنزيل", requirements: [{ code: "safety_certificate", label: "شهادة السلامة المهنية" }, { code: "fitness_certificate", label: "شهادة اللياقة الطبية" }] },
  { label: "عامل مستودع", requirements: [{ code: "safety_certificate", label: "شهادة السلامة المهنية" }] },
  { label: "عامل إنشاءات", requirements: [{ code: "safety_certificate", label: "شهادة السلامة المهنية" }, { code: "fitness_certificate", label: "شهادة اللياقة الطبية" }] },
  { label: "كهربائي", requirements: [{ code: "professional_certificate", label: "شهادة مهنية في الكهرباء" }, { code: "electrical_safety", label: "شهادة السلامة الكهربائية" }] },
  { label: "سباك", requirements: [{ code: "professional_certificate", label: "شهادة مهنية في السباكة" }, { code: "safety_certificate", label: "شهادة السلامة المهنية" }] },
  { label: "نجار", requirements: [{ code: "professional_certificate", label: "شهادة مهنية في النجارة" }, { code: "safety_certificate", label: "شهادة السلامة المهنية" }] },
  { label: "حداد", requirements: [{ code: "safety_certificate", label: "شهادة السلامة المهنية" }] },
  { label: "لحام", requirements: [{ code: "welding_certificate", label: "شهادة تأهيل اللحام" }, { code: "safety_certificate", label: "شهادة السلامة المهنية" }] },
  { label: "دهان", requirements: [{ code: "professional_certificate", label: "شهادة مهنية أو إثبات خبرة في الدهان" }, { code: "safety_certificate", label: "شهادة السلامة المهنية" }] },
  { label: "مبلط", requirements: [{ code: "professional_certificate", label: "شهادة مهنية أو إثبات خبرة" }, { code: "safety_certificate", label: "شهادة السلامة المهنية" }] },
  { label: "عامل جبس", requirements: [{ code: "professional_certificate", label: "شهادة مهنية أو إثبات خبرة" }, { code: "safety_certificate", label: "شهادة السلامة المهنية" }] },
  { label: "فني تكييف وتبريد", requirements: [{ code: "hvac_certificate", label: "شهادة التكييف والتبريد" }, { code: "safety_certificate", label: "شهادة السلامة المهنية" }] },
  { label: "فني صيانة", requirements: [{ code: "maintenance_certificate", label: "شهادة فنية في الصيانة" }, { code: "safety_certificate", label: "شهادة السلامة المهنية" }] },
  { label: "مشغل معدات", requirements: [{ code: "equipment_license", label: "رخصة تشغيل المعدات" }, { code: "safety_certificate", label: "شهادة السلامة المهنية" }] },
  { label: "سائق معدات", requirements: [{ code: "driving_license", label: "رخصة القيادة المناسبة" }, { code: "equipment_license", label: "تصريح أو رخصة تشغيل المعدة" }] },
  { label: "مشرف موقع", requirements: [{ code: "supervision_certificate", label: "شهادة الإشراف أو المؤهل المهني" }, { code: "safety_certificate", label: "شهادة السلامة المهنية" }] },
  { label: "مشرف عمال", requirements: [{ code: "supervision_certificate", label: "شهادة الإشراف أو إثبات الخبرة" }, { code: "safety_certificate", label: "شهادة السلامة المهنية" }] },
  { label: "حارس أمن", requirements: [{ code: "security_license", label: "ترخيص أو تأهيل الحراسات الأمنية" }] },
  { label: "سائق", requirements: [{ code: "driving_license", label: "رخصة القيادة المناسبة" }] },
  { label: "مندوب توصيل", requirements: [{ code: "driving_license", label: "رخصة القيادة المناسبة" }] },
  { label: "أخرى", requirements: [{ code: "professional_evidence", label: "شهادة مهنية أو إثبات خبرة" }] },
];

export function requirementsForProfession(profession: string) {
  return workforceProfessions.find((item) => item.label === profession)?.requirements ?? workforceProfessions.at(-1)!.requirements;
}
