"""Offline catalog builder; project strings never leave the local machine.

Prepare /tmp/dali-ui-translation-work.json with generate-missing-ui-translations.mjs,
then run this helper in an environment containing torch, transformers, sentencepiece,
and a locally cached alirezamsh/small100 model.
"""

import gc
import html
import json
import os
import re
from pathlib import Path

import torch
from transformers import M2M100ForConditionalGeneration, M2M100Tokenizer

WORK_FILE = Path("/tmp/dali-ui-translation-work.json")
CACHE_FILE = Path("/tmp/dali-ui-translations-cache.json")
ARABIC = re.compile(r"[ء-ي]")
BENGALI = re.compile(r"[\u0980-\u09ff]")
PLACEHOLDER = re.compile(r"\{\{(\d+)\}\}")
MODEL_NAME = "alirezamsh/small100"
CACHE_VERSION = "small100-pivot-v1"

MANUAL_EN = {
    "/1000 — الحد الأدنى 10 أحرف": "/1000 — Minimum 10 characters",
    "النسبة %": "Percentage %",
    "ساعة ·": "hour ·",
    "{{0}} · {{1}} مرفق": "{{0}} · {{1}} attachment(s)",
    "{{0}} بايت": "{{0}} bytes",
    "{{0}} بند · {{1}}": "{{0}} item(s) · {{1}}",
    "{{0}} تنبيه": "{{0}} alert(s)",
    "{{0}} تنبيه إقامة": "{{0}} Iqama alert(s)",
    "{{0}} تنتظر الرد": "{{0}} awaiting reply",
    "{{0}} سجل": "{{0}} record(s)",
    "{{0}} طلب": "{{0}} request(s)",
    "{{0}} كيلوبايت": "{{0}} kilobytes",
    "{{0}} مرتبط بالموارد البشرية": "{{0}} linked to Human Resources",
    "{{0}} مكالمة مرئية واردة": "{{0}} incoming video call(s)",
    "{{0}} ميجابايت": "{{0}} megabytes",
    "{{0}} يوم": "{{0}} day(s)",
    "{{0}}س {{1}}د": "{{0}}h {{1}}m",
    "أرغب في التقديم على: {{0}}. اذكر خبرتك ومؤهلاتك بإيجاز.": "I would like to apply for: {{0}}. Briefly describe your experience and qualifications.",
    "أقل من هذا التوزيع في السجلات بفارق {{0}}": "The records are below this allocation by {{0}}",
    "الدفعة {{0}}": "Installment {{0}}",
    "السلام عليكم {{0}}، نرفق لكم عرض السعر {{1}}. رابط PDF الآمن: {{2}}": "Hello {{0}}, please find quotation {{1}} attached. Secure PDF link: {{2}}",
    "السلام عليكم، نرفق لكم فاتورة {{0}} للعقد {{1}}. رابط PDF الآمن: {{2}}": "Hello, please find invoice {{0}} for contract {{1}} attached. Secure PDF link: {{2}}",
    "العقد {{0}} · الرخصة {{1}}": "Contract {{0}} · License {{1}}",
    "العودة {{0}}": "Team returns {{0}}",
    "بعد {{0}} شهر من بداية العقد": "{{0}} month(s) after the contract start date",
    "بعد نحو {{0}} دقيقة": "After about {{0}} minute(s)",
    "تُحدّث الجهة والموقع من العقد {{0}}. لإلغاء الإسناد أو تغييره افتح إدارة العقد.": "The entity and location are updated from contract {{0}}. To cancel or change the assignment, open Contract Management.",
    "تستحق في {{0}}": "Due on {{0}}",
    "تم {{0}} العقد {{1}} وإحالته تلقائيًا للشؤون القانونية.": "Contract {{1}} was {{0}} and automatically referred to Legal Affairs.",
    "تم إنشاء {{0}} ملف عامل وإرفاق صور الإقامة والمتطلبات.": "Created {{0}} worker file(s) and attached the Iqama photos and requirements.",
    "تم تجاوز عدد الطلبات المسموح. حاول مجددًا{{0}}.": "The request limit was exceeded. Try again{{0}}.",
    "تم تجاوز عدد المحاولات المسموح. حاول مجددًا{{0}}.": "The attempt limit was exceeded. Try again{{0}}.",
    "تم تسجيل الغياب وخصم {{0}} من دفعة الشهر قبل الضريبة.": "The absence was recorded and {{0}} was deducted from the month's pre-tax installment.",
    "تم تعديل العقد {{0}} بالكامل وإعادته للمسودة للاعتماد مجددًا.": "Contract {{0}} was fully updated and returned to draft for reapproval.",
    "تم تعديل العقد {{0}} وإعادته للمسودة للاعتماد مجددًا.": "Contract {{0}} was updated and returned to draft for reapproval.",
    "تم حذف مسودة العقد {{0}}.": "Contract draft {{0}} was deleted.",
    "تم رفع العقد الموقع {{0}} وأصبح هو ملف PDF الحالي مع الاحتفاظ بمرجع النسخة السابقة.": "Signed contract {{0}} was uploaded and is now the current PDF; the previous version reference was retained.",
    "جاهزية {{0}} لتوفير العمالة خلال موسمي رمضان والحج": "{{0}} readiness to provide workforce during Ramadan and Hajj",
    "حالة وصول {{0}}": "Access status for {{0}}",
    "حتى {{0}}": "Until {{0}}",
    "حذف مسودة {{0}}؟": "Delete draft {{0}}?",
    "حذف مسودة العقد {{0}} نهائيًا؟": "Permanently delete contract draft {{0}}?",
    "حذف مسودة العقد {{0}} وجميع بياناتها غير المحاسبية؟": "Delete contract draft {{0}} and all its non-accounting data?",
    "حذف مسودة عرض السعر {{0}} نهائيًا؟": "Permanently delete quotation draft {{0}}?",
    "رد شركة دالي للتشغيل والصيانة على طلبكم {{0}}": "Dally Operation & Maintenance Co. response to your request {{0}}",
    "شعار {{0}}": "{{0}} logo",
    "عرض طلب {{0}}": "View request {{0}}",
    "على كفالة {{0}}": "Sponsored by {{0}}",
    "على كفالة {{0}} — {{1}}": "Sponsored by {{0}} — {{1}}",
    "عن {{0}}": "About {{0}}",
    "عولج {{0}} حدث، وتعذّر {{1}}.": "Processed {{0}} event(s); {{1}} failed.",
    "فجوة {{0}}": "Gap {{0}}",
    "في {{0}}": "on {{0}}",
    "متأخر {{0}} يومًا": "{{0}} day(s) overdue",
    "متبقٍ {{0}} عامل": "{{0}} worker(s) remaining",
    "متبقٍ {{0}} يوم": "{{0}} day(s) remaining",
    "متبقٍ {{0}} يومًا": "{{0}} day(s) remaining",
    "محادثة {{0}}": "Conversation {{0}}",
    "مساحة عملك في قسم {{0}}.": "Your workspace in the {{0}} department.",
    "مسير #{{0}}": "Payroll run #{{0}}",
    "منتهٍ منذ {{0}} يوم": "Expired {{0}} day(s) ago",
    "منتهي منذ {{0}} يومًا": "Expired {{0}} day(s) ago",
}

