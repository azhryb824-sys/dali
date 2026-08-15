import { entryPath, getWebsiteContent, isCollectionVisible, type WebsiteCollectionKey } from "@/lib/website-content";

export async function getPublicSearchIndex() {
  const content = await getWebsiteContent();
  const staticItems = [
    { title: "الرئيسية", excerpt: content.home.heroDescription, href: "/", keywords: content.seo.focusKeywords },
    { title: "عن الشركة", excerpt: content.site.description, href: "/about", keywords: `${content.site.companyName} ${content.site.city} ${content.site.district}` },
    ...(content.visibility.hajj ? [{ title: "جاهزية موسم الحج", excerpt: "تخطيط السعة والفرق متعددة المهن لمواقع الخدمة في مكة.", href: "/hajj", keywords: "الحج موسم مشاعر مقدسة جاهزية تشغيل مكة عمالة موسمية" }] : []),
    { title: "طلب عرض سعر", excerpt: "أرسل المهن والأعداد والمدة وموقع العمل للحصول على عرض.", href: "/contact", keywords: "تواصل استفسار سعر عرض طلب خدمة" },
    { title: "المحادثة المباشرة", excerpt: "تواصل مع فريق دالي، مع رد آلي خارج ساعات الدوام.", href: "/contact#live-chat", keywords: "محادثة دعم رسائل دوام" },
    ...(content.visibility.faq ? [{ title: "الأسئلة الشائعة", excerpt: "إجابات عن العمالة والتشغيل والصيانة والعقود والتكلفة.", href: "/faq", keywords: "أسئلة عمالة تشغيل صيانة مكة" }] : []),
    { title: "الشكاوى والاقتراحات", excerpt: "إرسال ملاحظة برقم متابعة إلى النظام الإداري.", href: "/feedback", keywords: "شكوى اقتراح ملاحظة" },
    { title: "الخصوصية وحقوق أصحاب البيانات", excerpt: "أغراض جمع البيانات ومدد الاحتفاظ وطلبات الوصول والتصحيح والحذف.", href: "/privacy", keywords: "خصوصية حماية بيانات سدايا وصول تصحيح حذف" },
    { title: "الشروط والأحكام", excerpt: "ضوابط استخدام الموقع وطلبات عروض الأسعار والمستندات.", href: "/terms", keywords: "شروط استخدام مسؤولية عروض أسعار" },
  ];
  const managedItems = (Object.entries(content.collections) as [WebsiteCollectionKey, typeof content.collections[WebsiteCollectionKey]][]).flatMap(([key, entries]) => !isCollectionVisible(content, key) ? [] : entries.filter((entry) => entry.status === "published").map((entry) => ({
    title: entry.shortTitle || entry.title,
    excerpt: entry.summary,
    href: entryPath(key, entry),
    keywords: `${entry.focusKeywords} ${entry.tags.join(" ")} ${entry.title}`,
  })));
  return [...staticItems, ...managedItems];
}
