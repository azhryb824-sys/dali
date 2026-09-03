"use client";

import { useMemo, useState } from "react";

type Locale = "ar" | "en" | "bn";
type Localized = Record<Locale, string>;
type ModuleGuide = {
  key: string;
  always?: boolean;
  rootOnly?: boolean;
  anyOf?: string[];
  allOf?: string[];
  title: Localized;
  description: Localized;
  steps: Record<Locale, string[]>;
};

const t = (ar: string, en: string, bn: string): Localized => ({ ar, en, bn });
const s = (ar: string[], en: string[], bn: string[]): Record<Locale, string[]> => ({ ar, en, bn });

const copy: Record<Locale, {
  eyebrow: string;
  title: string;
  intro: string;
  search: string;
  accessTitle: string;
  accessBody: string;
  role: string;
  department: string;
  pages: string;
  capabilities: string;
  fullAccess: string;
  startTitle: string;
  workflowTitle: string;
  workflowBody: string;
  modulesTitle: string;
  modulesBody: string;
  instructionsTitle: string;
  noModules: string;
  notesTitle: string;
  notesBody: string;
  notesExample: string;
  notesRule: string;
  securityTitle: string;
  permissionTitle: string;
  permissionBody: string;
  securityRules: string[];
}> = {
  ar: {
    eyebrow: "دليل العمل داخل نظام دالي",
    title: "كيف تستخدم النظام وتنجز العمل",
    intro: "دليل تشغيلي مفصل مرتبط بصلاحيات حسابك. يشرح وظيفة كل صفحة، والبيانات التي يجب مراجعتها، وتسلسل تنفيذ المعاملة من الإنشاء والحفظ إلى المراجعة والاعتماد والإغلاق.",
    search: "ابحث باسم الصفحة أو الإجراء أو الصلاحية...",
    accessTitle: "نطاقك الحالي",
    accessBody: "تظهر لك الصفحات والإجراءات التي يسمح بها دورك فقط. إذا لم يظهر زر مطلوب، فاطلب من مالك النظام أو المشرف مراجعة الدور بدل مشاركة الحساب.",
    role: "نوع الحساب",
    department: "القسم",
    pages: "صفحات متاحة",
    capabilities: "صلاحيات فعالة",
    fullAccess: "وصول كامل",
    startTitle: "ابدأ في خمس خطوات",
    workflowTitle: "مسار العمل الموحّد",
    workflowBody: "كل معاملة تحفظ المنشئ والوقت والحالة والمرفقات والقرار. اتبع التسلسل الظاهر ولا تعتبر الحفظ اعتمادًا أو ترحيلًا أو دفعًا.",
    modulesTitle: "دليل صفحاتك",
    modulesBody: "القائمة أدناه مفلترة تلقائيًا بحسب صلاحيات حسابك. افتح اسم الصفحة لقراءة خطوات استخدامها والتحقق من النتيجة.",
    instructionsTitle: "طريقة العمل في هذه الصفحة",
    noModules: "لا توجد صفحات تشغيلية مطابقة للبحث أو للصلاحيات الحالية.",
    notesTitle: "كيف تكتب الملاحظات",
    notesBody: "اكتب واقعة محددة قابلة للمتابعة، واذكر السجل المرتبط وما الذي حدث ومن المسؤول والإجراء التالي وموعده. تجنب العبارات العامة أو كتابة قرار اعتماد داخل الملاحظة.",
    notesExample: "مثال: لم يصل مرفق الفاتورة — المسؤول: المحاسب — الإجراء: طلب نسخة معتمدة — الموعد: 5 سبتمبر.",
    notesRule: "الملاحظة ليست اعتمادًا. استخدم زر الاعتماد أو الرفض أو الإلغاء المخصص حتى يسجل النظام القرار وصاحبه.",
    securityTitle: "قواعد الأمان",
    permissionTitle: "معاني الصلاحيات",
    permissionBody: "القراءة للاطلاع فقط، والكتابة للإنشاء والتعديل، والاعتماد لاتخاذ القرار، بينما الترحيل والدفع والمشاركة والتصدير صلاحيات مستقلة للعمليات الحساسة.",
    securityRules: ["لا تشارك كلمة المرور أو رمز التحقق أو جلسة الدخول.", "لا تستخدم حساب مستخدم آخر حتى لو كانت صلاحياته أعلى.", "نزّل المستندات وشاركها من الأزرار الرسمية فقط.", "راجع الجهة والمبلغ والحالة والمرفق قبل أي قرار.", "لا تكرر الحفظ أو الدفع إذا تأخر الرد؛ تحقق أولًا من السجل.", "سجّل الخروج عند استخدام جهاز مشترك أو عند انتهاء العمل."],
  },
  en: {
    eyebrow: "Dali System working guide",
    title: "Use the system and complete your work",
    intro: "A detailed operating guide tailored to your account permissions. It explains each page, the data to review, and how a transaction moves from creation and saving through review, approval, and closure.",
    search: "Search for a page, action, or permission...",
    accessTitle: "Your current access",
    accessBody: "You only see pages and actions allowed by your role. If a required action is missing, ask the system owner or administrator to review your role instead of sharing an account.",
    role: "Account type",
    department: "Department",
    pages: "Available pages",
    capabilities: "Effective permissions",
    fullAccess: "Full access",
    startTitle: "Start in five steps",
    workflowTitle: "Standard workflow",
    workflowBody: "Every transaction records its creator, time, status, attachments, and decision. Follow the displayed sequence; saving is not the same as approval, posting, or payment.",
    modulesTitle: "Your page guide",
    modulesBody: "The list below is filtered using your current permissions. Open a page name to read its operating steps and how to verify the result.",
    instructionsTitle: "How to work on this page",
    noModules: "No operational pages match the search or your current permissions.",
    notesTitle: "How to write notes",
    notesBody: "Record a specific, actionable fact with the linked record, what happened, the owner, the next action, and its due date. Avoid vague statements or placing an approval decision inside a note.",
    notesExample: "Example: Invoice attachment not received — owner: accountant — action: request an approved copy — due: 5 September.",
    notesRule: "A note is not an approval. Use the dedicated approve, reject, or cancel action so the system records the decision and its owner.",
    securityTitle: "Security rules",
    permissionTitle: "Permission meanings",
    permissionBody: "Read is view-only, write allows creation and editing, and approve allows decisions. Posting, payment, sharing, and export remain separate permissions for sensitive operations.",
    securityRules: ["Never share your password, verification code, or signed-in session.", "Do not use another person's account, even when it has broader access.", "Download and share documents only through official actions.", "Check the party, amount, status, and attachment before any decision.", "If saving or payment is slow, check the record before repeating the action.", "Sign out after using a shared device or finishing work."],
  },
  bn: {
    eyebrow: "ডালি সিস্টেমে কাজের নির্দেশিকা",
    title: "সিস্টেম ব্যবহার করে কাজ সম্পন্ন করুন",
    intro: "আপনার অ্যাকাউন্টের অনুমতি অনুযায়ী তৈরি বিস্তারিত পরিচালনা নির্দেশিকা। প্রতিটি পৃষ্ঠার কাজ, যাচাইযোগ্য তথ্য এবং একটি লেনদেন তৈরি ও সংরক্ষণ থেকে পর্যালোচনা, অনুমোদন ও সমাপ্তি পর্যন্ত কীভাবে এগোয় তা এখানে ব্যাখ্যা করা হয়েছে।",
    search: "পৃষ্ঠা, কাজ বা অনুমতি খুঁজুন...",
    accessTitle: "আপনার বর্তমান প্রবেশাধিকার",
    accessBody: "আপনার ভূমিকার অনুমোদিত পৃষ্ঠা ও কাজগুলোই দেখা যায়। প্রয়োজনীয় কোনো কাজ না দেখালে অ্যাকাউন্ট শেয়ার না করে সিস্টেম মালিক বা প্রশাসককে ভূমিকা পর্যালোচনা করতে বলুন।",
    role: "অ্যাকাউন্টের ধরন",
    department: "বিভাগ",
    pages: "উপলভ্য পৃষ্ঠা",
    capabilities: "কার্যকর অনুমতি",
    fullAccess: "সম্পূর্ণ প্রবেশাধিকার",
    startTitle: "পাঁচ ধাপে শুরু করুন",
    workflowTitle: "সাধারণ কর্মপ্রবাহ",
    workflowBody: "প্রতিটি লেনদেনে প্রস্তুতকারী, সময়, অবস্থা, সংযুক্তি ও সিদ্ধান্ত সংরক্ষিত হয়। প্রদর্শিত ধাপ অনুসরণ করুন; সংরক্ষণ অনুমোদন, পোস্টিং বা পরিশোধ নয়।",
    modulesTitle: "আপনার পৃষ্ঠার নির্দেশিকা",
    modulesBody: "আপনার বর্তমান অনুমতি অনুযায়ী নিচের তালিকা ফিল্টার করা হয়েছে। ব্যবহারের ধাপ ও ফল যাচাই করতে পৃষ্ঠার নাম খুলুন।",
    instructionsTitle: "এই পৃষ্ঠায় কাজ করার পদ্ধতি",
    noModules: "অনুসন্ধান বা বর্তমান অনুমতির সঙ্গে মেলে এমন কোনো পরিচালনাগত পৃষ্ঠা নেই।",
    notesTitle: "কীভাবে নোট লিখবেন",
    notesBody: "সংযুক্ত রেকর্ড, কী ঘটেছে, দায়িত্বে কে, পরবর্তী কাজ এবং সময়সীমা উল্লেখ করে নির্দিষ্ট ও অনুসরণযোগ্য তথ্য লিখুন। অস্পষ্ট কথা বা নোটের মধ্যে অনুমোদনের সিদ্ধান্ত লেখা এড়িয়ে চলুন।",
    notesExample: "উদাহরণ: চালানের সংযুক্তি পাওয়া যায়নি — দায়িত্ব: হিসাবরক্ষক — কাজ: অনুমোদিত কপি চাওয়া — সময়সীমা: ৫ সেপ্টেম্বর।",
    notesRule: "নোট কোনো অনুমোদন নয়। সিদ্ধান্ত ও সিদ্ধান্তদাতাকে নথিভুক্ত করতে নির্দিষ্ট অনুমোদন, প্রত্যাখ্যান বা বাতিল বোতাম ব্যবহার করুন।",
    securityTitle: "নিরাপত্তার নিয়ম",
    permissionTitle: "অনুমতির অর্থ",
    permissionBody: "Read শুধু দেখার জন্য, write তৈরি ও সম্পাদনার জন্য এবং approve সিদ্ধান্তের জন্য। পোস্টিং, পরিশোধ, শেয়ার ও রপ্তানি সংবেদনশীল কাজের আলাদা অনুমতি।",
    securityRules: ["পাসওয়ার্ড, যাচাইকরণ কোড বা লগইন সেশন শেয়ার করবেন না।", "অন্য ব্যবহারকারীর অ্যাকাউন্ট ব্যবহার করবেন না, তার অনুমতি বেশি হলেও নয়।", "শুধু নির্ধারিত বোতাম দিয়ে নথি ডাউনলোড ও শেয়ার করুন।", "সিদ্ধান্তের আগে পক্ষ, অর্থ, অবস্থা ও সংযুক্তি যাচাই করুন।", "সংরক্ষণ বা পরিশোধে দেরি হলে পুনরাবৃত্তির আগে রেকর্ড পরীক্ষা করুন।", "শেয়ার করা ডিভাইস ব্যবহারের পর বা কাজ শেষে লগআউট করুন।"],
  },
};