MANUAL_BN = {
    "· طلبها": "· অনুরোধ করেছেন",
    "الأسئلة الشائعة": "সচরাচর জিজ্ঞাসিত প্রশ্ন",
    "الترجمة البنغالية": "বাংলা অনুবাদ",
    "في": "এ",
    "· سدده {{0}}": "· পরিশোধ করেছেন {{0}}",
    "· مراجعة الاحتفاظ {{0}}": "· সংরক্ষণ পর্যালোচনা {{0}}",
    "· ينتهي {{0}}": "· মেয়াদ শেষ {{0}}",
    "{{0}} · {{1}} مرفق": "{{0}} · {{1}}টি সংযুক্তি",
    "{{0}} بايت": "{{0}} বাইট",
    "{{0}} بند · {{1}}": "{{0}}টি আইটেম · {{1}}",
    "{{0}} تنبيه إقامة": "{{0}}টি ইকামা সতর্কতা",
    "{{0}} تنتظر الرد": "{{0}}টি উত্তরের অপেক্ষায়",
    "{{0}} مستند": "{{0}}টি নথি",
    "{{0}} مستند منتهٍ،": "{{0}}টি মেয়াদোত্তীর্ণ নথি,",
    "{{0}} ميجابايت": "{{0}} মেগাবাইট",
    "{{0}} ناقص": "{{0}} অনুপস্থিত",
    "{{0}} نص ناقص": "{{0}}টি অসম্পূর্ণ লেখা",
    "{{0}}س {{1}}د": "{{0}} ঘণ্টা {{1}} মিনিট",
    "البند {{0}}": "আইটেম {{0}}",
    "السلام عليكم، نرفق لكم فاتورة {{0}} للعقد {{1}}. رابط PDF الآمن: {{2}}": "শুভেচ্ছা, চুক্তি {{1}}-এর চালান {{0}} সংযুক্ত করা হলো। নিরাপদ PDF লিংক: {{2}}",
    "العامل {{0}}: {{1}}": "কর্মী {{0}}: {{1}}",
    "العودة {{0}}": "দল ফিরবে {{0}}",
    "إنشاء إصدار جديد من {{0}} v{{1}} ووضع الإصدار الحالي كمتجاوز؟": "{{0}} v{{1}}-এর নতুন সংস্করণ তৈরি করে বর্তমান সংস্করণটিকে অতিক্রান্ত হিসেবে চিহ্নিত করবেন?",
    "تأكيد {{0}} العقد": "চুক্তি {{0}} নিশ্চিত করুন",
    "تستحق في {{0}}": "{{0}} তারিখে প্রাপ্য",
    "تشمل ضريبة {{0}}%": "{{0}}% কর অন্তর্ভুক্ত",
    "تفاصيل {{0}}": "{{0}}-এর বিবরণ",
    "تم إصدار العقد مع ترك {{0}} خانة عمالية دون إسناد لاستكمالها لاحقاً.": "চুক্তিটি জারি হয়েছে; {{0}}টি শ্রমিক পদ পরে বরাদ্দের জন্য খালি রাখা হয়েছে।",
    "تم تسجيل الغياب وخصم {{0}} من دفعة الشهر قبل الضريبة.": "অনুপস্থিতি নথিভুক্ত করা হয়েছে এবং কর-পূর্ব মাসিক কিস্তি থেকে {{0}} কাটা হয়েছে।",
    "حذف الدفعة {{0}}": "কিস্তি {{0}} মুছুন",
    "رد شركة دالي للتشغيل والصيانة على طلبكم {{0}}": "আপনার অনুরোধ {{0}}-এর বিষয়ে ডালি অপারেশন অ্যান্ড মেইনটেন্যান্স কোং-এর উত্তর",
    "صورة {{0}}": "{{0}}-এর ছবি",
    "عامل {{0}}": "কর্মী {{0}}",
    "على كفالة {{0}}": "{{0}}-এর স্পনসরশিপে",
    "على كفالة {{0}} — {{1}}": "{{0}}-এর স্পনসরশিপে — {{1}}",
    "عن {{0}}": "{{0}} সম্পর্কে",
    "فائض {{0}}": "উদ্বৃত্ত {{0}}",
    "فتح {{0}}": "{{0}} খুলুন",
    "في {{0}}": "{{0}}-এ",
    "مرسلة إلى {{0}}": "{{0}}-এর কাছে পাঠানো হয়েছে",
    "مساحة عملك في قسم {{0}}.": "{{0}} বিভাগে আপনার কর্মক্ষেত্র।",
    "مسير #{{0}}": "পে-রোল রান #{{0}}",
    "مشاركة {{0}}": "{{0}} শেয়ার করুন",
    "نقص {{0}}": "ঘাটতি {{0}}",
}

