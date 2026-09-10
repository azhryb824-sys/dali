type ReviewedTranslation = { en: string; bn: string };

/**
 * Human-reviewed overrides for operational terms whose literal machine
 * translation can change their business meaning. These entries intentionally
 * load after the generated catalog.
 */
export const reviewedUiTranslations: Record<string, ReviewedTranslation> = {
  "المهام": { en: "Tasks", bn: "কাজ" },
  "المهام والتذكيرات": { en: "Tasks & Reminders", bn: "কাজ ও অনুস্মারক" },
  "قائمة المهام والتذكيرات": { en: "Tasks & Reminders List", bn: "কাজ ও অনুস্মারকের তালিকা" },
  "مهامك وتذكيراتك في مكان واحد": { en: "Your tasks and reminders in one place", bn: "আপনার কাজ ও অনুস্মারক এক জায়গায়" },
  "العروض": { en: "Quotations", bn: "মূল্যপ্রস্তাব" },
  "عروض الأسعار": { en: "Quotations", bn: "মূল্যপ্রস্তাব" },
  "الخطابات": { en: "Letters", bn: "চিঠিপত্র" },
  "العقود والعروض والخطابات": { en: "Contracts, Quotations & Letters", bn: "চুক্তি, মূল্যপ্রস্তাব ও চিঠিপত্র" },
  "العقود وعروض الأسعار والخطابات": { en: "Contracts, Quotations & Letters", bn: "চুক্তি, মূল্যপ্রস্তাব ও চিঠিপত্র" },
  "الخطابات الرسمية": { en: "Official Letters", bn: "সরকারি চিঠিপত্র" },
  "اعتماد الخطاب": { en: "Approve letter", bn: "চিঠি অনুমোদন করুন" },
  "إغلاق نموذج تعديل الخطاب": { en: "Close letter edit form", bn: "চিঠি সম্পাদনা ফর্ম বন্ধ করুন" },
  "إلغاء الخطاب": { en: "Cancel letter", bn: "চিঠি বাতিল করুন" },
  "تعديل الخطاب الرسمي": { en: "Edit official letter", bn: "সরকারি চিঠি সম্পাদনা করুন" },
  "تعذر إنشاء الخطاب": { en: "Could not create the letter", bn: "চিঠি তৈরি করা যায়নি" },
  "تعذر تحميل الخطابات": { en: "Could not load letters", bn: "চিঠিগুলো লোড করা যায়নি" },
  "تعذر تعديل الخطاب": { en: "Could not update the letter", bn: "চিঠি হালনাগাদ করা যায়নি" },
  "تم إنشاء مسودة الخطاب.": { en: "Letter draft created.", bn: "চিঠির খসড়া তৈরি হয়েছে।" },
  "تم حفظ تعديلات الخطاب.": { en: "Letter changes saved.", bn: "চিঠির পরিবর্তনগুলো সংরক্ষিত হয়েছে।" },
  "موضوع الخطاب": { en: "Letter subject", bn: "চিঠির বিষয়" },
  "نص الخطاب": { en: "Letter body", bn: "চিঠির মূল লেখা" },
  "نسخ الخطابات القابلة للتنزيل": { en: "Downloadable letter versions", bn: "ডাউনলোডযোগ্য চিঠির সংস্করণ" },
  "مواصفات الورق الرسمي وبطاقة العمل والمظاريف والعروض والمستندات.": { en: "Specifications for letterhead, business cards, envelopes, quotations, and documents.", bn: "লেটারহেড, ব্যবসায়িক কার্ড, খাম, মূল্যপ্রস্তাব ও নথির নির্দিষ্টকরণ।" },
  "الحضور والجلسات": { en: "Attendance & Sessions", bn: "উপস্থিতি ও সেশন" },
  "نقص الدوام والرواتب": { en: "Attendance Shortfalls & Payroll", bn: "উপস্থিতির ঘাটতি ও বেতন" },
  "على رأس العمل": { en: "Active", bn: "কর্মরত" },
  "جهة مستفيدة": { en: "beneficiary", bn: "সুবিধাভোগী প্রতিষ্ঠান" },
  "لا توجد استحقاقات موظفين عاجلة": { en: "No urgent employee compliance deadlines", bn: "কর্মচারীদের কোনো জরুরি কমপ্লায়েন্স সময়সীমা নেই" },
  "إغلاق خامل 20:00": { en: "Idle sign-out at 20:00", bn: "নিষ্ক্রিয় থাকলে 20:00-এ সাইন-আউট" },
  "غير مصرح": { en: "Not authorized", bn: "অনুমোদিত নয়" },
  "غير مصرح بلوحة حوكمة الموظفين": { en: "You are not authorized to access the employee governance dashboard", bn: "কর্মচারী গভর্ন্যান্স ড্যাশবোর্ডে প্রবেশের অনুমতি নেই" },
  "رقم الآيبان": { en: "IBAN", bn: "আইবান" },
  "رقم الآيبان — اختياري": { en: "IBAN — optional", bn: "আইবান — ঐচ্ছিক" },
  "رقم الآيبان السعودي": { en: "Saudi IBAN", bn: "সৌদি আইবান" },
  "يبقى SA ثابتًا، وتضاف مسافة تلقائيًا بعد كل أربع خانات.": { en: "SA remains fixed, and a space is added automatically after every four characters.", bn: "SA অপরিবর্তিত থাকে এবং প্রতি চারটি অক্ষরের পর স্বয়ংক্রিয়ভাবে একটি স্পেস যোগ হয়।" },
  "اسم البنك — تلقائي": { en: "Bank name — automatic", bn: "ব্যাংকের নাম — স্বয়ংক্রিয়" },
  "حفظ وربط الملف": { en: "Save and link file", bn: "ফাইল সংরক্ষণ ও লিঙ্ক করুন" },
  "رفع الوثيقة وحفظها": { en: "Upload and save document", bn: "নথি আপলোড ও সংরক্ষণ করুন" },
};