const roleLabels: Record<"admin" | "manager" | "employee", Localized> = {
  admin: t("مدير النظام", "System administrator", "সিস্টেম প্রশাসক"),
  manager: t("الإدارة", "Management", "ব্যবস্থাপনা"),
  employee: t("موظف", "Employee", "কর্মচারী"),
};

const departmentLabels: Record<string, Localized> = {
  employees: t("الموظفون", "Employees", "কর্মচারী"),
  finance: t("المالية", "Finance", "অর্থ বিভাগ"),
  legal: t("الشؤون القانونية", "Legal", "আইন বিভাগ"),
  workforce: t("العمالة والتشغيل", "Workforce operations", "শ্রমিক পরিচালনা"),
  construction: t("المقاولات", "Construction", "নির্মাণ"),
  general: t("صلاحية عامة", "General", "সাধারণ"),
};

const actionLabels: Record<string, Localized> = {
  read: t("عرض", "View", "দেখা"),
  write: t("إنشاء وتعديل", "Create and edit", "তৈরি ও সম্পাদনা"),
  approve: t("اعتماد", "Approve", "অনুমোদন"),
  post: t("ترحيل", "Post", "পোস্ট"),
  pay: t("دفع", "Pay", "পরিশোধ"),
  share: t("مشاركة", "Share", "শেয়ার"),
  export: t("تصدير", "Export", "রপ্তানি"),
  manage: t("إدارة", "Manage", "পরিচালনা"),
  transfer: t("تحويل", "Transfer", "হস্তান্তর"),
  administer: t("إدارة عليا", "Administer", "প্রশাসন"),
};

const quickSteps: Record<Locale, string[]> = s(
  ["اختر العربية أو الإنجليزية أو البنغالية، وتأكد من ظهور اتجاه النص بصورة صحيحة.", "راجع اسمك ودورك وقسمك ونطاق الصلاحيات الظاهر أعلى الدليل قبل بدء العمل.", "ابدأ بمركز الإشعارات والمهام لمعرفة الطلبات المتأخرة أو التي تنتظر تدخلك.", "استخدم البحث الشامل باسم العميل أو العامل أو العقد أو رقم المرجع، ثم افتح السجل الصحيح.", "نفّذ الإجراء مرة واحدة، وانتظر رسالة النجاح، ثم تحقق من الحالة الجديدة وسجل النشاط."],
  ["Choose Arabic, English, or Bengali and confirm that the text direction is displayed correctly.", "Review your name, role, department, and access scope at the top of the guide before starting.", "Start with Notifications and Tasks to identify overdue items or requests waiting for you.", "Use global search with a client, worker, contract, or reference number, then open the correct record.", "Perform the action once, wait for the success message, and verify the new status and activity trail."],
  ["আরবি, ইংরেজি বা বাংলা বেছে নিয়ে লেখার দিক সঠিক আছে কি না নিশ্চিত করুন।", "কাজ শুরুর আগে নির্দেশিকার ওপরে আপনার নাম, ভূমিকা, বিভাগ ও অনুমতির পরিধি দেখুন।", "বিলম্বিত বিষয় বা আপনার অপেক্ষায় থাকা অনুরোধ জানতে বিজ্ঞপ্তি ও কাজের তালিকা দিয়ে শুরু করুন।", "গ্রাহক, শ্রমিক, চুক্তি বা রেফারেন্স নম্বর দিয়ে সার্বিক অনুসন্ধান করে সঠিক রেকর্ড খুলুন।", "কাজটি একবার করুন, সফলতার বার্তার জন্য অপেক্ষা করুন, তারপর নতুন অবস্থা ও কার্যক্রমের ইতিহাস যাচাই করুন।"],
);

const workflowSteps: Record<Locale, string[]> = s(
  ["أنشئ السجل في الوحدة الصحيحة، وأكمل الحقول الإلزامية، واربطه بالعميل أو العقد أو العامل عند الحاجة.", "أرفق المستند الداعم الصحيح، وراجع نوع الملف وصلاحيته وتاريخ انتهائه قبل الحفظ.", "احفظ السجل كمسودة، وراجع القيم والحسابات، ثم أرسله للمراجعة أو الاعتماد من الزر المخصص.", "يتخذ مستخدم آخر مخوّل القرار بعد مراجعة البيانات والمرفقات؛ ويجب توثيق سبب الرفض أو طلب التعديل.", "بعد الاعتماد نفّذ الإجراء التالي، مثل الإصدار أو الترحيل أو الدفع أو التفعيل، حسب صلاحيتك.", "تحقق من الحالة النهائية والإشعار وسجل النشاط والمستند الناتج، ولا تكرر العملية إذا كانت النتيجة مسجلة."],
  ["Create the record in the correct module, complete required fields, and link the client, contract, or worker when applicable.", "Attach the correct supporting document and check its file type, validity, and expiry date before saving.", "Save the record as a draft, review values and calculations, then submit it using the dedicated review or approval action.", "Another authorized user reviews the data and attachments before deciding; rejection or change requests must include a reason.", "After approval, complete the next action—such as issue, post, pay, or activate—according to your permission.", "Verify the final status, notification, activity trail, and generated document; do not repeat an operation already recorded."],
  ["সঠিক মডিউলে রেকর্ড তৈরি করুন, আবশ্যিক ঘর পূরণ করুন এবং প্রয়োজন হলে গ্রাহক, চুক্তি বা শ্রমিকের সঙ্গে যুক্ত করুন।", "সঠিক সহায়ক নথি সংযুক্ত করে সংরক্ষণের আগে ফাইলের ধরন, বৈধতা ও মেয়াদ যাচাই করুন।", "খসড়া হিসেবে সংরক্ষণ করে মান ও হিসাব দেখুন, তারপর নির্ধারিত পর্যালোচনা বা অনুমোদন বোতাম দিয়ে পাঠান।", "অন্য অনুমোদিত ব্যবহারকারী তথ্য ও সংযুক্তি দেখে সিদ্ধান্ত নেবেন; প্রত্যাখ্যান বা পরিবর্তনের অনুরোধে কারণ লিখতে হবে।", "অনুমোদনের পর আপনার অনুমতি অনুযায়ী প্রকাশ, পোস্টিং, পরিশোধ বা সক্রিয়করণের মতো পরবর্তী কাজ করুন।", "চূড়ান্ত অবস্থা, বিজ্ঞপ্তি, কার্যক্রমের ইতিহাস ও তৈরি নথি যাচাই করুন; ইতিমধ্যে নথিভুক্ত কাজ পুনরায় করবেন না।"],
);