MANUAL_EN.update({
    "[{\"transactionDate\":\"2026-08-29\",\"description\":\"حوالة\",\"amount\":100,\"direction\":\"credit\",\"reference\":\"ABC\"}]": "[{\"transactionDate\":\"2026-08-29\",\"description\":\"Bank transfer\",\"amount\":100,\"direction\":\"credit\",\"reference\":\"ABC\"}]",
    "— مرجع التتبع: {{0}}": "— Tracking reference: {{0}}",
    "— اختياري": "— Optional",
    "· حجز نظامي حتى {{0}}": "· Legal hold until {{0}}",
    "· سدده {{0}}": "· Paid by {{0}}",
    "البنود: الاسم | الكمية | المدة | السعر | الملاحظات": "Items: name | quantity | duration | price | notes",
    "التخصصات — سطر لكل تخصص": "Specialties — one line per specialty",
    "الجودة والسلامة في مشروعات المقاولات | دالي": "Quality and Safety in Contracting Projects | Dally",
    "النظام الإداري | شركة دالي للتشغيل والصيانة": "Administration System | Dally Operation & Maintenance Co.",
    "خطوات العمل — العنوان|الوصف في كل سطر": "Work steps — title|description on each line",
    "دالي مورّد العمالة — عقد إيراد مع عميل": "Dally as workforce supplier — revenue contract with a client",
    "سجل مالي #": "Financial record #",
    "صورة الإقامة — إلزامية": "Iqama image — required",
    "صورة العامل — إلزامية": "Worker image — required",
    "عدد مفتوح — دون قيمة إجمالية، والضريبة عند الفوترة": "Open quantity — no total value; tax is applied when invoicing",
    "عرض الملف ←": "View file ←",
    "عرض مرتبط #": "Linked quotation #",
    "فتح الصفحة ←": "Open page ←",
    "مشروعات ودراسات حالة المقاولات | دالي": "Contracting Projects and Case Studies | Dally",
    "{{0}} جهة مستفيدة حالياً": "{{0}} current beneficiary entity/entities",
    "{{0}} مسارات آلية": "{{0}} automated route(s)",
    "اكتب سبب حذف دور «{{0}}» (10 أحرف على الأقل):": "Enter the reason for deleting the role “{{0}}” (at least 10 characters):",
    "— الكفيل {{0}} — {{1}}": "— Sponsor {{0}} — {{1}}",
    "{{0}} — {{1}} — الإنجاز {{2}}%، والنهاية المخططة {{3}}.": "{{0}} — {{1}} — {{2}}% complete; planned completion {{3}}.",
    "{{0}} — {{1}} — الحالة {{2}}.": "{{0}} — {{1}} — Status: {{2}}.",
    "{{0}} — {{1}} — القسم المطلوب: {{2}}.": "{{0}} — {{1}} — Requested department: {{2}}.",
    "{{0}} — {{1}} — نقص {{2}} عامل في {{3}}.": "{{0}} — {{1}} — Shortage of {{2}} worker(s) in {{3}}.",
    "{{0}} — الإصدار {{1}} — {{2}}.": "{{0}} — Version {{1}} — {{2}}.",
    "{{0}} — خطوة {{1}}.": "{{0}} — Step {{1}}.",
    "، وموعد البدء {{0}}": ", with a start date of {{0}}",
    "{{0}} — {{1}} — متبقٍ {{2}} عامل{{3}}.": "{{0}} — {{1}} — {{2}} worker(s) remaining{{3}}.",
    "{{0}} — {{1}} — يبدأ {{2}}.": "{{0}} — {{1}} — Starts {{2}}.",
    "{{0}} — {{1}} ينتظر منذ {{2}}.": "{{0}} — {{1}} has been waiting since {{2}}.",
    "{{0}} — عكس {{1}}.": "{{0}} — Reversal of {{1}}.",
    "{{0}} — ينقص الملف {{1}} من متطلبات الجاهزية للمهنة.": "{{0}} — The file is missing {{1}} profession-readiness requirement(s).",
    "{{0}} عند {{1}} بتوقيت مكة": "{{0}} at {{1}} Makkah time",
    "{{0}} لموظف تنتهي قريبًا": "Employee {{0}} expires soon",
    "استحقاق مورّد {{0}}": "Supplier payable {{0}}",
    "الدفعة {{0}} — {{1}} — {{2}}.": "Installment {{0}} — {{1}} — {{2}}.",
    "تنتهي صلاحيته خلال {{0}} يوم": "Expires within {{0}} day(s)",
    "فاتورة {{0}}": "Invoice {{0}}",
    "متأخرة {{0}} يومًا": "{{0}} day(s) overdue",
    "مرحباً {{0}}، استخدم الرابط التالي لإعادة تعيين كلمة المرور خلال 30 دقيقة: {{1}} إذا لم تطلب ذلك فتجاهل الرسالة.": "Hello {{0}}, use the following link to reset your password within 30 minutes: {{1}} If you did not request this, ignore the message.",
    "معلّق منذ {{0}} دقيقة": "Pending for {{0}} minute(s)",
    "{{0}} - الرئيسية": "{{0}} - Home",
    "{{0}} ({{1}}) تحققت هويته ولم يستكمل سبب الوصول وضوابط الاستخدام.": "{{0}} ({{1}}) was verified but has not completed the access reason and usage policy acknowledgement.",
    "البيانات هنا مشتقة من العقد نفسه؛ أي إسناد أو إعادة ينعكس مباشرة على التغطية والموقع.": "This data is derived from the contract; every assignment or return is reflected immediately in coverage and location.",
    "تحديد المهمة والمهنة والعدد والموقع والمدة والورديات وموعد البدء المتوقع.": "Define the task, profession, headcount, location, duration, shifts, and expected start date.",
    "إرسال الطلب لا ينشئ عقدًا ولا التزامًا بالتوفير. يصبح العرض ملزمًا فقط بعد اعتماده وإرساله وقبوله وفق مدته وشروطه، ثم استكمال العقد أو أمر التشغيل المعتمد.": "Submitting a request does not create a contract or a commitment to supply. A quotation becomes binding only after it is approved, sent, and accepted under its validity period and terms, followed by completion of the approved contract or work order.",
    "مستند تنتهي صلاحيته خلال أقل من 30 يوماً.": "A document expiring in less than 30 days.",
    "ينعكس تقييم الزائر على الموظف الذي خدمه وعلى مؤشر رضا الشركة.": "The visitor's rating is reflected in the rating of the employee who served them and in the company's satisfaction score.",
    "12 خانة: كبير وصغير ورقم ورمز": "12 characters: uppercase, lowercase, number, and symbol",
    "WIP أعمال غير مفوترة": "Unbilled work in progress (WIP)",
    "البنك الأهلي السعودي": "Saudi National Bank",
    "البنك السعودي الفرنسي": "Banque Saudi Fransi",
    "بنك البلاد": "Bank Albilad",
    "حقل داخلي للعقد ولا يظهر للعميل في عرض السعر.": "An internal contract field that is not shown to the client in the quotation.",
    "خطط لرمضان والعشر الأواخر": "Plan for Ramadan and the last ten nights",
    "رقم متابعة يحفظ سياق حديثك.": "A tracking number preserves the context of your conversation.",
    "شاركنا احتياجك ليقترح فريق دالي الحل المناسب": "Share your needs so the Dally team can propose the right solution",
    "عمالة المقاولات والإنشاءات": "Contracting and construction workforce",
    "عمالة المقاولات والإنشاءات للمشروعات في مكة": "Contracting and construction workforce for projects in Makkah",
    "فنيو تكييف": "HVAC technicians",
    "ك.ب": "KB",
    "مستحقة": "Due",
    "المهنة المسؤولة": "Responsible profession",
    "ينبع": "Yanbu",
    "أهداف منجزة، جودة، أخطاء موثقة، ملاحظات عملاء، التزام بالمواعيد...": "Completed goals, quality, documented errors, client feedback, and on-time performance...",
    "م²": "m²",
    "المسير": "Payroll run",
    "التصنيف": "Classification",
    "الفئة": "Category",
    "كوادر": "Personnel",
    "مستخلص": "Progress claim",
    "مراجعة التخصصات": "Review specialties",
    "سحور": "Suhoor",
    "جدة": "Jeddah",
    "الوردية أو مستوى الخدمة": "Work shift or service level",
    "الاعتماد": "Approval",
    "تحديث الطلب": "Update request",
    "حوكمة الاستخدام": "Usage governance",
    "المعاينة والتقدير": "Inspection and estimation",
    "جداول الكميات": "Bills of quantities",
    "عقد بعدد مفتوح": "Open-headcount contract",
    "النظام البصري": "Visual system",
    "الفنادق والضيافة": "Hotels and hospitality",
    "العدد المطابق متاح حالياً": "The required matching headcount is currently available",
    "موعد عرض مقاولات قريب": "Contracting bid deadline approaching",
    "ما يصلح لرمضان لا يكفي للحج": "What works for Ramadan is not enough for Hajj",
    "جدول واضح للبداية والتجهيز والتوزيع قبل ارتفاع الطلب.": "A clear schedule for startup, mobilization, and deployment before demand rises.",
    "تظهر الإجراءات التي انتهت أو تبقّى عليها أقل من 29 يومًا، وترتبط مباشرة بالمنصة الحكومية المناسبة.": "Actions that are overdue or have fewer than 29 days remaining appear here and link directly to the relevant government platform.",
    "تم تسجيل السداد وإنشاء قيد الأحكام القانونية بانتظار الاعتماد والترحيل.": "Payment was recorded and a legal settlement journal entry was created, pending approval and posting.",
    "سكن ونقل وإقامات وغيرها": "Housing, transport, Iqamas, and other items",
    "الإقامات والتراخيص والمنصات الحكومية وطلبات سدادها.": "Iqamas, licenses, government platforms, and their payment requests.",
    "متابعة الإقامات والتراخيص والمنصات السعودية وطلبات سدادها ضمن سجل تدقيق وصلاحيات مقيدة.": "Track Iqamas, licenses, Saudi government platforms, and their payment requests with an audit trail and restricted permissions.",
    "مسددة": "Paid",
    "مقاولات عامة وأعمال إنشائية": "General contracting and construction works",
    "تعذّر حذف عرض السعر": "Unable to delete the quotation",
    "تعذّر تعديل عرض السعر": "Unable to edit the quotation",
    "كيف أحدد العدد المناسب لكل مهنة؟": "How do I determine the right headcount for each profession?",
    "محفوظة في السجل الوظيفي.": "Saved in the employment record.",
})

