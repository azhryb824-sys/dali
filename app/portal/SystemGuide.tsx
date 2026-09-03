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
    intro: "دليل عملي مرتبط بصلاحيات حسابك، يوضح نقطة البداية وطريقة تنفيذ المعاملة من الإنشاء حتى المراجعة والاعتماد والإغلاق.",
    search: "ابحث باسم الصفحة أو الإجراء أو الصلاحية...",
    accessTitle: "نطاقك الحالي",
    accessBody: "تظهر لك الصفحات والإجراءات التي يسمح بها دورك فقط. إذا لم يظهر زر مطلوب، فاطلب من مالك النظام أو المشرف مراجعة الدور بدل مشاركة الحساب.",
    role: "نوع الحساب",
    department: "القسم",
    pages: "صفحات متاحة",
    capabilities: "صلاحيات فعالة",
    fullAccess: "وصول كامل",
    startTitle: "ابدأ في أربع خطوات",
    workflowTitle: "مسار العمل الموحّد",
    workflowBody: "كل معاملة تحفظ المنشئ والوقت والحالة والقرار، وتفصل التنفيذ عن الاعتماد عند الحاجة.",
    modulesTitle: "دليل صفحاتك",
    modulesBody: "القائمة أدناه مفلترة تلقائيًا بحسب صلاحيات حسابك الحالية.",
    noModules: "لا توجد صفحات تشغيلية مطابقة للبحث أو للصلاحيات الحالية.",
    notesTitle: "كيف تكتب الملاحظات",
    notesBody: "اكتب واقعة محددة قابلة للمتابعة: ما الذي حدث، ومن المسؤول، وما الإجراء التالي، ومتى يجب إنجازه.",
    notesExample: "مثال: لم يصل مرفق الفاتورة — المسؤول: المحاسب — الإجراء: طلب نسخة معتمدة — الموعد: 5 سبتمبر.",
    notesRule: "الملاحظة ليست اعتمادًا. استخدم زر الاعتماد أو الرفض أو الإلغاء المخصص حتى يسجل النظام القرار وصاحبه.",
    securityTitle: "قواعد الأمان",
    permissionTitle: "معاني الصلاحيات",
    permissionBody: "القراءة للاطلاع، والكتابة للإنشاء والتعديل، والاعتماد للقرار، والترحيل والدفع والمشاركة للعمليات الحساسة.",
    securityRules: ["لا تشارك كلمة المرور أو رمز التحقق.", "نزّل المستندات وشاركها من الأزرار الرسمية فقط.", "راجع الجهة والمبلغ والمرفق قبل أي قرار.", "سجّل الخروج عند استخدام جهاز مشترك."],
  },
  en: {
    eyebrow: "Dali System working guide",
    title: "Use the system and complete your work",
    intro: "A practical guide tailored to your account permissions. It explains where to start and how a transaction moves from creation through review, approval, and closure.",
    search: "Search for a page, action, or permission...",
    accessTitle: "Your current access",
    accessBody: "You only see pages and actions allowed by your role. If a required action is missing, ask the system owner or administrator to review your role instead of sharing an account.",
    role: "Account type",
    department: "Department",
    pages: "Available pages",
    capabilities: "Effective permissions",
    fullAccess: "Full access",
    startTitle: "Start in four steps",
    workflowTitle: "Standard workflow",
    workflowBody: "Every transaction records its creator, time, status, and decision, with separation between execution and approval where required.",
    modulesTitle: "Your page guide",
    modulesBody: "The list below is filtered automatically using your current account permissions.",
    noModules: "No operational pages match the search or your current permissions.",
    notesTitle: "How to write notes",
    notesBody: "Record a specific, actionable fact: what happened, who owns it, the next action, and its due date.",
    notesExample: "Example: Invoice attachment not received — owner: accountant — action: request an approved copy — due: 5 September.",
    notesRule: "A note is not an approval. Use the dedicated approve, reject, or cancel action so the system records the decision and its owner.",
    securityTitle: "Security rules",
    permissionTitle: "Permission meanings",
    permissionBody: "Read is for viewing, write is for creating and editing, approve is for decisions, and post, pay, and share cover sensitive actions.",
    securityRules: ["Never share your password or verification code.", "Download and share documents only through official actions.", "Check the party, amount, and attachment before any decision.", "Sign out after using a shared device."],
  },
  bn: {
    eyebrow: "ডালি সিস্টেমে কাজের নির্দেশিকা",
    title: "সিস্টেম ব্যবহার করে কাজ সম্পন্ন করুন",
    intro: "আপনার অ্যাকাউন্টের অনুমতি অনুযায়ী তৈরি ব্যবহারিক নির্দেশিকা। কোথা থেকে শুরু করবেন এবং কীভাবে একটি লেনদেন তৈরি, পর্যালোচনা, অনুমোদন ও সমাপ্তির ধাপ অতিক্রম করে তা এখানে বলা হয়েছে।",
    search: "পৃষ্ঠা, কাজ বা অনুমতি খুঁজুন...",
    accessTitle: "আপনার বর্তমান প্রবেশাধিকার",
    accessBody: "আপনার ভূমিকার অনুমোদিত পৃষ্ঠা ও কাজগুলোই দেখা যায়। প্রয়োজনীয় কোনো কাজ না দেখালে অ্যাকাউন্ট শেয়ার না করে সিস্টেম মালিক বা প্রশাসককে ভূমিকা পর্যালোচনা করতে বলুন।",
    role: "অ্যাকাউন্টের ধরন",
    department: "বিভাগ",
    pages: "উপলভ্য পৃষ্ঠা",
    capabilities: "কার্যকর অনুমতি",
    fullAccess: "সম্পূর্ণ প্রবেশাধিকার",
    startTitle: "চার ধাপে শুরু করুন",
    workflowTitle: "সাধারণ কর্মপ্রবাহ",
    workflowBody: "প্রতিটি লেনদেনে প্রস্তুতকারী, সময়, অবস্থা ও সিদ্ধান্ত সংরক্ষিত হয়; যেখানে প্রয়োজন সেখানে কাজ ও অনুমোদন আলাদা থাকে।",
    modulesTitle: "আপনার পৃষ্ঠার নির্দেশিকা",
    modulesBody: "আপনার বর্তমান অনুমতি অনুযায়ী নিচের তালিকা স্বয়ংক্রিয়ভাবে ফিল্টার করা হয়েছে।",
    noModules: "অনুসন্ধান বা বর্তমান অনুমতির সঙ্গে মেলে এমন কোনো পরিচালনাগত পৃষ্ঠা নেই।",
    notesTitle: "কীভাবে নোট লিখবেন",
    notesBody: "নির্দিষ্ট ও অনুসরণযোগ্য তথ্য লিখুন: কী ঘটেছে, দায়িত্বে কে, পরবর্তী কাজ কী এবং শেষ সময় কখন।",
    notesExample: "উদাহরণ: চালানের সংযুক্তি পাওয়া যায়নি — দায়িত্ব: হিসাবরক্ষক — কাজ: অনুমোদিত কপি চাওয়া — সময়সীমা: ৫ সেপ্টেম্বর।",
    notesRule: "নোট কোনো অনুমোদন নয়। সিদ্ধান্ত ও সিদ্ধান্তদাতাকে নথিভুক্ত করতে নির্দিষ্ট অনুমোদন, প্রত্যাখ্যান বা বাতিল বোতাম ব্যবহার করুন।",
    securityTitle: "নিরাপত্তার নিয়ম",
    permissionTitle: "অনুমতির অর্থ",
    permissionBody: "Read তথ্য দেখার জন্য, write তৈরি ও সম্পাদনার জন্য, approve সিদ্ধান্তের জন্য এবং post, pay ও share সংবেদনশীল কাজের জন্য।",
    securityRules: ["পাসওয়ার্ড বা যাচাইকরণ কোড শেয়ার করবেন না।", "শুধু নির্ধারিত বোতাম দিয়ে নথি ডাউনলোড ও শেয়ার করুন।", "সিদ্ধান্তের আগে পক্ষ, অর্থের পরিমাণ ও সংযুক্তি যাচাই করুন।", "শেয়ার করা ডিভাইস ব্যবহারের পর লগআউট করুন।"],
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
  ["اختر لغتك من مفتاح اللغة أسفل الشاشة.", "ابدأ بالإشعارات والمهام لمعرفة ما ينتظر تدخلك.", "استخدم البحث الشامل للوصول إلى الصفحة أو السجل.", "نفّذ الإجراء وتحقق من الحالة ورسالة النجاح."],
  ["Choose your language from the language switcher.", "Start with Notifications and Tasks to see what needs attention.", "Use global search to reach a page or record.", "Complete the action and verify its status and success message."],
  ["স্ক্রিনের নিচের ভাষা তালিকা থেকে আপনার ভাষা বেছে নিন।", "কোন কাজ অপেক্ষায় আছে জানতে বিজ্ঞপ্তি ও কাজের তালিকা দেখুন।", "পৃষ্ঠা বা রেকর্ডে যেতে সার্বিক অনুসন্ধান ব্যবহার করুন।", "কাজ শেষ করে অবস্থা ও সফলতার বার্তা যাচাই করুন।"],
);

