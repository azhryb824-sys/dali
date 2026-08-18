export const brandIdentityAssets = [
  { id: "brand-guidelines", title: "دليل الهوية البصرية الشامل", description: "المرجع المعتمد للشعار والألوان والخطوط واللغة البصرية والتطبيقات.", pages: "دليل شامل", category: "الدليل" },
  { id: "logo-usage", title: "دليل استخدام الشعار", description: "قواعد المساحة الآمنة، والأحجام، والخلفيات، والاستخدامات الصحيحة والخاطئة.", pages: "قواعد الشعار", category: "الشعار" },
  { id: "colors-typography", title: "الألوان والخطوط", description: "لوحة الألوان الرقمية والطباعة والنظام الطباعي العربي المعتمد.", pages: "مواصفات فنية", category: "النظام البصري" },
  { id: "digital-applications", title: "التطبيقات الرقمية", description: "قواعد تطبيق الهوية في الموقع والنظام الإداري والتطبيق والمنصات الرقمية.", pages: "واجهات رقمية", category: "التطبيقات" },
  { id: "stationery-applications", title: "المطبوعات الرسمية", description: "مواصفات الورق الرسمي وبطاقة العمل والمظاريف والعروض والمستندات.", pages: "مطبوعات", category: "التطبيقات" },
] as const;

export type BrandIdentityAssetId = (typeof brandIdentityAssets)[number]["id"];

export function isBrandIdentityAssetId(value: string): value is BrandIdentityAssetId {
  return brandIdentityAssets.some((item) => item.id === value);
}