MANUAL_BN.update({
    "[{\"transactionDate\":\"2026-08-29\",\"description\":\"حوالة\",\"amount\":100,\"direction\":\"credit\",\"reference\":\"ABC\"}]": "[{\"transactionDate\":\"2026-08-29\",\"description\":\"ব্যাংক স্থানান্তর\",\"amount\":100,\"direction\":\"credit\",\"reference\":\"ABC\"}]",
    "— مرجع التتبع: {{0}}": "— ট্র্যাকিং রেফারেন্স: {{0}}",
    "— اختياري": "— ঐচ্ছিক",
    "· حجز نظامي حتى {{0}}": "· {{0}} পর্যন্ত আইনগত স্থগিতাদেশ",
    "· سدده {{0}}": "· পরিশোধ করেছেন {{0}}",
    "البنود: الاسم | الكمية | المدة | السعر | الملاحظات": "আইটেম: নাম | পরিমাণ | মেয়াদ | মূল্য | মন্তব্য",
    "التخصصات — سطر لكل تخصص": "বিশেষায়ন — প্রতি বিশেষায়নে একটি লাইন",
    "الجودة والسلامة في مشروعات المقاولات | دالي": "ঠিকাদারি প্রকল্পে গুণমান ও নিরাপত্তা | ডালি",
    "النظام الإداري | شركة دالي للتشغيل والصيانة": "প্রশাসনিক ব্যবস্থা | ডালি অপারেশন অ্যান্ড মেইনটেন্যান্স কোং",
    "خطوات العمل — العنوان|الوصف في كل سطر": "কাজের ধাপ — প্রতিটি লাইনে শিরোনাম|বিবরণ",
    "دالي مورّد العمالة — عقد إيراد مع عميل": "ডালি শ্রমশক্তি সরবরাহকারী — গ্রাহকের সঙ্গে রাজস্ব চুক্তি",
    "سجل مالي #": "আর্থিক রেকর্ড #",
    "صورة الإقامة — إلزامية": "ইকামার ছবি — আবশ্যিক",
    "صورة العامل — إلزامية": "কর্মীর ছবি — আবশ্যিক",
    "عدد مفتوح — دون قيمة إجمالية، والضريبة عند الفوترة": "উন্মুক্ত সংখ্যা — মোট মূল্য নেই; চালান তৈরির সময় কর প্রযোজ্য",
    "عرض الملف ←": "ফাইল দেখুন ←",
    "عرض مرتبط #": "সংযুক্ত মূল্য প্রস্তাব #",
    "فتح الصفحة ←": "পৃষ্ঠা খুলুন ←",
    "مشروعات ودراسات حالة المقاولات | دالي": "ঠিকাদারি প্রকল্প ও কেস স্টাডি | ডালি",
    "{{0}} جهة مستفيدة حالياً": "বর্তমানে {{0}}টি উপকারভোগী সংস্থা",
    "{{0}} مسارات آلية": "{{0}}টি স্বয়ংক্রিয় রুট",
    "اكتب سبب حذف دور «{{0}}» (10 أحرف على الأقل):": "“{{0}}” ভূমিকা মুছে ফেলার কারণ লিখুন (অন্তত ১০ অক্ষর):",
    "— الكفيل {{0}} — {{1}}": "— স্পনসর {{0}} — {{1}}",
    "{{0}} — {{1}} — الإنجاز {{2}}%، والنهاية المخططة {{3}}.": "{{0}} — {{1}} — {{2}}% সম্পন্ন; পরিকল্পিত সমাপ্তি {{3}}।",
    "{{0}} — {{1}} — الحالة {{2}}.": "{{0}} — {{1}} — অবস্থা: {{2}}।",
    "{{0}} — {{1}} — القسم المطلوب: {{2}}.": "{{0}} — {{1}} — অনুরোধকৃত বিভাগ: {{2}}।",
    "{{0}} — {{1}} — نقص {{2}} عامل في {{3}}.": "{{0}} — {{1}} — {{3}}-এ {{2}} জন কর্মীর ঘাটতি।",
    "{{0}} — الإصدار {{1}} — {{2}}.": "{{0}} — সংস্করণ {{1}} — {{2}}।",
    "{{0}} — خطوة {{1}}.": "{{0}} — ধাপ {{1}}।",
    "، وموعد البدء {{0}}": ", শুরুর তারিখ {{0}}",
    "{{0}} — {{1}} — متبقٍ {{2}} عامل{{3}}.": "{{0}} — {{1}} — {{2}} জন কর্মী অবশিষ্ট{{3}}।",
    "{{0}} — {{1}} — يبدأ {{2}}.": "{{0}} — {{1}} — শুরু {{2}}।",
    "{{0}} — {{1}} ينتظر منذ {{2}}.": "{{0}} — {{1}} {{2}} থেকে অপেক্ষায় আছেন।",
    "{{0}} — عكس {{1}}.": "{{0}} — {{1}}-এর বিপরীত এন্ট্রি।",
    "{{0}} — ينقص الملف {{1}} من متطلبات الجاهزية للمهنة.": "{{0}} — ফাইলে পেশাগত প্রস্তুতির {{1}}টি শর্ত অনুপস্থিত।",
    "{{0}} عند {{1}} بتوقيت مكة": "মক্কা সময় {{1}}-এ {{0}}",
    "{{0}} لموظف تنتهي قريبًا": "কর্মীর {{0}} শিগগিরই মেয়াদোত্তীর্ণ হবে",
    "استحقاق مورّد {{0}}": "সরবরাহকারীর পাওনা {{0}}",
    "الدفعة {{0}} — {{1}} — {{2}}.": "কিস্তি {{0}} — {{1}} — {{2}}।",
    "تنتهي صلاحيته خلال {{0}} يوم": "{{0}} দিনের মধ্যে মেয়াদ শেষ হবে",
    "فاتورة {{0}}": "চালান {{0}}",
    "متأخرة {{0}} يومًا": "{{0}} দিন বিলম্বিত",
    "مرحباً {{0}}، استخدم الرابط التالي لإعادة تعيين كلمة المرور خلال 30 دقيقة: {{1}} إذا لم تطلب ذلك فتجاهل الرسالة.": "স্বাগতম {{0}}, ৩০ মিনিটের মধ্যে পাসওয়ার্ড পুনরায় সেট করতে নিচের লিংকটি ব্যবহার করুন: {{1}} আপনি অনুরোধ না করে থাকলে বার্তাটি উপেক্ষা করুন।",
    "معلّق منذ {{0}} دقيقة": "{{0}} মিনিট ধরে অপেক্ষমাণ",
    "شهادة تأهيل اللحام": "ওয়েল্ডিং যোগ্যতা সনদ",
    "{{0}}، تشغيل وصيانة مكة، توفير عمالة في مكة": "{{0}}, মক্কায় অপারেশন ও রক্ষণাবেক্ষণ, মক্কায় শ্রমশক্তি সরবরাহ",
    "استحقاق المورد للدفعة رقم {{0}} ({{1}}) من عقد شراء العمالة {{2}}.": "শ্রমশক্তি ক্রয় চুক্তি {{2}}-এর {{0}} নম্বর কিস্তি ({{1}})-এর জন্য সরবরাহকারীর পাওনা।",
    "البند {{0}}: {{1}} — {{2}} — {{3}} شهر{{4}}": "আইটেম {{0}}: {{1}} — {{2}} — {{3}} মাস{{4}}",
    "فاتورة الدفعة رقم {{0}} ({{1}}) من العقد {{2}}.": "চুক্তি {{2}}-এর {{0}} নম্বর কিস্তির ({{1}}) চালান।",
    "{{0}} - الرئيسية": "{{0}} - হোম",
    "{{0}} ({{1}}) تحققت هويته ولم يستكمل سبب الوصول وضوابط الاستخدام.": "{{0}} ({{1}})-এর পরিচয় যাচাই হয়েছে, কিন্তু প্রবেশের কারণ ও ব্যবহারের নীতিমালার স্বীকৃতি সম্পন্ন হয়নি।",
    "البيانات هنا مشتقة من العقد نفسه؛ أي إسناد أو إعادة ينعكس مباشرة على التغطية والموقع.": "এই তথ্য সরাসরি চুক্তি থেকে নেওয়া; প্রতিটি নিয়োগ বা প্রত্যাবর্তন কভারেজ ও অবস্থানে সঙ্গে সঙ্গে প্রতিফলিত হয়।",
    "تحديد المهمة والمهنة والعدد والموقع والمدة والورديات وموعد البدء المتوقع.": "কাজ, পেশা, কর্মীর সংখ্যা, অবস্থান, মেয়াদ, শিফট এবং সম্ভাব্য শুরুর তারিখ নির্ধারণ করুন।",
    "إرسال الطلب لا ينشئ عقدًا ولا التزامًا بالتوفير. يصبح العرض ملزمًا فقط بعد اعتماده وإرساله وقبوله وفق مدته وشروطه، ثم استكمال العقد أو أمر التشغيل المعتمد.": "অনুরোধ পাঠালে কোনো চুক্তি বা সরবরাহের বাধ্যবাধকতা তৈরি হয় না। মূল্য প্রস্তাব অনুমোদিত, পাঠানো ও তার মেয়াদ ও শর্ত অনুযায়ী গৃহীত হওয়ার পর এবং অনুমোদিত চুক্তি বা কাজের আদেশ সম্পন্ন হলেই তা বাধ্যতামূলক হয়।",
    "مستند تنتهي صلاحيته خلال أقل من 30 يوماً.": "৩০ দিনের কম সময়ের মধ্যে মেয়াদ শেষ হবে এমন নথি।",
    "ينعكس تقييم الزائر على الموظف الذي خدمه وعلى مؤشر رضا الشركة.": "দর্শনার্থীর মূল্যায়ন সেবাদানকারী কর্মীর রেটিং এবং কোম্পানির সন্তুষ্টি সূচকে প্রতিফলিত হয়।",
    "12 خانة: كبير وصغير ورقم ورمز": "১২ অক্ষর: ইংরেজি বড় হাতের ও ছোট হাতের অক্ষর, সংখ্যা এবং প্রতীক",
    "WIP أعمال غير مفوترة": "চালান না-করা চলমান কাজ (WIP)",
    "البنك الأهلي السعودي": "সৌদি ন্যাশনাল ব্যাংক",
    "البنك السعودي الفرنسي": "ব্যাংক সৌদি ফ্রান্সি",
    "بنك البلاد": "ব্যাংক আলবিলাদ",
    "حقل داخلي للعقد ولا يظهر للعميل في عرض السعر.": "চুক্তির অভ্যন্তরীণ ক্ষেত্র; এটি গ্রাহকের মূল্য প্রস্তাবে দেখানো হয় না।",
    "خطط لرمضان والعشر الأواخر": "রমজান ও শেষ দশ রাতের পরিকল্পনা করুন",
    "رقم متابعة يحفظ سياق حديثك.": "একটি ট্র্যাকিং নম্বর আপনার কথোপকথনের প্রেক্ষাপট সংরক্ষণ করে।",
    "شاركنا احتياجك ليقترح فريق دالي الحل المناسب": "আপনার প্রয়োজন জানান, ডালি দল উপযুক্ত সমাধান প্রস্তাব করবে",
    "عمالة المقاولات والإنشاءات": "ঠিকাদারি ও নির্মাণকাজের শ্রমশক্তি",
    "عمالة المقاولات والإنشاءات للمشروعات في مكة": "মক্কার প্রকল্পগুলোর জন্য ঠিকাদারি ও নির্মাণকাজের শ্রমশক্তি",
    "فنيو تكييف": "এইচভিএসি প্রযুক্তিবিদ",
    "ك.ب": "কেবি",
    "مستحقة": "প্রাপ্য",
    "المهنة المسؤولة": "দায়িত্বপ্রাপ্ত পেশা",
    "ينبع": "ইয়ানবু",
    "أهداف منجزة، جودة، أخطاء موثقة، ملاحظات عملاء، التزام بالمواعيد...": "সম্পন্ন লক্ষ্য, মান, নথিভুক্ত ত্রুটি, গ্রাহকের মতামত এবং সময়ানুবর্তিতা...",
    "م²": "মি²",
    "المسير": "পে-রোল রান",
    "التصنيف": "শ্রেণিবিন্যাস",
    "الفئة": "শ্রেণি",
    "كوادر": "জনবল",
    "مستخلص": "অগ্রগতি বিল",
    "مراجعة التخصصات": "বিশেষায়ন পর্যালোচনা",
    "سحور": "সাহরি",
    "جدة": "জেদ্দা",
    "الوردية أو مستوى الخدمة": "কাজের শিফট বা সেবার স্তর",
    "الاعتماد": "অনুমোদন",
    "تحديث الطلب": "অনুরোধ হালনাগাদ করুন",
    "حوكمة الاستخدام": "ব্যবহারবিধির শাসন",
    "المعاينة والتقدير": "পরিদর্শন ও প্রাক্কলন",
    "جداول الكميات": "পরিমাণের বিল (BOQ)",
    "عقد بعدد مفتوح": "উন্মুক্ত কর্মীসংখ্যার চুক্তি",
    "النظام البصري": "ভিজ্যুয়াল সিস্টেম",
    "الفنادق والضيافة": "হোটেল ও আতিথেয়তা",
    "العدد المطابق متاح حالياً": "প্রয়োজনীয় উপযুক্ত কর্মীসংখ্যা বর্তমানে উপলভ্য",
    "موعد عرض مقاولات قريب": "ঠিকাদারি দরপত্রের সময়সীমা ঘনিয়ে এসেছে",
    "ما يصلح لرمضان لا يكفي للحج": "রমজানের উপযোগী পরিকল্পনা হজের জন্য যথেষ্ট নয়",
    "جدول واضح للبداية والتجهيز والتوزيع قبل ارتفاع الطلب.": "চাহিদা বাড়ার আগে শুরু, প্রস্তুতি ও মোতায়েনের স্পষ্ট সময়সূচি।",
    "تظهر الإجراءات التي انتهت أو تبقّى عليها أقل من 29 يومًا، وترتبط مباشرة بالمنصة الحكومية المناسبة.": "মেয়াদোত্তীর্ণ বা ২৯ দিনের কম সময় বাকি থাকা কার্যক্রম এখানে দেখা যায় এবং সংশ্লিষ্ট সরকারি প্ল্যাটফর্মের সঙ্গে সরাসরি যুক্ত থাকে।",
    "تم تسجيل السداد وإنشاء قيد الأحكام القانونية بانتظار الاعتماد والترحيل.": "পরিশোধ নথিভুক্ত হয়েছে এবং আইনগত নিষ্পত্তির জার্নাল এন্ট্রি তৈরি হয়েছে; এখন অনুমোদন ও পোস্টিংয়ের অপেক্ষায়।",
    "سكن ونقل وإقامات وغيرها": "আবাসন, পরিবহন, ইকামা এবং অন্যান্য বিষয়",
    "الإقامات والتراخيص والمنصات الحكومية وطلبات سدادها.": "ইকামা, লাইসেন্স, সরকারি প্ল্যাটফর্ম এবং সেগুলোর পরিশোধের অনুরোধ।",
    "متابعة الإقامات والتراخيص والمنصات السعودية وطلبات سدادها ضمن سجل تدقيق وصلاحيات مقيدة.": "অডিট ট্রেইল ও সীমিত অনুমতির আওতায় ইকামা, লাইসেন্স, সৌদি সরকারি প্ল্যাটফর্ম এবং সেগুলোর পরিশোধের অনুরোধ অনুসরণ করুন।",
    "مسددة": "পরিশোধিত",
    "مقاولات عامة وأعمال إنشائية": "সাধারণ ঠিকাদারি ও নির্মাণকাজ",
    "تعذّر حذف عرض السعر": "মূল্য প্রস্তাব মুছে ফেলা যায়নি",
    "تعذّر تعديل عرض السعر": "মূল্য প্রস্তাব সম্পাদনা করা যায়নি",
    "كيف أحدد العدد المناسب لكل مهنة؟": "প্রতিটি পেশার জন্য সঠিক কর্মীসংখ্যা কীভাবে নির্ধারণ করব?",
    "محفوظة في السجل الوظيفي.": "কর্মসংস্থান রেকর্ডে সংরক্ষিত।",
})