const modules: ModuleGuide[] = [
  {
    key: "overview",
    always: true,
    title: t("نظرة عامة", "Overview", "সারসংক্ষেপ"),
    description: t("لوحة البداية التي تجمع مؤشرات العمل اليومية والتنبيهات والاختصارات إلى السجلات المهمة.", "Your starting dashboard for daily indicators, alerts, and shortcuts to important records.", "দৈনিক সূচক, সতর্কতা এবং গুরুত্বপূর্ণ রেকর্ডের শর্টকাটসহ শুরুর ড্যাশবোর্ড।"),
    steps: s(
      ["ابدأ ببطاقات الحالات التي تحمل رقمًا أو تنبيهًا، وقارنها بمهامك وإشعاراتك المستحقة اليوم.", "اضغط البطاقة أو الاختصار لفتح القائمة المفلترة، ولا تعتمد على الرقم المختصر وحده لاتخاذ قرار.", "افتح السجل المطلوب وراجع حالته وآخر تحديث والمسؤول عنه قبل تنفيذ أي إجراء.", "إذا بدت البيانات قديمة، حدّث الصفحة وتحقق من نطاق التاريخ أو القسم ثم ارجع إلى الوحدة الأصلية."],
      ["Start with status cards that show a count or alert and compare them with tasks and notifications due today.", "Open a card or shortcut to inspect its filtered list; do not make a decision from the summary count alone.", "Open the required record and review its status, last update, and owner before taking action.", "If data appears stale, refresh the page, check the date or department scope, and verify it in the source module."],
      ["সংখ্যা বা সতর্কতা দেখানো স্ট্যাটাস কার্ড দিয়ে শুরু করুন এবং আজকের কাজ ও বিজ্ঞপ্তির সঙ্গে মিলিয়ে দেখুন।", "ফিল্টার করা তালিকা দেখতে কার্ড বা শর্টকাট খুলুন; শুধু সারসংক্ষেপের সংখ্যা দেখে সিদ্ধান্ত নেবেন না।", "কাজ করার আগে প্রয়োজনীয় রেকর্ডের অবস্থা, সর্বশেষ হালনাগাদ ও দায়িত্বশীল ব্যক্তি দেখুন।", "তথ্য পুরোনো মনে হলে পৃষ্ঠা রিফ্রেশ করে তারিখ বা বিভাগের পরিধি যাচাই করুন এবং মূল মডিউলে মিলিয়ে নিন।"],
    ),
  },
  {
    key: "search",
    always: true,
    title: t("البحث الشامل", "Global Search", "সার্বিক অনুসন্ধান"),
    description: t("الوصول السريع إلى العملاء والعاملين والعقود والطلبات باستخدام الاسم أو رقم المرجع.", "Quickly find clients, workers, contracts, and requests by name or reference number.", "নাম বা রেফারেন্স নম্বর দিয়ে দ্রুত গ্রাহক, শ্রমিক, চুক্তি ও অনুরোধ খুঁজুন।"),
    steps: s(
      ["اكتب اسم العميل أو العامل أو رقم العقد أو رقم المرجع كاملًا قدر الإمكان لتقليل النتائج المتشابهة.", "راجع نوع كل نتيجة وحالتها والجهة المرتبطة بها قبل فتحها، خصوصًا عند تكرار الأسماء.", "لا تظهر في النتائج إلا السجلات التي تسمح صلاحياتك بقراءتها؛ عدم الظهور لا يعني حذف السجل.", "افتح النتيجة الصحيحة، ثم نفّذ الإجراء داخل صفحتها الأصلية حتى يُحفظ في سجل النشاط."],
      ["Enter as much of the client, worker, contract, or reference number as possible to narrow similar results.", "Check each result's type, status, and related party before opening it, especially when names are duplicated.", "Search only returns records your permissions allow you to read; a missing result does not mean it was deleted.", "Open the correct result and perform the action in its source page so it is recorded in the activity trail."],
      ["একই ধরনের ফল কমাতে গ্রাহক বা শ্রমিকের নাম, চুক্তি নম্বর বা রেফারেন্স নম্বর যতটা সম্ভব সম্পূর্ণ লিখুন।", "বিশেষ করে একই নাম থাকলে ফল খোলার আগে ধরন, অবস্থা ও সংশ্লিষ্ট পক্ষ যাচাই করুন।", "আপনার read অনুমতি থাকা রেকর্ডই অনুসন্ধানে আসে; ফল না পাওয়া মানে রেকর্ড মুছে গেছে এমন নয়।", "সঠিক ফল খুলে তার মূল পৃষ্ঠায় কাজটি করুন, যাতে কার্যক্রমের ইতিহাসে তা সংরক্ষিত হয়।"],
    ),
  },
  {
    key: "notifications",
    always: true,
    title: t("مركز الإشعارات", "Notification Center", "বিজ্ঞপ্তি কেন্দ্র"),
    description: t("أحداث النظام التي تنبهك إلى قرار أو موعد أو تغيير يحتاج قراءة ومتابعة.", "System events that alert you to a decision, deadline, or change requiring follow-up.", "সিদ্ধান্ত, সময়সীমা বা পরিবর্তন অনুসরণের জন্য সিস্টেমের সতর্কবার্তা।"),
    steps: s(
      ["صفِّ الإشعارات حسب غير المقروء أو النوع، وابدأ بالتنبيهات الحرجة والمتأخرة.", "اقرأ مصدر الإشعار وسببه ووقته والسجل المرتبط به؛ فالعنوان المختصر لا يعرض السياق كاملًا.", "افتح السجل من رابط الإشعار، وراجع آخر التغييرات ثم نفّذ الإجراء الذي تسمح به صلاحيتك.", "علّم الإشعار كمقروء بعد المتابعة، وتأكد من اختفائه من قائمة ما يحتاج إجراءً."],
      ["Filter by unread status or type and handle critical or overdue notifications first.", "Read the notification source, reason, time, and linked record; the short title does not contain the full context.", "Open the linked record, review its latest changes, and perform the action allowed by your permission.", "Mark the notification as read after follow-up and confirm it no longer appears among items needing action."],
      ["অপঠিত অবস্থা বা ধরন দিয়ে ফিল্টার করে জরুরি ও বিলম্বিত বিজ্ঞপ্তি আগে দেখুন।", "উৎস, কারণ, সময় ও সংযুক্ত রেকর্ড পড়ুন; ছোট শিরোনামে সম্পূর্ণ প্রসঙ্গ থাকে না।", "সংযুক্ত রেকর্ড খুলে সর্বশেষ পরিবর্তন দেখুন এবং আপনার অনুমোদিত কাজটি করুন।", "অনুসরণ শেষে বিজ্ঞপ্তি পঠিত হিসেবে চিহ্নিত করুন এবং করণীয় তালিকা থেকে সরে গেছে কি না দেখুন।"],
    ),
  },
  {
    key: "tasks",
    always: true,
    title: t("المهام والتذكيرات", "Tasks and Reminders", "কাজ ও স্মরণিকা"),
    description: t("تنظيم مهامك الخاصة وما يُسند إليك مع الأولوية والموعد والسجل المرتبط.", "Organize private and assigned work with priority, due date, and linked records.", "অগ্রাধিকার, সময়সীমা ও সংযুক্ত রেকর্ডসহ নিজস্ব ও অর্পিত কাজ সাজান।"),
    steps: s(
      ["أنشئ عنوانًا واضحًا للمهمة، وحدد المسؤول والأولوية وموعد الاستحقاق بدل وضعها كلها في الملاحظات.", "اربط المهمة بالعميل أو العقد أو الطلب المعني، وأضف تفاصيل النتيجة المطلوبة في الوصف.", "عند استلام مهمة مسندة، أكد الاستلام وحدّث حالتها إذا بدأت أو تعذر التنفيذ مع كتابة السبب.", "لا تغلق المهمة إلا بعد تنفيذ المطلوب؛ اكتب النتيجة النهائية وتحقق من اكتمال السجل المرتبط."],
      ["Give the task a clear title and set its owner, priority, and due date instead of placing everything in notes.", "Link it to the relevant client, contract, or request and describe the expected outcome.", "Acknowledge an assigned task and update its status when work starts or becomes blocked, including the reason.", "Complete the task only after the work is done; record the outcome and verify the linked record."],
      ["কাজের স্পষ্ট শিরোনাম দিন এবং সবকিছু নোটে না লিখে দায়িত্বশীল ব্যক্তি, অগ্রাধিকার ও সময়সীমা নির্ধারণ করুন।", "সংশ্লিষ্ট গ্রাহক, চুক্তি বা অনুরোধের সঙ্গে যুক্ত করে প্রত্যাশিত ফল বর্ণনা করুন।", "অর্পিত কাজ গ্রহণ নিশ্চিত করুন এবং শুরু হলে বা বাধা এলে কারণসহ অবস্থা হালনাগাদ করুন।", "কাজ সম্পন্ন না হওয়া পর্যন্ত বন্ধ করবেন না; ফল লিখে সংযুক্ত রেকর্ড যাচাই করুন।"],
    ),
  },
  {
    key: "conversations",
    anyOf: ["conversations.read", "conversations.write"],
    title: t("المحادثات المباشرة", "Live Conversations", "সরাসরি কথোপকথন"),
    description: t("متابعة رسائل زوار الموقع من الانتظار إلى الرد والتحويل والإغلاق وتقييم الخدمة.", "Handle visitor messages from waiting through reply, transfer, closure, and service rating.", "দর্শকের বার্তা অপেক্ষা থেকে উত্তর, হস্তান্তর, সমাপ্তি ও সেবা মূল্যায়ন পর্যন্ত পরিচালনা করুন।"),
    steps: s(
      ["ابدأ بالمحادثات المنتظرة أو غير المقروءة، وتحقق من اسم الزائر ووسيلة التواصل ووقت آخر رسالة.", "اقرأ المحادثة كاملة والصفحة التي بدأ منها الزائر قبل الرد حتى لا تطلب معلومات سبق تقديمها.", "استخدم الرد أو تغيير الحالة فقط إذا كانت لديك صلاحية الكتابة، وحوّل المحادثة للجهة المختصة عند الحاجة.", "عند حل الطلب، لخّص النتيجة ثم أنهِ المحادثة وتابع تقييم الخدمة أو أي طلب متابعة ناتج عنها."],
      ["Start with waiting or unread conversations and check the visitor, contact method, and last-message time.", "Read the full conversation and its originating page before replying so you do not request information already provided.", "Reply or change status only with write permission, and transfer the conversation to the responsible team when needed.", "When resolved, summarize the outcome, close the conversation, and review any service rating or follow-up request."],
      ["অপেক্ষমাণ বা অপঠিত কথোপকথন আগে খুলে দর্শক, যোগাযোগের মাধ্যম ও সর্বশেষ বার্তার সময় যাচাই করুন।", "ইতিমধ্যে দেওয়া তথ্য আবার না চাইতে উত্তর দেওয়ার আগে সম্পূর্ণ কথোপকথন ও শুরুর পৃষ্ঠা পড়ুন।", "write অনুমতি থাকলেই উত্তর বা অবস্থা পরিবর্তন করুন এবং প্রয়োজনে দায়িত্বশীল দলে হস্তান্তর করুন।", "সমাধান হলে ফল সংক্ষেপে লিখে কথোপকথন শেষ করুন এবং সেবা মূল্যায়ন বা পরবর্তী অনুরোধ দেখুন।"],
    ),
  },
  {
    key: "employees",
    anyOf: ["employees.read"],
    title: t("إدارة الموظفين", "Employee Management", "কর্মচারী ব্যবস্থাপনা"),
    description: t("إدارة الملف الوظيفي والوثائق والحضور والإجازات والبيانات البنكية ومسيرات الرواتب.", "Manage employment profiles, documents, attendance, leave, bank data, and payroll runs.", "চাকরির প্রোফাইল, নথি, উপস্থিতি, ছুটি, ব্যাংক তথ্য ও বেতন প্রক্রিয়া পরিচালনা করুন।"),
    steps: s(
      ["افتح ملف الموظف وتحقق من الهوية والحالة الوظيفية والقسم والمسمى والربط بحساب المستخدم.", "أكمل الوثائق الإلزامية وتواريخ الإصدار والانتهاء، وتأكد من وضوح المرفقات قبل اعتماد الملف.", "راجع الحضور والإجازات والاستقطاعات والبدلات للفترة نفسها قبل إنشاء مسير الراتب.", "تحقق من الآيبان واسم المستفيد دون نسخ البيانات إلى الملاحظات أو مشاركتها خارج النظام.", "أنشئ الطلب أو المسير كمسودة، ثم أرسله لمستخدم آخر مخوّل بالمراجعة والاعتماد وتحقق من حالته النهائية."],
      ["Open the employee profile and verify identity, employment status, department, title, and linked user account.", "Complete required documents and issue/expiry dates, and ensure attachments are legible before approval.", "Review attendance, leave, deductions, and allowances for the same period before creating payroll.", "Verify the IBAN and beneficiary name without copying bank data into notes or sharing it outside the system.", "Create the request or payroll run as a draft, submit it to another authorized reviewer, and verify its final status."],
      ["কর্মচারীর প্রোফাইল খুলে পরিচয়, চাকরির অবস্থা, বিভাগ, পদবী ও সংযুক্ত ব্যবহারকারী অ্যাকাউন্ট যাচাই করুন।", "আবশ্যিক নথি ও ইস্যু/মেয়াদের তারিখ পূরণ করে অনুমোদনের আগে সংযুক্তি স্পষ্ট কি না দেখুন।", "বেতন প্রক্রিয়া তৈরির আগে একই সময়ের উপস্থিতি, ছুটি, কর্তন ও ভাতা পর্যালোচনা করুন।", "ব্যাংক তথ্য নোটে কপি বা সিস্টেমের বাইরে শেয়ার না করে IBAN ও সুবিধাভোগীর নাম যাচাই করুন।", "অনুরোধ বা বেতন প্রক্রিয়া খসড়া হিসেবে তৈরি করে অন্য অনুমোদিত পর্যালোচকের কাছে পাঠান এবং চূড়ান্ত অবস্থা দেখুন।"],
    ),
  },
  {
    key: "finance",
    anyOf: ["finance.read"],
    title: t("الإدارة المالية", "Finance", "অর্থ ব্যবস্থাপনা"),
    description: t("إدارة الحركات والقيود والمشتريات والتسويات والفواتير والدفعات مع فصل الصلاحيات الحساسة.", "Manage transactions, journals, purchasing, reconciliations, invoices, and payments with separated controls.", "আলাদা সংবেদনশীল অনুমতিসহ লেনদেন, জার্নাল, ক্রয়, সমন্বয়, চালান ও পরিশোধ পরিচালনা করুন।"),
    steps: s(
      ["اختر نوع الحركة والجهة والحساب الصحيح، واربطها بالعقد أو العامل أو طلب الشراء لتبقى قابلة للتتبع.", "راجع المبلغ والعملة والضريبة والتاريخ ومركز التكلفة، ثم أرفق فاتورة أو سندًا واضحًا ومطابقًا.", "احفظ المسودة وراجع القيم والحسابات والتكرار المحتمل قبل إرسالها للاعتماد من الزر المخصص.", "بعد الاعتماد، ينفذ المستخدم المخوّل الترحيل أو الدفع مرة واحدة؛ فلكل منهما صلاحية وحالة وسجل مستقل.", "تحقق من رقم القيد أو الفاتورة أو سند الدفع والحالة النهائية وأثرها في الرصيد والتقرير قبل إغلاق المتابعة."],
      ["Choose the correct transaction type, party, and account, then link the contract, worker, or purchase request for traceability.", "Check amount, currency, tax, date, and cost center, and attach a clear matching invoice or voucher.", "Save a draft and review values, calculations, and possible duplicates before using the dedicated approval action.", "After approval, an authorized user posts or pays once; each action has its own permission, status, and audit record.", "Verify the journal, invoice, or payment reference, final status, and effect on balances and reports before closing follow-up."],
      ["সঠিক লেনদেনের ধরন, পক্ষ ও হিসাব বেছে নিয়ে অনুসরণযোগ্য রাখতে চুক্তি, শ্রমিক বা ক্রয় অনুরোধের সঙ্গে যুক্ত করুন।", "পরিমাণ, মুদ্রা, কর, তারিখ ও কস্ট সেন্টার দেখে মিল থাকা স্পষ্ট চালান বা ভাউচার সংযুক্ত করুন।", "খসড়া সংরক্ষণ করে মান, হিসাব ও সম্ভাব্য ডুপ্লিকেট দেখুন, তারপর নির্ধারিত অনুমোদন বোতাম ব্যবহার করুন।", "অনুমোদনের পর অনুমোদিত ব্যবহারকারী একবার পোস্ট বা পরিশোধ করবেন; প্রতিটির আলাদা অনুমতি, অবস্থা ও অডিট রেকর্ড আছে।", "অনুসরণ শেষ করার আগে জার্নাল, চালান বা পরিশোধের রেফারেন্স, চূড়ান্ত অবস্থা এবং ব্যালেন্স ও প্রতিবেদনে প্রভাব যাচাই করুন।"],
    ),
  },
  {
    key: "reports",
    anyOf: ["finance.read", "reports.read"],
    title: t("التقارير المالية", "Financial Reports", "আর্থিক প্রতিবেদন"),
    description: t("تحليل ميزان المراجعة والقوائم والحركة النقدية وربحية العقود من البيانات المرحلة.", "Analyze trial balance, statements, cash movement, and contract profitability from posted data.", "পোস্ট করা তথ্য থেকে ট্রায়াল ব্যালেন্স, বিবরণী, নগদ প্রবাহ ও চুক্তির লাভ বিশ্লেষণ করুন।"),
    steps: s(
      ["حدد الفترة والجهة أو العقد ونوع التقرير، وتأكد من المنطقة الزمنية وتاريخ الإقفال قبل العرض.", "راجع أن التقرير يعتمد على القيود المرحلة، وقارن الإجماليات بمصادرها عند وجود فرق أو رصيد غير متوقع.", "عالج الخطأ في الحركة أو القيد الأصلي ثم أعد إنشاء التقرير؛ لا تعدّل الأرقام النهائية يدويًا.", "نزّل PDF أو صدّر البيانات فقط مع صلاحية التصدير، وراجع العنوان والفترة والإجماليات في الملف الناتج."],
      ["Select the period, entity or contract, and report type; check the timezone and closing date before viewing.", "Confirm the report uses posted entries and trace unexpected balances or differences back to their sources.", "Correct the source transaction or journal and regenerate the report; never edit report totals manually.", "Download PDF or export data only with export permission, then verify the title, period, and totals in the output."],
      ["সময়কাল, প্রতিষ্ঠান বা চুক্তি এবং প্রতিবেদনের ধরন বেছে নিয়ে দেখার আগে সময় অঞ্চল ও সমাপনী তারিখ যাচাই করুন।", "প্রতিবেদন পোস্ট করা এন্ট্রি ব্যবহার করছে কি না দেখুন এবং অপ্রত্যাশিত পার্থক্য উৎস রেকর্ডে অনুসরণ করুন।", "মূল লেনদেন বা জার্নাল ঠিক করে প্রতিবেদন আবার তৈরি করুন; চূড়ান্ত মোট হাতে পরিবর্তন করবেন না।", "export অনুমতি থাকলেই PDF বা তথ্য রপ্তানি করুন এবং তৈরি ফাইলে শিরোনাম, সময়কাল ও মোট যাচাই করুন।"],
    ),
  },
  {
    key: "legal",
    anyOf: ["legal.read"],
    title: t("الشؤون القانونية", "Legal Affairs", "আইনগত বিষয়"),
    description: t("متابعة القضايا والإحالات والعقود والمواعيد والإجراءات والمستندات القانونية حتى الإغلاق.", "Track cases, referrals, contracts, deadlines, legal actions, and documents through closure.", "মামলা, রেফারেল, চুক্তি, সময়সীমা, আইনি পদক্ষেপ ও নথি সমাপ্তি পর্যন্ত অনুসরণ করুন।"),
    steps: s(
      ["راجع مصدر الإحالة وسببها والأطراف والعقد والمرفقات، وتأكد من اكتمال المستندات قبل قبول الملف.", "عيّن المسؤول والحالة والأولوية والموعد النظامي، وأنشئ مهمة مستقلة لكل إجراء يحتاج متابعة.", "سجّل كل اتصال أو جلسة أو خطاب مع تاريخه ونتيجته وأرفق النسخة المعتمدة بدل الاعتماد على الملاحظات وحدها.", "لا تغلق القضية أو التسوية إلا بعد القرار المخوّل، وإكمال الالتزامات، وتوثيق النتيجة النهائية والمستند المؤيد."],
      ["Review the referral source, reason, parties, contract, and attachments, and confirm the file is complete before accepting it.", "Assign an owner, status, priority, and legal deadline, with a separate task for each follow-up action.", "Record each call, hearing, or letter with its date and outcome, and attach the approved copy instead of relying on notes alone.", "Close a case or settlement only after authorized decision, completed obligations, and documented final outcome and evidence."],
      ["রেফারেলের উৎস, কারণ, পক্ষ, চুক্তি ও সংযুক্তি দেখে গ্রহণের আগে ফাইল সম্পূর্ণ কি না নিশ্চিত করুন।", "দায়িত্বশীল ব্যক্তি, অবস্থা, অগ্রাধিকার ও আইনি সময়সীমা নির্ধারণ করে প্রতিটি অনুসরণযোগ্য পদক্ষেপের জন্য আলাদা কাজ তৈরি করুন।", "প্রতিটি কল, শুনানি বা চিঠির তারিখ ও ফল লিখে শুধু নোটের বদলে অনুমোদিত কপি সংযুক্ত করুন।", "অনুমোদিত সিদ্ধান্ত, সব দায় পূরণ এবং চূড়ান্ত ফল ও প্রমাণ নথিভুক্ত না হওয়া পর্যন্ত মামলা বা সমঝোতা বন্ধ করবেন না।"],
    ),
  },
  {
    key: "government",
    anyOf: ["government.read"],
    title: t("العلاقات الحكومية والامتثال", "Government Relations and Compliance", "সরকারি সম্পর্ক ও সম্মতি"),
    description: t("متابعة التجديدات والالتزامات والمنصات الحكومية والمرفقات وطلبات السداد حتى إثبات الإنجاز.", "Track renewals, obligations, government platforms, evidence, and payment requests through completion.", "নবায়ন, বাধ্যবাধকতা, সরকারি প্ল্যাটফর্ম, প্রমাণ ও পরিশোধ অনুরোধ সম্পন্ন হওয়া পর্যন্ত অনুসরণ করুন।"),
    steps: s(
      ["راجع نوع الالتزام والجهة والمنصة والمسؤول وتاريخ الاستحقاق، وابدأ بالأقرب انتهاءً أو الأعلى خطورة.", "حدّث بيانات الطلب وأرفق المستندات المطلوبة، واضبط تذكيرًا قبل الموعد بوقت يسمح بمعالجة النواقص.", "إذا تطلب الإجراء رسومًا، أنشئ طلب السداد واربطه بالالتزام؛ لا تسجل الدفع داخل الملاحظات.", "بيانات الدخول والدفع النهائي للمستخدم المخوّل فقط، وبعد الإنجاز أرفق الإيصال أو الشهادة وحدّث الحالة وتاريخ الانتهاء الجديد."],
      ["Review the obligation type, authority, platform, owner, and due date, prioritizing the nearest expiry or highest risk.", "Update the request, attach required documents, and set a reminder early enough to resolve missing items.", "When fees are required, create and link a payment request; do not record payment only in notes.", "Only authorized users may access credentials or complete payment; afterward attach the receipt or certificate and update status and new expiry."],
      ["বাধ্যবাধকতার ধরন, কর্তৃপক্ষ, প্ল্যাটফর্ম, দায়িত্বশীল ব্যক্তি ও সময়সীমা দেখে নিকটতম মেয়াদ বা বেশি ঝুঁকির কাজ আগে করুন।", "অনুরোধ হালনাগাদ করে প্রয়োজনীয় নথি সংযুক্ত করুন এবং ঘাটতি সমাধানের মতো সময় রেখে স্মরণিকা দিন।", "ফি লাগলে সংযুক্ত পরিশোধ অনুরোধ তৈরি করুন; শুধু নোটে পরিশোধ লিখবেন না।", "শুধু অনুমোদিত ব্যবহারকারী লগইন তথ্য বা চূড়ান্ত পরিশোধ করবেন; শেষে রসিদ বা সনদ সংযুক্ত করে অবস্থা ও নতুন মেয়াদ দিন।"],
    ),
  },
  {
    key: "workforce",
    anyOf: ["workforce.read"],
    title: t("شؤون العمالة", "Workforce Affairs", "শ্রমিক বিষয়ক ব্যবস্থাপনা"),
    description: t("إدارة طلبات العمال وملفاتهم ووثائقهم وعقودهم ومهنهم وإسنادهم للمواقع.", "Manage worker requests, profiles, documents, contracts, professions, and site assignments.", "শ্রমিক অনুরোধ, প্রোফাইল, নথি, চুক্তি, পেশা ও সাইটে নিয়োগ পরিচালনা করুন।"),
    steps: s(
      ["راجع طلب العمالة والعدد والمهنة والموقع والمدة والوثائق قبل إنشاء أو ربط أي ملف عامل.", "تحقق من هوية العامل والكفيل والعقد والمهنة والوثائق وتواريخ الانتهاء، ثم عالج أي نقص قبل التفعيل.", "اربط العامل بالعقد والموقع وأمر التشغيل الصحيح، وتأكد من عدم وجود إسناد نشط متعارض.", "تابع الحضور والغياب والاستبدال والنقل والانتهاء، وراجع أثر كل تغيير على العقد والفاتورة والراتب."],
      ["Review the workforce request, quantity, profession, site, duration, and documents before creating or linking a worker profile.", "Verify worker identity, sponsor, contract, profession, documents, and expiries, resolving missing data before activation.", "Assign the worker to the correct contract, site, and work order and check for conflicting active assignments.", "Track attendance, absence, replacement, transfer, and end dates, checking each change against contract, invoice, and payroll."],
      ["প্রোফাইল তৈরি বা সংযুক্ত করার আগে শ্রমিক অনুরোধ, সংখ্যা, পেশা, সাইট, মেয়াদ ও নথি দেখুন।", "সক্রিয় করার আগে শ্রমিকের পরিচয়, স্পনসর, চুক্তি, পেশা, নথি ও মেয়াদ যাচাই করে ঘাটতি সমাধান করুন।", "সঠিক চুক্তি, সাইট ও কাজের আদেশে শ্রমিক নিয়োগ করে অন্য সক্রিয় নিয়োগের সঙ্গে সংঘাত আছে কি না দেখুন।", "উপস্থিতি, অনুপস্থিতি, বদলি, স্থানান্তর ও সমাপ্তি অনুসরণ করে প্রতিটি পরিবর্তনের চুক্তি, চালান ও বেতনে প্রভাব যাচাই করুন।"],
    ),
  },
  {
    key: "operations",
    anyOf: ["operations.read"],
    title: t("المبيعات والتشغيل", "Sales and Operations", "বিক্রয় ও পরিচালনা"),
    description: t("إدارة دورة العميل من الفرصة وعرض السعر إلى العقد وأمر التشغيل والدوام والفوترة والتحصيل.", "Manage the client cycle from opportunity and quote to contract, work order, time, invoicing, and collection.", "সুযোগ ও মূল্য প্রস্তাব থেকে চুক্তি, কাজের আদেশ, সময়, চালান ও আদায় পর্যন্ত গ্রাহকচক্র পরিচালনা করুন।"),
    steps: s(
      ["أنشئ العميل أو اختره بعد البحث لتجنب التكرار، ثم سجل الفرصة واحتياجها والمسؤول وموعد المتابعة.", "جهّز عرض السعر بالكميات والأسعار والضريبة والمدة والشروط، وراجعه قبل إرساله للاعتماد أو للعميل.", "بعد قبول العرض واعتماده، أنشئ العقد وأمر التشغيل وحدد المواقع والعمالة والجدول ونقاط الفوترة.", "تابع الدوام والخدمة والدفعات والفواتير والتحصيل من السجلات المرتبطة، ولا تتجاوز حالة مطلوبة لإخفاء نقص أو تأخير."],
      ["Search before creating a client to avoid duplicates, then record the opportunity, need, owner, and follow-up date.", "Prepare the quote with quantities, rates, tax, duration, and terms, and review it before approval or client delivery.", "After acceptance and approval, create the contract and work order with sites, workforce, schedule, and billing milestones.", "Track time, service, installments, invoices, and collection through linked records; never skip a required status to hide a gap or delay."],
      ["ডুপ্লিকেট এড়াতে গ্রাহক তৈরির আগে খুঁজুন, তারপর সুযোগ, প্রয়োজন, দায়িত্বশীল ব্যক্তি ও অনুসরণের তারিখ লিখুন।", "পরিমাণ, মূল্য, কর, মেয়াদ ও শর্তসহ মূল্য প্রস্তাব তৈরি করে অনুমোদন বা গ্রাহকের কাছে পাঠানোর আগে পর্যালোচনা করুন।", "গ্রহণ ও অনুমোদনের পর সাইট, শ্রমিক, সময়সূচি ও বিলিং ধাপসহ চুক্তি ও কাজের আদেশ তৈরি করুন।", "সংযুক্ত রেকর্ডে উপস্থিতি, সেবা, কিস্তি, চালান ও আদায় অনুসরণ করুন; ঘাটতি বা বিলম্ব লুকাতে প্রয়োজনীয় অবস্থা বাদ দেবেন না।"],
    ),
  },
  {
    key: "integrations",
    anyOf: ["integrations.administer"],
    title: t("إدارة التكاملات", "Integration Management", "ইন্টিগ্রেশন ব্যবস্থাপনা"),
    description: t("ضبط نقاط الربط ومراقبة الأحداث الفاشلة وإعادة الإرسال وتشغيل صيانة البيانات المؤقتة بأمان.", "Configure endpoints, monitor failed events, retry delivery, and safely maintain transient data.", "এন্ডপয়েন্ট কনফিগার, ব্যর্থ ইভেন্ট পর্যবেক্ষণ, পুনরায় পাঠানো ও অস্থায়ী তথ্য নিরাপদে রক্ষণাবেক্ষণ করুন।"),
    steps: s(
      ["تحقق من رابط HTTPS والبيئة والجهة المستقبلة وسر التوقيع دون عرضه أو نسخه في الملاحظات.", "راجع الحدث الفاشل ووقت المحاولة ورمز الاستجابة ورسالة الخطأ، وتأكد من عدم احتواء العرض على بيانات حساسة.", "عالج السبب في الإعداد أو النظام المستقبل، ثم أعد المحاولة مرة واحدة وراقب انتقال الحالة إلى ناجح.", "شغّل التنظيف أو الصيانة من تبويب التكاملات فقط وبعد التحقق من النطاق، ثم راجع السجل والنتيجة."],
      ["Verify the HTTPS endpoint, environment, recipient, and signing secret without exposing or copying the secret into notes.", "Inspect the failed event, attempt time, response code, and error while ensuring sensitive data is not displayed.", "Correct the configuration or receiving system, retry once, and confirm the event status changes to successful.", "Run cleanup or maintenance only from the Integrations tab after verifying scope, then review its audit record and result."],
      ["গোপন তথ্য নোটে না দেখিয়ে বা কপি না করে HTTPS এন্ডপয়েন্ট, পরিবেশ, গ্রহণকারী ও স্বাক্ষরের গোপনীয়তা যাচাই করুন।", "সংবেদনশীল তথ্য না দেখিয়ে ব্যর্থ ইভেন্ট, চেষ্টার সময়, প্রতিক্রিয়া কোড ও ত্রুটি পরীক্ষা করুন।", "কনফিগারেশন বা গ্রহণকারী সিস্টেম ঠিক করে একবার পুনরায় চেষ্টা করুন এবং অবস্থা সফল হয়েছে কি না দেখুন।", "পরিধি যাচাইয়ের পর শুধু ইন্টিগ্রেশন ট্যাব থেকে পরিষ্কার বা রক্ষণাবেক্ষণ চালিয়ে অডিট রেকর্ড ও ফল দেখুন।"],
    ),
  },
  {
    key: "representatives",
    anyOf: ["representatives.read", "operations.read"],
    title: t("إدارة المناديب", "Representative Management", "প্রতিনিধি ব্যবস্থাপনা"),
    description: t("إدارة مناديب المبيعات والمشتريات ونطاقاتهم وطلباتهم الميدانية وقرارات مراجعتها.", "Manage sales and purchasing representatives, scopes, field requests, and review decisions.", "বিক্রয় ও ক্রয় প্রতিনিধি, পরিধি, মাঠের অনুরোধ ও পর্যালোচনা সিদ্ধান্ত পরিচালনা করুন।"),
    steps: s(
      ["حدد نوع المندوب وبياناته ونطاق العملاء أو المشتريات والمنطقة قبل التفعيل، وتأكد من عدم تكرار الحساب.", "راجع الطلب الميداني والجهة والمبلغ أو الكمية والمرفقات وتاريخ الحاجة قبل اتخاذ القرار.", "استخدم اعتماد أو طلب تعديل أو رفض من الزر المخصص، واكتب سببًا واضحًا يمكن للمندوب متابعته.", "حوّل الطلب المعتمد إلى عرض سعر أو خطوة شراء مرتبطة، ثم تابع حالته حتى التنفيذ بدل إنشاء سجل منفصل غير مرتبط."],
      ["Set the representative type, profile, client or purchasing scope, and region before activation, checking for duplicate accounts.", "Review the field request, party, amount or quantity, attachments, and required date before deciding.", "Use the dedicated approve, request-change, or reject action and give a clear reason the representative can follow.", "Convert an approved request into a linked quote or purchasing step and track it through completion instead of creating an unrelated record."],
      ["সক্রিয় করার আগে প্রতিনিধির ধরন, প্রোফাইল, গ্রাহক বা ক্রয় পরিধি ও অঞ্চল নির্ধারণ করে ডুপ্লিকেট অ্যাকাউন্ট দেখুন।", "সিদ্ধান্তের আগে মাঠের অনুরোধ, পক্ষ, পরিমাণ, সংযুক্তি ও প্রয়োজনের তারিখ পর্যালোচনা করুন।", "নির্ধারিত অনুমোদন, পরিবর্তন চাওয়া বা প্রত্যাখ্যান বোতাম ব্যবহার করে প্রতিনিধির জন্য স্পষ্ট কারণ লিখুন।", "অনুমোদিত অনুরোধকে সংযুক্ত মূল্য প্রস্তাব বা ক্রয় ধাপে রূপান্তর করে শেষ পর্যন্ত অনুসরণ করুন; অসংযুক্ত নতুন রেকর্ড করবেন না।"],
    ),
  },
  {
    key: "construction",
    anyOf: ["construction.read"],
    title: t("المقاولات والمشروعات", "Construction and Projects", "নির্মাণ ও প্রকল্প"),
    description: t("إدارة الفرص والتقديرات والميزانية والجدول والسجلات الميدانية والجودة والسلامة والتسليم.", "Manage opportunities, estimates, budget, schedule, field records, quality, safety, and handover.", "সুযোগ, প্রাক্কলন, বাজেট, সময়সূচি, মাঠের রেকর্ড, গুণমান, নিরাপত্তা ও হস্তান্তর পরিচালনা করুন।"),
    steps: s(
      ["اختر المشروع داخل نطاقك، وراجع العميل والموقع ونطاق الأعمال والتقدير والمرفقات قبل التفعيل.", "بعد الاعتماد ثبت الميزانية والجدول والمراحل والمسؤولين، واربط أوامر الشراء والعقود بالمشروع الصحيح.", "سجل التقرير اليومي والكميات والجودة والسلامة والتقدم مع صور أو مستندات مؤرخة من الموقع.", "أرسل التغيير أو المطالبة أو محضر الاستلام للمراجعة والاعتماد، ولا تغلق المرحلة أو المشروع قبل توثيق التسليم والالتزامات المتبقية."],
      ["Choose a project within your scope and review client, location, work scope, estimate, and attachments before activation.", "After approval, establish the budget, schedule, phases, and owners and link purchases and contracts to the correct project.", "Record daily reports, quantities, quality, safety, and progress with dated site photos or documents.", "Submit changes, claims, or handover records for review; do not close a phase or project before documenting delivery and remaining obligations."],
      ["আপনার পরিধির প্রকল্প বেছে নিয়ে সক্রিয় করার আগে গ্রাহক, স্থান, কাজের পরিধি, প্রাক্কলন ও সংযুক্তি দেখুন।", "অনুমোদনের পর বাজেট, সময়সূচি, ধাপ ও দায়িত্বশীল ব্যক্তি নির্ধারণ করে সঠিক প্রকল্পে ক্রয় ও চুক্তি যুক্ত করুন।", "তারিখসহ সাইটের ছবি বা নথি দিয়ে দৈনিক প্রতিবেদন, পরিমাণ, গুণমান, নিরাপত্তা ও অগ্রগতি লিখুন।", "পরিবর্তন, দাবি বা হস্তান্তর রেকর্ড পর্যালোচনায় পাঠান; সরবরাহ ও বাকি দায় নথিভুক্ত না করে ধাপ বা প্রকল্প বন্ধ করবেন না।"],
    ),
  },
  {
    key: "supervision",
    allOf: ["contracts.read", "workforce.read"],
    title: t("إدارة الإشراف على العمالة", "Workforce Supervision", "শ্রমিক তত্ত্বাবধান"),
    description: t("مقارنة احتياج العقود النشطة بالإسناد الفعلي ومتابعة الحضور والغياب والاستبدال وأثرها المالي.", "Compare active contract demand with assignments and track attendance, absence, replacement, and financial impact.", "সক্রিয় চুক্তির চাহিদার সঙ্গে নিয়োগ মিলিয়ে উপস্থিতি, অনুপস্থিতি, বদলি ও আর্থিক প্রভাব অনুসরণ করুন।"),
    steps: s(
      ["افتح العقد النشط وتحقق من الموقع والمهنة والعدد المطلوب والفترة قبل مراجعة العمالة المسندة.", "قارن المطلوب بالمسند فعليًا، وافتح ملف كل عامل للتأكد من صلاحيته وعدم وجود إسناد متعارض.", "سجّل الحضور أو الغياب أو الاستبدال من العقد أو أمر التشغيل نفسه مع التاريخ والسبب والمستند المؤيد.", "راجع انعكاس التغيير على ساعات العمل والفاتورة والراتب، ثم تحقق من اكتمال العدد والحالة في شاشة الإشراف."],
      ["Open the active contract and verify site, profession, required headcount, and period before reviewing assignments.", "Compare demand with actual assignments and inspect each worker for eligibility and conflicting active assignments.", "Record attendance, absence, or replacement from the contract or work order with date, reason, and evidence.", "Check the change against hours, invoice, and payroll, then confirm headcount and status in the supervision view."],
      ["সক্রিয় চুক্তি খুলে নিয়োজিত শ্রমিক দেখার আগে সাইট, পেশা, প্রয়োজনীয় সংখ্যা ও সময়কাল যাচাই করুন।", "চাহিদার সঙ্গে প্রকৃত নিয়োগ মিলিয়ে প্রতিটি শ্রমিকের যোগ্যতা ও বিরোধী সক্রিয় নিয়োগ আছে কি না দেখুন।", "তারিখ, কারণ ও প্রমাণসহ চুক্তি বা কাজের আদেশ থেকে উপস্থিতি, অনুপস্থিতি বা বদলি রেকর্ড করুন।", "ঘণ্টা, চালান ও বেতনে পরিবর্তনের প্রভাব দেখে তত্ত্বাবধান পর্দায় সংখ্যা ও অবস্থা নিশ্চিত করুন।"],
    ),
  },
  {
    key: "contracts",
    anyOf: ["contracts.read"],
    title: t("العقود والعروض والخطابات", "Contracts, Quotes, and Letters", "চুক্তি, মূল্য প্রস্তাব ও চিঠি"),
    description: t("إنشاء المحررات الرسمية متعددة اللغات ومراجعتها واعتمادها وتفعيلها ومتابعة دفعاتها وإلغائها.", "Create multilingual formal documents, review, approve, activate, track payments, and handle cancellation.", "বহুভাষিক আনুষ্ঠানিক নথি তৈরি, পর্যালোচনা, অনুমোদন, সক্রিয়করণ, পরিশোধ অনুসরণ ও বাতিল পরিচালনা করুন।"),
    steps: s(
      ["اختر نوع المحرر ومصدره، وأكمل بيانات الأطراف والنطاق والبنود والمهن والأسعار والمدة والمرفقات.", "راجع المسودة والنسخ العربية والإنجليزية والبنغالية وأرقام الهوية والحسابات، ثم أنشئ PDF للمعاينة قبل الاعتماد.", "أرسل المسودة لمستخدم مخوّل؛ وبعد الاعتماد فعّل أو أصدر أو نزّل أو شارك النسخة الرسمية بحسب صلاحيتك.", "اربط جدول الدفعات والفواتير والتحصيل بالمحرر، وتابع المتأخرات من السجل نفسه حتى تبقى الحركة قابلة للتتبع.", "أي تعديل جوهري أو إلغاء يحتاج سببًا وقرارًا مخوّلًا؛ راجع الأثر القانوني والمالي ثم تحقق من حالة المحرر وسجل النشاط."],
      ["Select the document type and source, then complete parties, scope, clauses, professions, rates, duration, and attachments.", "Review the draft in Arabic, English, and Bengali, including IDs and calculations, and generate a PDF preview before approval.", "Submit the draft to an authorized user; after approval, activate, issue, download, or share the official version as permitted.", "Link payment schedules, invoices, and collections to the document and track overdue items from the same record.", "Material edits or cancellation require a reason and authorized decision; review legal and financial impact, status, and activity trail."],
      ["নথির ধরন ও উৎস বেছে নিয়ে পক্ষ, পরিধি, শর্ত, পেশা, মূল্য, মেয়াদ ও সংযুক্তি পূরণ করুন।", "আরবি, ইংরেজি ও বাংলা খসড়া, পরিচয় নম্বর ও হিসাব দেখে অনুমোদনের আগে PDF প্রিভিউ তৈরি করুন।", "খসড়া অনুমোদিত ব্যবহারকারীর কাছে পাঠান; অনুমোদনের পর অনুমতি অনুযায়ী আনুষ্ঠানিক সংস্করণ সক্রিয়, প্রকাশ, ডাউনলোড বা শেয়ার করুন।", "পরিশোধ সূচি, চালান ও আদায় নথির সঙ্গে যুক্ত করে একই রেকর্ড থেকে বিলম্ব অনুসরণ করুন।", "গুরুত্বপূর্ণ পরিবর্তন বা বাতিলে কারণ ও অনুমোদিত সিদ্ধান্ত দরকার; আইনি ও আর্থিক প্রভাব, অবস্থা ও কার্যক্রমের ইতিহাস যাচাই করুন।"],
    ),
  },
  {
    key: "documents",
    anyOf: ["documents.read"],
    title: t("مستندات الشركة", "Company Documents", "কোম্পানির নথি"),
    description: t("تصنيف ورفع وإصدار وتنزيل ومشاركة المستندات الرسمية ومتابعة تواريخ انتهائها وتجديدها.", "Classify, upload, issue, download, share, and renew official company documents.", "আনুষ্ঠানিক কোম্পানি নথি শ্রেণিবদ্ধ, আপলোড, প্রকাশ, ডাউনলোড, শেয়ার ও নবায়ন করুন।"),
    steps: s(
      ["اختر التصنيف والجهة والمرجع والمالك وتاريخ الإصدار والانتهاء قبل رفع الملف.", "ارفع ملفًا واضحًا بالصيغة والحجم المسموحين، وافتحه بعد الحفظ للتأكد من أنه المستند الصحيح والكامل.", "ميّز النسخة الرسمية المعتمدة من المسودة أو النسخة القديمة، ولا تحذف ملفًا مستخدمًا في عقد أو معاملة.", "أنشئ رابط مشاركة مؤقتًا فقط مع الصلاحية وللمستلم المقصود، وتابع تنبيهات الانتهاء وارفع التجديد كسجل مرتبط."],
      ["Select category, issuer, reference, owner, issue date, and expiry before uploading the file.", "Upload a clear file in an allowed format and size, then open it after saving to confirm it is complete and correct.", "Distinguish the approved official version from drafts or old copies, and do not delete a file used by a contract or transaction.", "Create a temporary share link only with permission and for the intended recipient; track expiry alerts and link renewed versions."],
      ["ফাইল আপলোডের আগে শ্রেণি, ইস্যুকারী, রেফারেন্স, মালিক, ইস্যু তারিখ ও মেয়াদ বেছে নিন।", "অনুমোদিত ধরন ও আকারের স্পষ্ট ফাইল আপলোড করে সংরক্ষণের পর খুলে সম্পূর্ণ ও সঠিক কি না নিশ্চিত করুন।", "অনুমোদিত আনুষ্ঠানিক সংস্করণকে খসড়া বা পুরোনো কপি থেকে আলাদা রাখুন এবং চুক্তি বা লেনদেনে ব্যবহৃত ফাইল মুছবেন না।", "অনুমতি থাকলেই নির্দিষ্ট প্রাপকের জন্য অস্থায়ী শেয়ার লিংক তৈরি করুন; মেয়াদের সতর্কতা দেখে নবায়িত সংস্করণ যুক্ত করুন।"],
    ),
  },
  {
    key: "brand",
    anyOf: ["documents.read", "assets.administer"],
    title: t("الهوية البصرية", "Brand Identity", "ব্র্যান্ড পরিচিতি"),
    description: t("إدارة النسخ المعتمدة من الشعار والألوان والختم والتوقيع والأصول المستخدمة في المستندات والموقع.", "Manage approved logos, colors, stamp, signature, and assets used in documents and the website.", "নথি ও ওয়েবসাইটে ব্যবহৃত অনুমোদিত লোগো, রং, সিল, স্বাক্ষর ও সম্পদ পরিচালনা করুন।"),
    steps: s(
      ["اختر الأصل المعتمد المناسب للخلفية والاستخدام، وتحقق من وضوح الشعار والألوان قبل تنزيله أو إدراجه.", "راجع مكان استخدام الأصل في العقود والفواتير والخطابات والموقع قبل استبداله.", "رفع أو استبدال الختم أو التوقيع أو الأصل الرسمي يتطلب صلاحية إدارة الأصول ومراجعة الملف قبل الحفظ.", "بعد التغيير أنشئ معاينة لمستند ومقطع من الموقع، ولا تحذف إصدارًا لا يزال مستخدمًا في محرر سابق."],
      ["Choose the approved asset for its background and use, and check logo and color clarity before download or insertion.", "Review where the asset is used across contracts, invoices, letters, and the website before replacing it.", "Uploading or replacing a stamp, signature, or official asset requires asset administration and file review before saving.", "After a change, preview a document and website section, and do not delete a version still used by an earlier document."],
      ["পটভূমি ও ব্যবহারের জন্য উপযুক্ত অনুমোদিত সম্পদ বেছে নিয়ে ডাউনলোড বা ব্যবহারের আগে লোগো ও রঙের স্বচ্ছতা দেখুন।", "প্রতিস্থাপনের আগে চুক্তি, চালান, চিঠি ও ওয়েবসাইটে সম্পদটি কোথায় ব্যবহৃত হয়েছে দেখুন।", "সিল, স্বাক্ষর বা আনুষ্ঠানিক সম্পদ আপলোড বা বদলাতে assets প্রশাসনের অনুমতি ও সংরক্ষণের আগে ফাইল পর্যালোচনা দরকার।", "পরিবর্তনের পর একটি নথি ও ওয়েবসাইট অংশ প্রিভিউ করুন এবং পুরোনো নথিতে ব্যবহৃত সংস্করণ মুছবেন না।"],
    ),
  },
  {
    key: "website",
    anyOf: ["website.read"],
    title: t("إدارة الموقع الإلكتروني", "Website Management", "ওয়েবসাইট ব্যবস্থাপনা"),
    description: t("تحرير محتوى الموقع بالعربية والإنجليزية والبنغالية وإدارة الوسائط والروابط والظهور والنشر.", "Edit Arabic, English, and Bengali website content and manage media, links, visibility, and publishing.", "আরবি, ইংরেজি ও বাংলা ওয়েবসাইট বিষয়বস্তু, মিডিয়া, লিংক, দৃশ্যমানতা ও প্রকাশনা পরিচালনা করুন।"),
    steps: s(
      ["افتح القسم أو الصفحة الصحيحة وحدد حالة الظهور، ثم عدّل العنوان والوصف والإجراء في اللغات الثلاث.", "راجع الصور والنص البديل والروابط والترتيب، وتأكد من عدم وجود نص ناقص أو رابط داخلي إلى صفحة غير منشورة.", "احفظ المسودة وراجع المعاينة على الهاتف وسطح المكتب وباتجاهي RTL وLTR قبل النشر.", "انشر التعديل مرة واحدة، ثم افتح الصفحة العامة وتحقق من المحتوى واللغة والروابط ورقم الإصدار؛ دوّن أي تصحيح كسجل جديد."],
      ["Open the correct page or section and visibility state, then edit its title, description, and action in all three languages.", "Review images, alt text, links, and order, checking for missing translations or internal links to unpublished pages.", "Save the draft and preview mobile, desktop, RTL, and LTR layouts before publishing.", "Publish once, then verify content, language, links, and version on the public page; record later corrections as a new change."],
      ["সঠিক পৃষ্ঠা বা অংশ এবং দৃশ্যমানতার অবস্থা খুলে তিন ভাষায় শিরোনাম, বর্ণনা ও কাজ সম্পাদনা করুন।", "ছবি, বিকল্প লেখা, লিংক ও ক্রম দেখে অনুপস্থিত অনুবাদ বা অপ্রকাশিত পৃষ্ঠার অভ্যন্তরীণ লিংক আছে কি না যাচাই করুন।", "খসড়া সংরক্ষণ করে প্রকাশের আগে মোবাইল, ডেস্কটপ, RTL ও LTR বিন্যাস প্রিভিউ করুন।", "একবার প্রকাশ করে জনসাধারণের পৃষ্ঠায় বিষয়বস্তু, ভাষা, লিংক ও সংস্করণ দেখুন; পরে সংশোধনকে নতুন পরিবর্তন হিসেবে নথিভুক্ত করুন।"],
    ),
  },
  {
    key: "video",
    anyOf: ["video.read"],
    title: t("المقابلات المرئية", "Video Interviews", "ভিডিও সাক্ষাৎকার"),
    description: t("إدارة التوفر وطلبات الاتصال وقبول المقابلة وتحويلها وإنهائها وتسجيل نتيجة الخدمة.", "Manage availability, incoming calls, acceptance, transfer, completion, and service outcomes.", "উপস্থিতি, আসা কল, গ্রহণ, হস্তান্তর, সমাপ্তি ও সেবার ফল পরিচালনা করুন।"),
    steps: s(
      ["اضبط حالة توفرك في بداية الدوام، ولا تتركها متاحًا إذا لم تكن قادرًا على استقبال طلب جديد.", "افتح الطلب الوارد وتحقق من اسم الزائر وسبب الاتصال والوقت، ثم اقبله قبل انتهاء المهلة.", "راجع السياق أثناء المقابلة واستخدم التحويل فقط للجهة المتاحة والمختصة مع توضيح سبب التحويل.", "عند الانتهاء سجّل النتيجة وأي متابعة لازمة ثم أنهِ الطلب، وتحقق من الحالة والتقييم دون تسجيل بيانات حساسة في الملاحظات."],
      ["Set availability at the start of work and do not remain available when you cannot accept a new request.", "Open an incoming request, verify visitor, contact reason, and time, and accept it before the response window expires.", "Review context during the interview and transfer only to an available responsible team, including the transfer reason.", "Record the outcome and follow-up, complete the request, and check status and rating without placing sensitive data in notes."],
      ["কাজের শুরুতে উপস্থিতির অবস্থা ঠিক করুন এবং নতুন অনুরোধ নিতে না পারলে available রাখবেন না।", "আসা অনুরোধ খুলে দর্শক, যোগাযোগের কারণ ও সময় যাচাই করে নির্ধারিত সময়ের মধ্যে গ্রহণ করুন।", "সাক্ষাৎকারে প্রসঙ্গ দেখুন এবং কারণসহ শুধু উপলভ্য দায়িত্বশীল দলে হস্তান্তর করুন।", "শেষে ফল ও পরবর্তী কাজ লিখে অনুরোধ সম্পন্ন করুন এবং নোটে সংবেদনশীল তথ্য না রেখে অবস্থা ও মূল্যায়ন দেখুন।"],
    ),
  },
  {
    key: "users",
    rootOnly: true,
    title: t("المستخدمون والصلاحيات", "Users and Permissions", "ব্যবহারকারী ও অনুমতি"),
    description: t("اعتماد الحسابات وتعيين الأدوار والصلاحيات والنطاقات وتعطيل الوصول وفق مبدأ أقل صلاحية.", "Approve accounts, assign roles, permissions and scopes, and revoke access using least privilege.", "সর্বনিম্ন অনুমতির নীতিতে অ্যাকাউন্ট অনুমোদন, ভূমিকা, অনুমতি ও পরিধি নির্ধারণ এবং প্রবেশাধিকার বাতিল করুন।"),
    steps: s(
      ["تحقق من هوية طالب الحساب والقسم والمسمى والمدير وسبب الوصول قبل الموافقة أو التعديل.", "اختر أقل دور وظيفي ونطاق جغرافي وصلاحيات تحقق العمل، ولا تمنح صلاحيات اعتماد أو دفع لمجرد الحاجة إلى القراءة.", "تتطلب الصلاحيات الجذرية قرار مستخدم مخوّل؛ لا ترفع صلاحيتك بنفسك، ووثّق سبب كل منح أو رفض أو تغيير.", "عند انتقال المستخدم أو انتهاء عمله عطّل الحساب وألغِ الجلسات أو أعد كلمة المرور، ثم راجع سجل التدقيق للتأكد من تنفيذ التغيير."],
      ["Verify the requester, department, title, manager, and business reason before approving or changing an account.", "Assign the least functional role, geographic scope, and permissions needed; do not grant approval or payment merely for viewing.", "Root access requires an authorized decision; never elevate yourself, and record the reason for every grant, rejection, or change.", "When a user moves or leaves, disable the account and revoke sessions or reset access, then confirm the change in the audit trail."],
      ["অ্যাকাউন্ট অনুমোদন বা পরিবর্তনের আগে আবেদনকারী, বিভাগ, পদবী, ব্যবস্থাপক ও প্রবেশাধিকারের ব্যবসায়িক কারণ যাচাই করুন।", "কাজের জন্য সর্বনিম্ন কার্যকর ভূমিকা, ভৌগোলিক পরিধি ও অনুমতি দিন; শুধু দেখার জন্য approval বা payment অনুমতি দেবেন না।", "root প্রবেশাধিকারে অনুমোদিত সিদ্ধান্ত দরকার; নিজেকে উন্নীত করবেন না এবং প্রতিটি প্রদান, প্রত্যাখ্যান বা পরিবর্তনের কারণ লিখুন।", "ব্যবহারকারী বদলি বা চাকরি ছাড়লে অ্যাকাউন্ট নিষ্ক্রিয় করে সেশন বাতিল বা প্রবেশাধিকার রিসেট করুন এবং অডিট রেকর্ডে পরিবর্তন নিশ্চিত করুন।"],
    ),
  },
];