const workflowSteps: Record<Locale, string[]> = s(
  ["إنشاء السجل وإكمال الحقول الإلزامية", "إرفاق الدليل أو المستند المرتبط", "إرسال السجل للمراجعة أو الاعتماد", "اتخاذ القرار بواسطة مستخدم مخوّل آخر", "تنفيذ الإجراء المالي أو التشغيلي", "التحقق من الحالة والإشعار وسجل النشاط"],
  ["Create the record and complete required fields", "Attach the supporting evidence or document", "Submit the record for review or approval", "Have another authorized user make the decision", "Complete the financial or operational action", "Verify the status, notification, and activity trail"],
  ["রেকর্ড তৈরি করে আবশ্যিক ঘর পূরণ করুন", "সহায়ক প্রমাণ বা নথি সংযুক্ত করুন", "পর্যালোচনা বা অনুমোদনের জন্য পাঠান", "অন্য অনুমোদিত ব্যবহারকারীকে সিদ্ধান্ত নিতে দিন", "আর্থিক বা পরিচালনাগত কাজ সম্পন্ন করুন", "অবস্থা, বিজ্ঞপ্তি ও কার্যক্রমের ইতিহাস যাচাই করুন"],
);

const modules: ModuleGuide[] = [
  { key: "overview", always: true, title: t("نظرة عامة", "Overview", "সারসংক্ষেপ"), description: t("مؤشراتك اليومية والتنبيهات والانتقال السريع.", "Daily indicators, alerts, and quick navigation.", "দৈনিক সূচক, সতর্কতা ও দ্রুত নেভিগেশন।"), steps: s(["راجع البطاقات التي تحمل رقمًا أو تنبيهًا.", "افتح الوحدة المرتبطة لإكمال الإجراء."], ["Review cards that show a count or alert.", "Open the related module to complete the action."], ["সংখ্যা বা সতর্কতা থাকা কার্ডগুলো দেখুন।", "কাজ শেষ করতে সংশ্লিষ্ট মডিউল খুলুন।"]) },
  { key: "notifications", always: true, title: t("مركز الإشعارات", "Notification Center", "বিজ্ঞপ্তি কেন্দ্র"), description: t("أحداث النظام التي تحتاج قراءة أو متابعة.", "System events that need review or follow-up.", "যেসব সিস্টেম ঘটনা দেখা বা অনুসরণ করা দরকার।"), steps: s(["اقرأ سبب الإشعار والجهة والسجل المرتبط.", "انتقل إلى السجل ثم علّم الإشعار كمقروء."], ["Read the reason, source, and linked record.", "Open the record, then mark the notification as read."], ["কারণ, উৎস ও সংযুক্ত রেকর্ড দেখুন।", "রেকর্ড খুলে বিজ্ঞপ্তি পঠিত হিসেবে চিহ্নিত করুন।"]) },
  { key: "tasks", always: true, title: t("المهام والتذكيرات", "Tasks and Reminders", "কাজ ও স্মরণিকা"), description: t("مهامك الخاصة وما أُسند إليك مع مواعيدها.", "Your private and assigned tasks with due dates.", "নিজস্ব ও অর্পিত কাজ এবং সময়সীমা।"), steps: s(["أنشئ المهمة وحدد الأولوية والموعد.", "أكملها أو أكد استلامها من مركز المهام."], ["Create a task with priority and due date.", "Complete or acknowledge it in the Task Center."], ["অগ্রাধিকার ও সময়সীমা দিয়ে কাজ তৈরি করুন।", "কাজের কেন্দ্র থেকে সম্পন্ন বা প্রাপ্তি নিশ্চিত করুন।"]) },
  { key: "conversations", anyOf: ["conversations.read", "conversations.write"], title: t("المحادثات المباشرة", "Live Conversations", "সরাসরি কথোপকথন"), description: t("رسائل زوار الموقع وحالتها وتقييم الخدمة.", "Visitor messages, conversation status, and service ratings.", "ওয়েবসাইট দর্শকের বার্তা, অবস্থা ও সেবার মূল্যায়ন।"), steps: s(["اقرأ السياق كاملًا قبل الرد.", "يظهر الرد وتغيير الحالة فقط مع صلاحية الكتابة."], ["Read the full context before replying.", "Reply and status controls require write access."], ["উত্তর দেওয়ার আগে পুরো প্রসঙ্গ পড়ুন।", "উত্তর ও অবস্থা পরিবর্তনে write অনুমতি দরকার।"]) },
  { key: "employees", anyOf: ["employees.read"], title: t("إدارة الموظفين", "Employee Management", "কর্মচারী ব্যবস্থাপনা"), description: t("الملفات الوظيفية والوثائق والحضور والإجازات والرواتب.", "Profiles, documents, attendance, leave, and payroll.", "প্রোফাইল, নথি, উপস্থিতি, ছুটি ও বেতন।"), steps: s(["أكمل الملف والربط بالحساب والبيانات البنكية.", "أنشئ الطلب أو المسير ثم أرسله لمستخدم آخر مخوّل بالاعتماد."], ["Complete the profile, account link, and bank data.", "Create the request or payroll run, then send it to another authorized approver."], ["প্রোফাইল, অ্যাকাউন্ট সংযোগ ও ব্যাংক তথ্য পূরণ করুন।", "অনুরোধ বা বেতন প্রক্রিয়া তৈরি করে অন্য অনুমোদিত ব্যক্তির কাছে পাঠান।"]) },
  { key: "finance", anyOf: ["finance.read"], title: t("الإدارة المالية", "Finance", "অর্থ ব্যবস্থাপনা"), description: t("الحركات والقيود والمشتريات والتسويات والدفعات.", "Transactions, journals, purchasing, reconciliations, and payments.", "লেনদেন, জার্নাল, ক্রয়, সমন্বয় ও পরিশোধ।"), steps: s(["اربط الحركة بالعقد أو العامل وأرفق المستند.", "الاعتماد والترحيل والدفع لها صلاحيات مستقلة ولا ينوب عنها زر الحفظ."], ["Link the transaction to its contract or worker and attach evidence.", "Approval, posting, and payment use separate permissions; saving does not replace them."], ["লেনদেনকে চুক্তি বা শ্রমিকের সঙ্গে যুক্ত করে প্রমাণ সংযুক্ত করুন।", "অনুমোদন, পোস্ট ও পরিশোধের অনুমতি আলাদা; সংরক্ষণ এগুলোর বিকল্প নয়।"]) },
  { key: "reports", anyOf: ["finance.read", "reports.read"], title: t("التقارير المالية", "Financial Reports", "আর্থিক প্রতিবেদন"), description: t("ميزان المراجعة والقوائم وربحية العقود.", "Trial balance, statements, and contract profitability.", "ট্রায়াল ব্যালেন্স, আর্থিক বিবরণী ও চুক্তির লাভজনকতা।"), steps: s(["حدد الفترة وراجع القيود المرحلة الداخلة في التقرير.", "تنزيل PDF يتطلب صلاحية تصدير التقارير."], ["Choose the period and review the posted entries included.", "PDF download requires report export permission."], ["সময়কাল বেছে নিয়ে অন্তর্ভুক্ত পোস্ট করা এন্ট্রি দেখুন।", "PDF ডাউনলোডে প্রতিবেদন রপ্তানির অনুমতি দরকার।"]) },
  { key: "legal", anyOf: ["legal.read"], title: t("الشؤون القانونية", "Legal Affairs", "আইনগত বিষয়"), description: t("القضايا والعقود والمواعيد والإجراءات النظامية.", "Cases, contracts, deadlines, and legal actions.", "মামলা, চুক্তি, সময়সীমা ও আইনগত পদক্ষেপ।"), steps: s(["راجع الملف والمرفقات وسبب الإحالة.", "أضف الإجراء ومالكه وموعده ثم أغلقه بعد اكتماله."], ["Review the file, attachments, and referral reason.", "Add the action, owner, and due date, then close it after completion."], ["ফাইল, সংযুক্তি ও পাঠানোর কারণ দেখুন।", "পদক্ষেপ, দায়িত্বশীল ব্যক্তি ও সময়সীমা যোগ করে শেষে বন্ধ করুন।"]) },
  { key: "government", anyOf: ["government.read"], title: t("العلاقات الحكومية والامتثال", "Government Relations and Compliance", "সরকারি সম্পর্ক ও সম্মতি"), description: t("التجديدات والمنصات الحكومية وطلبات السداد.", "Renewals, government platforms, and payment requests.", "নবায়ন, সরকারি প্ল্যাটফর্ম ও পরিশোধ অনুরোধ।"), steps: s(["راجع الاستحقاقات والمنصة المرتبطة قبل البدء.", "بيانات الدخول والسداد النهائي محصوران بالمستخدم المخوّل."], ["Review due items and the related platform before starting.", "Credential reveal and final payment are restricted to authorized users."], ["শুরুর আগে বকেয়া বিষয় ও সংশ্লিষ্ট প্ল্যাটফর্ম দেখুন।", "লগইন তথ্য দেখা ও চূড়ান্ত পরিশোধ শুধু অনুমোদিত ব্যবহারকারীর জন্য।"]) },
  { key: "workforce", anyOf: ["workforce.read"], title: t("شؤون العمالة", "Workforce Affairs", "শ্রমিক বিষয়ক ব্যবস্থাপনা"), description: t("طلبات العمال وملفاتهم والعقود والإسناد للمواقع.", "Worker requests, profiles, contracts, and site assignments.", "শ্রমিক অনুরোধ, প্রোফাইল, চুক্তি ও সাইটে নিয়োগ।"), steps: s(["راجع الطلب والوثائق قبل إنشاء ملف العامل.", "اربط العامل بالعقد والمهنة ثم تابع الإسناد والانتهاء."], ["Review the request and documents before creating a worker profile.", "Link the worker to a contract and profession, then track assignment and expiry."], ["শ্রমিকের প্রোফাইল তৈরির আগে অনুরোধ ও নথি দেখুন।", "শ্রমিককে চুক্তি ও পেশার সঙ্গে যুক্ত করে নিয়োগ ও মেয়াদ অনুসরণ করুন।"]) },
  { key: "operations", anyOf: ["operations.read"], title: t("المبيعات والتشغيل", "Sales and Operations", "বিক্রয় ও পরিচালনা"), description: t("من العميل والفرصة إلى عرض السعر والعقد والدوام والتحصيل.", "From client and opportunity to quote, contract, timesheet, and collection.", "গ্রাহক ও সুযোগ থেকে মূল্য প্রস্তাব, চুক্তি, উপস্থিতি ও আদায় পর্যন্ত।"), steps: s(["أنشئ العميل والفرصة ثم جهّز عرض السعر للمراجعة.", "بعد الاعتماد أنشئ العقد وأمر التشغيل وتابع الدوام والدفعات."], ["Create the client and opportunity, then prepare the quote for review.", "After approval, create the contract and work order, then track time and payments."], ["গ্রাহক ও সুযোগ তৈরি করে মূল্য প্রস্তাব পর্যালোচনার জন্য প্রস্তুত করুন।", "অনুমোদনের পর চুক্তি ও কাজের আদেশ তৈরি করে সময় ও কিস্তি অনুসরণ করুন।"]) },
  { key: "integrations", anyOf: ["integrations.administer"], title: t("إدارة التكاملات", "Integration Management", "ইন্টিগ্রেশন ব্যবস্থাপনা"), description: t("متابعة أحداث الربط وإعادة المحاولة وصيانة البيانات المؤقتة.", "Monitor integration events, retry delivery, and maintain transient data.", "ইন্টিগ্রেশন ইভেন্ট পর্যবেক্ষণ, পুনরায় পাঠানো ও অস্থায়ী ডেটা রক্ষণাবেক্ষণ।"), steps: s(["تحقق من إعداد رابط HTTPS وسر التوقيع قبل الإرسال.", "أعد محاولة الحدث الفاشل أو شغّل الصيانة من تبويب التكاملات فقط."], ["Verify the HTTPS endpoint and signing secret before dispatch.", "Retry failed events or run maintenance only from the Integrations tab."], ["পাঠানোর আগে HTTPS এন্ডপয়েন্ট ও স্বাক্ষর গোপনীয়তা যাচাই করুন।", "শুধু ইন্টিগ্রেশন ট্যাব থেকে ব্যর্থ ইভেন্ট পুনরায় পাঠান বা রক্ষণাবেক্ষণ চালান।"]) },
  { key: "representatives", anyOf: ["operations.read"], title: t("إدارة المناديب", "Representative Management", "প্রতিনিধি ব্যবস্থাপনা"), description: t("مناديب المبيعات والمشتريات وطلباتهم الميدانية.", "Sales and purchasing representatives and their field requests.", "বিক্রয় ও ক্রয় প্রতিনিধি এবং মাঠ পর্যায়ের অনুরোধ।"), steps: s(["تحقق من نوع المندوب ونطاقه قبل التفعيل.", "وثّق سبب الاعتماد أو طلب التعديل أو الرفض."], ["Verify the representative type and scope before activation.", "Record the reason for approval, change request, or rejection."], ["সক্রিয় করার আগে প্রতিনিধির ধরন ও পরিধি যাচাই করুন।", "অনুমোদন, পরিবর্তন অনুরোধ বা প্রত্যাখ্যানের কারণ লিখুন।"]) },
  { key: "construction", anyOf: ["construction.read"], title: t("المقاولات والمشروعات", "Construction and Projects", "নির্মাণ ও প্রকল্প"), description: t("الفرص والتقدير والمشروع والسجلات الميدانية والتسليم.", "Opportunities, estimates, projects, field records, and handover.", "সুযোগ, প্রাক্কলন, প্রকল্প, মাঠের রেকর্ড ও হস্তান্তর।"), steps: s(["اختر مشروعًا داخل نطاقك الوظيفي أو الجغرافي.", "أضف السجل ودليله؛ القرارات والاعتمادات تتطلب صلاحية مستقلة."], ["Choose a project within your functional or geographic scope.", "Add the record and evidence; decisions and approvals require separate access."], ["আপনার কাজ বা ভৌগোলিক পরিধির প্রকল্প বেছে নিন।", "রেকর্ড ও প্রমাণ যোগ করুন; সিদ্ধান্ত ও অনুমোদনে আলাদা অনুমতি দরকার।"]) },
  { key: "supervision", allOf: ["contracts.read", "workforce.read"], title: t("إدارة الإشراف على العمالة", "Workforce Supervision", "শ্রমিক তত্ত্বাবধান"), description: t("العقود النشطة والإسناد والحضور والغياب.", "Active contracts, assignments, attendance, and absence.", "সক্রিয় চুক্তি, নিয়োগ, উপস্থিতি ও অনুপস্থিতি।"), steps: s(["افتح العقد وحدد العمالة المسندة للموقع.", "سجّل الغياب من العقد حتى ينعكس ماليًا بطريقة موثقة."], ["Open the contract and review workers assigned to the site.", "Record absence from the contract so its financial impact is traceable."], ["চুক্তি খুলে সাইটে নিয়োজিত শ্রমিক দেখুন।", "আর্থিক প্রভাব নথিভুক্ত রাখতে চুক্তি থেকেই অনুপস্থিতি রেকর্ড করুন।"]) },
  { key: "contracts", anyOf: ["contracts.read"], title: t("العقود والعروض والخطابات", "Contracts, Quotes, and Letters", "চুক্তি, মূল্য প্রস্তাব ও চিঠি"), description: t("تحرير المحررات الرسمية ومراجعتها واعتمادها وإلغاؤها.", "Create, review, approve, and cancel formal documents.", "আনুষ্ঠানিক নথি তৈরি, পর্যালোচনা, অনুমোদন ও বাতিল।"), steps: s(["أنشئ المسودة وأكمل الأطراف والبنود والمرفقات.", "لا تتحول المسودة إلى محرر معتمد إلا بقرار المستخدم المخوّل."], ["Create the draft and complete parties, clauses, and attachments.", "A draft becomes approved only through an authorized user's decision."], ["খসড়া তৈরি করে পক্ষ, শর্ত ও সংযুক্তি পূরণ করুন।", "অনুমোদিত ব্যবহারকারীর সিদ্ধান্ত ছাড়া খসড়া অনুমোদিত নথি হয় না।"]) },
  { key: "documents", anyOf: ["documents.read"], title: t("مستندات الشركة", "Company Documents", "কোম্পানির নথি"), description: t("رفع وإصدار وتنزيل ومشاركة الملفات الرسمية.", "Upload, issue, download, and share official files.", "আনুষ্ঠানিক ফাইল আপলোড, প্রকাশ, ডাউনলোড ও শেয়ার।"), steps: s(["تحقق من التصنيف والمرجع وتاريخ الانتهاء.", "رابط المشاركة مؤقت ولا يظهر إلا مع صلاحية المشاركة."], ["Check category, reference, and expiry date.", "Temporary share links appear only with share permission."], ["শ্রেণি, রেফারেন্স ও মেয়াদ যাচাই করুন।", "অস্থায়ী শেয়ার লিংক শুধু share অনুমতিতে দেখা যায়।"]) },
  { key: "brand", anyOf: ["documents.read", "assets.administer"], title: t("الهوية البصرية", "Brand Identity", "ব্র্যান্ড পরিচিতি"), description: t("الشعار والألوان والختم والتوقيع والأصول الرسمية.", "Logo, colors, stamp, signature, and official assets.", "লোগো, রং, সিল, স্বাক্ষর ও আনুষ্ঠানিক সম্পদ।"), steps: s(["استخدم النسخة المعتمدة المناسبة للمستند.", "استبدال الختم أو التوقيع يتطلب صلاحية إدارة الأصول."], ["Use the approved version suitable for the document.", "Replacing the stamp or signature requires asset administration."], ["নথির জন্য উপযুক্ত অনুমোদিত সংস্করণ ব্যবহার করুন।", "সিল বা স্বাক্ষর বদলাতে সম্পদ প্রশাসনের অনুমতি দরকার।"]) },
  { key: "website", anyOf: ["website.read"], title: t("إدارة الموقع الإلكتروني", "Website Management", "ওয়েবসাইট ব্যবস্থাপনা"), description: t("المحتوى متعدد اللغات والنشر وإعدادات الظهور.", "Multilingual content, publishing, and visibility settings.", "বহুভাষিক বিষয়বস্তু, প্রকাশনা ও দৃশ্যমানতার সেটিংস।"), steps: s(["راجع العربية والإنجليزية والبنغالية قبل الحفظ.", "انشر التعديل ثم تحقق من رقم الإصدار."], ["Review Arabic, English, and Bengali before saving.", "Publish the change, then verify the version number."], ["সংরক্ষণের আগে আরবি, ইংরেজি ও বাংলা দেখুন।", "পরিবর্তন প্রকাশ করে সংস্করণ নম্বর যাচাই করুন।"]) },
  { key: "video", anyOf: ["video.read"], title: t("المقابلات المرئية", "Video Interviews", "ভিডিও সাক্ষাৎকার"), description: t("استقبال طلب الاتصال وتحويله وإنهاؤه أثناء الدوام.", "Receive, transfer, and complete call requests during working hours.", "কাজের সময় কল অনুরোধ গ্রহণ, হস্তান্তর ও সমাপ্তি।"), steps: s(["اضبط حالة توفرّك ثم افتح الطلب الوارد.", "اقبل أو حوّل أو أنهِ المقابلة وفق الصلاحية الظاهرة."], ["Set your availability, then open the incoming request.", "Accept, transfer, or complete it according to the visible permission."], ["উপস্থিতির অবস্থা ঠিক করে আসা অনুরোধ খুলুন।", "দৃশ্যমান অনুমতি অনুযায়ী গ্রহণ, হস্তান্তর বা শেষ করুন।"]) },
  { key: "users", rootOnly: true, title: t("المستخدمون والصلاحيات", "Users and Permissions", "ব্যবহারকারী ও অনুমতি"), description: t("اعتماد الحسابات والأدوار والنطاقات وفق أقل صلاحية لازمة.", "Approve accounts, roles, and scopes using least privilege.", "সর্বনিম্ন প্রয়োজনীয় অনুমতিতে অ্যাকাউন্ট, ভূমিকা ও পরিধি অনুমোদন।"), steps: s(["تحقق من هوية المستخدم والقسم وسبب الطلب.", "اختر أقل دور ونطاق يحققان العمل ووثّق سبب القرار."], ["Verify the user, department, and request reason.", "Choose the least role and scope needed, then record the reason."], ["ব্যবহারকারী, বিভাগ ও অনুরোধের কারণ যাচাই করুন।", "কাজের জন্য সর্বনিম্ন ভূমিকা ও পরিধি বেছে নিয়ে কারণ লিখুন।"]) },
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
        <div>{visibleModules.map((module, index) => <details key={module.key} open={!query && index === 0}><summary><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{module.title[locale]}</strong><small>{module.description[locale]}</small></div><code dir="ltr">{permissionFor(module)}</code><i aria-hidden="true">＋</i></summary><ol>{module.steps[locale].map((step) => <li key={step}>{step}</li>)}</ol></details>)}</div>
        {!visibleModules.length && <p className="guide-empty">{c.noModules}</p>}
      </section>

      <div className="guide-two-column guide-closing">
        <section className="guide-card guide-notes"><header><span>05</span><div><h2>{c.notesTitle}</h2><p>{c.notesBody}</p></div></header><p className="guide-note-example">{c.notesExample}</p><blockquote>{c.notesRule}</blockquote></section>
        <section className="guide-card guide-security"><header><span>06</span><div><h2>{c.securityTitle}</h2></div></header><ul>{c.securityRules.map((rule) => <li key={rule}>{rule}</li>)}</ul></section>
      </div>
    </section>
  );
}