MANUAL_EN.update({
    "جارٍ...": "Working...",
    "جارية": "In progress",
    "جارية الآن": "In progress now",
    "جارٍ الحفظ": "Saving",
    "جارٍ الحفظ...": "Saving...",
    "جارٍ الإرسال": "Sending",
    "جارٍ الإرسال...": "Sending...",
    "جارٍ الإنشاء": "Creating",
    "جارٍ الإنشاء...": "Creating...",
    "جارٍ التجهيز": "Preparing",
    "جارٍ التحديث": "Updating",
    "جارٍ الاعتماد": "Approving",
    "جارٍ الاعتماد...": "Approving...",
    "جارٍ التحقق": "Verifying",
    "جارٍ التحقق...": "Verifying...",
    "جارٍ الرفع...": "Uploading...",
    "جارٍ التسجيل...": "Registering...",
    "جارٍ الطلب...": "Submitting request...",
    "جارٍ التنزيل...": "Downloading...",
    "جارٍ التهيئة...": "Initializing...",
    "جارٍ الحذف": "Deleting",
    "جارٍ التحقق من الوصول...": "Verifying access...",
    "جارٍ رفع المرفق...": "Uploading attachment...",
    "جارٍ الإسناد...": "Assigning...",
    "جارٍ تحميل المحادثة...": "Loading conversation...",
    "جارٍ بدء المحادثة...": "Starting conversation...",
    "جارٍ التحقق من رابط العقد...": "Verifying contract link...",
    "جارٍ تسجيل السداد...": "Recording payment...",
    "جارٍ الإصدار...": "Issuing...",
    "جارٍ توثيق الموقع...": "Recording site location...",
    "جارٍ اعتماد العقد...": "Approving contract...",
    "جارٍ تحميل دورة العميل والتشغيل...": "Loading client and operations lifecycle...",
    "جارٍ تحميل إدارة القضايا...": "Loading case management...",
    "جارٍ البحث في السجلات المصرح بها...": "Searching authorized records...",
    "جارٍ تنفيذ الإحالة...": "Processing referral...",
    "جارٍ إنشاء المسودة...": "Creating draft...",
    "جارٍ تجهيز نموذج عرض السعر...": "Preparing quotation form...",
    "جارٍ تحميل العقود والدفعات...": "Loading contracts and installments...",
    "جارٍ الترجمة...": "Translating...",
    "جارٍ تحميل المهام...": "Loading tasks...",
    "جارٍ التحقق والحفظ...": "Verifying and saving...",
    "جارٍ إنشاء الملف...": "Creating file...",
    "جارٍ تسجيل الخصم...": "Recording deduction...",
    "جارٍ إنشاء القيد...": "Creating journal entry...",
    "جارٍ إرسال الطلب...": "Submitting request...",
    "جارٍ حفظ المسودة...": "Saving draft...",
    "جارٍ إعداد مركز الدفعات...": "Preparing payments center...",
    "جارٍ التحقق من صلاحية الحساب...": "Verifying account access...",
    "جارٍ الرفع والحفظ...": "Uploading and saving...",
    "جارٍ تحميل مصفوفة الأدوار والنطاقات...": "Loading roles and scopes matrix...",
    "جارٍ تحميل قطاع المقاولات...": "Loading contracting sector...",
    "جارٍ حفظ القرار...": "Saving decision...",
    "جارٍ رفع الشعار والتحقق منه...": "Uploading and verifying logo...",
    "جارٍ تحميل إدارة العلاقات الحكومية والامتثال...": "Loading government relations and compliance...",
    "جارٍ تجهيز جميع ملفات الهوية...": "Preparing all brand identity files...",
})