export default function SystemGuide({ locale, userName, role, department, functionalRoles, grantedPermissions }: {
  locale: Locale;
  userName: string;
  role: "admin" | "manager" | "employee";
  department: string;
  functionalRoles: string[];
  grantedPermissions: string[];
}) {
  const c = copy[locale];
  const [query, setQuery] = useState("");
  const permissionSet = useMemo(() => new Set(grantedPermissions), [grantedPermissions]);
  const root = role === "admin" || permissionSet.has("*") || functionalRoles.some((item) => item === "system_owner" || item === "system_admin");
  const availableModules = useMemo(() => modules.filter((module) => {
    if (module.always) return true;
    if (module.rootOnly) return root;
    if (root) return true;
    const anyAllowed = !module.anyOf?.length || module.anyOf.some((permission) => permissionSet.has(permission));
    const allAllowed = !module.allOf?.length || module.allOf.every((permission) => permissionSet.has(permission));
    return anyAllowed && allAllowed;
  }), [permissionSet, root]);
  const visibleModules = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return availableModules;
    return availableModules.filter((module) => [module.title[locale], module.description[locale], ...module.steps[locale], ...(module.anyOf || []), ...(module.allOf || [])].join(" ").toLowerCase().includes(term));
  }, [availableModules, locale, query]);
  const operationalPermissions = grantedPermissions.filter((permission) => permission !== "*" && !permission.endsWith(".read"));
  const permissionFor = (module: ModuleGuide) => module.rootOnly ? "users.administer" : [...(module.allOf || []), ...(module.anyOf || [])].find((permission) => permissionSet.has(permission)) || module.anyOf?.[0] || module.allOf?.join(" + ") || "overview.read";

  return (
    <section className="system-guide" data-no-translate dir={locale === "ar" ? "rtl" : "ltr"}>
      <header className="guide-hero">
        <div>
          <span>{c.eyebrow}</span>
          <h1>{c.title}</h1>
          <p>{c.intro}</p>
          <small>العربية · English · বাংলা</small>
        </div>
        <aside>
          <strong>{userName}</strong>
          <dl>
            <div><dt>{c.role}</dt><dd>{roleLabels[role][locale]}</dd></div>
            <div><dt>{c.department}</dt><dd>{(departmentLabels[department] || departmentLabels.general)[locale]}</dd></div>
            <div><dt>{c.pages}</dt><dd>{availableModules.length}</dd></div>
            <div><dt>{c.capabilities}</dt><dd>{root ? c.fullAccess : grantedPermissions.length}</dd></div>
          </dl>
        </aside>
      </header>

      <label className="guide-search"><span aria-hidden="true">⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={c.search} /><kbd>⌘ K</kbd></label>
      <section className="guide-access-note"><span aria-hidden="true">✓</span><div><h2>{c.accessTitle}</h2><p>{c.accessBody}</p></div></section>

      <div className="guide-two-column">
        <section className="guide-card guide-start"><header><span>01</span><div><h2>{c.startTitle}</h2><p>{c.workflowBody}</p></div></header><ol>{quickSteps[locale].map((step, index) => <li key={step}><b>{index + 1}</b><span>{step}</span></li>)}</ol></section>
        <section className="guide-card guide-permissions"><header><span>02</span><div><h2>{c.permissionTitle}</h2><p>{c.permissionBody}</p></div></header><div>{root ? <span><b>{c.fullAccess}</b><code dir="ltr">*</code></span> : operationalPermissions.length ? operationalPermissions.map((permission) => { const [resource, action] = permission.split("."); return <span key={permission}><b>{actionLabels[action]?.[locale] || action}</b><code dir="ltr">{resource}</code></span>; }) : <p>{c.accessBody}</p>}</div></section>
      </div>

      <section className="guide-card guide-workflow"><header><span>03</span><div><h2>{c.workflowTitle}</h2><p>{c.workflowBody}</p></div></header><ol>{workflowSteps[locale].map((step, index) => <li key={step}><b>{String(index + 1).padStart(2, "0")}</b><span>{step}</span></li>)}</ol></section>

      <section className="guide-modules">
        <header><div><span>04</span><div><h2>{c.modulesTitle}</h2><p>{c.modulesBody}</p></div></div><b>{visibleModules.length}/{availableModules.length}</b></header>
        <div>{visibleModules.map((module, index) => <details key={module.key} open={!query && index === 0}><summary><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{module.title[locale]}</strong><small>{module.description[locale]}</small></div><code dir="ltr">{permissionFor(module)}</code><i aria-hidden="true">＋</i></summary><div className="guide-module-body"><h3>{c.instructionsTitle}</h3><ol>{module.steps[locale].map((step) => <li key={step}>{step}</li>)}</ol></div></details>)}</div>
        {!visibleModules.length && <p className="guide-empty">{c.noModules}</p>}
      </section>

      <div className="guide-two-column guide-closing">
        <section className="guide-card guide-notes"><header><span>05</span><div><h2>{c.notesTitle}</h2><p>{c.notesBody}</p></div></header><p className="guide-note-example">{c.notesExample}</p><blockquote>{c.notesRule}</blockquote></section>
        <section className="guide-card guide-security"><header><span>06</span><div><h2>{c.securityTitle}</h2></div></header><ul>{c.securityRules.map((rule) => <li key={rule}>{rule}</li>)}</ul></section>
      </div>
    </section>
  );
}
