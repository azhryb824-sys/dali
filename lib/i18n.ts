import { adminUiTranslations } from "@/lib/i18n-admin-catalog";
import { generatedUiTranslations } from "@/lib/i18n-generated-catalog";
import { generatedUiTemplates } from "@/lib/i18n-generated-templates";
import { publicUiTranslations } from "@/lib/i18n-public-catalog";

export const supportedLocales = ["ar", "en", "bn"] as const;
export type AppLocale = typeof supportedLocales[number];
export const localeCookieName = "dali_locale";
export function isAppLocale(value: unknown): value is AppLocale { return typeof value === "string" && supportedLocales.includes(value as AppLocale); }
/** Preserve old Urdu preferences by migrating them to Bengali instead of breaking sign-in. */
export function normalizeAppLocale(value: unknown): AppLocale | null { return value === "ur" ? "bn" : isAppLocale(value) ? value : null; }
export function localeDirection(locale: AppLocale) { return locale === "ar" ? "rtl" : "ltr"; }
export const localeNames: Record<AppLocale,string> = { ar: "العربية", en: "English", bn: "বাংলা" };

type Translation = { en: string; ur?: string; bn?: string };
export const uiTranslations: Record<string,Translation> = {
  "الرئيسية":{en:"Home",ur:"مرکزی صفحہ"},"من نحن":{en:"About us",ur:"ہمارے بارے میں"},"خدماتنا":{en:"Services",ur:"ہماری خدمات"},"المقاولات":{en:"Contracting",ur:"تعمیرات"},"القطاعات":{en:"Sectors",ur:"شعبے"},"مناطق الخدمة":{en:"Service areas",ur:"خدمات کے علاقے"},"رمضان والحج":{en:"Ramadan & Hajj",ur:"رمضان اور حج"},"المعرفة":{en:"Insights",ur:"معلومات"},"اطلب عرض سعر":{en:"Request a quotation",ur:"قیمت کی پیشکش طلب کریں"},"ابحث في الموقع":{en:"Search the website",ur:"ویب سائٹ میں تلاش کریں"},
  "النظام الإداري الداخلي":{en:"Internal Administration System",ur:"اندرونی انتظامی نظام"},"تسجيل الدخول الآمن":{en:"Secure sign in",ur:"محفوظ لاگ اِن"},"رقم الهوية / الإقامة":{en:"National ID / Iqama",ur:"قومی شناخت / اقامہ"},"كلمة المرور":{en:"Password",ur:"پاس ورڈ"},"دخول آمن":{en:"Sign in securely",ur:"محفوظ لاگ اِن"},"نسيت كلمة المرور؟":{en:"Forgot password?",ur:"پاس ورڈ بھول گئے؟"},"تسجيل الخروج":{en:"Sign out",ur:"لاگ آؤٹ"},
  "نظرة عامة":{en:"Overview",ur:"جائزہ"},"إدارة الموظفين":{en:"Employee Management",ur:"ملازمین کا انتظام"},"الإدارة المالية":{en:"Financial Management",ur:"مالی انتظام"},"الشؤون القانونية":{en:"Legal Affairs",ur:"قانونی امور"},"شؤون العمالة":{en:"Workforce Affairs",ur:"افرادی قوت کے امور"},"المبيعات والتشغيل":{en:"Sales & Operations",ur:"فروخت اور آپریشنز"},"المقاولات والمشروعات":{en:"Contracting & Projects",ur:"تعمیرات اور منصوبے"},"المحادثات المباشرة":{en:"Live Conversations",ur:"براہ راست گفتگو"},"مركز المستندات":{en:"Document Center",ur:"دستاویزات مرکز"},"إدارة الموقع الإلكتروني":{en:"Website Management",ur:"ویب سائٹ انتظام"},"إدارة المستخدمين":{en:"User Management",ur:"صارفین کا انتظام"},"إدارة المناديب":{en:"Representative Management",ur:"نمائندگان کا انتظام"},"الإشعارات":{en:"Notifications",ur:"اطلاعات"},"البحث":{en:"Search",ur:"تلاش"},
  "لوحة المتابعة":{en:"Dashboard",ur:"ڈیش بورڈ"},"مركز الإشعارات":{en:"Notification Center",ur:"اطلاعات مرکز"},"الهوية البصرية":{en:"Brand Identity",ur:"برانڈ شناخت"},"إدارة الموقع":{en:"Website Management",ur:"ویب سائٹ انتظام"},"المستخدمون والصلاحيات":{en:"Users & Permissions",ur:"صارفین اور اجازتیں"},"النظام الإداري":{en:"Administration System",ur:"انتظامی نظام"},"أقسام النظام":{en:"System sections",ur:"نظام کے حصے"},"اتصال محمي":{en:"Secure connection",ur:"محفوظ کنکشن"},"تُطبّق الصلاحيات من جهة الخادم.":{en:"Permissions are enforced by the server.",ur:"اجازتیں سرور کی جانب سے نافذ ہوتی ہیں۔"},"إغلاق القائمة":{en:"Close menu",ur:"مینو بند کریں"},"فتح القائمة":{en:"Open menu",ur:"مینو کھولیں"},"فتح مركز الإشعارات":{en:"Open notification center",ur:"اطلاعات مرکز کھولیں"},"شركة دالي للتشغيل والصيانة":{en:"Dally Operation & Maintenance Co.",ur:"ڈالی آپریشن اینڈ مینٹیننس کمپنی"},
  "إضافة":{en:"Add",ur:"شامل کریں"},"حفظ":{en:"Save",ur:"محفوظ کریں"},"إلغاء":{en:"Cancel",ur:"منسوخ کریں"},"حذف":{en:"Delete",ur:"حذف کریں"},"تعديل":{en:"Edit",ur:"ترمیم کریں"},"اعتماد":{en:"Approve",ur:"منظور کریں"},"رفض":{en:"Reject",ur:"مسترد کریں"},"تنزيل":{en:"Download",ur:"ڈاؤن لوڈ"},"مشاركة":{en:"Share",ur:"شیئر کریں"},"إغلاق":{en:"Close",ur:"بند کریں"},"عرض الحالة":{en:"View status",ur:"حالت دیکھیں"},"جارٍ التحميل...":{en:"Loading...",ur:"لوڈ ہو رہا ہے..."},"لا توجد نتائج":{en:"No results",ur:"کوئی نتائج نہیں"},"غير محدد":{en:"Not specified",ur:"متعین نہیں"},"نشط":{en:"Active",ur:"فعال"},"غير نشط":{en:"Inactive",ur:"غیر فعال"},"معتمد":{en:"Approved",ur:"منظور شدہ"},"مسودة":{en:"Draft",ur:"مسودہ"},"مرفوض":{en:"Rejected",ur:"مسترد"},"ملغى":{en:"Cancelled",ur:"منسوخ"},
  "بحث":{en:"Search",ur:"تلاش"},"تحديث البيانات":{en:"Refresh data",ur:"ڈیٹا تازہ کریں"},"التفاصيل":{en:"Details",ur:"تفصیلات"},"الإجراءات":{en:"Actions",ur:"کارروائیاں"},"الحالة":{en:"Status",ur:"حالت"},"الاسم":{en:"Name",ur:"نام"},"البريد الإلكتروني":{en:"Email",ur:"ای میل"},"رقم الجوال":{en:"Mobile number",ur:"موبائل نمبر"},"التاريخ":{en:"Date",ur:"تاریخ"},"ملاحظات":{en:"Notes",ur:"نوٹس"},"التالي":{en:"Next",ur:"اگلا"},"السابق":{en:"Previous",ur:"پچھلا"},"تأكيد":{en:"Confirm",ur:"تصدیق کریں"},"إرسال":{en:"Send",ur:"بھیجیں"},"طباعة":{en:"Print",ur:"پرنٹ"},"معاينة":{en:"Preview",ur:"پیش منظر"},
  "العملاء والفرص":{en:"Clients & Opportunities",ur:"گاہک اور مواقع"},"عروض الأسعار":{en:"Quotations",ur:"قیمت کی پیشکشیں"},"العقود والدفعات":{en:"Contracts & Payments",ur:"معاہدے اور ادائیگیاں"},"أوامر التشغيل":{en:"Work Orders",ur:"کام کے احکامات"},"الدوام":{en:"Attendance",ur:"حاضری"},"إنشاء عقد":{en:"Create contract",ur:"معاہدہ بنائیں"},"إنشاء عرض سعر":{en:"Create quotation",ur:"قیمت کی پیشکش بنائیں"},"اعتماد عرض السعر":{en:"Approve quotation",ur:"قیمت کی پیشکش منظور کریں"},"مشاركة واتساب":{en:"Share on WhatsApp",ur:"واٹس ایپ پر شیئر کریں"},"تحويل إلى عقد":{en:"Convert to contract",ur:"معاہدے میں تبدیل کریں"},
  "إدارة المناديب والطلبات":{en:"Representatives & Requests",ur:"نمائندگان اور درخواستیں"},"مناديب المبيعات":{en:"Sales representatives",ur:"فروخت کے نمائندے"},"مناديب المشتريات":{en:"Purchasing representatives",ur:"خریداری کے نمائندے"},"صندوق طلبات المناديب":{en:"Representative Request Inbox",ur:"نمائندہ درخواست ان باکس"},"إرسال طلب مندوب":{en:"Submit representative request",ur:"نمائندہ درخواست بھیجیں"},"إضافة مندوب":{en:"Add representative",ur:"نمائندہ شامل کریں"},"طلب تعديل":{en:"Request changes",ur:"ترمیم طلب کریں"},"رفض نهائي":{en:"Final rejection",ur:"حتمی مسترد"},
  "اللغة":{en:"Language",ur:"زبان"},"اختيار اللغة":{en:"Choose language",ur:"زبان منتخب کریں"},"تغيير اللغة":{en:"Change language",ur:"زبان تبدیل کریں"},"حفظ اللغة":{en:"Save language",ur:"زبان محفوظ کریں"},"العربية":{en:"Arabic",ur:"عربی"},"الإنجليزية":{en:"English",ur:"انگریزی"},"الأوردية":{en:"Urdu",ur:"اردو"},
  "جميع الحقوق محفوظة.":{en:"All rights reserved.",ur:"جملہ حقوق محفوظ ہیں۔"},"الشروط والأحكام":{en:"Terms & Conditions",ur:"شرائط و ضوابط"},"سياسة الخصوصية":{en:"Privacy Policy",ur:"رازداری کی پالیسی"},"الأسئلة الشائعة":{en:"FAQ",ur:"عمومی سوالات"},"الوظائف":{en:"Careers",ur:"ملازمتیں"},"الشركة":{en:"Company",ur:"کمپنی"},"الخدمات":{en:"Services",ur:"خدمات"},"التواصل والحوكمة":{en:"Contact & Governance",ur:"رابطہ اور گورننس"}
};
Object.assign(uiTranslations,{
  "العميل":{en:"Client",ur:"گاہک"},"العملاء":{en:"Clients",ur:"گاہک"},"النوع":{en:"Type",ur:"قسم"},"المرجع":{en:"Reference",ur:"حوالہ"},"الإجراء":{en:"Action",ur:"کارروائی"},"المسؤول":{en:"Owner",ur:"ذمہ دار"},"المبلغ":{en:"Amount",ur:"رقم"},"القيمة":{en:"Value",ur:"قدر"},"البيان":{en:"Description",ur:"تفصیل"},"الملف":{en:"File",ur:"فائل"},"المستند":{en:"Document",ur:"دستاویز"},"نوع المستند":{en:"Document type",ur:"دستاویز کی قسم"},"نوع الملف":{en:"File type",ur:"فائل کی قسم"},
  "العامل":{en:"Worker",ur:"کارکن"},"الموظف":{en:"Employee",ur:"ملازم"},"موظف":{en:"Employee",ur:"ملازم"},"المهنة":{en:"Profession",ur:"پیشہ"},"الجنسية":{en:"Nationality",ur:"قومیت"},"القسم":{en:"Department",ur:"شعبہ"},"الإدارة":{en:"Management",ur:"انتظامیہ"},"الدور":{en:"Role",ur:"کردار"},"المسمى":{en:"Title",ur:"عہدہ"},"المسمى الوظيفي":{en:"Job title",ur:"ملازمت کا عنوان"},"الرقم الوظيفي":{en:"Employee number",ur:"ملازم نمبر"},"البريد الوظيفي":{en:"Work email",ur:"دفتری ای میل"},"تاريخ الالتحاق":{en:"Joining date",ur:"شمولیت کی تاریخ"},
  "العقد":{en:"Contract",ur:"معاہدہ"},"عقد":{en:"Contract",ur:"معاہدہ"},"العقد المرتبط":{en:"Related contract",ur:"متعلقہ معاہدہ"},"نهاية العقد":{en:"Contract end",ur:"معاہدے کا اختتام"},"الدفعة":{en:"Installment",ur:"قسط"},"الاستحقاق":{en:"Due",ur:"واجب الادا"},"تاريخ الاستحقاق":{en:"Due date",ur:"واجب الادا تاریخ"},"تاريخ الإصدار":{en:"Issue date",ur:"اجراء کی تاریخ"},"نسبة الضريبة %":{en:"Tax rate %",ur:"ٹیکس کی شرح %"},"تطبيق الضريبة":{en:"Apply tax",ur:"ٹیکس لاگو کریں"},"بدون ضريبة":{en:"Tax exempt",ur:"بغیر ٹیکس"},
  "الحساب البنكي":{en:"Bank account",ur:"بینک اکاؤنٹ"},"الحسابات البنكية":{en:"Bank accounts",ur:"بینک اکاؤنٹس"},"البنك":{en:"Bank",ur:"بینک"},"اسم البنك":{en:"Bank name",ur:"بینک کا نام"},"رقم الآيبان":{en:"IBAN",ur:"آئی بان"},"نقدي":{en:"Cash",ur:"نقد"},"سند قبض":{en:"Receipt voucher",ur:"وصولی واؤچر"},"سند صرف":{en:"Payment voucher",ur:"ادائیگی واؤچر"},"دليل الحسابات":{en:"Chart of accounts",ur:"اکاؤنٹس چارٹ"},"ميزان المراجعة":{en:"Trial balance",ur:"ٹرائل بیلنس"},"مركز التكلفة":{en:"Cost center",ur:"لاگت مرکز"},"الإيرادات":{en:"Revenue",ur:"آمدنی"},
  "المدينة":{en:"City",ur:"شہر"},"المنطقة":{en:"Region",ur:"علاقہ"},"العنوان":{en:"Address",ur:"پتہ"},"موقع العمل":{en:"Work location",ur:"کام کی جگہ"},"موقع تقديم الخدمة":{en:"Service location",ur:"خدمت کی جگہ"},"المشروع":{en:"Project",ur:"منصوبہ"},"مدير المشروع":{en:"Project manager",ur:"پروجیکٹ مینیجر"},"نوع المشروع":{en:"Project type",ur:"منصوبے کی قسم"},"اختر المشروع":{en:"Select project",ur:"منصوبہ منتخب کریں"},"اختر المدينة":{en:"Select city",ur:"شہر منتخب کریں"},
  "الجهة":{en:"Entity",ur:"ادارہ"},"الجهة المستفيدة":{en:"Beneficiary",ur:"فائدہ اٹھانے والا ادارہ"},"قطاع الأعمال":{en:"Business sector",ur:"کاروباری شعبہ"},"الفرصة":{en:"Opportunity",ur:"موقع"},"المندوب":{en:"Representative",ur:"نمائندہ"},"نوع المندوب":{en:"Representative type",ur:"نمائندے کی قسم"},"دون مندوب":{en:"No representative",ur:"بغیر نمائندہ"},
  "نشط":{en:"Active",ur:"فعال"},"موقوف":{en:"Suspended",ur:"معطل"},"معلق":{en:"Pending",ur:"زیر التوا"},"جارية":{en:"In progress",ur:"جاری"},"مغلقة":{en:"Closed",ur:"بند"},"منشور":{en:"Published",ur:"شائع شدہ"},"عالية":{en:"High",ur:"اعلیٰ"},"حاضر":{en:"Present",ur:"حاضر"},"غائب":{en:"Absent",ur:"غیر حاضر"},"إجازة":{en:"Leave",ur:"رخصت"},"مرضي":{en:"Sick leave",ur:"بیماری کی رخصت"},
  "اختر الموظف":{en:"Select employee",ur:"ملازم منتخب کریں"},"اختر العامل":{en:"Select worker",ur:"کارکن منتخب کریں"},"إلزامي":{en:"Required",ur:"لازمی"},"أخرى":{en:"Other",ur:"دیگر"},"من":{en:"From",ur:"سے"},"إلى":{en:"To",ur:"تک"},"الوحدة":{en:"Unit",ur:"اکائی"},"التصنيف":{en:"Category",ur:"زمرہ"},"رقم الجوال":{en:"Mobile number",ur:"موبائل نمبر"},"الجوال":{en:"Mobile",ur:"موبائل"},"الاسم الكامل":{en:"Full name",ur:"مکمل نام"},"تنزيل PDF":{en:"Download PDF",ur:"پی ڈی ایف ڈاؤن لوڈ"},"تعليم الكل كمقروء":{en:"Mark all as read",ur:"سب کو پڑھا ہوا نشان زد کریں"},"تنتظر الرد":{en:"Awaiting reply",ur:"جواب کا انتظار"},"يحتاج إجراء":{en:"Action required",ur:"کارروائی درکار"}
  ,"مركز العمليات":{en:"Operations Center",ur:"آپریشنز مرکز"},"مرحباً،":{en:"Welcome,",ur:"خوش آمدید،"},"متابعة موحّدة لأعمال الشركة من لوحة واحدة.":{en:"A unified view of company operations from one dashboard.",ur:"ایک ڈیش بورڈ سے کمپنی کے کام کا جامع جائزہ۔"},"الموظفون":{en:"Employees",ur:"ملازمین"},"السجلات المالية":{en:"Financial records",ur:"مالی ریکارڈ"},"الملفات القانونية":{en:"Legal files",ur:"قانونی فائلیں"},"العمالة":{en:"Workforce",ur:"افرادی قوت"},"المحادثات":{en:"Conversations",ur:"گفتگو"},"مستندات الشركة":{en:"Company documents",ur:"کمپنی کی دستاویزات"},
  "الأقسام التشغيلية":{en:"Operational departments",ur:"آپریشنل شعبے"},"الوحدات المتاحة وفقاً لصلاحية حسابك":{en:"Modules available under your account permissions",ur:"آپ کے اکاؤنٹ کی اجازتوں کے مطابق دستیاب ماڈیولز"},"سجل النشاط":{en:"Activity log",ur:"سرگرمی لاگ"},"آخر التحديثات الإدارية":{en:"Latest administrative updates",ur:"تازہ ترین انتظامی اپ ڈیٹس"},"تحديث سجل إداري":{en:"Administrative record updated",ur:"انتظامی ریکارڈ اپ ڈیٹ"},"بدء جلسة إدارية آمنة":{en:"Secure administrative session started",ur:"محفوظ انتظامی سیشن شروع"},"إنهاء جلسة إدارية":{en:"Administrative session ended",ur:"انتظامی سیشن ختم"},"انتهاء جلسة إدارية":{en:"Administrative session expired",ur:"انتظامی سیشن کی مدت ختم"},
  "ملفات الموظفين وسلم الوظائف وبيانات التعيين":{en:"Employee files, job grades, and appointment data",ur:"ملازمین کی فائلیں، ملازمت کے درجات اور تقرری کا ڈیٹا"},"الفواتير والمصروفات والرواتب والأرصدة المالية":{en:"Invoices, expenses, payroll, and financial balances",ur:"انوائس، اخراجات، تنخواہیں اور مالی بیلنس"},"العقود والقضايا والتراخيص ومواعيد التجديد":{en:"Contracts, cases, licenses, and renewal dates",ur:"معاہدے، مقدمات، لائسنس اور تجدید کی تاریخیں"},"بيانات العمال والتوزيع على المواقع وطلبات العملاء":{en:"Worker data, site allocation, and client requests",ur:"کارکنوں کا ڈیٹا، سائٹ تقسیم اور گاہک کی درخواستیں"},
  "مالك النظام":{en:"System owner",ur:"نظام کا مالک"},"مشرف النظام":{en:"System administrator",ur:"سسٹم ایڈمنسٹریٹر"},"صلاحية عامة":{en:"Full access",ur:"مکمل رسائی"},"البحث في جميع أقسام النظام...":{en:"Search across all system sections...",ur:"نظام کے تمام حصوں میں تلاش کریں..."},"لا يوجد نشاط مسجّل بعد.":{en:"No activity has been recorded yet.",ur:"ابھی کوئی سرگرمی ریکارڈ نہیں ہوئی۔"},"الحساب مفعّل":{en:"Account active",ur:"اکاؤنٹ فعال"},"لم يُحدَّد قسمك بعد":{en:"Your department has not been assigned yet",ur:"آپ کا شعبہ ابھی مقرر نہیں ہوا"},"الصلاحية الحالية":{en:"Current permission",ur:"موجودہ اجازت"}
});
Object.assign(uiTranslations,publicUiTranslations,adminUiTranslations);
Object.assign(uiTranslations, {
  "الرئيسية": { ...uiTranslations["الرئيسية"], bn: "হোম" },
  "من نحن": { ...uiTranslations["من نحن"], bn: "আমাদের সম্পর্কে" },
  "خدماتنا": { ...uiTranslations["خدماتنا"], bn: "আমাদের সেবা" },
  "الخدمات": { ...uiTranslations["الخدمات"], bn: "সেবা" },
  "المقاولات": { ...uiTranslations["المقاولات"], bn: "নির্মাণ ও ঠিকাদারি" },
  "القطاعات": { ...uiTranslations["القطاعات"], bn: "খাতসমূহ" },
  "مناطق الخدمة": { ...uiTranslations["مناطق الخدمة"], bn: "সেবার এলাকা" },
  "رمضان والحج": { ...uiTranslations["رمضان والحج"], bn: "রমজান ও হজ" },
  "المعرفة": { ...uiTranslations["المعرفة"], bn: "তথ্যকেন্দ্র" },
  "اطلب عرض سعر": { ...uiTranslations["اطلب عرض سعر"], bn: "মূল্য প্রস্তাব চান" },
  "ابحث في الموقع": { ...uiTranslations["ابحث في الموقع"], bn: "ওয়েবসাইটে খুঁজুন" },
  "النظام الإداري الداخلي": { ...uiTranslations["النظام الإداري الداخلي"], bn: "অভ্যন্তরীণ প্রশাসনিক ব্যবস্থা" },
  "تسجيل الدخول الآمن": { ...uiTranslations["تسجيل الدخول الآمن"], bn: "নিরাপদ লগইন" },
  "رقم الهوية / الإقامة": { ...uiTranslations["رقم الهوية / الإقامة"], bn: "জাতীয় পরিচয়পত্র / ইকামা নম্বর" },
  "كلمة المرور": { ...uiTranslations["كلمة المرور"], bn: "পাসওয়ার্ড" },
  "دخول آمن": { ...uiTranslations["دخول آمن"], bn: "নিরাপদে প্রবেশ করুন" },
  "نسيت كلمة المرور؟": { ...uiTranslations["نسيت كلمة المرور؟"], bn: "পাসওয়ার্ড ভুলে গেছেন?" },
  "تسجيل الخروج": { ...uiTranslations["تسجيل الخروج"], bn: "লগআউট" },
  "نظرة عامة": { ...uiTranslations["نظرة عامة"], bn: "সারসংক্ষেপ" },
  "لوحة المتابعة": { ...uiTranslations["لوحة المتابعة"], bn: "ড্যাশবোর্ড" },
  "إدارة الموظفين": { ...uiTranslations["إدارة الموظفين"], bn: "কর্মচারী ব্যবস্থাপনা" },
  "الإدارة المالية": { ...uiTranslations["الإدارة المالية"], bn: "আর্থিক ব্যবস্থাপনা" },
  "الشؤون القانونية": { ...uiTranslations["الشؤون القانونية"], bn: "আইনগত বিষয়" },
  "شؤون العمالة": { ...uiTranslations["شؤون العمالة"], bn: "শ্রমিক বিষয়ক ব্যবস্থাপনা" },
  "المبيعات والتشغيل": { ...uiTranslations["المبيعات والتشغيل"], bn: "বিক্রয় ও পরিচালনা" },
  "المقاولات والمشروعات": { ...uiTranslations["المقاولات والمشروعات"], bn: "নির্মাণ ও প্রকল্প" },
  "مركز المستندات": { ...uiTranslations["مركز المستندات"], bn: "নথি কেন্দ্র" },
  "إدارة الموقع الإلكتروني": { ...uiTranslations["إدارة الموقع الإلكتروني"], bn: "ওয়েবসাইট ব্যবস্থাপনা" },
  "إدارة المستخدمين": { ...uiTranslations["إدارة المستخدمين"], bn: "ব্যবহারকারী ব্যবস্থাপনা" },
  "الإشعارات": { ...uiTranslations["الإشعارات"], bn: "বিজ্ঞপ্তি" },
  "البحث": { ...uiTranslations["البحث"], bn: "অনুসন্ধান" },
  "اللغة": { ...uiTranslations["اللغة"], bn: "ভাষা" },
  "اختيار اللغة": { ...uiTranslations["اختيار اللغة"], bn: "ভাষা নির্বাচন করুন" },
  "إضافة": { ...uiTranslations["إضافة"], bn: "যোগ করুন" },
  "حفظ": { ...uiTranslations["حفظ"], bn: "সংরক্ষণ করুন" },
  "إلغاء": { ...uiTranslations["إلغاء"], bn: "বাতিল" },
  "حذف": { ...uiTranslations["حذف"], bn: "মুছুন" },
  "تعديل": { ...uiTranslations["تعديل"], bn: "সম্পাদনা" },
  "اعتماد": { ...uiTranslations["اعتماد"], bn: "অনুমোদন" },
  "تنزيل": { ...uiTranslations["تنزيل"], bn: "ডাউনলোড" },
  "مشاركة": { ...uiTranslations["مشاركة"], bn: "শেয়ার করুন" },
  "إغلاق": { ...uiTranslations["إغلاق"], bn: "বন্ধ করুন" },
  "جارٍ التحميل...": { ...uiTranslations["جارٍ التحميل..."], bn: "লোড হচ্ছে..." },
  "لا توجد نتائج": { ...uiTranslations["لا توجد نتائج"], bn: "কোনো ফলাফল নেই" },
  "الحالة": { ...uiTranslations["الحالة"], bn: "অবস্থা" },
  "الاسم": { ...uiTranslations["الاسم"], bn: "নাম" },
  "البريد الإلكتروني": { ...uiTranslations["البريد الإلكتروني"], bn: "ইমেইল" },
  "رقم الجوال": { ...uiTranslations["رقم الجوال"], bn: "মোবাইল নম্বর" },
  "التاريخ": { ...uiTranslations["التاريخ"], bn: "তারিখ" },
  "ملاحظات": { ...uiTranslations["ملاحظات"], bn: "মন্তব্য" },
  "إرسال": { ...uiTranslations["إرسال"], bn: "পাঠান" },
  "تأكيد": { ...uiTranslations["تأكيد"], bn: "নিশ্চিত করুন" },
  "العقود والدفعات": { ...uiTranslations["العقود والدفعات"], bn: "চুক্তি ও কিস্তি" },
  "عروض الأسعار": { ...uiTranslations["عروض الأسعار"], bn: "মূল্য প্রস্তাব" },
  "الموظفون": { ...uiTranslations["الموظفون"], bn: "কর্মচারী" },
  "العمالة": { ...uiTranslations["العمالة"], bn: "শ্রমিক" },
  "تنزيل PDF": { ...uiTranslations["تنزيل PDF"], bn: "PDF ডাউনলোড" },
  "البنغالية": { en: "Bengali", bn: "বাংলা" },
});
for (const [source, generated] of Object.entries(generatedUiTranslations)) {
  uiTranslations[source] = { ...uiTranslations[source], ...generated } as Translation;
}
const dynamicUiTranslations:Array<{pattern:RegExp;en:(match:RegExpMatchArray)=>string;ur:(match:RegExpMatchArray)=>string;bn?:(match:RegExpMatchArray)=>string}>=[
  {pattern:/^مساحة عمل مهيأة لصلاحيات:\s*(.+)\.$/,en:m=>`Workspace configured for role: ${translateUi(m[1],"en")}.`,ur:m=>`کردار کے مطابق ورک اسپیس: ${m[1]}۔`,bn:m=>`ভূমিকা অনুযায়ী কর্মক্ষেত্র: ${m[1]}।`},
  {pattern:/^مساحة عملك في قسم\s+(.+)\.$/,en:m=>`Your workspace in the ${translateUi(m[1],"en")} department.`,ur:m=>`${m[1]} شعبے میں آپ کا ورک اسپیس۔`,bn:m=>`${m[1]} বিভাগে আপনার কর্মক্ষেত্র।`},
  {pattern:/^(\d+)\s+على رأس العمل$/,en:m=>`${m[1]} active employees`,ur:m=>`${m[1]} فعال ملازمین`},
  {pattern:/^(.+)\s+إجمالي مسجّل$/,en:m=>`${m[1]} total recorded`,ur:m=>`${m[1]} کل ریکارڈ`},
  {pattern:/^(\d+)\s+تنبيه خلال 45 يوماً$/,en:m=>`${m[1]} alerts within 45 days`,ur:m=>`45 دن میں ${m[1]} انتباہات`},
  {pattern:/^متاح:\s*(\d+)\s+·\s+جهة مستفيدة\s*(\d+)$/,en:m=>`Available: ${m[1]} · Beneficiaries: ${m[2]}`,ur:m=>`دستیاب: ${m[1]} · مستفید ادارے: ${m[2]}`},
  {pattern:/^تنتظر الرد:\s*(\d+)\s+·\s+رسالة غير مقروءة\s*(\d+)$/,en:m=>`Awaiting reply: ${m[1]} · Unread: ${m[2]}`,ur:m=>`جواب کی منتظر: ${m[1]} · غیر پڑھی: ${m[2]}`},
  {pattern:/^(\d+)\s+تنبيه انتهاء خلال 30 يوماً أو مستند منتهٍ$/,en:m=>`${m[1]} expiry alerts within 30 days or expired documents`,ur:m=>`30 دن میں میعاد ختم ہونے یا ختم شدہ دستاویزات کے ${m[1]} انتباہات`},
  {pattern:/^(\d+)\s+موظف$/,en:m=>`${m[1]} employees`,ur:m=>`${m[1]} ملازمین`},
  {pattern:/^(\d+)\s+سجل$/,en:m=>`${m[1]} records`,ur:m=>`${m[1]} ریکارڈ`},
  {pattern:/^(\d+)\s+تنبيه$/,en:m=>`${m[1]} alerts`,ur:m=>`${m[1]} انتباہات`},
  {pattern:/^(\d+)\s+طلب$/,en:m=>`${m[1]} requests`,ur:m=>`${m[1]} درخواستیں`}
];
function escapeRegExp(value:string){return value.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}
const compiledGeneratedUiTemplates=generatedUiTemplates.map(item=>{
  const indexes:number[]=[];
  let sourceIndex=0;
  let pattern="^";
  for(const match of item.source.matchAll(/\{\{(\d+)\}\}/g)){
    const matchIndex=match.index??0;
    pattern+=escapeRegExp(item.source.slice(sourceIndex,matchIndex)).replaceAll(" ","\\s+");
    pattern+="(.*?)";
    indexes.push(Number(match[1]));
    sourceIndex=matchIndex+match[0].length;
  }
  pattern+=escapeRegExp(item.source.slice(sourceIndex)).replaceAll(" ","\\s+")+"$";
  return{...item,indexes,pattern:new RegExp(pattern,"s")};
});
const calendarWords:Record<AppLocale,Record<string,string>>={ar:{},en:{"الأحد":"Sunday","الاثنين":"Monday","الثلاثاء":"Tuesday","الأربعاء":"Wednesday","الخميس":"Thursday","الجمعة":"Friday","السبت":"Saturday","يناير":"January","فبراير":"February","مارس":"March","أبريل":"April","مايو":"May","يونيو":"June","يوليو":"July","أغسطس":"August","سبتمبر":"September","أكتوبر":"October","نوفمبر":"November","ديسمبر":"December"},bn:{"الأحد":"রবিবার","الاثنين":"সোমবার","الثلاثاء":"মঙ্গলবার","الأربعاء":"বুধবার","الخميس":"বৃহস্পতিবার","الجمعة":"শুক্রবার","السبت":"শনিবার","يناير":"জানুয়ারি","فبراير":"ফেব্রুয়ারি","مارس":"মার্চ","أبريل":"এপ্রিল","مايو":"মে","يونيو":"জুন","يوليو":"জুলাই","أغسطس":"আগস্ট","سبتمبر":"সেপ্টেম্বর","أكتوبر":"অক্টোবর","نوفمبر":"নভেম্বর","ديسمبر":"ডিসেম্বর"}};
export function translateUi(value:string,locale:AppLocale){
  if(locale==="ar")return value;
  const normalized=value.replace(/\s+/g," ").trim();
  const exact=uiTranslations[value]?.[locale]??uiTranslations[normalized]?.[locale];
  if(exact)return exact;
  for(const item of dynamicUiTranslations){const match=normalized.match(item.pattern);const translate=item[locale];if(match&&translate)return translate(match)}
  for(const item of compiledGeneratedUiTemplates){
    const match=normalized.match(item.pattern);
    if(!match)continue;
    let translated=item[locale];
    item.indexes.forEach((placeholderIndex,captureIndex)=>{
      const captured=match[captureIndex+1];
      const nested=uiTranslations[captured]?.[locale]??captured;
      translated=translated.replaceAll(`{{${placeholderIndex}}}`,nested);
    });
    return translated;
  }
  let translated=value;
  for(const[arabic,replacement]of Object.entries(calendarWords[locale]))translated=translated.replace(arabic,replacement);
  return translated;
}