MANUAL_BN.update({
    "جارٍ...": "প্রক্রিয়া চলছে...",
    "جارية": "চলমান",
    "جارية الآن": "এখন চলমান",
    "جارٍ الحفظ": "সংরক্ষণ করা হচ্ছে",
    "جارٍ الحفظ...": "সংরক্ষণ করা হচ্ছে...",
    "جارٍ الإرسال": "পাঠানো হচ্ছে",
    "جارٍ الإرسال...": "পাঠানো হচ্ছে...",
    "جارٍ الإنشاء": "তৈরি করা হচ্ছে",
    "جارٍ الإنشاء...": "তৈরি করা হচ্ছে...",
    "جارٍ التجهيز": "প্রস্তুত করা হচ্ছে",
    "جارٍ التحديث": "হালনাগাদ করা হচ্ছে",
    "جارٍ الاعتماد": "অনুমোদন করা হচ্ছে",
    "جارٍ الاعتماد...": "অনুমোদন করা হচ্ছে...",
    "جارٍ التحقق": "যাচাই করা হচ্ছে",
    "جارٍ التحقق...": "যাচাই করা হচ্ছে...",
    "جارٍ الرفع...": "আপলোড করা হচ্ছে...",
    "جارٍ التسجيل...": "নিবন্ধন করা হচ্ছে...",
    "جارٍ الطلب...": "অনুরোধ জমা দেওয়া হচ্ছে...",
    "جارٍ التنزيل...": "ডাউনলোড করা হচ্ছে...",
    "جارٍ التهيئة...": "প্রস্তুত করা হচ্ছে...",
    "جارٍ الحذف": "মুছে ফেলা হচ্ছে",
    "جارٍ التحقق من الوصول...": "প্রবেশাধিকার যাচাই করা হচ্ছে...",
    "جارٍ رفع المرفق...": "সংযুক্তি আপলোড করা হচ্ছে...",
    "جارٍ الإسناد...": "নিয়োগ করা হচ্ছে...",
    "جارٍ تحميل المحادثة...": "কথোপকথন লোড করা হচ্ছে...",
    "جارٍ بدء المحادثة...": "কথোপকথন শুরু করা হচ্ছে...",
    "جارٍ التحقق من رابط العقد...": "চুক্তির লিংক যাচাই করা হচ্ছে...",
    "جارٍ تسجيل السداد...": "পরিশোধ নথিভুক্ত করা হচ্ছে...",
    "جارٍ الإصدار...": "ইস্যু করা হচ্ছে...",
    "جارٍ توثيق الموقع...": "সাইটের অবস্থান নথিভুক্ত করা হচ্ছে...",
    "جارٍ اعتماد العقد...": "চুক্তি অনুমোদন করা হচ্ছে...",
    "جارٍ تحميل دورة العميل والتشغيل...": "গ্রাহক ও পরিচালনা কার্যপ্রবাহ লোড করা হচ্ছে...",
    "جارٍ تحميل إدارة القضايا...": "মামলা ব্যবস্থাপনা লোড করা হচ্ছে...",
    "جارٍ البحث في السجلات المصرح بها...": "অনুমোদিত রেকর্ডে অনুসন্ধান করা হচ্ছে...",
    "جارٍ تنفيذ الإحالة...": "রেফারেল প্রক্রিয়া করা হচ্ছে...",
    "جارٍ إنشاء المسودة...": "খসড়া তৈরি করা হচ্ছে...",
    "جارٍ تجهيز نموذج عرض السعر...": "মূল্য প্রস্তাবের ফর্ম প্রস্তুত করা হচ্ছে...",
    "جارٍ تحميل العقود والدفعات...": "চুক্তি ও কিস্তি লোড করা হচ্ছে...",
    "جارٍ الترجمة...": "অনুবাদ করা হচ্ছে...",
    "جارٍ تحميل المهام...": "কাজগুলো লোড করা হচ্ছে...",
    "جارٍ التحقق والحفظ...": "যাচাই ও সংরক্ষণ করা হচ্ছে...",
    "جارٍ إنشاء الملف...": "ফাইল তৈরি করা হচ্ছে...",
    "جارٍ تسجيل الخصم...": "কর্তন নথিভুক্ত করা হচ্ছে...",
    "جارٍ إنشاء القيد...": "জার্নাল এন্ট্রি তৈরি করা হচ্ছে...",
    "جارٍ إرسال الطلب...": "অনুরোধ জমা দেওয়া হচ্ছে...",
    "جارٍ حفظ المسودة...": "খসড়া সংরক্ষণ করা হচ্ছে...",
    "جارٍ إعداد مركز الدفعات...": "পেমেন্ট কেন্দ্র প্রস্তুত করা হচ্ছে...",
    "جارٍ التحقق من صلاحية الحساب...": "অ্যাকাউন্টের প্রবেশাধিকার যাচাই করা হচ্ছে...",
    "جارٍ الرفع والحفظ...": "আপলোড ও সংরক্ষণ করা হচ্ছে...",
    "جارٍ تحميل مصفوفة الأدوار والنطاقات...": "ভূমিকা ও পরিধির ম্যাট্রিক্স লোড করা হচ্ছে...",
    "جارٍ تحميل قطاع المقاولات...": "ঠিকাদারি বিভাগ লোড করা হচ্ছে...",
    "جارٍ حفظ القرار...": "সিদ্ধান্ত সংরক্ষণ করা হচ্ছে...",
    "جارٍ رفع الشعار والتحقق منه...": "লোগো আপলোড ও যাচাই করা হচ্ছে...",
    "جارٍ تحميل إدارة العلاقات الحكومية والامتثال...": "সরকারি সম্পর্ক ও কমপ্লায়েন্স ব্যবস্থাপনা লোড করা হচ্ছে...",
    "جارٍ تجهيز جميع ملفات الهوية...": "সব ব্র্যান্ড পরিচয় ফাইল প্রস্তুত করা হচ্ছে...",
})

torch.set_num_threads(max(1, min(12, os.cpu_count() or 1)))


def valid(value, target, placeholders=()):
    if not value or ARABIC.search(value) or re.search(r"[♪♫]|\. \. \.|_{4,}|DALI[\s_-]*VAR|&(?:apos|quot|amp|lt|gt|#\d+);|\(_?D\)|DOR_VAR|copertor", value, flags=re.IGNORECASE):
        return False
    if target == "en" and not re.search(r"[A-Za-z]", value):
        return False
    if target == "bn":
        if not BENGALI.search(value):
            return False
        for character in value:
            codepoint = ord(character)
            if 0x0370 <= codepoint <= 0x052F or (0x0900 <= codepoint <= 0x097F and codepoint not in (0x0964, 0x0965)):
                return False
    return all(placeholder in value for placeholder in placeholders)


def protect(value):
    return PLACEHOLDER.sub(lambda match: f"__DALI_VAR_{match.group(1)}__", value)


def restore(value):
    value = html.unescape(value)
    value = re.sub(r"_*DALI[\s_-]*VAR[\s_-]*(\d+)_*", lambda match: "{{" + match.group(1) + "}}", value, flags=re.IGNORECASE)
    return re.sub(r"\s+", " ", value).strip()


def apply_glossary(source, value, target):
    if target == "en":
        value = re.sub(r"\b(?:Daly|Daley)\b", "Dally", value, flags=re.IGNORECASE)
        if "مكة" in source:
            value = re.sub(r"\bMecca\b", "Makkah", value, flags=re.IGNORECASE)
        if "عامل" in source:
            value = re.sub(r"\bworking factors?\b", "worker", value, flags=re.IGNORECASE)
            value = re.sub(r"\bfactor(s?)\b", lambda match: "workers" if match.group(1) else "worker", value, flags=re.IGNORECASE)
            if "مندوب" not in source:
                value = re.sub(r"\bagent(s?)\b", lambda match: "workers" if match.group(1) else "worker", value, flags=re.IGNORECASE)
        if "كفال" in source or "كفيل" in source:
            value = re.sub(r"\b(?:bail|guarantee|surety)\b", "sponsorship", value, flags=re.IGNORECASE)
            value = re.sub(r"\bguarantor\b", "sponsor", value, flags=re.IGNORECASE)
        if "عقد" in source:
            value = re.sub(r"\bdecade\b", "contract", value, flags=re.IGNORECASE)
        if "وردي" in source:
            value = re.sub(r"\b(?:pink|rose|roses)\b", "work shift", value, flags=re.IGNORECASE)
        if "إقام" in source:
            value = re.sub(r"\b(?:residence|accommodation)\b", "Iqama", value, flags=re.IGNORECASE)
        if "دفعة" in source:
            value = re.sub(r"\bbatch(?:es)?\b", "installment", value, flags=re.IGNORECASE)
        if "اعتماد" in source:
            value = re.sub(r"\b(?:adoption|accreditation)\b", "approval", value, flags=re.IGNORECASE)
        if "إسناد" in source:
            value = re.sub(r"\b(?:attribution|grant|backup)\b", "assignment", value, flags=re.IGNORECASE)
        if "مرفق" in source:
            value = re.sub(r"\bannex(es)?\b", lambda match: "attachments" if match.group(1) else "attachment", value, flags=re.IGNORECASE)
        if "رفع" in source:
            value = re.sub(r"\blifting\b", "uploading", value, flags=re.IGNORECASE)
        if "تنزيل" in source:
            value = re.sub(r"\bdiscount\b", "download", value, flags=re.IGNORECASE)
        if "جلس" in source:
            value = re.sub(r"\bmeetings?\b", "sessions", value, flags=re.IGNORECASE)
        if "ترحيل" in source:
            value = re.sub(r"\bdeportation\b", "posting", value, flags=re.IGNORECASE)
        if "تقدير" in source:
            value = re.sub(r"\bappreciation\b", "estimation", value, flags=re.IGNORECASE)
        if "تجهيز" in source:
            value = re.sub(r"\b(?:machining|packaging)\b", "mobilization", value, flags=re.IGNORECASE)
    else:
        if "دالي" in source:
            value = re.sub(r"ডেইলি|ড্যালি|ডেলি", "ডালি", value)
        if "مكة" in source:
            value = re.sub(r"মেক্সিকো|মেকা|মক্কাহ", "মক্কা", value)
        if "عامل" in source:
            value = value.replace("ফ্যাক্টর", "কর্মী")
        if "كفال" in source or "كفيل" in source:
            value = re.sub(r"জামিন|বেইল|নিশ্চয়তা|গ্যারান্টি|ওয়ারেন্টি", "স্পনসরশিপ", value)
        if "إقام" in source and "سكن" not in source:
            value = re.sub(r"বাসস্থান|আবাসন", "ইকামা", value)
        if "دفعة" in source:
            value = re.sub(r"ইনস্টলেশন|ব্যাচ", "কিস্তি", value)
        if "وردي" in source:
            value = re.sub(r"গোলাপ|কাজ পরিবর্তন", "কাজের শিফট", value)
        if "اعتماد" in source:
            value = value.replace("দত্তক", "অনুমোদন")
        if "إسناد" in source:
            value = value.replace("বিনিয়োগ", "নিয়োগ")
        if "عرض" in source and "سعر" in source:
            value = re.sub(r"দাম প্রদর্শন|দামের অফার|মূল্য অফার|দাম অফার", "মূল্য প্রস্তাব", value)
        if "مستحق" in source:
            value = re.sub(r"\bদুই\b", "প্রাপ্য", value)
        if "حج" in source:
            value = re.sub(r"নামাজ|প্রার্থনা", "হজ", value)
        if source == "جدة":
            value = "জেদ্দা"
        if re.search(r"مهن(?!ي)", source):
            value = value.replace("ক্যারিয়ার", "পেশা")
    return value


def save(cache):
    CACHE_FILE.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")


def load_model():
    tokenizer = M2M100Tokenizer.from_pretrained(MODEL_NAME, local_files_only=True)
    model = M2M100ForConditionalGeneration.from_pretrained(MODEL_NAME, local_files_only=True)
    model.eval()
    return tokenizer, model


def translate_batches(tokenizer, model, rows, target, cache, batch_size=64):
    completed = 0
    invalid_rows = []
    tokenizer.src_lang = target
    rows.sort(key=lambda row: len(row["request"]))
    with torch.inference_mode():
        for offset in range(0, len(rows), batch_size):
            batch = rows[offset:offset + batch_size]
            encoded = tokenizer([row["request"] for row in batch], return_tensors="pt", padding=True, truncation=True, max_length=384)
            input_tokens = int(encoded["attention_mask"].sum(dim=1).max().item())
            generated = model.generate(**encoded, num_beams=2, max_new_tokens=max(32, min(256, input_tokens * 2 + 16)))
            translations = tokenizer.batch_decode(generated, skip_special_tokens=True)
            for row, translated in zip(batch, translations):
                value = apply_glossary(row["source"], restore(translated), target)
                placeholders = PLACEHOLDER.findall(row["source"])
                required = ["{{" + item + "}}" for item in placeholders]
                if not valid(value, target, required):
                    invalid_rows.append((row["source"], value))
                else:
                    cache[row["kind"]][target][row["source"]] = value
            completed += len(batch)
            save(cache)
            print(f"{target}: {completed}/{len(rows)}", flush=True)
    if invalid_rows:
        cache.setdefault("invalid", {})[target] = dict(invalid_rows)
        save(cache)
        for source, value in invalid_rows:
            print(f"INVALID {target}: {source} -> {value}", flush=True)
        raise RuntimeError(f"{len(invalid_rows)} local {target} translations require review")


work = json.loads(WORK_FILE.read_text(encoding="utf-8"))
cache = json.loads(CACHE_FILE.read_text(encoding="utf-8")) if CACHE_FILE.exists() else {}
if cache.get("generator") != CACHE_VERSION:
    cache = {
    "generator": CACHE_VERSION,
    "static": {"en": {}, "bn": {}},
    "templates": {"en": {}, "bn": {}},
    }
for kind in ("static", "templates"):
    for target in ("en", "bn"):
        cache.setdefault(kind, {}).setdefault(target, {})
    for source, value in list(cache[kind]["en"].items()):
        cleaned = html.unescape(value)
        if cleaned != value:
            cache[kind]["en"][source] = cleaned
            cache[kind]["bn"].pop(source, None)
    for target in ("en", "bn"):
        for source, value in list(cache[kind][target].items()):
            cache[kind][target][source] = apply_glossary(source, value, target)

template_source_set = set(work["templateSources"])
for target, rows in cache.get("invalid", {}).items():
    for source, value in rows.items():
        required = ["{{" + item + "}}" for item in PLACEHOLDER.findall(source)]
        if valid(value, target, required):
            kind = "templates" if source in template_source_set else "static"
            cache[kind][target][source] = value
for source, value in MANUAL_EN.items():
    kind = "templates" if source in template_source_set else "static"
    cache[kind]["en"][source] = value
for source, value in MANUAL_BN.items():
    kind = "templates" if source in template_source_set else "static"
    cache[kind]["bn"][source] = value
cache.setdefault("invalid", {}).pop("en", None)
cache.setdefault("invalid", {}).pop("bn", None)
save(cache)

existing = work["existing"]
english_rows = []
for source in work["staticSources"]:
    if not valid(existing.get(source, {}).get("en"), "en") and not valid(cache["static"]["en"].get(source), "en"):
        english_rows.append({"kind": "static", "source": source, "request": source})
for source in work["templateSources"]:
    required = PLACEHOLDER.findall(source)
    placeholders = ["{{" + item + "}}" for item in required]
    if not valid(cache["templates"]["en"].get(source), "en", placeholders):
        english_rows.append({"kind": "templates", "source": source, "request": protect(source)})

if english_rows:
    print(f"Loading local multilingual model for {len(english_rows)} English strings", flush=True)
    tokenizer, model = load_model()
    translate_batches(tokenizer, model, english_rows, "en", cache)
else:
    tokenizer = model = None

bengali_rows = []
for source in work["staticSources"]:
    if valid(existing.get(source, {}).get("bn"), "bn") or valid(cache["static"]["bn"].get(source), "bn"):
        continue
    english = existing.get(source, {}).get("en") or cache["static"]["en"].get(source)
    if not valid(english, "en"):
        raise RuntimeError(f"English pivot is unavailable for: {source}")
    bengali_rows.append({"kind": "static", "source": source, "request": english.replace("(s)", "")})
for source in work["templateSources"]:
    required = PLACEHOLDER.findall(source)
    placeholders = ["{{" + item + "}}" for item in required]
    if valid(cache["templates"]["bn"].get(source), "bn", placeholders):
        continue
    english = cache["templates"]["en"].get(source)
    if not valid(english, "en", placeholders):
        raise RuntimeError(f"English template pivot is unavailable for: {source}")
    bengali_rows.append({"kind": "templates", "source": source, "request": protect(english.replace("(s)", ""))})

if bengali_rows:
    print(f"Translating {len(bengali_rows)} Bengali strings from the reviewed English pivot", flush=True)
    if tokenizer is None or model is None:
        tokenizer, model = load_model()
    translate_batches(tokenizer, model, bengali_rows, "bn", cache)

del tokenizer, model
gc.collect()

save(cache)
print("Local translation cache is complete.", flush=True)
