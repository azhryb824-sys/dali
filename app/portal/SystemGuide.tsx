"use client";

import { useMemo, useState } from "react";

type Locale = "ar" | "en" | "bn";
type Localized = Record<Locale, string>;

export type SystemGuideView =
  | "overview"
  | "notifications"
  | "tasks"
  | "conversations"
  | "employees"
  | "finance"
  | "legal"
  | "government"
  | "workforce"
  | "operations"
  | "representatives"
  | "construction"
  | "workforce-supervision"
  | "contractual-documents"
  | "documents"
  | "brand"
  | "website"
  | "users";

type Requirement = {
  anyOf?: string[];
  allOf?: string[];
  rootOnly?: boolean;
  rolesAny?: string[];
};

type GuideSection = {
  label: Localized;
  operationTab?: string;
};

type GuideAction = Requirement & {
  label: Localized;
  detail: Localized;
  operationTab?: string;
};

type PageGuide = {
  view: SystemGuideView;
  title: Localized;
  description: Localized;
  sections: GuideSection[];
  actions: GuideAction[];
  steps: Record<Locale, string[]>;
  caution: Localized;
};

const t = (ar: string, en: string, bn: string): Localized => ({ ar, en, bn });
const s = (ar: string[], en: string[], bn: string[]): Record<Locale, string[]> => ({ ar, en, bn });
const section = (ar: string, en: string, bn: string, operationTab?: string): GuideSection => ({
  label: t(ar, en, bn),
  operationTab,
});
const action = (
  label: Localized,
  detail: Localized,
  requirement: Requirement = {},
  operationTab?: string,
): GuideAction => ({ label, detail, ...requirement, operationTab });

const copy = {
  ar: {
    eyebrow: "دليل العمل داخل نظام دالي",
    title: "دليلك الفعلي لاستخدام النظام",
    intro: "هذا الدليل مبني على الصفحات التي تظهر في حسابك الآن، وعلى أدوارك وصلاحياتك الفعلية. ستجد الاسم نفسه الموجود في القائمة الجانبية، والأقسام الموجودة داخل كل صفحة، وما تستطيع تنفيذه وما يحتاج مستخدمًا مخولًا.",
    search: "ابحث باسم الصفحة أو القسم أو الإجراء...",
    accessTitle: "هذا الدليل مخصص لحسابك",
    accessBody: "لا تُعرض هنا إلا الصفحات الموجودة فعلًا في قائمتك. ظهور الصفحة لا يعني السماح بكل أزرارها؛ لذلك يوضح كل قسم الإجراءات المتاحة لك والإجراءات المقيدة بصورة منفصلة.",
    accountType: "نوع الحساب",
    assignedRoles: "الأدوار المسندة",
    department: "القسم الأساسي",
    pages: "الصفحات المشروحة",
    capabilities: "الإجراءات المتاحة",
    fullAccess: "وصول إداري كامل",
    noFixedDepartment: "لا يوجد قسم ثابت",
    startTitle: "ابدأ يومك بهذه الخطوات",
    workflowTitle: "كيف تنتقل المعاملة داخل النظام",
    workflowBody: "الحفظ ينشئ سجلًا أو مسودة فقط. المراجعة والاعتماد والترحيل والدفع والنشر خطوات مستقلة، ولا ينفذها إلا صاحب الصلاحية المناسبة.",
    permissionTitle: "صلاحياتك المسندة بالاسم",
    permissionBody: "هذه أسماء الصلاحيات الفعلية في حسابك. استخدمها لمعرفة سبب ظهور زر أو اختفائه، واطلب تعديل الدور بدل استخدام حساب شخص آخر.",
    modulesTitle: "الصفحات التي تظهر لك فعليًا",
    modulesBody: "الأسماء مرتبة كما تظهر في القائمة الجانبية. افتح أي صفحة هنا لترى أقسامها وإجراءاتها وخطوات العمل الدقيقة، أو انتقل إليها مباشرة.",
    sectionsTitle: "ما يوجد داخل الصفحة",
    availableTitle: "متاح لك الآن",
    unavailableTitle: "غير متاح في حسابك",
    unavailableBody: "ينفذ هذا الإجراء مستخدم مخول بعد استلام السجل ومراجعته.",
    stepsTitle: "طريقة العمل خطوة بخطوة",
    cautionTitle: "انتبه قبل الإغلاق",
    openPage: "فتح الصفحة",
    requirement: "يتطلب",
    noRestriction: "متاح لكل من يرى الصفحة",
    noPages: "لا توجد صفحة مطابقة للبحث ضمن الصفحات الظاهرة لحسابك.",
    toolsTitle: "أدوات مشتركة وليست صفحات",
    toolsBody: "هذه الأدوات تظهر في رأس النظام أو كنافذة مساعدة؛ لذلك لا تُحسب كصفحات مستقلة في القائمة.",
    notesTitle: "كتابة الملاحظات بطريقة قابلة للمتابعة",
    notesBody: "اكتب الواقعة، والسجل المرتبط، والمسؤول، والإجراء التالي، والموعد. لا تضع قرار اعتماد أو دفع داخل نص ملاحظة.",
    notesExample: "مثال صحيح: لم يصل مرفق الفاتورة للعقد D-104 — المسؤول: محاسب المشروع — الإجراء التالي: طلب نسخة معتمدة — الموعد: 5 سبتمبر.",
    notesRule: "الملاحظة ليست اعتمادًا. استخدم زر الاعتماد أو الرفض أو الإلغاء حتى يسجل النظام القرار وصاحبه وتوقيته.",
    securityTitle: "قواعد الأمان والتحقق",
    securityRules: [
      "لا تشارك كلمة المرور أو رمز التحقق أو جلسة الدخول.",
      "تحقق من اسم العميل أو الموظف أو العامل ورقم المرجع قبل تعديل أي سجل.",
      "راجع الحالة الحالية والمرفقات وآخر تحديث قبل الاعتماد أو الترحيل أو الدفع.",
      "إذا تأخر الرد فلا تكرر الحفظ أو الدفع؛ حدّث السجل وتحقق من سجل النشاط أولًا.",
      "نزّل المستندات وشاركها من الأزرار الرسمية فقط، ولا ترسل رابطًا منتهيًا أو إلى مستلم غير مقصود.",
      "سجّل الخروج عند استخدام جهاز مشترك أو انتهاء العمل.",
    ],
  },
  en: {
    eyebrow: "Dali system working guide",
    title: "Your actual guide to the system",
    intro: "This guide is built from the pages currently visible to your account and your actual roles and permissions. It uses the exact sidebar names, identifies the real sections inside each page, and separates what you can do from actions that require another authorized user.",
    search: "Search by page, section, or action...",
    accessTitle: "This guide is tailored to your account",
    accessBody: "Only pages that are currently present in your sidebar are listed. Seeing a page does not grant every action on it, so each page separates actions available to you from restricted actions.",
    accountType: "Account type",
    assignedRoles: "Assigned roles",
    department: "Primary department",
    pages: "Explained pages",
    capabilities: "Available actions",
    fullAccess: "Full administrative access",
    noFixedDepartment: "No fixed department",
    startTitle: "Start your day with these steps",
    workflowTitle: "How a transaction moves through the system",
    workflowBody: "Saving only creates a record or draft. Review, approval, posting, payment, and publishing are separate stages performed only by users with the relevant permission.",
    permissionTitle: "Your assigned permissions by name",
    permissionBody: "These are the actual permissions assigned to your account. Use them to understand why an action appears or is hidden, and request a role change instead of using someone else's account.",
    modulesTitle: "Pages actually visible to you",
    modulesBody: "Names follow the same order as the sidebar. Open any entry to see its real sections, actions, and detailed workflow, or go directly to that page.",
    sectionsTitle: "What is inside this page",
    availableTitle: "Available to you now",
    unavailableTitle: "Not available to your account",
    unavailableBody: "An authorized user performs this action after receiving and reviewing the record.",
    stepsTitle: "Step-by-step workflow",
    cautionTitle: "Check before you finish",
    openPage: "Open page",
    requirement: "Requires",
    noRestriction: "Available to anyone who can see the page",
    noPages: "No visible page matches this search.",
    toolsTitle: "Shared tools, not separate pages",
    toolsBody: "These tools appear in the system header or as a helper window, so they are not counted as sidebar pages.",
    notesTitle: "Write notes that can be followed up",
    notesBody: "State the event, linked record, owner, next action, and due date. Never place an approval or payment decision only inside a note.",
    notesExample: "Good example: Invoice attachment for contract D-104 not received — owner: project accountant — next action: request an approved copy — due: 5 September.",
    notesRule: "A note is not an approval. Use the approve, reject, or cancel action so the system records the decision, decision-maker, and time.",
    securityTitle: "Security and verification rules",
    securityRules: [
      "Never share your password, verification code, or signed-in session.",
      "Verify the client, employee, or worker and reference number before editing a record.",
      "Review current status, attachments, and the latest update before approval, posting, or payment.",
      "If a response is slow, do not repeat save or payment; refresh the record and check its activity first.",
      "Download and share documents only through official actions, and never send an expired link or the link to the wrong recipient.",
      "Sign out after using a shared device or completing work.",
    ],
  },
  bn: {
    eyebrow: "ডালি সিস্টেমে কাজের নির্দেশিকা",
    title: "সিস্টেম ব্যবহারের আপনার বাস্তব নির্দেশিকা",
    intro: "এই নির্দেশিকা বর্তমানে আপনার অ্যাকাউন্টে দেখা পৃষ্ঠা এবং আপনার প্রকৃত ভূমিকা ও অনুমতি থেকে তৈরি। এতে সাইডবারের একই নাম, প্রতিটি পৃষ্ঠার বাস্তব অংশ এবং আপনি যা করতে পারেন ও অনুমোদিত অন্য ব্যবহারকারীর প্রয়োজন এমন কাজ আলাদা করে দেখানো হয়েছে।",
    search: "পৃষ্ঠা, অংশ বা কাজের নাম দিয়ে খুঁজুন...",
    accessTitle: "এই নির্দেশিকা আপনার অ্যাকাউন্ট অনুযায়ী",
    accessBody: "বর্তমানে আপনার সাইডবারে থাকা পৃষ্ঠাগুলোই এখানে দেখানো হয়। পৃষ্ঠা দেখা মানেই সব কাজের অনুমতি নয়, তাই প্রতিটি পৃষ্ঠায় আপনার জন্য উপলভ্য ও সীমাবদ্ধ কাজ আলাদা করা হয়েছে।",
    accountType: "অ্যাকাউন্টের ধরন",
    assignedRoles: "অর্পিত ভূমিকা",
    department: "মূল বিভাগ",
    pages: "ব্যাখ্যা করা পৃষ্ঠা",
    capabilities: "উপলভ্য কাজ",
    fullAccess: "সম্পূর্ণ প্রশাসনিক প্রবেশাধিকার",
    noFixedDepartment: "নির্দিষ্ট বিভাগ নেই",
    startTitle: "এই ধাপগুলো দিয়ে দিন শুরু করুন",
    workflowTitle: "সিস্টেমে একটি লেনদেন যেভাবে এগোয়",
    workflowBody: "সংরক্ষণ শুধু রেকর্ড বা খসড়া তৈরি করে। পর্যালোচনা, অনুমোদন, পোস্টিং, পরিশোধ ও প্রকাশ আলাদা ধাপ এবং সংশ্লিষ্ট অনুমতিপ্রাপ্ত ব্যবহারকারীই তা করেন।",
    permissionTitle: "নামসহ আপনার অর্পিত অনুমতি",
    permissionBody: "এগুলো আপনার অ্যাকাউন্টে থাকা প্রকৃত অনুমতি। কোনো কাজ কেন দেখা যাচ্ছে বা লুকানো তা বুঝতে এগুলো ব্যবহার করুন; অন্যের অ্যাকাউন্ট ব্যবহার না করে ভূমিকা পরিবর্তনের অনুরোধ করুন।",
    modulesTitle: "আপনার কাছে বাস্তবে দৃশ্যমান পৃষ্ঠা",
    modulesBody: "নামগুলো সাইডবারের একই ক্রমে আছে। বাস্তব অংশ, কাজ ও বিস্তারিত ধাপ দেখতে যেকোনো পৃষ্ঠা খুলুন অথবা সরাসরি সেই পৃষ্ঠায় যান।",
    sectionsTitle: "এই পৃষ্ঠার ভেতরে যা আছে",
    availableTitle: "এখন আপনার জন্য উপলভ্য",
    unavailableTitle: "আপনার অ্যাকাউন্টে উপলভ্য নয়",
    unavailableBody: "রেকর্ড গ্রহণ ও পর্যালোচনার পর অনুমোদিত ব্যবহারকারী এই কাজ করবেন।",
    stepsTitle: "ধাপে ধাপে কাজের পদ্ধতি",
    cautionTitle: "শেষ করার আগে যাচাই করুন",
    openPage: "পৃষ্ঠা খুলুন",
    requirement: "প্রয়োজন",
    noRestriction: "পৃষ্ঠা দেখতে পাওয়া সবাই ব্যবহার করতে পারেন",
    noPages: "আপনার দৃশ্যমান পৃষ্ঠার মধ্যে এই অনুসন্ধানের মিল নেই।",
    toolsTitle: "সাধারণ টুল, আলাদা পৃষ্ঠা নয়",
    toolsBody: "এগুলো সিস্টেম হেডার বা সহায়ক উইন্ডোতে দেখা যায়, তাই সাইডবারের আলাদা পৃষ্ঠা হিসেবে গণনা হয় না।",
    notesTitle: "অনুসরণযোগ্য নোট লিখুন",
    notesBody: "ঘটনা, সংযুক্ত রেকর্ড, দায়িত্বশীল ব্যক্তি, পরবর্তী কাজ ও সময়সীমা লিখুন। অনুমোদন বা পরিশোধের সিদ্ধান্ত শুধু নোটে রাখবেন না।",
    notesExample: "সঠিক উদাহরণ: D-104 চুক্তির চালান সংযুক্তি পাওয়া যায়নি — দায়িত্ব: প্রকল্প হিসাবরক্ষক — পরবর্তী কাজ: অনুমোদিত কপি চাওয়া — সময়সীমা: ৫ সেপ্টেম্বর।",
    notesRule: "নোট কোনো অনুমোদন নয়। সিদ্ধান্ত, সিদ্ধান্তদাতা ও সময় নথিভুক্ত করতে approve, reject বা cancel কাজ ব্যবহার করুন।",
    securityTitle: "নিরাপত্তা ও যাচাইয়ের নিয়ম",
    securityRules: [
      "পাসওয়ার্ড, যাচাইকরণ কোড বা লগইন সেশন শেয়ার করবেন না।",
      "রেকর্ড সম্পাদনার আগে গ্রাহক, কর্মচারী বা শ্রমিক এবং রেফারেন্স নম্বর যাচাই করুন।",
      "অনুমোদন, পোস্টিং বা পরিশোধের আগে বর্তমান অবস্থা, সংযুক্তি ও সর্বশেষ হালনাগাদ দেখুন।",
      "উত্তর পেতে দেরি হলে save বা payment পুনরাবৃত্তি করবেন না; রেকর্ড রিফ্রেশ করে কার্যক্রম দেখুন।",
      "শুধু আনুষ্ঠানিক বোতামে নথি ডাউনলোড ও শেয়ার করুন; মেয়াদোত্তীর্ণ লিংক বা ভুল প্রাপককে লিংক পাঠাবেন না।",
      "শেয়ার করা ডিভাইস ব্যবহারের পর বা কাজ শেষে লগআউট করুন।",
    ],
  },
} satisfies Record<Locale, Record<string, string | string[]>>;

const accountRoleLabels: Record<"admin" | "manager" | "employee", Localized> = {
  admin: t("مدير النظام", "System administrator", "সিস্টেম প্রশাসক"),
  manager: t("حساب إداري", "Management account", "ব্যবস্থাপনা অ্যাকাউন্ট"),
  employee: t("حساب موظف", "Employee account", "কর্মচারী অ্যাকাউন্ট"),
};

const functionalRoleLabels: Record<string, Localized> = {
  system_owner: t("مالك النظام", "System owner", "সিস্টেম মালিক"),
  system_admin: t("مسؤول النظام", "System administrator", "সিস্টেম প্রশাসক"),
  executive: t("الإدارة التنفيذية", "Executive management", "নির্বাহী ব্যবস্থাপনা"),
  construction_director: t("مدير قطاع المقاولات", "Construction director", "নির্মাণ পরিচালক"),
  workforce_operations_manager: t("مدير تشغيل العمالة", "Workforce operations manager", "শ্রমিক পরিচালনা ব্যবস্থাপক"),
  finance_director: t("المدير المالي", "Finance director", "অর্থ পরিচালক"),
  project_manager: t("مدير مشروع", "Project manager", "প্রকল্প ব্যবস্থাপক"),
  site_engineer: t("مهندس موقع", "Site engineer", "সাইট প্রকৌশলী"),
  planning_engineer: t("مهندس تخطيط", "Planning engineer", "পরিকল্পনা প্রকৌশলী"),
  cost_engineer: t("مهندس تكاليف", "Cost engineer", "ব্যয় প্রকৌশলী"),
  contracts_manager: t("مدير العقود", "Contracts manager", "চুক্তি ব্যবস্থাপক"),
  procurement_officer: t("مسؤول المشتريات", "Procurement officer", "ক্রয় কর্মকর্তা"),
  project_accountant: t("محاسب مشروع", "Project accountant", "প্রকল্প হিসাবরক্ষক"),
  document_controller: t("مراقب وثائق", "Document controller", "নথি নিয়ন্ত্রক"),
  quality_officer: t("مسؤول الجودة", "Quality officer", "গুণমান কর্মকর্তা"),
  safety_officer: t("مسؤول السلامة", "Safety officer", "নিরাপত্তা কর্মকর্তা"),
  hr_officer: t("مسؤول الموارد البشرية", "HR officer", "মানবসম্পদ কর্মকর্তা"),
  government_relations_officer: t("مسؤول العلاقات الحكومية والامتثال", "Government relations and compliance officer", "সরকারি সম্পর্ক ও সম্মতি কর্মকর্তা"),
  regional_manager: t("مدير منطقة", "Regional manager", "আঞ্চলিক ব্যবস্থাপক"),
  client_consultant: t("ممثل العميل أو الاستشاري", "Client or consultant representative", "গ্রাহক বা পরামর্শক প্রতিনিধি"),
  subcontractor: t("مقاول باطن", "Subcontractor", "উপ-ঠিকাদার"),
  accountant: t("المحاسب", "Accountant", "হিসাবরক্ষক"),
  lawyer: t("محامي", "Lawyer", "আইনজীবী"),
  legal_supervisor: t("محامي مشرف", "Legal supervisor", "আইনি তত্ত্বাবধায়ক"),
  legal_lawyer: t("محامي فرعي", "Assigned lawyer", "নিযুক্ত আইনজীবী"),
  workforce_supervisor: t("مشرف العمالة", "Workforce supervisor", "শ্রমিক তত্ত্বাবধায়ক"),
  legal_affairs: t("شؤون قانونية", "Legal affairs", "আইনি বিষয়"),
  sales_representative: t("مندوب مبيعات", "Sales representative", "বিক্রয় প্রতিনিধি"),
  purchasing_representative: t("مندوب مشتريات", "Purchasing representative", "ক্রয় প্রতিনিধি"),
  administrative_assistant: t("مساعد إداري", "Administrative assistant", "প্রশাসনিক সহকারী"),
};

const departmentLabels: Record<string, Localized> = {
  employees: t("إدارة الموظفين", "Employee Management", "কর্মচারী ব্যবস্থাপনা"),
  finance: t("الإدارة المالية", "Finance", "অর্থ বিভাগ"),
  legal: t("الشؤون القانونية", "Legal Affairs", "আইনি বিষয়"),
  workforce: t("شؤون العمالة", "Workforce Affairs", "শ্রমিক বিষয়"),
  construction: t("المقاولات والمشروعات", "Construction and Projects", "নির্মাণ ও প্রকল্প"),
  general: t("لا يوجد قسم ثابت", "No fixed department", "নির্দিষ্ট বিভাগ নেই"),
};

const permissionLabels: Record<string, Localized> = {
  "overview.read": t("عرض لوحة المتابعة", "View dashboard", "ড্যাশবোর্ড দেখা"),
  "employees.read": t("عرض إدارة الموظفين", "View employees", "কর্মচারী দেখা"),
  "employees.write": t("إنشاء وتعديل بيانات الموظفين", "Create and edit employees", "কর্মচারী তৈরি ও সম্পাদনা"),
  "employees.approve": t("اعتماد إجراءات الموظفين", "Approve employee actions", "কর্মচারী কার্যক্রম অনুমোদন"),
  "finance.read": t("عرض الإدارة المالية", "View finance", "অর্থ বিভাগ দেখা"),
  "finance.write": t("إنشاء وتعديل الحركات المالية", "Create and edit finance records", "আর্থিক রেকর্ড তৈরি ও সম্পাদনা"),
  "finance.approve": t("اعتماد المعاملات المالية", "Approve finance transactions", "আর্থিক লেনদেন অনুমোদন"),
  "finance.post": t("ترحيل القيود المحاسبية", "Post accounting entries", "হিসাব এন্ট্রি পোস্ট"),
  "finance.pay": t("تنفيذ المدفوعات", "Release payments", "পরিশোধ কার্যকর"),
  "legal.read": t("عرض الشؤون القانونية", "View legal affairs", "আইনি বিষয় দেখা"),
  "legal.write": t("تعديل السجلات القانونية", "Edit legal records", "আইনি রেকর্ড সম্পাদনা"),
  "legal.approve": t("الاعتماد القانوني", "Legal approval", "আইনি অনুমোদন"),
  "government.read": t("عرض العلاقات الحكومية", "View government relations", "সরকারি সম্পর্ক দেখা"),
  "government.write": t("تعديل العلاقات الحكومية", "Edit government relations", "সরকারি সম্পর্ক সম্পাদনা"),
  "workforce.read": t("عرض شؤون العمالة", "View workforce affairs", "শ্রমিক বিষয় দেখা"),
  "workforce.write": t("تعديل العمالة والتشغيل", "Edit workforce operations", "শ্রমিক কার্যক্রম সম্পাদনা"),
  "workforce.approve": t("اعتماد التشغيل والساعات", "Approve operations and hours", "কার্যক্রম ও ঘণ্টা অনুমোদন"),
  "operations.read": t("عرض المبيعات والتشغيل", "View sales and operations", "বিক্রয় ও কার্যক্রম দেখা"),
  "operations.write": t("تعديل المبيعات والتشغيل", "Edit sales and operations", "বিক্রয় ও কার্যক্রম সম্পাদনা"),
  "representatives.read": t("عرض إدارة المناديب", "View representatives", "প্রতিনিধি দেখা"),
  "representatives.write": t("إدارة المناديب وطلباتهم", "Manage representatives and requests", "প্রতিনিধি ও অনুরোধ পরিচালনা"),
  "contracts.read": t("عرض العقود والعروض والخطابات", "View contracts, quotes, and letters", "চুক্তি, প্রস্তাব ও চিঠি দেখা"),
  "contracts.write": t("إنشاء وتعديل المحررات التعاقدية", "Create and edit contractual documents", "চুক্তিগত নথি তৈরি ও সম্পাদনা"),
  "contracts.approve": t("اعتماد المحررات التعاقدية", "Approve contractual documents", "চুক্তিগত নথি অনুমোদন"),
  "construction.read": t("عرض المقاولات والمشروعات", "View construction and projects", "নির্মাণ ও প্রকল্প দেখা"),
  "construction.write": t("تعديل سجلات المقاولات", "Edit construction records", "নির্মাণ রেকর্ড সম্পাদনা"),
  "construction.approve": t("اعتماد قرارات المقاولات", "Approve construction decisions", "নির্মাণ সিদ্ধান্ত অনুমোদন"),
  "documents.read": t("عرض مستندات الشركة", "View company documents", "কোম্পানির নথি দেখা"),
  "documents.preview": t("تنزيل معاينات PDF", "Download PDF previews", "PDF প্রিভিউ ডাউনলোড"),
  "documents.write": t("رفع وتعديل مستندات الشركة", "Upload and edit company documents", "কোম্পানির নথি আপলোড ও সম্পাদনা"),
  "documents.share": t("مشاركة مستندات الشركة", "Share company documents", "কোম্পানির নথি শেয়ার"),
  "conversations.read": t("عرض المحادثات المباشرة", "View live conversations", "সরাসরি কথোপকথন দেখা"),
  "conversations.write": t("الرد وإدارة المحادثات", "Reply to and manage conversations", "কথোপকথনে উত্তর ও পরিচালনা"),
  "website.read": t("عرض إدارة الموقع", "View website management", "ওয়েবসাইট ব্যবস্থাপনা দেখা"),
  "website.write": t("تعديل ونشر الموقع", "Edit and publish the website", "ওয়েবসাইট সম্পাদনা ও প্রকাশ"),
  "reports.read": t("عرض التقارير", "View reports", "প্রতিবেদন দেখা"),
  "reports.export": t("تصدير التقارير", "Export reports", "প্রতিবেদন রপ্তানি"),
  "video.read": t("عرض المقابلات المرئية", "View video interviews", "ভিডিও সাক্ষাৎকার দেখা"),
  "video.manage": t("استقبال وإدارة المقابلات المرئية", "Receive and manage video interviews", "ভিডিও সাক্ষাৎকার গ্রহণ ও পরিচালনা"),
  "video.transfer": t("تحويل المقابلات المرئية", "Transfer video interviews", "ভিডিও সাক্ষাৎকার হস্তান্তর"),
  "assets.administer": t("إدارة الختم والتوقيع والأصول", "Manage stamps, signatures, and assets", "সিল, স্বাক্ষর ও সম্পদ পরিচালনা"),
  "users.administer": t("إدارة المستخدمين والأدوار", "Manage users and roles", "ব্যবহারকারী ও ভূমিকা পরিচালনা"),
  "integrations.administer": t("إدارة التكاملات والصيانة", "Manage integrations and maintenance", "ইন্টিগ্রেশন ও রক্ষণাবেক্ষণ পরিচালনা"),
};

const quickSteps = s(
  [
    "راجع اسمك والأدوار المسندة أعلى الدليل؛ فهي أدق من المسمى العام للحساب.",
    "ابدأ بمركز الإشعارات ثم المهام والتذكيرات، وتعامل أولًا مع الحرج والمتأخر.",
    "استخدم البحث الشامل باسم أو رقم مرجع، وتحقق من نوع النتيجة قبل فتحها.",
    "افتح الصفحة الأصلية للسجل واقرأ حالته ومرفقاته وآخر تحديث قبل التنفيذ.",
    "نفّذ الإجراء مرة واحدة، وانتظر رسالة النجاح، ثم تحقق من الحالة وسجل النشاط.",
  ],
  [
    "Review your name and assigned roles at the top; they are more precise than the general account type.",
    "Start with Notification Center, then Tasks and Reminders, handling critical and overdue items first.",
    "Use global search with a name or reference and verify the result type before opening it.",
    "Open the record's source page and review its status, attachments, and latest update before acting.",
    "Perform the action once, wait for confirmation, then verify the status and activity trail.",
  ],
  [
    "ওপরে আপনার নাম ও অর্পিত ভূমিকা দেখুন; এগুলো সাধারণ অ্যাকাউন্ট ধরনের চেয়ে বেশি নির্দিষ্ট।",
    "বিজ্ঞপ্তি কেন্দ্র, তারপর কাজ ও স্মরণিকা দিয়ে শুরু করে জরুরি ও বিলম্বিত বিষয় আগে নিন।",
    "নাম বা রেফারেন্স দিয়ে সার্বিক অনুসন্ধান করুন এবং খোলার আগে ফলের ধরন যাচাই করুন।",
    "কাজের আগে মূল পৃষ্ঠায় রেকর্ডের অবস্থা, সংযুক্তি ও সর্বশেষ হালনাগাদ দেখুন।",
    "কাজটি একবার করুন, নিশ্চিতকরণের জন্য অপেক্ষা করুন, তারপর অবস্থা ও কার্যক্রম যাচাই করুন।",
  ],
);

const workflowSteps = s(
  [
    "إنشاء: اختر الوحدة الصحيحة، وأكمل الحقول الإلزامية، واربط السجل بالعميل أو العقد أو الموظف أو العامل الصحيح.",
    "توثيق: أرفق الملف الداعم، وراجع الجهة والمرجع والتاريخ والصلاحية والمبلغ قبل الحفظ.",
    "مراجعة: احفظ كمسودة، وراجع القيم والحسابات والترجمات، ثم أرسل من زر المراجعة أو الاعتماد.",
    "قرار: يراجع المستخدم المخول البيانات والمرفقات، ويسجل سبب الرفض أو طلب التعديل من الإجراء المخصص.",
    "تنفيذ: بعد الاعتماد فقط يتم الإصدار أو الترحيل أو الدفع أو النشر أو التفعيل حسب نوع المعاملة.",
    "تحقق: راجع الحالة النهائية والإشعار وسجل النشاط والمستند الناتج قبل إغلاق المهمة.",
  ],
  [
    "Create: choose the correct module, complete required fields, and link the right client, contract, employee, or worker.",
    "Document: attach supporting evidence and verify party, reference, date, validity, and amount before saving.",
    "Review: save a draft, check values, calculations, and translations, then submit through the review or approval action.",
    "Decide: an authorized user reviews data and attachments and records any rejection or change request through the dedicated action.",
    "Execute: only after approval should the record be issued, posted, paid, published, or activated as applicable.",
    "Verify: check final status, notification, activity trail, and generated document before closing the task.",
  ],
  [
    "তৈরি: সঠিক মডিউল বেছে আবশ্যিক ঘর পূরণ করুন এবং সঠিক গ্রাহক, চুক্তি, কর্মচারী বা শ্রমিক যুক্ত করুন।",
    "নথিভুক্ত: সহায়ক প্রমাণ সংযুক্ত করে সংরক্ষণের আগে পক্ষ, রেফারেন্স, তারিখ, বৈধতা ও অর্থ যাচাই করুন।",
    "পর্যালোচনা: খসড়া সংরক্ষণ করে মান, হিসাব ও অনুবাদ দেখুন, তারপর review বা approval কাজ দিয়ে পাঠান।",
    "সিদ্ধান্ত: অনুমোদিত ব্যবহারকারী তথ্য ও সংযুক্তি দেখে নির্ধারিত কাজের মাধ্যমে প্রত্যাখ্যান বা পরিবর্তনের কারণ লিখবেন।",
    "কার্যকর: অনুমোদনের পরই প্রযোজ্য ক্ষেত্রে প্রকাশ, পোস্টিং, পরিশোধ, প্রকাশনা বা সক্রিয়করণ হবে।",
    "যাচাই: কাজ বন্ধ করার আগে চূড়ান্ত অবস্থা, বিজ্ঞপ্তি, কার্যক্রম ও তৈরি নথি দেখুন।",
  ],
);

const pages: PageGuide[] = [
  {
    view: "overview",
    title: t("نظرة عامة", "Overview", "সারসংক্ষেপ"),
    description: t(
      "صفحة البداية التي تجمع المؤشرات المتاحة لحسابك، والتنبيهات، والاختصارات إلى الوحدات الأصلية.",
      "The starting page that combines indicators available to your account, alerts, and shortcuts to source modules.",
      "আপনার অ্যাকাউন্টে উপলভ্য সূচক, সতর্কতা ও মূল মডিউলের শর্টকাটসহ শুরুর পৃষ্ঠা।",
    ),
    sections: [
      section("مؤشرات الأقسام المصرح بها", "Authorized department indicators", "অনুমোদিত বিভাগের সূচক"),
      section("التنبيهات والطلبات التي تحتاج متابعة", "Alerts and requests needing follow-up", "অনুসরণযোগ্য সতর্কতা ও অনুরোধ"),
      section("مركز قيادة الأفراد للإدارة الجذرية", "People command center for root administrators", "মূল প্রশাসকের জনবল কমান্ড সেন্টার"),
      section("سجل النشاط والاختصارات", "Activity trail and shortcuts", "কার্যক্রমের ইতিহাস ও শর্টকাট"),
    ],
    actions: [
      action(
        t("فتح بطاقة المؤشر", "Open an indicator card", "সূচক কার্ড খুলুন"),
        t("ينقلك إلى الصفحة الأصلية أو القائمة المرتبطة بدل اتخاذ قرار من الرقم المختصر.", "Takes you to the source page or linked list instead of deciding from a summary count.", "সারসংক্ষেপ সংখ্যা থেকে সিদ্ধান্ত না নিয়ে মূল পৃষ্ঠা বা তালিকায় নিয়ে যায়।"),
      ),
      action(
        t("مراجعة السجل والنشاط", "Review a record and its activity", "রেকর্ড ও কার্যক্রম দেখুন"),
        t("تحقق من الحالة والمسؤول وآخر تحديث قبل أي إجراء.", "Check status, owner, and latest update before any action.", "কাজের আগে অবস্থা, দায়িত্বশীল ব্যক্তি ও সর্বশেষ হালনাগাদ দেখুন।"),
      ),
    ],
    steps: s(
      [
        "ابدأ بالبطاقات التي تحمل رقمًا أو لون تنبيه، ثم قارنها بالإشعارات والمهام المستحقة اليوم.",
        "اضغط البطاقة لفتح السجلات الداخلة في العدد؛ لا تعتمد على الإجمالي وحده.",
        "حدد السجل الصحيح بالاسم والمرجع، وافتح صفحته الأصلية لمراجعة التفاصيل.",
        "بعد التنفيذ عد إلى نظرة عامة وتأكد من تغير المؤشر أو زوال التنبيه.",
      ],
      [
        "Start with cards showing a count or alert color and compare them with today's notifications and tasks.",
        "Open the card to inspect records included in the count; never rely on the total alone.",
        "Identify the correct record by name and reference, then open its source page for details.",
        "After acting, return to Overview and confirm the indicator or alert changed.",
      ],
      [
        "সংখ্যা বা সতর্কতার রঙ দেখানো কার্ড দিয়ে শুরু করে আজকের বিজ্ঞপ্তি ও কাজের সঙ্গে মিলিয়ে দেখুন।",
        "গণনায় থাকা রেকর্ড দেখতে কার্ড খুলুন; শুধু মোট সংখ্যার ওপর নির্ভর করবেন না।",
        "নাম ও রেফারেন্স দিয়ে সঠিক রেকর্ড বেছে বিস্তারিত দেখতে মূল পৃষ্ঠা খুলুন।",
        "কাজের পর সারসংক্ষেপে ফিরে সূচক বা সতর্কতা বদলেছে কি না দেখুন।",
      ],
    ),
    caution: t(
      "المؤشر ملخص لحظي وليس سجل اعتماد؛ القرار ينفذ داخل الوحدة الأصلية.",
      "An indicator is a live summary, not an approval record; decisions are made in the source module.",
      "সূচক তাৎক্ষণিক সারসংক্ষেপ, অনুমোদনের রেকর্ড নয়; সিদ্ধান্ত মূল মডিউলে হয়।",
    ),
  },
  {
    view: "notifications",
    title: t("مركز الإشعارات", "Notification Center", "বিজ্ঞপ্তি কেন্দ্র"),
    description: t(
      "قائمة أحداث النظام التي تنبهك إلى موعد أو تغيير أو قرار متعلق بسجل تستطيع الوصول إليه.",
      "System events that alert you to a deadline, change, or decision involving a record you can access.",
      "আপনার প্রবেশযোগ্য রেকর্ডের সময়সীমা, পরিবর্তন বা সিদ্ধান্ত সম্পর্কে সিস্টেমের সতর্কতা।",
    ),
    sections: [
      section("غير المقروء", "Unread", "অপঠিত"),
      section("الحرج", "Critical", "জরুরি"),
      section("التحذيرات", "Warnings", "সতর্কতা"),
      section("كل الإشعارات النشطة", "All active notifications", "সব সক্রিয় বিজ্ঞপ্তি"),
    ],
    actions: [
      action(
        t("تصفية وتحديث القائمة", "Filter and refresh the list", "তালিকা ফিল্টার ও রিফ্রেশ"),
        t("اعرض الكل أو غير المقروء أو الحرج أو التحذيرات؛ ويتم تحديث المركز دوريًا.", "Show all, unread, critical, or warning items; the center also refreshes periodically.", "সব, অপঠিত, জরুরি বা সতর্কতা দেখুন; কেন্দ্র নিয়মিত রিফ্রেশও হয়।"),
      ),
      action(
        t("فتح السجل المرتبط", "Open the linked record", "সংযুক্ত রেকর্ড খুলুন"),
        t("ينقلك الإشعار إلى الصفحة المرتبطة إذا كان السجل داخل نطاقك.", "The notification opens its linked page when the record is within your scope.", "রেকর্ড আপনার পরিধিতে থাকলে বিজ্ঞপ্তি সংযুক্ত পৃষ্ঠা খোলে।"),
      ),
      action(
        t("تعليم كمقروء أو إخفاء", "Mark read or dismiss", "পঠিত চিহ্নিত বা সরান"),
        t("نفّذ ذلك بعد فهم التنبيه ومتابعة السجل، ويمكن تعليم الكل كمقروء.", "Do this after understanding the alert and following up; all items can also be marked read.", "সতর্কতা বুঝে অনুসরণ করার পর করুন; সবকেও পঠিত হিসেবে চিহ্নিত করা যায়।"),
      ),
    ],
    steps: s(
      [
        "اختر «الحرج» أولًا ثم «غير المقروء»، وراجع المصدر والوقت ورسالة التنبيه.",
        "افتح السجل المرتبط واقرأ حالته وآخر تعديل؛ العنوان المختصر لا يعرض السياق كاملًا.",
        "نفّذ الإجراء داخل الصفحة الأصلية، أو أنشئ مهمة إذا كانت المتابعة تحتاج وقتًا.",
        "ارجع إلى المركز وعلّم الإشعار كمقروء أو أخفه بعد اكتمال المتابعة.",
      ],
      [
        "Select Critical first, then Unread, and review the source, time, and alert message.",
        "Open the linked record and read its status and latest change; the short title lacks full context.",
        "Act in the source page, or create a task when follow-up will take time.",
        "Return to the center and mark the item read or dismiss it after follow-up is complete.",
      ],
      [
        "প্রথমে জরুরি, তারপর অপঠিত বেছে উৎস, সময় ও সতর্কতার বার্তা দেখুন।",
        "সংযুক্ত রেকর্ড খুলে অবস্থা ও সর্বশেষ পরিবর্তন পড়ুন; ছোট শিরোনামে পুরো প্রসঙ্গ নেই।",
        "মূল পৃষ্ঠায় কাজ করুন, অথবা অনুসরণে সময় লাগলে একটি কাজ তৈরি করুন।",
        "অনুসরণ শেষ হলে কেন্দ্রে ফিরে পঠিত চিহ্নিত করুন বা সরিয়ে দিন।",
      ],
    ),
    caution: t(
      "تعليم الإشعار كمقروء لا يغير حالة المعاملة المرتبطة.",
      "Marking a notification read does not change the linked transaction's status.",
      "বিজ্ঞপ্তি পঠিত করলে সংযুক্ত লেনদেনের অবস্থা বদলায় না।",
    ),
  },
  {
    view: "tasks",
    title: t("المهام والتذكيرات", "Tasks and Reminders", "কাজ ও স্মরণিকা"),
    description: t(
      "مساحة للمهام الخاصة والمهام المرسلة إلى مستخدمين، مع الأولوية والموعد وحالة كل مستلم.",
      "A workspace for private tasks and tasks sent to users, with priority, due time, and recipient status.",
      "ব্যক্তিগত কাজ ও ব্যবহারকারীদের পাঠানো কাজের স্থান, যেখানে অগ্রাধিকার, সময় ও প্রাপকের অবস্থা থাকে।",
    ),
    sections: [
      section("مهمة جديدة", "New task", "নতুন কাজ"),
      section("مهامي الخاصة", "My private tasks", "আমার ব্যক্তিগত কাজ"),
      section("المهام المرسلة إلى مستخدمين", "Tasks sent to users", "ব্যবহারকারীদের পাঠানো কাজ"),
      section("الأولوية ووقت التنفيذ والتذكير", "Priority, execution time, and reminder", "অগ্রাধিকার, সময় ও স্মরণিকা"),
    ],
    actions: [
      action(
        t("إنشاء مهمة خاصة", "Create a private task", "ব্যক্তিগত কাজ তৈরি"),
        t("اترك قائمة المستلمين فارغة لتظهر المهمة لك وحدك.", "Leave recipients empty to keep the task private to you.", "কাজটি শুধু আপনার রাখতে প্রাপকের তালিকা খালি রাখুন।"),
      ),
      action(
        t("إرسال مهمة إلى مستخدمين", "Send a task to users", "ব্যবহারকারীদের কাজ পাঠান"),
        t("حدد المستلمين والأولوية ووقت التنفيذ، ثم تابع حالة كل مستلم.", "Select recipients, priority, and execution time, then follow each recipient's status.", "প্রাপক, অগ্রাধিকার ও সময় বেছে প্রতিটি প্রাপকের অবস্থা অনুসরণ করুন।"),
      ),
      action(
        t("إكمال المهمة", "Complete a task", "কাজ সম্পন্ন করুন"),
        t("ضع علامة الإكمال بعد تنفيذ المطلوب، ويظهر تذكير قبل الموعد بخمس دقائق.", "Mark complete only after the work is done; a reminder appears five minutes before due time.", "কাজ শেষ হলে সম্পন্ন চিহ্ন দিন; সময়ের পাঁচ মিনিট আগে স্মরণিকা আসে।"),
      ),
    ],
    steps: s(
      [
        "اكتب عنوانًا يصف النتيجة المطلوبة، ثم أضف التفاصيل ورقم السجل أو العقد في الوصف.",
        "حدد الأولوية ووقت التنفيذ بدقة؛ واترك المستلمين فارغين للمهمة الخاصة أو اختر الأشخاص المقصودين.",
        "راجع المهمة عند ظهور التذكير، وافتح السجل المرتبط ونفّذ العمل في صفحته الأصلية.",
        "بعد التحقق من النتيجة علّم المهمة مكتملة، وتابع حالات المستلمين في المهام المرسلة.",
      ],
      [
        "Write a title describing the required outcome, then add details and the record or contract number.",
        "Set priority and execution time; leave recipients empty for a private task or select the intended users.",
        "When reminded, open the linked record and perform the work in its source page.",
        "After verifying the result, mark the task complete and review recipient status for sent tasks.",
      ],
      [
        "প্রয়োজনীয় ফল বোঝায় এমন শিরোনাম লিখে বিবরণে রেকর্ড বা চুক্তি নম্বর দিন।",
        "অগ্রাধিকার ও সময় ঠিক করুন; ব্যক্তিগত কাজের জন্য প্রাপক খালি রাখুন বা নির্দিষ্ট ব্যবহারকারী বাছুন।",
        "স্মরণিকা এলে সংযুক্ত রেকর্ড খুলে মূল পৃষ্ঠায় কাজ করুন।",
        "ফল যাচাই করে কাজ সম্পন্ন চিহ্নিত করুন এবং পাঠানো কাজের প্রাপকের অবস্থা দেখুন।",
      ],
    ),
    caution: t(
      "إكمال المهمة لا يعتمد السجل المرتبط ولا يغير حالته تلقائيًا.",
      "Completing a task does not approve or automatically change its linked record.",
      "কাজ সম্পন্ন করলে সংযুক্ত রেকর্ড অনুমোদিত বা স্বয়ংক্রিয়ভাবে পরিবর্তিত হয় না।",
    ),
  },
  {
    view: "conversations",
    title: t("المحادثات المباشرة", "Live Conversations", "সরাসরি কথোপকথন"),
    description: t(
      "طابور رسائل زوار الموقع مع المحادثة الكاملة وحالة الانتظار والرسائل غير المقروءة وتقييم الخدمة.",
      "The website visitor message queue with full threads, waiting status, unread messages, and service ratings.",
      "ওয়েবসাইট দর্শকের বার্তা সারি, সম্পূর্ণ কথোপকথন, অপেক্ষার অবস্থা, অপঠিত বার্তা ও সেবা মূল্যায়ন।",
    ),
    sections: [
      section("قائمة الانتظار وغير المقروء", "Waiting and unread queue", "অপেক্ষমাণ ও অপঠিত সারি"),
      section("سجل المحادثة الكامل", "Full conversation thread", "সম্পূর্ণ কথোপকথন"),
      section("حالة المحادثة والرد", "Conversation status and reply", "কথোপকথনের অবস্থা ও উত্তর"),
      section("تقييمات الخدمة", "Service ratings", "সেবা মূল্যায়ন"),
      section("ساعات العمل والرد الآلي للإدارة", "Business hours and administrator automation", "কাজের সময় ও প্রশাসনিক স্বয়ংক্রিয় উত্তর"),
    ],
    actions: [
      action(
        t("قراءة المحادثة", "Read a conversation", "কথোপকথন পড়ুন"),
        t("راجع كل الرسائل والصفحة التي بدأ منها الزائر ووسيلة التواصل.", "Review all messages, the originating page, and contact method.", "সব বার্তা, শুরুর পৃষ্ঠা ও যোগাযোগের মাধ্যম দেখুন।"),
        { anyOf: ["conversations.read", "conversations.write"] },
      ),
      action(
        t("الرد وتغيير الحالة", "Reply and change status", "উত্তর ও অবস্থা পরিবর্তন"),
        t("أرسل الرد ثم حدّث الحالة إلى انتظار أو مفتوحة أو مغلقة حسب النتيجة.", "Send the reply, then set waiting, open, or closed according to the outcome.", "উত্তর পাঠিয়ে ফল অনুযায়ী অপেক্ষমাণ, খোলা বা বন্ধ অবস্থা দিন।"),
        { allOf: ["conversations.write"] },
      ),
      action(
        t("تعديل ساعات العمل والرد الآلي", "Edit business hours and automation", "কাজের সময় ও স্বয়ংক্রিয় উত্তর সম্পাদনা"),
        t("إدارة أيام وساعات العمل والرسائل التلقائية وقواعد الكلمات المفتاحية.", "Manage working days, hours, automatic messages, and keyword rules.", "কাজের দিন, সময়, স্বয়ংক্রিয় বার্তা ও কীওয়ার্ড নিয়ম পরিচালনা।"),
        { rootOnly: true },
      ),
    ],
    steps: s(
      [
        "ابدأ بالمنتظر وغير المقروء، وتحقق من اسم الزائر ووقت آخر رسالة والصفحة التي بدأ منها.",
        "اقرأ المحادثة كاملة حتى لا تطلب بيانات سبق تقديمها، وحدد المطلوب والجهة المسؤولة.",
        "إذا كانت الكتابة متاحة لك، أرسل ردًا واضحًا ثم غيّر الحالة بما يعكس المتابعة الفعلية.",
        "عند الحل لخّص النتيجة وأغلق المحادثة، ثم راجع التقييم وأي متابعة ناتجة.",
      ],
      [
        "Start with waiting and unread items; verify the visitor, last-message time, and originating page.",
        "Read the whole thread to avoid asking for supplied information, then identify the request and owner.",
        "If write access is available, send a clear reply and set a status that reflects actual follow-up.",
        "When resolved, summarize the outcome, close the conversation, and review its rating and follow-up.",
      ],
      [
        "অপেক্ষমাণ ও অপঠিত দিয়ে শুরু করে দর্শক, সর্বশেষ বার্তার সময় ও শুরুর পৃষ্ঠা যাচাই করুন।",
        "আগে দেওয়া তথ্য আবার না চাইতে পুরো কথোপকথন পড়ে অনুরোধ ও দায়িত্বশীল বিভাগ চিহ্নিত করুন।",
        "write অনুমতি থাকলে স্পষ্ট উত্তর দিয়ে বাস্তব অনুসরণ অনুযায়ী অবস্থা দিন।",
        "সমাধান হলে ফল লিখে কথোপকথন বন্ধ করুন, তারপর মূল্যায়ন ও পরবর্তী কাজ দেখুন।",
      ],
    ),
    caution: t(
      "لا تسجل كلمات مرور أو هويات أو بيانات دفع حساسة داخل نص المحادثة.",
      "Never place passwords, identity secrets, or sensitive payment data in the conversation.",
      "কথোপকথনে পাসওয়ার্ড, গোপন পরিচয় তথ্য বা সংবেদনশীল পরিশোধ তথ্য লিখবেন না।",
    ),
  },
  {
    view: "employees",
    title: t("إدارة الموظفين", "Employee Management", "কর্মচারী ব্যবস্থাপনা"),
    description: t(
      "السجل الموحد للموظفين والربط بحساب النظام والمستندات والدوام والإجازات والحركات والأداء ومسيرات الرواتب.",
      "The unified employee register with portal-account linkage, documents, attendance, leave, movements, performance, and payroll.",
      "পোর্টাল অ্যাকাউন্ট সংযোগ, নথি, উপস্থিতি, ছুটি, পরিবর্তন, কর্মদক্ষতা ও বেতনসহ একীভূত কর্মচারী রেজিস্টার।",
    ),
    sections: [
      section("بطاقات إجمالي الموظفين والحاليين والإجازات والمنتهين", "Total, current, leave, and ended employee metrics", "মোট, বর্তমান, ছুটি ও সমাপ্ত কর্মচারীর সূচক"),
      section("دليل الموظفين والبحث والربط بحساب النظام", "Employee directory, search, and portal-account link", "কর্মচারী তালিকা, অনুসন্ধান ও পোর্টাল অ্যাকাউন্ট সংযোগ"),
      section("البيانات البنكية ومستندات التوظيف", "Bank details and employment documents", "ব্যাংক তথ্য ও চাকরির নথি"),
      section("الدوام والإجازات والموافقات", "Attendance, leave, and approvals", "উপস্থিতি, ছুটি ও অনুমোদন"),
      section("الحركات التنظيمية والمالية والأداء", "Organizational and financial movements and performance", "সাংগঠনিক ও আর্থিক পরিবর্তন এবং কর্মদক্ষতা"),
      section("مسودات الرواتب والاعتماد وملف حماية الأجور", "Payroll drafts, approval, and wage-protection file", "বেতন খসড়া, অনুমোদন ও মজুরি সুরক্ষা ফাইল"),
    ],
    actions: [
      action(
        t("البحث وفتح ملف موظف", "Search and open an employee file", "কর্মচারী ফাইল খুঁজে খুলুন"),
        t("ابحث بالاسم أو الرقم ثم راجع الهوية والوظيفة والحالة والحساب المرتبط.", "Search by name or number, then review identity, job, status, and linked account.", "নাম বা নম্বর দিয়ে খুঁজে পরিচয়, পদ, অবস্থা ও সংযুক্ত অ্যাকাউন্ট দেখুন।"),
        { allOf: ["employees.read"] },
      ),
      action(
        t("إضافة أو تعديل بيانات الموظف", "Add or edit employee data", "কর্মচারীর তথ্য যোগ বা সম্পাদনা"),
        t("حدّث البيانات الوظيفية والبنكية والمستندات والحضور والإجازات من الأقسام المخصصة.", "Update job, bank, document, attendance, and leave data in their dedicated sections.", "নির্ধারিত অংশে চাকরি, ব্যাংক, নথি, উপস্থিতি ও ছুটির তথ্য হালনাগাদ করুন।"),
        { allOf: ["employees.write"] },
      ),
      action(
        t("اعتماد إجراء أو أرشفة ملف", "Approve an action or archive a file", "কার্যক্রম অনুমোদন বা ফাইল আর্কাইভ"),
        t("راجع السبب والتاريخ والأثر قبل اعتماد الإجازة أو الحركة أو إنهاء الملف.", "Review reason, date, and impact before approving leave, a movement, or ending a file.", "ছুটি, পরিবর্তন বা ফাইল সমাপ্তির আগে কারণ, তারিখ ও প্রভাব দেখুন।"),
        { allOf: ["employees.approve"] },
      ),
    ],
    steps: s(
      [
        "ابحث بالرقم الوظيفي أو الاسم، وافتح الملف الصحيح بعد مطابقة الهوية والمسمى والقسم.",
        "راجع البيانات الأساسية والحساب المرتبط والمعلومات البنكية وتواريخ المستندات قبل التعديل.",
        "سجل الحضور أو الإجازة أو الحركة في القسم المخصص وأرفق المستند الداعم؛ لا تستخدم الملاحظات بديلًا.",
        "أرسل الإجراء للاعتماد عند الحاجة، ثم تحقق من الحالة الجديدة وأثرها في الملف أو مسير الرواتب.",
        "عند انتهاء العلاقة لا تحذف الموظف؛ استخدم الإنهاء أو الأرشفة المصرح بها للمحافظة على السجل.",
      ],
      [
        "Search by employee number or name and open the correct file after matching identity, title, and department.",
        "Review core data, linked account, bank information, and document dates before editing.",
        "Record attendance, leave, or a movement in its dedicated section and attach evidence; notes are not a substitute.",
        "Submit for approval when required, then verify the new status and its effect on the file or payroll.",
        "When employment ends, do not delete the employee; use the authorized end or archive action to preserve history.",
      ],
      [
        "কর্মচারী নম্বর বা নাম দিয়ে খুঁজে পরিচয়, পদ ও বিভাগ মিলিয়ে সঠিক ফাইল খুলুন।",
        "সম্পাদনার আগে মূল তথ্য, সংযুক্ত অ্যাকাউন্ট, ব্যাংক তথ্য ও নথির তারিখ দেখুন।",
        "নির্ধারিত অংশে উপস্থিতি, ছুটি বা পরিবর্তন লিখে প্রমাণ যুক্ত করুন; নোট বিকল্প নয়।",
        "প্রয়োজন হলে অনুমোদনে পাঠিয়ে নতুন অবস্থা এবং ফাইল বা বেতনে প্রভাব যাচাই করুন।",
        "চাকরি শেষ হলে কর্মচারী মুছবেন না; ইতিহাস রাখতে অনুমোদিত সমাপ্তি বা আর্কাইভ ব্যবহার করুন।",
      ],
    ),
    caution: t(
      "ربط الموظف بحساب النظام لا يمنحه صلاحيات تلقائيًا؛ الصلاحيات تأتي من الدور المسند.",
      "Linking an employee to a portal account does not grant permissions automatically; permissions come from assigned roles.",
      "কর্মচারীকে পোর্টাল অ্যাকাউন্টে যুক্ত করলে স্বয়ংক্রিয় অনুমতি দেয় না; অনুমতি অর্পিত ভূমিকা থেকে আসে।",
    ),
  },
  {
    view: "finance",
    title: t("الإدارة المالية", "Finance", "অর্থ বিভাগ"),
    description: t(
      "دورة مالية متكاملة من الاستحقاق والفاتورة والسداد إلى القيود والمشتريات والتقارير والتسوية البنكية.",
      "An end-to-end finance cycle from dues, invoices, and payments to entries, purchasing, reports, and bank reconciliation.",
      "বকেয়া, চালান ও পরিশোধ থেকে এন্ট্রি, ক্রয়, প্রতিবেদন ও ব্যাংক সমন্বয় পর্যন্ত পূর্ণ আর্থিক চক্র।",
    ),
    sections: [
      section("إدارة دفعات العقود والفواتير والتحصيل", "Contract installments, invoices, and collection", "চুক্তির কিস্তি, চালান ও আদায়"),
      section("الحركات المالية وإصدار المستندات", "Finance movements and document issuance", "আর্থিক লেনদেন ও নথি প্রকাশ"),
      section("دليل الحسابات والبنوك والقيود اليومية", "Chart of accounts, banks, and journal entries", "হিসাব তালিকা, ব্যাংক ও জার্নাল এন্ট্রি"),
      section("الترحيل المالي", "Financial posting", "আর্থিক পোস্টিং"),
      section("الموردون والمشتريات ومصروفات الموظفين", "Suppliers, purchasing, and employee expenses", "সরবরাহকারী, ক্রয় ও কর্মচারী ব্যয়"),
      section("التقارير المالية وربحية العقود", "Financial reports and contract profitability", "আর্থিক প্রতিবেদন ও চুক্তির লাভজনকতা"),
      section("التسوية البنكية", "Bank reconciliation", "ব্যাংক সমন্বয়"),
    ],
    actions: [
      action(
        t("إنشاء حركة أو مستند مالي", "Create a finance record or document", "আর্থিক রেকর্ড বা নথি তৈরি"),
        t("أنشئ الاستحقاق أو الفاتورة أو السند أو المصروف واربطه بالعقد والطرف الصحيح.", "Create a due, invoice, voucher, or expense and link the correct contract and party.", "বকেয়া, চালান, ভাউচার বা ব্যয় তৈরি করে সঠিক চুক্তি ও পক্ষ যুক্ত করুন।"),
        { allOf: ["finance.write"] },
      ),
      action(
        t("اعتماد معاملة مالية", "Approve a finance transaction", "আর্থিক লেনদেন অনুমোদন"),
        t("راجع المبلغ والضريبة والمرفق والحساب والطرف قبل اتخاذ قرار الاعتماد.", "Verify amount, tax, attachment, account, and party before approval.", "অনুমোদনের আগে অর্থ, কর, সংযুক্তি, হিসাব ও পক্ষ যাচাই করুন।"),
        { allOf: ["finance.approve"] },
      ),
      action(
        t("ترحيل قيد محاسبي", "Post an accounting entry", "হিসাব এন্ট্রি পোস্ট"),
        t("الترحيل يجعل القيد يؤثر في الأرصدة والتقارير؛ المسودة لا تفعل ذلك.", "Posting makes an entry affect balances and reports; a draft does not.", "পোস্টিং করলে এন্ট্রি ব্যালেন্স ও প্রতিবেদনে প্রভাব ফেলে; খসড়া ফেলে না।"),
        { allOf: ["finance.post"] },
      ),
      action(
        t("تنفيذ دفعة", "Release a payment", "পরিশোধ কার্যকর"),
        t("نفّذ الدفع من الطلب المعتمد وبعد اختيار البنك والتحقق من عدم السداد السابق.", "Pay only from an approved request after selecting the bank and checking it was not already paid.", "অনুমোদিত অনুরোধ থেকে ব্যাংক বেছে আগে পরিশোধ হয়নি যাচাই করে পরিশোধ করুন।"),
        { allOf: ["finance.pay"] },
      ),
      action(
        t("تصدير تقرير PDF", "Export a PDF report", "PDF প্রতিবেদন রপ্তানি"),
        t("نزّل التقرير بعد تحديد الفترة والتحقق من أن القيود المطلوبة مرحّلة.", "Download after choosing the period and confirming required entries are posted.", "সময়কাল বেছে প্রয়োজনীয় এন্ট্রি পোস্ট হয়েছে নিশ্চিত করে ডাউনলোড করুন।"),
        { allOf: ["reports.export"] },
      ),
    ],
    steps: s(
      [
        "ابدأ من العقد أو الطرف الصحيح، وحدد نوع الحركة والمبلغ والضريبة وتاريخ الاستحقاق والمرجع.",
        "أرفق الفاتورة أو السند، واحفظ المسودة ثم راجع الإجمالي والحساب المدين والدائن.",
        "أرسل للاعتماد؛ وبعده ينفذ المستخدم المخول الترحيل أو الدفع من الزر المخصص، لا من الملاحظات.",
        "راجع سجل القيد وحالة الدفع والبنك والمرجع، ثم تحقق من ظهور الأثر في التقرير المناسب.",
        "في التسوية البنكية طابق كل حركة بكشف البنك ولا تنشئ قيدًا مكررًا لمعالجة فرق لم يُفهم سببه.",
      ],
      [
        "Start from the correct contract or party and set transaction type, amount, tax, due date, and reference.",
        "Attach the invoice or voucher, save a draft, then verify the total and debit and credit accounts.",
        "Submit for approval; afterward an authorized user posts or pays through the dedicated action, not a note.",
        "Review entry, payment status, bank, and reference, then confirm the effect in the relevant report.",
        "During bank reconciliation, match each movement to the statement and never duplicate an entry for an unexplained difference.",
      ],
      [
        "সঠিক চুক্তি বা পক্ষ থেকে শুরু করে লেনদেনের ধরন, অর্থ, কর, সময়সীমা ও রেফারেন্স দিন।",
        "চালান বা ভাউচার যুক্ত করে খসড়া সংরক্ষণ করুন, তারপর মোট ও debit-credit হিসাব যাচাই করুন।",
        "অনুমোদনে পাঠান; এরপর অনুমোদিত ব্যবহারকারী নোট নয়, নির্ধারিত কাজ দিয়ে পোস্ট বা পরিশোধ করবেন।",
        "এন্ট্রি, পরিশোধের অবস্থা, ব্যাংক ও রেফারেন্স দেখে সংশ্লিষ্ট প্রতিবেদনে প্রভাব নিশ্চিত করুন।",
        "ব্যাংক সমন্বয়ে প্রতিটি লেনদেন বিবৃতির সঙ্গে মিলিয়ে অজানা পার্থক্যের জন্য দ্বৈত এন্ট্রি করবেন না।",
      ],
    ),
    caution: t(
      "التقارير تعتمد القيود المرحّلة فقط؛ وجود المسودة أو الاعتماد وحده لا يعني انعكاسها في الأرصدة.",
      "Reports use posted entries only; a draft or approval alone does not affect balances.",
      "প্রতিবেদনে শুধু পোস্ট করা এন্ট্রি থাকে; খসড়া বা শুধু অনুমোদন ব্যালেন্সে প্রভাব ফেলে না।",
    ),
  },
  {
    view: "legal",
    title: t("الشؤون القانونية", "Legal Affairs", "আইনি বিষয়"),
    description: t(
      "إدارة السجلات والقضايا والمواعيد والمذكرات والأدلة والتسويات والأحكام والالتزامات النظامية.",
      "Manage legal records, cases, deadlines, memos, evidence, settlements, judgments, and compliance obligations.",
      "আইনি রেকর্ড, মামলা, সময়সীমা, স্মারক, প্রমাণ, সমঝোতা, রায় ও সম্মতি দায় পরিচালনা।",
    ),
    sections: [
      section("السجلات القانونية والعقود والتراخيص", "Legal records, contracts, and licenses", "আইনি রেকর্ড, চুক্তি ও লাইসেন্স"),
      section("القضايا المقامة على الشركة", "Cases against the company", "কোম্পানির বিরুদ্ধে মামলা"),
      section("الجلسات والمواعيد النهائية", "Hearings and deadlines", "শুনানি ও সময়সীমা"),
      section("المذكرات والإصدارات والأدلة والمرفقات", "Memos, versions, evidence, and attachments", "স্মারক, সংস্করণ, প্রমাণ ও সংযুক্তি"),
      section("التسويات والأحكام وطلبات السداد", "Settlements, judgments, and payment requests", "সমঝোতা, রায় ও পরিশোধ অনুরোধ"),
      section("المشاركة الآمنة مع المحامي الخارجي", "Secure external-lawyer sharing", "বাহ্যিক আইনজীবীর সঙ্গে নিরাপদ শেয়ার"),
      section("الالتزامات والتراخيص ومخاطر الانتهاء", "Obligations, licenses, and expiry risks", "দায়, লাইসেন্স ও মেয়াদ ঝুঁকি"),
    ],
    actions: [
      action(
        t("عرض الملف القانوني", "View a legal file", "আইনি ফাইল দেখুন"),
        t("راجع الطرف والمرجع والحالة والموعد والمستندات المرتبطة.", "Review party, reference, status, deadline, and linked documents.", "পক্ষ, রেফারেন্স, অবস্থা, সময়সীমা ও সংযুক্ত নথি দেখুন।"),
        { allOf: ["legal.read"] },
      ),
      action(
        t("إضافة قضية أو تحديث تفاصيلها", "Add a case or update its details", "মামলা যোগ বা বিস্তারিত হালনাগাদ"),
        t("يشمل بيانات القضية والجلسات والمذكرات والأدلة، وهو مقيد بالأدوار القانونية المخولة.", "Covers case details, hearings, memos, and evidence and is limited to authorized legal roles.", "মামলার তথ্য, শুনানি, স্মারক ও প্রমাণ অন্তর্ভুক্ত এবং অনুমোদিত আইনি ভূমিকায় সীমাবদ্ধ।"),
        { allOf: ["legal.write"], rolesAny: ["system_owner", "system_admin", "legal_supervisor", "lawyer"] },
      ),
      action(
        t("تحديث التزام أو ترخيص", "Update an obligation or license", "দায় বা লাইসেন্স হালনাগাদ"),
        t("حدّث المالك والتاريخ والحالة ومستوى المخاطر واربط مستند التجديد.", "Update owner, date, status, risk level, and attach renewal evidence.", "দায়িত্বশীল ব্যক্তি, তারিখ, অবস্থা ও ঝুঁকি হালনাগাদ করে নবায়ন প্রমাণ যুক্ত করুন।"),
        { allOf: ["legal.write"] },
      ),
      action(
        t("اعتماد قرار قانوني", "Approve a legal decision", "আইনি সিদ্ধান্ত অনুমোদন"),
        t("سجل القرار من الإجراء الرسمي بعد مراجعة الملف والأثر المالي.", "Record the decision through the official action after reviewing the file and financial impact.", "ফাইল ও আর্থিক প্রভাব দেখে আনুষ্ঠানিক কাজ দিয়ে সিদ্ধান্ত নথিভুক্ত করুন।"),
        { allOf: ["legal.approve"] },
      ),
    ],
    steps: s(
      [
        "افتح الملف من مرجعه، وراجع الطرف ونوع القضية والحالة والمحامي المسند والموعد الأقرب.",
        "أضف الجلسة أو المذكرة أو الدليل في قسمه الصحيح مع التاريخ والإصدار والمرفق.",
        "عند التسوية أو الحكم سجّل المبلغ والالتزام والمهلة، وأرسل طلب السداد للجهة المخولة عند الحاجة.",
        "شارك المحامي الخارجي من رابط آمن مخصص وتابع سجل الوصول، ولا ترسل ملف القضية كاملًا بوسيلة غير معتمدة.",
        "بعد كل حدث حدّث الحالة والمهمة التالية وتأكد من ظهور التنبيه قبل الموعد.",
      ],
      [
        "Open the file by reference and review party, case type, status, assigned lawyer, and nearest deadline.",
        "Add each hearing, memo, or item of evidence in its proper section with date, version, and attachment.",
        "For a settlement or judgment, record amount, obligation, and deadline and send any payment request to the authorized team.",
        "Share with external counsel using the dedicated secure link and review access history; do not send the whole case through an unapproved channel.",
        "After each event, update status and next task and confirm an alert is scheduled before the deadline.",
      ],
      [
        "রেফারেন্স দিয়ে ফাইল খুলে পক্ষ, মামলার ধরন, অবস্থা, নিযুক্ত আইনজীবী ও নিকটতম সময়সীমা দেখুন।",
        "প্রতিটি শুনানি, স্মারক বা প্রমাণ সঠিক অংশে তারিখ, সংস্করণ ও সংযুক্তিসহ যোগ করুন।",
        "সমঝোতা বা রায়ে অর্থ, দায় ও সময়সীমা লিখে প্রয়োজনে অনুমোদিত বিভাগে পরিশোধ অনুরোধ পাঠান।",
        "নির্ধারিত নিরাপদ লিংকে বাহ্যিক আইনজীবীর সঙ্গে শেয়ার করে প্রবেশ ইতিহাস দেখুন; অননুমোদিত মাধ্যমে পুরো মামলা পাঠাবেন না।",
        "প্রতিটি ঘটনার পর অবস্থা ও পরবর্তী কাজ হালনাগাদ করে সময়সীমার আগে সতর্কতা আছে কি না দেখুন।",
      ],
    ),
    caution: t(
      "صلاحية الكتابة العامة لا تكفي وحدها لإدارة القضايا؛ يجب أن يكون الدور القانوني من الأدوار المخولة.",
      "General legal write permission alone is not enough to manage cases; an authorized legal role is also required.",
      "শুধু সাধারণ legal write অনুমতি মামলা পরিচালনার জন্য যথেষ্ট নয়; অনুমোদিত আইনি ভূমিকাও দরকার।",
    ),
  },
  {
    view: "government",
    title: t("العلاقات الحكومية", "Government Relations", "সরকারি সম্পর্ক"),
    description: t(
      "متابعة انتهاء الوثائق النظامية والمنصات الحكومية والتجديدات وطلبات السداد المرتبطة بها.",
      "Track statutory document expiries, government platforms, renewals, and related payment requests.",
      "আইনগত নথির মেয়াদ, সরকারি প্ল্যাটফর্ম, নবায়ন ও সংশ্লিষ্ট পরিশোধ অনুরোধ অনুসরণ।",
    ),
    sections: [
      section("التنبيهات النظامية العاجلة للموظفين", "Urgent employee statutory alerts", "কর্মচারীর জরুরি আইনগত সতর্কতা"),
      section("التراخيص والالتزامات العامة", "General licenses and obligations", "সাধারণ লাইসেন্স ও দায়"),
      section("المنصات الحكومية وبيانات الوصول", "Government platforms and access details", "সরকারি প্ল্যাটফর্ম ও প্রবেশ তথ্য"),
      section("التجديد وطلب السداد", "Renewal and payment request", "নবায়ন ও পরিশোধ অনুরোধ"),
      section("تأكيد المالك والدفع البنكي والقيد", "Owner confirmation, bank payment, and entry", "মালিকের নিশ্চিতকরণ, ব্যাংক পরিশোধ ও এন্ট্রি"),
    ],
    actions: [
      action(
        t("مراجعة تنبيهات الانتهاء", "Review expiry alerts", "মেয়াদ সতর্কতা দেখুন"),
        t("ابدأ بالأقرب انتهاءً وحدد الموظف أو الترخيص والجهة المسؤولة.", "Start with the nearest expiry and identify the employee or license and responsible authority.", "নিকটতম মেয়াদ দিয়ে শুরু করে কর্মচারী বা লাইসেন্স ও দায়িত্বশীল কর্তৃপক্ষ শনাক্ত করুন।"),
        { allOf: ["government.read"] },
      ),
      action(
        t("إضافة منصة أو تحديث تجديد", "Add a platform or update a renewal", "প্ল্যাটফর্ম যোগ বা নবায়ন হালনাগাদ"),
        t("حدّث الرابط والمالك وبيانات الوصول وتاريخ الانتهاء والمستند الداعم.", "Update URL, owner, access details, expiry date, and supporting document.", "URL, দায়িত্বশীল ব্যক্তি, প্রবেশ তথ্য, মেয়াদ ও সহায়ক নথি হালনাগাদ করুন।"),
        { allOf: ["government.write"] },
      ),
      action(
        t("إنشاء طلب سداد حكومي", "Create a government payment request", "সরকারি পরিশোধ অনুরোধ তৈরি"),
        t("أدخل الجهة والغرض والمبلغ والمرجع وأرسل الطلب للمالك.", "Enter authority, purpose, amount, and reference, then send the request to the owner.", "কর্তৃপক্ষ, উদ্দেশ্য, অর্থ ও রেফারেন্স দিয়ে মালিকের কাছে পাঠান।"),
        { allOf: ["government.write"] },
      ),
      action(
        t("تأكيد السداد واختيار البنك", "Confirm payment and select a bank", "পরিশোধ নিশ্চিত ও ব্যাংক নির্বাচন"),
        t("يؤكد المالك أو مسؤول النظام السداد ليُسجل القيد المستقل.", "The system owner or administrator confirms payment so its independent entry is recorded.", "সিস্টেম মালিক বা প্রশাসক পরিশোধ নিশ্চিত করলে স্বতন্ত্র এন্ট্রি নথিভুক্ত হয়।"),
        { rootOnly: true },
      ),
    ],
    steps: s(
      [
        "رتب التنبيهات حسب أقرب تاريخ، وافتح الموظف أو الترخيص للتأكد من الرقم والجهة والحالة.",
        "افتح المنصة الحكومية من الرابط المسجل، واكشف بيانات الوصول مؤقتًا فقط عند الحاجة ثم أغلقها.",
        "سجل نتيجة التجديد وارفع الإثبات، أو أنشئ طلب سداد بالمبلغ والمرجع الصحيحين.",
        "بعد تأكيد المالك راجع البنك والقيد الناتج، ثم حدّث تاريخ الانتهاء والحالة وأغلق التنبيه.",
      ],
      [
        "Sort alerts by nearest date and open the employee or license to verify number, authority, and status.",
        "Open the government platform from its saved URL and reveal access details only temporarily when needed.",
        "Record the renewal and upload evidence, or create a payment request with the correct amount and reference.",
        "After owner confirmation, review the bank and resulting entry, update expiry and status, and close the alert.",
      ],
      [
        "নিকটতম তারিখ অনুযায়ী সতর্কতা সাজিয়ে কর্মচারী বা লাইসেন্স খুলে নম্বর, কর্তৃপক্ষ ও অবস্থা যাচাই করুন।",
        "সংরক্ষিত URL থেকে সরকারি প্ল্যাটফর্ম খুলে প্রয়োজন হলে প্রবেশ তথ্য সাময়িক দেখুন।",
        "নবায়নের ফল ও প্রমাণ যোগ করুন, অথবা সঠিক অর্থ ও রেফারেন্সে পরিশোধ অনুরোধ তৈরি করুন।",
        "মালিক নিশ্চিত করার পর ব্যাংক ও তৈরি এন্ট্রি দেখে মেয়াদ ও অবস্থা হালনাগাদ করে সতর্কতা বন্ধ করুন।",
      ],
    ),
    caution: t(
      "لا تنسخ بيانات الدخول إلى الملاحظات أو المحادثات، ولا تعتبر إنشاء طلب السداد دفعًا فعليًا.",
      "Never copy access secrets into notes or chats, and do not treat creating a payment request as actual payment.",
      "প্রবেশের গোপন তথ্য নোট বা চ্যাটে কপি করবেন না, এবং অনুরোধ তৈরি করাকে পরিশোধ মনে করবেন না।",
    ),
  },
  {
    view: "workforce",
    title: t("شؤون العمالة", "Workforce Affairs", "শ্রমিক বিষয়"),
    description: t(
      "ملفات العمال وجاهزيتهم وتوزيعهم على الجهات والعقود ومرفقاتهم وطلبات القوى العاملة الواردة من الموقع.",
      "Worker files, readiness, allocation to clients and contracts, attachments, and workforce requests from the website.",
      "শ্রমিক ফাইল, প্রস্তুতি, গ্রাহক ও চুক্তিতে বণ্টন, সংযুক্তি এবং ওয়েবসাইটের শ্রমিক অনুরোধ।",
    ),
    sections: [
      section("مؤشرات الإجمالي والمتاح والموزع ونقص الملفات", "Total, available, assigned, and incomplete-file metrics", "মোট, উপলভ্য, নিযুক্ত ও অসম্পূর্ণ ফাইলের সূচক"),
      section("التوزيع الحالي حسب الجهة المستفيدة", "Current allocation by beneficiary", "উপকারভোগী অনুযায়ী বর্তমান বণ্টন"),
      section("الجاهزية حسب المهنة", "Readiness by profession", "পেশা অনুযায়ী প্রস্তুতি"),
      section("ملف العامل والإقامة والصورة والمرفقات", "Worker file, iqama, photo, and attachments", "শ্রমিক ফাইল, ইকামা, ছবি ও সংযুক্তি"),
      section("عقود العمالة والتغطية", "Workforce contracts and coverage", "শ্রমিক চুক্তি ও কভারেজ"),
      section("طلبات القوى العاملة من الموقع", "Website workforce requests", "ওয়েবসাইটের শ্রমিক অনুরোধ"),
    ],
    actions: [
      action(
        t("فتح ملف عامل ومراجعة الجاهزية", "Open a worker file and review readiness", "শ্রমিক ফাইল ও প্রস্তুতি দেখুন"),
        t("تحقق من الهوية والمهنة والحالة والجهة ونواقص الملف وتواريخ الانتهاء.", "Check identity, profession, status, beneficiary, missing items, and expiries.", "পরিচয়, পেশা, অবস্থা, উপকারভোগী, ঘাটতি ও মেয়াদ দেখুন।"),
        { allOf: ["workforce.read"] },
      ),
      action(
        t("إضافة أو تعديل عامل ومرفقاته", "Add or edit a worker and attachments", "শ্রমিক ও সংযুক্তি যোগ বা সম্পাদনা"),
        t("حدّث الملف وارفع كل وثيقة في نوعها الصحيح مع تاريخ الانتهاء.", "Update the file and upload each document under the correct type with its expiry.", "ফাইল হালনাগাদ করে প্রতিটি নথি সঠিক ধরন ও মেয়াদসহ আপলোড করুন।"),
        { allOf: ["workforce.write"] },
      ),
      action(
        t("إسناد أو تحرير عامل من عقد", "Assign or release a worker from a contract", "চুক্তিতে শ্রমিক নিয়োগ বা মুক্ত"),
        t("نفّذ الإسناد من العقد الصحيح بعد مطابقة المهنة والفترة والجاهزية.", "Assign from the correct contract after matching profession, period, and readiness.", "পেশা, সময়কাল ও প্রস্তুতি মিলিয়ে সঠিক চুক্তি থেকে নিয়োগ করুন।"),
        { allOf: ["workforce.write"] },
      ),
      action(
        t("اعتماد تشغيل أو ساعات", "Approve operations or hours", "কার্যক্রম বা ঘণ্টা অনুমোদন"),
        t("راجع العقد والحضور والفترة قبل اعتماد التشغيل أو الساعات.", "Review contract, attendance, and period before approval.", "অনুমোদনের আগে চুক্তি, উপস্থিতি ও সময়কাল দেখুন।"),
        { allOf: ["workforce.approve"] },
      ),
    ],
    steps: s(
      [
        "ابحث برقم الإقامة أو الاسم أو المهنة، وطابق العامل والصورة والحالة قبل فتح الملف.",
        "راجع نواقص الملف والتنبيهات، وارفع الوثيقة في نوعها الصحيح وحدد تاريخ الانتهاء الحقيقي.",
        "قبل الإسناد تحقق من أن العامل متاح ومهنته مطابقة وأن العقد يحتاج العدد خلال الفترة المحددة.",
        "نفّذ الإسناد أو التحرير من العقد، ثم راجع الجهة المستفيدة والتغطية والعدد المتبقي.",
        "عالج طلبات الموقع بتحديث حالتها وربطها بالسجل أو العقد الناتج بدل تركها في حالة جديدة.",
      ],
      [
        "Search by iqama, name, or profession and match worker, photo, and status before opening the file.",
        "Review missing items and alerts, upload each document under the correct type, and set its real expiry.",
        "Before assignment, confirm the worker is available, profession matches, and the contract needs the worker in that period.",
        "Assign or release from the contract, then verify beneficiary, coverage, and remaining requirement.",
        "Process website requests by updating status and linking the resulting record or contract instead of leaving them new.",
      ],
      [
        "ইকামা, নাম বা পেশা দিয়ে খুঁজে ফাইল খোলার আগে শ্রমিক, ছবি ও অবস্থা মিলিয়ে নিন।",
        "ঘাটতি ও সতর্কতা দেখে সঠিক ধরনের অধীনে নথি আপলোড করে প্রকৃত মেয়াদ দিন।",
        "নিয়োগের আগে শ্রমিক উপলভ্য, পেশা মেলে এবং ওই সময়ে চুক্তিতে প্রয়োজন আছে নিশ্চিত করুন।",
        "চুক্তি থেকে নিয়োগ বা মুক্ত করে উপকারভোগী, কভারেজ ও অবশিষ্ট চাহিদা দেখুন।",
        "ওয়েবসাইটের অনুরোধের অবস্থা বদলে তৈরি রেকর্ড বা চুক্তি যুক্ত করুন; নতুন অবস্থায় ফেলে রাখবেন না।",
      ],
    ),
    caution: t(
      "وجود العامل في النظام لا يعني جاهزيته؛ تحقق من الحالة ونواقص الملف وتواريخ الوثائق قبل الإسناد.",
      "A worker existing in the system does not mean readiness; check status, missing items, and document dates before assignment.",
      "সিস্টেমে শ্রমিক থাকা মানেই প্রস্তুত নয়; নিয়োগের আগে অবস্থা, ঘাটতি ও নথির তারিখ দেখুন।",
    ),
  },
  {
    view: "operations",
    title: t("المبيعات والتشغيل", "Sales and Operations", "বিক্রয় ও কার্যক্রম"),
    description: t(
      "مساحة متعددة التبويبات؛ يعرض حسابك فقط تبويبات العملاء والتشغيل والخصوصية والبوابات والتكاملات المسموح بها.",
      "A multi-tab workspace; your account only receives allowed customer, operations, privacy, portal, and integration tabs.",
      "বহু-ট্যাবের কর্মস্থান; আপনার অ্যাকাউন্টে অনুমোদিত গ্রাহক, কার্যক্রম, গোপনীয়তা, পোর্টাল ও ইন্টিগ্রেশন ট্যাবই আসে।",
    ),
    sections: [
      section("العملاء والفرص", "Clients and Opportunities", "গ্রাহক ও সুযোগ", "crm"),
      section("أوامر التشغيل", "Work Orders", "কাজের আদেশ", "orders"),
      section("الدوام", "Timesheets", "সময়পত্র", "timesheets"),
      section("السعة الموسمية", "Seasonal Capacity", "মৌসুমি সক্ষমতা", "capacity"),
      section("طلبات الخصوصية", "Privacy Requests", "গোপনীয়তার অনুরোধ", "privacy"),
      section("وصول البوابات", "Portal Access", "পোর্টাল প্রবেশাধিকার", "clients"),
      section("التكامل والصيانة", "Integrations and Maintenance", "ইন্টিগ্রেশন ও রক্ষণাবেক্ষণ", "integrations"),
    ],
    actions: [
      action(
        t("إدارة العملاء والفرص", "Manage clients and opportunities", "গ্রাহক ও সুযোগ পরিচালনা"),
        t("أنشئ العميل أو الفرصة وحدّث المرحلة والقيمة والمتابعة التالية.", "Create a client or opportunity and update stage, value, and next follow-up.", "গ্রাহক বা সুযোগ তৈরি করে ধাপ, মূল্য ও পরবর্তী অনুসরণ হালনাগাদ করুন।"),
        { allOf: ["operations.write"] },
        "crm",
      ),
      action(
        t("إدارة أوامر التشغيل والدوام والسعة", "Manage work orders, timesheets, and capacity", "কাজের আদেশ, সময়পত্র ও সক্ষমতা পরিচালনা"),
        t("اربط السجل بالعقد والفترة والجهة ثم راجع الحالة والأعداد.", "Link the record to its contract, period, and party, then review status and quantities.", "রেকর্ডকে চুক্তি, সময়কাল ও পক্ষের সঙ্গে যুক্ত করে অবস্থা ও সংখ্যা দেখুন।"),
        { allOf: ["operations.write"] },
        "operations-core",
      ),
      action(
        t("معالجة طلب خصوصية", "Process a privacy request", "গোপনীয়তার অনুরোধ প্রক্রিয়া"),
        t("تحقق من هوية مقدم الطلب والنطاق والمهلة ثم سجل القرار والتنفيذ.", "Verify requester identity, scope, and deadline, then record decision and completion.", "আবেদনকারীর পরিচয়, পরিধি ও সময়সীমা যাচাই করে সিদ্ধান্ত ও সমাপ্তি লিখুন।"),
        { allOf: ["legal.write"] },
        "privacy",
      ),
      action(
        t("إدارة وصول البوابات", "Manage portal access", "পোর্টাল প্রবেশাধিকার পরিচালনা"),
        t("إنشاء وتعطيل حسابات بوابات العملاء والعمال متاح للإدارة الجذرية فقط.", "Creating and disabling client and worker portal accounts is limited to root administrators.", "গ্রাহক ও শ্রমিক পোর্টাল অ্যাকাউন্ট তৈরি ও নিষ্ক্রিয় করা শুধু মূল প্রশাসকের জন্য।"),
        { rootOnly: true },
        "clients",
      ),
      action(
        t("إدارة التكامل والصيانة", "Manage integrations and maintenance", "ইন্টিগ্রেশন ও রক্ষণাবেক্ষণ পরিচালনা"),
        t("راجع حالة التكامل ونفّذ أدوات الصيانة وفق الصلاحية المستقلة.", "Review integration state and run maintenance tools under the dedicated permission.", "স্বতন্ত্র অনুমতিতে ইন্টিগ্রেশনের অবস্থা দেখে রক্ষণাবেক্ষণ টুল চালান।"),
        { allOf: ["integrations.administer"] },
        "integrations",
      ),
    ],
    steps: s(
      [
        "راجع التبويبات الظاهرة لك أعلى الصفحة؛ عدم ظهور تبويب يعني أنه غير مسند لحسابك.",
        "افتح التبويب المطلوب وابحث بالمرجع أو العميل، ثم راجع الحالة والفترة والسجل المرتبط.",
        "أنشئ أو عدّل داخل التبويب نفسه وأكمل الحقول والمرفقات قبل الحفظ.",
        "إذا احتاج السجل اعتمادًا أو عقدًا أو إجراءً ماليًا، أرسله للوحدة المختصة وتابع حالته من المرجع.",
        "تحقق من النتيجة داخل التبويب ولا تفترض أن تحديث فرصة عدّل العقد أو الدفعة تلقائيًا.",
      ],
      [
        "Review tabs visible at the top; a missing tab has not been granted to your account.",
        "Open the needed tab and search by reference or client, then review status, period, and linked record.",
        "Create or edit within that tab and complete required fields and attachments before saving.",
        "If approval, a contract, or finance action is needed, send it to the responsible module and track by reference.",
        "Verify the result in the tab; updating an opportunity does not automatically change a contract or payment.",
      ],
      [
        "ওপরে দৃশ্যমান ট্যাব দেখুন; অনুপস্থিত ট্যাব আপনার অ্যাকাউন্টে অর্পিত নয়।",
        "প্রয়োজনীয় ট্যাব খুলে রেফারেন্স বা গ্রাহক দিয়ে খুঁজে অবস্থা, সময়কাল ও সংযুক্ত রেকর্ড দেখুন।",
        "একই ট্যাবে তৈরি বা সম্পাদনা করে সংরক্ষণের আগে আবশ্যিক ঘর ও সংযুক্তি পূরণ করুন।",
        "অনুমোদন, চুক্তি বা আর্থিক কাজ লাগলে দায়িত্বশীল মডিউলে পাঠিয়ে রেফারেন্স দিয়ে অনুসরণ করুন।",
        "ট্যাবে ফল যাচাই করুন; সুযোগ বদলালে চুক্তি বা পরিশোধ স্বয়ংক্রিয়ভাবে বদলায় না।",
      ],
    ),
    caution: t(
      "الدليل يعرض هنا التبويبات المرسلة إلى حسابك فعليًا فقط، وليس كل تبويبات مساحة العمليات.",
      "This guide lists only the operation tabs actually supplied to your account, not every tab supported by the workspace.",
      "এই নির্দেশিকা শুধু আপনার অ্যাকাউন্টে বাস্তবে দেওয়া ট্যাব দেখায়, কর্মস্থানের সব সমর্থিত ট্যাব নয়।",
    ),
  },
  {
    view: "representatives",
    title: t("إدارة المناديب", "Representative Management", "প্রতিনিধি ব্যবস্থাপনা"),
    description: t(
      "سجل مندوبي المبيعات والمشتريات وطلبات الميدان ومسار مراجعتها وتحويل المعتمد منها إلى متابعة تشغيلية.",
      "Sales and purchasing representative register, field requests, review workflow, and conversion of approved requests into operations.",
      "বিক্রয় ও ক্রয় প্রতিনিধি রেজিস্টার, মাঠের অনুরোধ, পর্যালোচনা এবং অনুমোদিত অনুরোধকে কার্যক্রমে রূপান্তর।",
    ),
    sections: [
      section("سجل مندوبي المبيعات والمشتريات", "Sales and purchasing representative register", "বিক্রয় ও ক্রয় প্রতিনিধি রেজিস্টার"),
      section("إضافة مندوب", "Add a representative", "প্রতিনিধি যোগ"),
      section("إرسال طلب ميداني", "Submit a field request", "মাঠের অনুরোধ পাঠান"),
      section("لوحة طلبات المناديب", "Representative request board", "প্রতিনিধি অনুরোধ বোর্ড"),
      section("قرار المالك: اعتماد أو تعديل أو رفض", "Owner decision: approve, request changes, or reject", "মালিকের সিদ্ধান্ত: অনুমোদন, পরিবর্তন বা প্রত্যাখ্যান"),
      section("تحويل طلب المبيعات المعتمد إلى عرض", "Convert an approved sales request to a quote", "অনুমোদিত বিক্রয় অনুরোধকে প্রস্তাবে রূপান্তর"),
    ],
    actions: [
      action(
        t("عرض السجل والطلبات", "View register and requests", "রেজিস্টার ও অনুরোধ দেখুন"),
        t("راجع نوع المندوب وحالته وطلبات الميدان وقراراتها.", "Review representative type, status, field requests, and decisions.", "প্রতিনিধির ধরন, অবস্থা, মাঠের অনুরোধ ও সিদ্ধান্ত দেখুন।"),
        { anyOf: ["representatives.read", "operations.read"] },
      ),
      action(
        t("إضافة مندوب أو إرسال طلب", "Add a representative or submit a request", "প্রতিনিধি যোগ বা অনুরোধ পাঠান"),
        t("أكمل بيانات المندوب أو العميل والغرض والموقع والمرفقات قبل الإرسال.", "Complete representative or client details, purpose, location, and attachments before submitting.", "পাঠানোর আগে প্রতিনিধি বা গ্রাহক তথ্য, উদ্দেশ্য, স্থান ও সংযুক্তি পূরণ করুন।"),
        { anyOf: ["representatives.write", "operations.write"] },
      ),
      action(
        t("اعتماد أو رفض طلب مندوب", "Approve or reject a representative request", "প্রতিনিধির অনুরোধ অনুমোদন বা প্রত্যাখ্যান"),
        t("يتخذ مالك النظام أو مسؤوله القرار المسبب بعد مراجعة بيانات الطلب.", "The system owner or administrator records a reasoned decision after review.", "সিস্টেম মালিক বা প্রশাসক পর্যালোচনার পর কারণসহ সিদ্ধান্ত নেন।"),
        { rootOnly: true },
      ),
    ],
    steps: s(
      [
        "اختر مندوب المبيعات أو المشتريات الصحيح، وراجع حالته ووسائل التواصل قبل إنشاء الطلب.",
        "أدخل العميل أو المورد والغرض والموقع والتاريخ والقيمة المتوقعة وأرفق الإثبات المتاح.",
        "أرسل الطلب وتابع حالته؛ إذا طُلب تعديل فحدّث الحقول المحددة وأعد الإرسال بدل إنشاء طلب مكرر.",
        "بعد الاعتماد حوّل طلب المبيعات إلى عرض عند توفر الإجراء، واحتفظ بالمرجع بين الطلب والعرض.",
      ],
      [
        "Choose the correct sales or purchasing representative and review status and contact details before creating a request.",
        "Enter client or supplier, purpose, location, date, expected value, and available evidence.",
        "Submit and track status; if changes are requested, update specified fields and resubmit instead of duplicating the request.",
        "After approval, convert an eligible sales request to a quote and preserve the reference between both records.",
      ],
      [
        "সঠিক বিক্রয় বা ক্রয় প্রতিনিধি বেছে অনুরোধের আগে অবস্থা ও যোগাযোগের তথ্য দেখুন।",
        "গ্রাহক বা সরবরাহকারী, উদ্দেশ্য, স্থান, তারিখ, সম্ভাব্য মূল্য ও প্রমাণ দিন।",
        "পাঠিয়ে অবস্থা অনুসরণ করুন; পরিবর্তন চাইলে নতুন অনুরোধ না বানিয়ে নির্দিষ্ট ঘর বদলে আবার পাঠান।",
        "অনুমোদনের পর যোগ্য বিক্রয় অনুরোধকে প্রস্তাবে রূপান্তর করে উভয় রেকর্ডের রেফারেন্স রাখুন।",
      ],
    ),
    caution: t(
      "اعتماد الطلب لا يعني إصدار عرض أو تنفيذ شراء تلقائيًا؛ تابع السجل الناتج في وحدته.",
      "Approving a request does not automatically issue a quote or execute a purchase; follow the resulting record in its module.",
      "অনুরোধ অনুমোদন করলে প্রস্তাব প্রকাশ বা ক্রয় স্বয়ংক্রিয় হয় না; তৈরি রেকর্ড তার মডিউলে অনুসরণ করুন।",
    ),
  },
  {
    view: "construction",
    title: t("المقاولات والمشروعات", "Construction and Projects", "নির্মাণ ও প্রকল্প"),
    description: t(
      "إدارة الفرص والمناقصات والمشروعات والسجلات الميدانية والهندسية والتجارية حتى التسليم.",
      "Manage opportunities, tenders, projects, field, engineering, and commercial records through handover.",
      "সুযোগ, দরপত্র, প্রকল্প, মাঠ, প্রকৌশল ও বাণিজ্যিক রেকর্ড হস্তান্তর পর্যন্ত পরিচালনা।",
    ),
    sections: [
      section("الفرص والمناقصات والتحويل إلى مشروع", "Opportunities, tenders, and project conversion", "সুযোগ, দরপত্র ও প্রকল্পে রূপান্তর"),
      section("مركز تكلفة المشروع وهيكل WBS", "Project cost center and WBS", "প্রকল্প ব্যয় কেন্দ্র ও WBS"),
      section("التقارير اليومية: الموقع والطقس والعمالة والمواد والمعدات", "Daily logs: location, weather, labor, materials, and equipment", "দৈনিক লগ: স্থান, আবহাওয়া, শ্রম, উপকরণ ও সরঞ্জাম"),
      section("RFI والاعتمادات والفحص وNCR والجودة والسلامة", "RFI, submittals, inspections, NCR, quality, and safety", "RFI, সাবমিটাল, পরিদর্শন, NCR, গুণমান ও নিরাপত্তা"),
      section("المشتريات والباطن والتغييرات ومستخلصات الدفع", "Procurement, subcontracting, changes, and payment certificates", "ক্রয়, উপ-ঠিকাদার, পরিবর্তন ও পরিশোধ সনদ"),
      section("المستندات الهندسية وإصدارات المراجعة", "Engineering documents and review versions", "প্রকৌশল নথি ও পর্যালোচনা সংস্করণ"),
      section("CBS وWIP وEAC والرقابة التجارية", "CBS, WIP, EAC, and commercial control", "CBS, WIP, EAC ও বাণিজ্যিক নিয়ন্ত্রণ"),
      section("التسليم والمخاطر ونطاق المدن المنشور", "Handover, risks, and published city coverage", "হস্তান্তর, ঝুঁকি ও প্রকাশিত শহর কভারেজ"),
    ],
    actions: [
      action(
        t("عرض مشروع وسجلاته", "View a project and its records", "প্রকল্প ও রেকর্ড দেখুন"),
        t("يعتمد ما تراه أيضًا على نطاق المشروع أو المدينة أو الدور المسند.", "What you see can also depend on assigned project, city, or functional scope.", "আপনি যা দেখেন তা অর্পিত প্রকল্প, শহর বা কার্যকর পরিধির ওপরও নির্ভর করতে পারে।"),
        { allOf: ["construction.read"] },
      ),
      action(
        t("إنشاء أو تعديل سجل مقاولات", "Create or edit a construction record", "নির্মাণ রেকর্ড তৈরি বা সম্পাদনা"),
        t("أنشئ التقرير أو الطلب في نوعه الصحيح واربطه بالمشروع والحزمة والموقع.", "Create the item under its correct type and link project, package, and location.", "সঠিক ধরনের অধীনে তৈরি করে প্রকল্প, প্যাকেজ ও স্থান যুক্ত করুন।"),
        { allOf: ["construction.write"] },
      ),
      action(
        t("اعتماد قرار حساس", "Approve a sensitive decision", "সংবেদনশীল সিদ্ধান্ত অনুমোদন"),
        t("يشمل قرارات المناقصة والاعتمادات والتغييرات ومستخلصات الدفع المقيدة.", "Covers restricted tender decisions, submittals, changes, and payment certificates.", "সীমাবদ্ধ দরপত্র সিদ্ধান্ত, সাবমিটাল, পরিবর্তন ও পরিশোধ সনদ অন্তর্ভুক্ত।"),
        { allOf: ["construction.approve"] },
      ),
    ],
    steps: s(
      [
        "اختر الفرصة أو المشروع الصحيح وتحقق من العميل والمدينة ومدير المشروع ومركز التكلفة.",
        "أضف السجل في نوعه الفعلي واربطه بالحزمة وWBS والتاريخ والموقع والمرفقات.",
        "في التقرير اليومي سجل الطقس والقوى العاملة والمواد والمعدات والملاحظات الميدانية القابلة للإثبات.",
        "أرسل RFI أو الاعتماد أو الفحص أو التغيير للمراجعة، ولا تغيّر حالة قرار حساس دون صلاحية الاعتماد.",
        "تابع الأثر في التكلفة وWIP وEAC والمخاطر ومستخلص الدفع، ثم وثّق الإغلاق أو التسليم.",
      ],
      [
        "Select the correct opportunity or project and verify client, city, project manager, and cost center.",
        "Create the item under its actual type and link package, WBS, date, location, and attachments.",
        "In a daily log record weather, labor, materials, equipment, and evidence-based site notes.",
        "Submit RFI, submittal, inspection, or change for review; never change a restricted decision without approval permission.",
        "Track impact on cost, WIP, EAC, risks, and payment certificate, then document closure or handover.",
      ],
      [
        "সঠিক সুযোগ বা প্রকল্প বেছে গ্রাহক, শহর, প্রকল্প ব্যবস্থাপক ও ব্যয় কেন্দ্র যাচাই করুন।",
        "প্রকৃত ধরনের অধীনে রেকর্ড তৈরি করে প্যাকেজ, WBS, তারিখ, স্থান ও সংযুক্তি যুক্ত করুন।",
        "দৈনিক লগে আবহাওয়া, শ্রম, উপকরণ, সরঞ্জাম ও প্রমাণযোগ্য সাইট নোট লিখুন।",
        "RFI, সাবমিটাল, পরিদর্শন বা পরিবর্তন পর্যালোচনায় পাঠান; approval অনুমতি ছাড়া সীমাবদ্ধ সিদ্ধান্ত বদলাবেন না।",
        "ব্যয়, WIP, EAC, ঝুঁকি ও পরিশোধ সনদে প্রভাব দেখে সমাপ্তি বা হস্তান্তর নথিভুক্ত করুন।",
      ],
    ),
    caution: t(
      "قد تسمح الصلاحية بفتح الصفحة مع بقاء بعض المشروعات خارج نطاقك الجغرافي أو الوظيفي أو المالي.",
      "Page access can coexist with project restrictions based on geographic, functional, or financial scope.",
      "পৃষ্ঠা দেখা গেলেও ভৌগোলিক, কার্যকর বা আর্থিক পরিধির কারণে কিছু প্রকল্প সীমাবদ্ধ থাকতে পারে।",
    ),
  },
  {
    view: "workforce-supervision",
    title: t("إدارة الإشراف على العمالة", "Workforce Supervision", "শ্রমিক তত্ত্বাবধান"),
    description: t(
      "لوحة تغطية عقود العمالة: المطلوب والمسند والعجز والمتاح، مع فتح العقد لمعالجة التوزيع والغياب.",
      "Workforce contract coverage: required, assigned, shortage, and available counts, with contract-level assignment and absence handling.",
      "শ্রমিক চুক্তির কভারেজ: প্রয়োজন, নিযুক্ত, ঘাটতি ও উপলভ্য সংখ্যা; চুক্তিতে নিয়োগ ও অনুপস্থিতি পরিচালনা।",
    ),
    sections: [
      section("كل العقود أو العقود ذات العجز", "All contracts or contracts with shortage", "সব চুক্তি বা ঘাটতিযুক্ত চুক্তি"),
      section("المطلوب مقابل المسند", "Required versus assigned", "প্রয়োজন বনাম নিযুক্ত"),
      section("العجز والمتاح حسب المهنة", "Shortage and availability by profession", "পেশা অনুযায়ী ঘাটতি ও উপলভ্যতা"),
      section("فتح العقد للإسناد والتحرير والغياب", "Open contract for assignment, release, and absence", "নিয়োগ, মুক্ত ও অনুপস্থিতির জন্য চুক্তি খুলুন"),
    ],
    actions: [
      action(
        t("تصفية العقود ومراجعة العجز", "Filter contracts and review shortage", "চুক্তি ফিল্টার ও ঘাটতি দেখুন"),
        t("قارن المطلوب والمسند والمتاح لكل مهنة وافتح العقد المطلوب.", "Compare required, assigned, and available counts by profession and open the contract.", "প্রতিটি পেশায় প্রয়োজন, নিযুক্ত ও উপলভ্য সংখ্যা মিলিয়ে চুক্তি খুলুন।"),
        { allOf: ["contracts.read", "workforce.read"] },
      ),
      action(
        t("إسناد أو تحرير عامل وتسجيل غياب", "Assign or release a worker and record absence", "শ্রমিক নিয়োগ, মুক্ত ও অনুপস্থিতি লিখুন"),
        t("هذه التعديلات تتم من درج العقد، ويقيدها النظام حاليًا بالإدارة الجذرية.", "These changes are made in the contract drawer and are currently restricted to root administrators.", "এই পরিবর্তন চুক্তির ড্রয়ার থেকে হয় এবং বর্তমানে মূল প্রশাসকের জন্য সীমাবদ্ধ।"),
        { rootOnly: true },
      ),
    ],
    steps: s(
      [
        "اختر «العقود ذات العجز» لتحديد الأولويات، ثم راجع المهنة والعدد والفترة والموقع.",
        "افتح العقد وتحقق من المطلوب والمسند والعامل المتاح قبل أي تغيير.",
        "ينفذ المستخدم الإداري المخول الإسناد أو التحرير أو تسجيل الغياب من درج العقد مع السبب والتاريخ.",
        "ارجع إلى لوحة الإشراف وتأكد من تحديث العجز والتغطية، ثم راجع أثر الغياب في الدوام.",
      ],
      [
        "Select Contracts with Shortage to prioritize, then review profession, quantity, period, and location.",
        "Open the contract and verify requirements, current assignments, and available worker before changing anything.",
        "An authorized root administrator assigns, releases, or records absence from the contract drawer with reason and date.",
        "Return to supervision and confirm shortage and coverage changed, then review the absence effect on timesheets.",
      ],
      [
        "অগ্রাধিকার দিতে ঘাটতিযুক্ত চুক্তি বেছে পেশা, সংখ্যা, সময়কাল ও স্থান দেখুন।",
        "চুক্তি খুলে পরিবর্তনের আগে চাহিদা, বর্তমান নিয়োগ ও উপলভ্য শ্রমিক যাচাই করুন।",
        "অনুমোদিত মূল প্রশাসক চুক্তির ড্রয়ার থেকে কারণ ও তারিখসহ নিয়োগ, মুক্ত বা অনুপস্থিতি লিখবেন।",
        "তত্ত্বাবধানে ফিরে ঘাটতি ও কভারেজ বদলেছে নিশ্চিত করে সময়পত্রে অনুপস্থিতির প্রভাব দেখুন।",
      ],
    ),
    caution: t(
      "الأرقام مشتقة من بيانات العقد والإسناد؛ صحح المصدر بدل تعديل رقم الملخص يدويًا.",
      "Counts are derived from contract and assignment data; correct the source rather than a summary number.",
      "সংখ্যা চুক্তি ও নিয়োগ তথ্য থেকে আসে; সারসংক্ষেপ সংখ্যা নয়, উৎস সংশোধন করুন।",
    ),
  },
  {
    view: "contractual-documents",
    title: t("العقود والعروض والخطابات", "Contracts, Quotes, and Letters", "চুক্তি, প্রস্তাব ও চিঠি"),
    description: t(
      "مركز المحررات التعاقدية والرسمية لإنشاء المسودات ومراجعة PDF والاعتماد والإصدار والإلغاء.",
      "The contractual and formal document center for drafting, PDF review, approval, issuance, and cancellation.",
      "খসড়া, PDF পর্যালোচনা, অনুমোদন, প্রকাশ ও বাতিলের জন্য চুক্তিগত ও আনুষ্ঠানিক নথি কেন্দ্র।",
    ),
    sections: [
      section("العقود", "Contracts", "চুক্তি"),
      section("عروض الأسعار", "Quotations", "মূল্য প্রস্তাব"),
      section("الخطابات الرسمية", "Official Letters", "আনুষ্ঠানিক চিঠি"),
      section("المسودة والتعديل والمعاينة والتنزيل", "Draft, edit, preview, and download", "খসড়া, সম্পাদনা, প্রিভিউ ও ডাউনলোড"),
      section("الاعتماد والإصدار والإلغاء", "Approval, issuance, and cancellation", "অনুমোদন, প্রকাশ ও বাতিল"),
      section("مكتبة PDF للخطابات", "Letter PDF library", "চিঠির PDF লাইব্রেরি"),
    ],
    actions: [
      action(
        t("عرض وتنزيل المحرر", "View and download a document", "নথি দেখুন ও ডাউনলোড"),
        t("راجع نوعه ومرجعه وحالته وإصداره قبل تنزيل النسخة.", "Check type, reference, status, and version before downloading.", "ডাউনলোডের আগে ধরন, রেফারেন্স, অবস্থা ও সংস্করণ দেখুন।"),
        { allOf: ["contracts.read"] },
      ),
      action(
        t("إنشاء أو تعديل عقد أو عرض أو خطاب", "Create or edit a contract, quote, or letter", "চুক্তি, প্রস্তাব বা চিঠি তৈরি বা সম্পাদনা"),
        t("أكمل الأطراف والبنود والأسعار والمدة واللغات ثم أنشئ معاينة PDF.", "Complete parties, clauses, prices, duration, and languages, then generate a PDF preview.", "পক্ষ, শর্ত, মূল্য, মেয়াদ ও ভাষা পূরণ করে PDF প্রিভিউ তৈরি করুন।"),
        { allOf: ["contracts.write"] },
      ),
      action(
        t("اعتماد محرر تعاقدي", "Approve a contractual document", "চুক্তিগত নথি অনুমোদন"),
        t("طابق المسودة والمعاينة والمبالغ والهوية قبل إصدار النسخة الرسمية.", "Match draft, preview, amounts, and identity before issuing the official version.", "আনুষ্ঠানিক সংস্করণের আগে খসড়া, প্রিভিউ, অর্থ ও পরিচয় মিলিয়ে নিন।"),
        { allOf: ["contracts.approve"] },
      ),
      action(
        t("إلغاء محرر", "Cancel a document", "নথি বাতিল"),
        t("يتطلب الإلغاء سببًا ومراجعة الأثر القانوني والمالي وسجلًا واضحًا.", "Cancellation requires a reason, legal and financial impact review, and a clear trail.", "বাতিলে কারণ, আইনি-আর্থিক প্রভাব পর্যালোচনা ও স্পষ্ট ইতিহাস দরকার।"),
        { allOf: ["contracts.approve"] },
      ),
    ],
    steps: s(
      [
        "اختر نوع المحرر ومصدره، وأكمل الأطراف والنطاق والبنود والمهن والأسعار والمدة.",
        "راجع العربية والإنجليزية والبنغالية والأرقام والهوية، ثم أنشئ PDF للمعاينة.",
        "احفظ كمسودة وأرسل للاعتماد؛ لا تشارك المسودة بوصفها نسخة رسمية.",
        "بعد الاعتماد أصدر أو نزّل النسخة الرسمية واربط جدول الدفعات أو السجل الناتج عند الحاجة.",
        "لأي تعديل جوهري أو إلغاء استخدم الإجراء المخصص وسجل السبب، ثم راجع الأثر القانوني والمالي.",
      ],
      [
        "Choose document type and source and complete parties, scope, clauses, professions, prices, and duration.",
        "Review Arabic, English, Bengali, numbers, and identities, then generate a PDF preview.",
        "Save a draft and submit for approval; never share the draft as an official version.",
        "After approval, issue or download the official copy and link any payment schedule or resulting record.",
        "For a material edit or cancellation use the dedicated action, record the reason, and review legal and financial impact.",
      ],
      [
        "নথির ধরন ও উৎস বেছে পক্ষ, পরিধি, শর্ত, পেশা, মূল্য ও মেয়াদ পূরণ করুন।",
        "আরবি, ইংরেজি, বাংলা, সংখ্যা ও পরিচয় দেখে PDF প্রিভিউ তৈরি করুন।",
        "খসড়া সংরক্ষণ করে অনুমোদনে পাঠান; খসড়াকে আনুষ্ঠানিক সংস্করণ হিসেবে শেয়ার করবেন না।",
        "অনুমোদনের পর আনুষ্ঠানিক কপি প্রকাশ বা ডাউনলোড করে প্রয়োজনে পরিশোধ সূচি বা তৈরি রেকর্ড যুক্ত করুন।",
        "গুরুত্বপূর্ণ পরিবর্তন বা বাতিলে নির্ধারিত কাজ দিয়ে কারণ লিখে আইনি ও আর্থিক প্রভাব দেখুন।",
      ],
    ),
    caution: t(
      "المعاينة ليست اعتمادًا، والاعتماد لا يعني أن جدول الدفعات أو السداد نُفذ تلقائيًا.",
      "A preview is not approval, and approval does not mean a payment schedule or payment was completed automatically.",
      "প্রিভিউ অনুমোদন নয়, এবং অনুমোদন মানে পরিশোধ সূচি বা পরিশোধ স্বয়ংক্রিয়ভাবে সম্পন্ন নয়।",
    ),
  },
  {
    view: "documents",
    title: t("مستندات الشركة", "Company Documents", "কোম্পানির নথি"),
    description: t(
      "مركز رفع وتصنيف ومعاينة ومشاركة المستندات ومتابعة الانتهاء، ويضم إدارة الختم والتوقيع وإجراءات الإصدار المخولة.",
      "Upload, classify, preview, share, and track document expiry, with authorized issuance and stamp/signature management.",
      "নথি আপলোড, শ্রেণিবিন্যাস, প্রিভিউ, শেয়ার ও মেয়াদ অনুসরণ; অনুমোদিত প্রকাশ এবং সিল-স্বাক্ষর ব্যবস্থাপনা।",
    ),
    sections: [
      section("إجمالي المستندات والمنتهي والقريب من الانتهاء", "Total, expired, and expiring documents", "মোট, মেয়াদোত্তীর্ণ ও শিগগির মেয়াদ শেষ নথি"),
      section("مكتبة المستندات والبحث", "Document library and search", "নথি লাইব্রেরি ও অনুসন্ধান"),
      section("المعاينة والتنزيل", "Preview and download", "প্রিভিউ ও ডাউনলোড"),
      section("روابط مشاركة صالحة سبعة أيام", "Seven-day share links", "সাত দিনের শেয়ার লিংক"),
      section("رفع مستند شركة", "Upload a company document", "কোম্পানির নথি আপলোড"),
      section("إصدار عقد أو عرض وفتح الاعتمادات", "Issue a contract or quote and open approvals", "চুক্তি বা প্রস্তাব প্রকাশ ও অনুমোদন খুলুন"),
      section("إدارة الختم والتوقيع", "Stamp and signature management", "সিল ও স্বাক্ষর ব্যবস্থাপনা"),
    ],
    actions: [
      action(
        t("معاينة أو تنزيل مستند", "Preview or download a document", "নথি প্রিভিউ বা ডাউনলোড"),
        t("افتح السجل الصحيح وتحقق من المرجع والحالة والإصدار قبل التنزيل.", "Open the correct record and verify reference, status, and version before download.", "সঠিক রেকর্ড খুলে ডাউনলোডের আগে রেফারেন্স, অবস্থা ও সংস্করণ দেখুন।"),
        { allOf: ["documents.read"] },
      ),
      action(
        t("رفع مستند", "Upload a document", "নথি আপলোড"),
        t("حدد التصنيف والجهة والمرجع وتاريخ الانتهاء وارفع الملف الصحيح.", "Set category, issuer, reference, and expiry and upload the correct file.", "শ্রেণি, ইস্যুকারী, রেফারেন্স ও মেয়াদ দিয়ে সঠিক ফাইল আপলোড করুন।"),
        { allOf: ["documents.write"] },
      ),
      action(
        t("إنشاء رابط مشاركة", "Create a share link", "শেয়ার লিংক তৈরি"),
        t("ينشئ رابطًا مخصصًا صالحًا سبعة أيام للمستلم المقصود.", "Creates a dedicated seven-day link for the intended recipient.", "নির্দিষ্ট প্রাপকের জন্য সাত দিনের লিংক তৈরি করে।"),
        { allOf: ["documents.share"] },
      ),
      action(
        t("إصدار عقد أو عرض", "Issue a contract or quote", "চুক্তি বা প্রস্তাব প্রকাশ"),
        t("ينقلك إلى محرر المستند التعاقدي بالحقول المطلوبة.", "Opens the contractual document editor with required fields.", "প্রয়োজনীয় ঘরসহ চুক্তিগত নথি সম্পাদক খোলে।"),
        { allOf: ["contracts.write"] },
      ),
      action(
        t("اعتماد عقد أو عرض", "Approve a contract or quote", "চুক্তি বা প্রস্তাব অনুমোদন"),
        t("راجع المعاينة والنسخة الحالية قبل الاعتماد المباشر.", "Review the preview and current version before direct approval.", "সরাসরি অনুমোদনের আগে প্রিভিউ ও বর্তমান সংস্করণ দেখুন।"),
        { allOf: ["contracts.approve"] },
      ),
      action(
        t("رفع أو استبدال الختم والتوقيع", "Upload or replace stamp and signature", "সিল বা স্বাক্ষর আপলোড বা বদল"),
        t("استخدم PNG أو JPG معتمدًا وراجع أثره في معاينة مستند.", "Use an approved PNG or JPG and verify it in a document preview.", "অনুমোদিত PNG বা JPG ব্যবহার করে নথির প্রিভিউতে যাচাই করুন।"),
        { allOf: ["assets.administer"] },
      ),
    ],
    steps: s(
      [
        "ابحث بالعنوان أو المرجع، وافتح السجل وطابق التصنيف والحالة والإصدار وتاريخ الانتهاء.",
        "عند الرفع اختر الملف الواضح والتصنيف الصحيح وأدخل المرجع والجهة والتواريخ بدقة.",
        "افتح الملف بعد الحفظ للتأكد من اكتماله، وميّز النسخة الرسمية من المسودة أو الإصدار القديم.",
        "أنشئ رابط المشاركة للمستلم المقصود فقط، وبلغه بمدة السبعة أيام وتابع سجل المشاركة.",
        "عند تغيير الختم أو التوقيع أنشئ معاينة عقد أو خطاب قبل اعتماد استخدام الأصل الجديد.",
      ],
      [
        "Search by title or reference, open the record, and match category, status, version, and expiry.",
        "For upload, choose a clear file and correct category and enter reference, issuer, and dates accurately.",
        "Open the saved file to confirm completeness and distinguish the official version from a draft or old issue.",
        "Create a link only for the intended recipient, state the seven-day validity, and review sharing history.",
        "After changing stamp or signature, generate a contract or letter preview before approving the new asset for use.",
      ],
      [
        "শিরোনাম বা রেফারেন্স দিয়ে খুঁজে রেকর্ড খুলে শ্রেণি, অবস্থা, সংস্করণ ও মেয়াদ মিলিয়ে নিন।",
        "আপলোডে স্পষ্ট ফাইল ও সঠিক শ্রেণি বেছে রেফারেন্স, ইস্যুকারী ও তারিখ নির্ভুল দিন।",
        "সংরক্ষিত ফাইল খুলে পূর্ণতা যাচাই করে আনুষ্ঠানিক সংস্করণকে খসড়া বা পুরোনো সংস্করণ থেকে আলাদা করুন।",
        "শুধু নির্দিষ্ট প্রাপকের জন্য লিংক তৈরি করে সাত দিনের মেয়াদ জানান এবং শেয়ার ইতিহাস দেখুন।",
        "সিল বা স্বাক্ষর বদলালে নতুন সম্পদ ব্যবহারের আগে চুক্তি বা চিঠির প্রিভিউ তৈরি করুন।",
      ],
    ),
    caution: t(
      "الختم والتوقيع يُداران في هذه الصفحة، أما صفحة «الهوية البصرية» فهي مرجع للهوية وليست شاشة رفع.",
      "Stamp and signature are managed here; Brand Identity is a reference page, not an upload screen.",
      "সিল ও স্বাক্ষর এখানে পরিচালিত হয়; ব্র্যান্ড পরিচিতি একটি রেফারেন্স পৃষ্ঠা, আপলোড স্ক্রিন নয়।",
    ),
  },
  {
    view: "brand",
    title: t("الهوية البصرية", "Brand Identity", "ব্র্যান্ড পরিচিতি"),
    description: t(
      "صفحة مرجعية لنسخ الشعار والألوان وخط Tajawal وقواعد الصور وتنزيل دليل الهوية بصيغة PDF.",
      "A reference page for logo versions, colors, Tajawal typography, image rules, and the PDF brand guide.",
      "লোগো সংস্করণ, রং, Tajawal ফন্ট, ছবির নিয়ম ও PDF ব্র্যান্ড গাইডের রেফারেন্স পৃষ্ঠা।",
    ),
    sections: [
      section("نسخ الشعار المعتمدة", "Approved logo versions", "অনুমোদিত লোগো সংস্করণ"),
      section("لوحة الألوان", "Color palette", "রঙের প্যালেট"),
      section("خط Tajawal وأوزان العناوين والنصوص", "Tajawal typeface and text weights", "Tajawal ফন্ট ও লেখার ওজন"),
      section("قواعد اختيار الصور", "Image selection rules", "ছবি নির্বাচনের নিয়ম"),
      section("تنزيل دليل الهوية PDF", "Download the PDF brand guide", "PDF ব্র্যান্ড গাইড ডাউনলোড"),
    ],
    actions: [
      action(
        t("مراجعة معايير الهوية", "Review brand standards", "ব্র্যান্ড মান দেখুন"),
        t("طابق الشعار واللون والخط والصورة مع الاستخدام المطلوب.", "Match logo, color, typography, and imagery to the intended use.", "প্রয়োজনীয় ব্যবহারের সঙ্গে লোগো, রং, ফন্ট ও ছবি মিলিয়ে নিন।"),
      ),
      action(
        t("تنزيل دليل الهوية", "Download the brand guide", "ব্র্যান্ড গাইড ডাউনলোড"),
        t("استخدم ملف PDF كمرجع عند إعداد مستند أو مادة خارج النظام.", "Use the PDF when preparing a document or material outside the system.", "সিস্টেমের বাইরে নথি বা উপকরণ তৈরিতে PDF রেফারেন্স ব্যবহার করুন।"),
      ),
    ],
    steps: s(
      [
        "حدد نوع الاستخدام: شاشة أو طباعة أو مستند رسمي، ثم اختر نسخة الشعار المناسبة للخلفية.",
        "انسخ قيم الألوان واستخدم خط Tajawal والأوزان المحددة بدل ألوان أو خطوط تقريبية.",
        "راجع قواعد الصور والهوامش والوضوح قبل تسليم المادة.",
        "نزّل دليل PDF عند العمل خارج النظام، وأدر الختم والتوقيع من «مستندات الشركة» إذا كنت مخولًا.",
      ],
      [
        "Identify the use—screen, print, or formal document—then choose the logo version suitable for its background.",
        "Use the listed color values and Tajawal weights instead of approximate colors or fonts.",
        "Review imagery, spacing, and clarity rules before delivering the material.",
        "Download the PDF for work outside the system; manage stamp and signature in Company Documents when authorized.",
      ],
      [
        "ব্যবহার—স্ক্রিন, মুদ্রণ বা আনুষ্ঠানিক নথি—নির্ধারণ করে পটভূমির উপযুক্ত লোগো বাছুন।",
        "আনুমানিক রং বা ফন্ট নয়, তালিকাভুক্ত রঙের মান ও Tajawal ওজন ব্যবহার করুন।",
        "উপকরণ দেওয়ার আগে ছবি, ফাঁকা স্থান ও স্পষ্টতার নিয়ম দেখুন।",
        "সিস্টেমের বাইরে কাজে PDF নিন; অনুমতি থাকলে কোম্পানির নথিতে সিল ও স্বাক্ষর পরিচালনা করুন।",
      ],
    ),
    caution: t(
      "هذه صفحة مرجعية فقط؛ لا ترفع منها الختم أو التوقيع ولا تغيّر أصول المستندات.",
      "This is a reference page only; it does not upload stamps, signatures, or document assets.",
      "এটি শুধু রেফারেন্স পৃষ্ঠা; এখানে সিল, স্বাক্ষর বা নথির সম্পদ আপলোড হয় না।",
    ),
  },
  {
    view: "website",
    title: t("إدارة الموقع", "Website Management", "ওয়েবসাইট ব্যবস্থাপনা"),
    description: t(
      "تحرير أقسام الموقع وعناصره وأسئلته الشائعة باللغات الثلاث مع الترتيب والظهور والمسودة والنشر.",
      "Edit website sections, items, and FAQs in three languages with ordering, visibility, drafts, and publishing.",
      "ক্রম, দৃশ্যমানতা, খসড়া ও প্রকাশসহ তিন ভাষায় ওয়েবসাইটের অংশ, আইটেম ও FAQ সম্পাদনা।",
    ),
    sections: [
      section("الأقسام والعناصر والأسئلة الشائعة", "Sections, items, and FAQs", "অংশ, আইটেম ও FAQ"),
      section("العنوان والوصف المحلي باللغات الثلاث", "Localized title and description in three languages", "তিন ভাষায় স্থানীয় শিরোনাম ও বিবরণ"),
      section("الترتيب وحالة الظهور", "Order and visibility", "ক্রম ও দৃশ্যমানতা"),
      section("المسودة والمعاينة", "Draft and preview", "খসড়া ও প্রিভিউ"),
      section("النشر والتحقق من الصفحة العامة", "Publish and verify the public page", "প্রকাশ ও জনসাধারণের পৃষ্ঠা যাচাই"),
      section("إرشادات SEO والبحث المحلي", "SEO and local-search guidance", "SEO ও স্থানীয় অনুসন্ধান নির্দেশনা"),
    ],
    actions: [
      action(
        t("عرض محتوى الموقع", "View website content", "ওয়েবসাইটের বিষয়বস্তু দেখুন"),
        t("راجع النصوص والترتيب والظهور وحالة المسودة دون تعديل.", "Review text, order, visibility, and draft state without editing.", "সম্পাদনা ছাড়া লেখা, ক্রম, দৃশ্যমানতা ও খসড়া অবস্থা দেখুন।"),
        { allOf: ["website.read"] },
      ),
      action(
        t("تعديل وحفظ مسودة", "Edit and save a draft", "সম্পাদনা ও খসড়া সংরক্ষণ"),
        t("أكمل العربية والإنجليزية والبنغالية والصور والروابط والترتيب.", "Complete Arabic, English, Bengali, images, links, and ordering.", "আরবি, ইংরেজি, বাংলা, ছবি, লিংক ও ক্রম পূরণ করুন।"),
        { allOf: ["website.write"] },
      ),
      action(
        t("نشر الموقع", "Publish the website", "ওয়েবসাইট প্রকাশ"),
        t("لا يسمح النظام بالنشر عند نقص الإنجليزية أو البنغالية؛ راجع المعاينة أولًا.", "Publishing is blocked when English or Bengali is incomplete; review the preview first.", "ইংরেজি বা বাংলা অসম্পূর্ণ হলে প্রকাশ বন্ধ থাকে; আগে প্রিভিউ দেখুন।"),
        { allOf: ["website.write"] },
      ),
    ],
    steps: s(
      [
        "افتح القسم أو العنصر الصحيح وتحقق من مكان ظهوره وترتيبه وحالته الحالية.",
        "عدّل العنوان والوصف والإجراء بالعربية والإنجليزية والبنغالية، ثم راجع الصور والنص البديل والروابط.",
        "احفظ المسودة وراجع المعاينة على الهاتف وسطح المكتب وباتجاهي RTL وLTR.",
        "أكمل أي ترجمة ناقصة ثم انشر مرة واحدة، وافتح الصفحة العامة وتحقق من اللغة والروابط والإصدار.",
      ],
      [
        "Open the correct section or item and verify its location, order, and current visibility.",
        "Edit title, description, and action in Arabic, English, and Bengali, then check images, alt text, and links.",
        "Save a draft and preview mobile, desktop, RTL, and LTR layouts.",
        "Complete missing translations, publish once, and verify language, links, and version on the public page.",
      ],
      [
        "সঠিক অংশ বা আইটেম খুলে অবস্থান, ক্রম ও বর্তমান দৃশ্যমানতা যাচাই করুন।",
        "আরবি, ইংরেজি ও বাংলায় শিরোনাম, বিবরণ ও কাজ সম্পাদনা করে ছবি, alt text ও লিংক দেখুন।",
        "খসড়া সংরক্ষণ করে মোবাইল, ডেস্কটপ, RTL ও LTR বিন্যাস প্রিভিউ করুন।",
        "অনুপস্থিত অনুবাদ পূরণ করে একবার প্রকাশ করুন এবং জনসাধারণের পৃষ্ঠায় ভাষা, লিংক ও সংস্করণ দেখুন।",
      ],
    ),
    caution: t(
      "الحفظ لا ينشر التعديل، والنشر لا يكتمل إذا كانت الإنجليزية أو البنغالية ناقصة.",
      "Saving does not publish, and publishing cannot complete while English or Bengali is missing.",
      "সংরক্ষণ প্রকাশ নয়, এবং ইংরেজি বা বাংলা অনুপস্থিত থাকলে প্রকাশ সম্পন্ন হয় না।",
    ),
  },
  {
    view: "users",
    title: t("المستخدمون والصلاحيات", "Users and Permissions", "ব্যবহারকারী ও অনুমতি"),
    description: t(
      "إدارة حسابات النظام والموافقات والحالة وكلمات المرور وأجهزة PWA والأدوار الديناميكية ونطاقات الوصول.",
      "Manage accounts, approvals, status, passwords, PWA devices, dynamic roles, and access scopes.",
      "অ্যাকাউন্ট, অনুমোদন, অবস্থা, পাসওয়ার্ড, PWA ডিভাইস, গতিশীল ভূমিকা ও প্রবেশ পরিধি পরিচালনা।",
    ),
    sections: [
      section("حسابات النظام وطلبات الانضمام", "System accounts and access requests", "সিস্টেম অ্যাকাউন্ট ও প্রবেশ অনুরোধ"),
      section("الموافقة والحالة وإعادة تعيين كلمة المرور", "Approval, status, and password reset", "অনুমোদন, অবস্থা ও পাসওয়ার্ড রিসেট"),
      section("أجهزة PWA الموثوقة", "Trusted PWA devices", "বিশ্বস্ত PWA ডিভাইস"),
      section("تعريف الأدوار والصلاحيات الديناميكية", "Role definitions and dynamic permissions", "ভূমিকা সংজ্ঞা ও গতিশীল অনুমতি"),
      section("نطاق الوصول والبريد الحالي", "Access scope and current email", "প্রবেশ পরিধি ও বর্তমান ইমেইল"),
      section("إبطال الجلسات وسجل التدقيق", "Session invalidation and audit trail", "সেশন বাতিল ও অডিট ইতিহাস"),
    ],
    actions: [
      action(
        t("إنشاء أو اعتماد حساب", "Create or approve an account", "অ্যাকাউন্ট তৈরি বা অনুমোদন"),
        t("تحقق من الهوية والقسم والمسمى والمدير وسبب الوصول قبل التفعيل.", "Verify identity, department, title, manager, and business reason before activation.", "সক্রিয় করার আগে পরিচয়, বিভাগ, পদ, ব্যবস্থাপক ও প্রবেশের কারণ যাচাই করুন।"),
        { rootOnly: true },
      ),
      action(
        t("تعيين دور وصلاحيات ونطاق", "Assign role, permissions, and scope", "ভূমিকা, অনুমতি ও পরিধি অর্পণ"),
        t("امنح أقل وصول يكفي للعمل، وحدد المشروع أو المدينة أو النطاق عند الحاجة.", "Grant the least access needed and define project, city, or scope when applicable.", "প্রয়োজনীয় সর্বনিম্ন প্রবেশাধিকার দিয়ে প্রযোজ্য প্রকল্প, শহর বা পরিধি নির্ধারণ করুন।"),
        { rootOnly: true },
      ),
      action(
        t("تعطيل حساب أو إبطال جلساته", "Disable an account or revoke sessions", "অ্যাকাউন্ট নিষ্ক্রিয় বা সেশন বাতিল"),
        t("استخدمه عند انتقال المستخدم أو انتهاء عمله أو الاشتباه الأمني، وسجل السبب.", "Use when a user moves, leaves, or has a security concern, and record the reason.", "ব্যবহারকারী বদলি, চাকরি শেষ বা নিরাপত্তা সন্দেহে কারণ লিখে ব্যবহার করুন।"),
        { rootOnly: true },
      ),
      action(
        t("إدارة دور ديناميكي", "Manage a dynamic role", "গতিশীল ভূমিকা পরিচালনা"),
        t("أنشئ أو عدّل الدور بسبب موثق، ولا تحذف دورًا مرتبطًا بمستخدم نشط.", "Create or edit with a documented reason, and never delete a role linked to an active user.", "নথিভুক্ত কারণে তৈরি বা সম্পাদনা করুন; সক্রিয় ব্যবহারকারীর ভূমিকা মুছবেন না।"),
        { rootOnly: true },
      ),
    ],
    steps: s(
      [
        "افتح طلب الحساب وراجع البريد والاسم والقسم والمسمى والمدير وسبب الحاجة.",
        "اختر الدور الوظيفي ونمط الصلاحية والنطاق الأقل الذي يحقق المهمة، ولا تمنح اعتمادًا أو دفعًا للحاجة إلى القراءة.",
        "سجل سبب الموافقة أو الرفض أو التعديل، ثم احفظ وتأكد من إبطال الجلسات القديمة عند التغيير الأمني.",
        "راجع وصول المستخدم الفعلي والصفحات الظاهرة له، واختبر أن الصفحات خارج النطاق لا تظهر.",
        "عند الانتقال أو انتهاء العمل عطّل الحساب وألغِ الأجهزة أو الجلسات اللازمة وراجع سجل التدقيق.",
      ],
      [
        "Open the request and review email, name, department, title, manager, and business reason.",
        "Choose the least functional role, permission profile, and scope needed; do not grant approval or payment merely for viewing.",
        "Record the reason for approval, rejection, or change, save, and confirm old sessions are revoked after a security change.",
        "Review the user's effective access and visible pages and verify out-of-scope pages remain hidden.",
        "When a user moves or leaves, disable the account, revoke necessary devices or sessions, and inspect the audit trail.",
      ],
      [
        "অনুরোধ খুলে ইমেইল, নাম, বিভাগ, পদ, ব্যবস্থাপক ও ব্যবসায়িক কারণ দেখুন।",
        "প্রয়োজনীয় সর্বনিম্ন কার্যকর ভূমিকা, অনুমতি প্রোফাইল ও পরিধি দিন; শুধু দেখার জন্য approval বা payment দেবেন না।",
        "অনুমোদন, প্রত্যাখ্যান বা পরিবর্তনের কারণ লিখে সংরক্ষণ করুন এবং নিরাপত্তা পরিবর্তনে পুরোনো সেশন বাতিল হয়েছে দেখুন।",
        "ব্যবহারকারীর কার্যকর প্রবেশাধিকার ও দৃশ্যমান পৃষ্ঠা দেখে পরিধির বাইরের পৃষ্ঠা লুকানো আছে যাচাই করুন।",
        "ব্যবহারকারী বদলি বা চলে গেলে অ্যাকাউন্ট নিষ্ক্রিয় করে প্রয়োজনীয় ডিভাইস বা সেশন বাতিল ও অডিট ইতিহাস দেখুন।",
      ],
    ),
    caution: t(
      "لا ترفع صلاحيتك بنفسك ولا تمنح النجمة (*) إلا للأدوار الجذرية المحمية؛ كل تغيير أمني يجب أن يكون مسببًا.",
      "Never elevate yourself or grant (*) outside protected root roles; every security change must have a reason.",
      "নিজেকে উন্নীত করবেন না বা সুরক্ষিত মূল ভূমিকার বাইরে (*) দেবেন না; প্রতিটি নিরাপত্তা পরিবর্তনে কারণ চাই।",
    ),
  },
];

const orWord: Record<Locale, string> = { ar: " أو ", en: " or ", bn: " অথবা " };

export default function SystemGuide({
  locale,
  userName,
  role,
  department,
  functionalRoles,
  grantedPermissions,
  visibleViews,
  operationsTabs,
  videoEnabled,
  onOpenView,
}: {
  locale: Locale;
  userName: string;
  role: "admin" | "manager" | "employee";
  department: string;
  functionalRoles: string[];
  grantedPermissions: string[];
  visibleViews: SystemGuideView[];
  operationsTabs: string[];
  videoEnabled: boolean;
  onOpenView: (view: SystemGuideView) => void;
}) {
  const c = copy[locale];
  const [query, setQuery] = useState("");
  const permissionSet = useMemo(() => new Set(grantedPermissions), [grantedPermissions]);
  const root =
    role === "admin" ||
    permissionSet.has("*") ||
    functionalRoles.some((item) => item === "system_owner" || item === "system_admin");
  const viewSet = useMemo(() => new Set(visibleViews), [visibleViews]);
  const operationTabSet = useMemo(() => new Set(operationsTabs), [operationsTabs]);

  const supportsOperationTab = (tab?: string) => {
    if (!tab) return true;
    if (tab === "operations-core") {
      return ["orders", "timesheets", "capacity"].some((item) => operationTabSet.has(item));
    }
    return operationTabSet.has(tab);
  };

  const requirementAllowed = (requirement: Requirement) => {
    if (root) return true;
    if (requirement.rootOnly) return false;
    if (requirement.rolesAny?.length && !requirement.rolesAny.some((item) => functionalRoles.includes(item))) return false;
    if (requirement.anyOf?.length && !requirement.anyOf.some((item) => permissionSet.has(item))) return false;
    if (requirement.allOf?.length && !requirement.allOf.every((item) => permissionSet.has(item))) return false;
    return true;
  };

  const requirementText = (requirement: Requirement) => {
    const parts: string[] = [];
    if (requirement.rootOnly) {
      parts.push(
        [functionalRoleLabels.system_owner[locale], functionalRoleLabels.system_admin[locale]].join(orWord[locale]),
      );
    }
    if (requirement.rolesAny?.length) {
      parts.push(
        requirement.rolesAny
          .map((item) => functionalRoleLabels[item]?.[locale] || item)
          .join(orWord[locale]),
      );
    }
    if (requirement.allOf?.length) {
      parts.push(
        requirement.allOf
          .map((item) => permissionLabels[item]?.[locale] || item)
          .join(" + "),
      );
    }
    if (requirement.anyOf?.length) {
      parts.push(
        requirement.anyOf
          .map((item) => permissionLabels[item]?.[locale] || item)
          .join(orWord[locale]),
      );
    }
    return parts.length ? parts.join(" · ") : c.noRestriction;
  };

  const availablePages = useMemo(
    () =>
      pages
        .filter((page) => viewSet.has(page.view))
        .map((page) =>
          page.view === "operations"
            ? {
                ...page,
                sections: page.sections.filter((item) => supportsOperationTab(item.operationTab)),
                actions: page.actions.filter((item) => supportsOperationTab(item.operationTab)),
              }
            : page,
        ),
    // permission-independent page visibility comes directly from PortalDashboard.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [viewSet, operationTabSet],
  );

  const visiblePages = useMemo(() => {
    const term = query.trim().toLocaleLowerCase(locale);
    if (!term) return availablePages;
    return availablePages.filter((page) => {
      const haystack = [
        page.title[locale],
        page.description[locale],
        ...page.sections.map((item) => item.label[locale]),
        ...page.actions.flatMap((item) => [
          item.label[locale],
          item.detail[locale],
          requirementText(item),
        ]),
        ...page.steps[locale],
        page.caution[locale],
      ]
        .join(" ")
        .toLocaleLowerCase(locale);
      return haystack.includes(term);
    });
    // requirementText depends only on the values already included in these dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availablePages, locale, query]);

  const localizedRoles = functionalRoles.length
    ? functionalRoles.map((item) => functionalRoleLabels[item]?.[locale] || item)
    : [accountRoleLabels[role][locale]];
  const namedPermissions = grantedPermissions.filter((item) => item !== "*");
  const availableActionCount = availablePages.reduce(
    (total, page) =>
      total + page.actions.filter((item) => requirementAllowed(item)).length,
    0,
  );

  const sharedTools = [
    {
      key: "search",
      title: t("البحث الشامل", "Global Search", "সার্বিক অনুসন্ধান"),
      detail: t(
        "اكتب حرفين على الأقل من اسم العميل أو الموظف أو العامل أو العقد أو رقم المرجع. لا تظهر إلا النتائج التي يسمح حسابك بقراءتها، ثم تُفتح النتيجة في صفحتها الأصلية.",
        "Enter at least two characters from a client, employee, worker, contract, or reference. Only records your account may read appear, and the result opens in its source page.",
        "গ্রাহক, কর্মচারী, শ্রমিক, চুক্তি বা রেফারেন্সের অন্তত দুই অক্ষর লিখুন। আপনার পাঠযোগ্য রেকর্ডই আসে এবং ফল মূল পৃষ্ঠায় খোলে।",
      ),
    },
    {
      key: "language",
      title: t("لغة الواجهة", "Interface Language", "ইন্টারফেসের ভাষা"),
      detail: t(
        "يمكنك اختيار العربية أو الإنجليزية أو البنغالية. يتغير اتجاه الواجهة بين RTL وLTR، بينما تبقى البيانات والسجلات نفسها.",
        "Choose Arabic, English, or Bengali. The interface direction changes between RTL and LTR while records remain the same.",
        "আরবি, ইংরেজি বা বাংলা বাছুন। RTL ও LTR দিক বদলালেও রেকর্ড একই থাকে।",
      ),
    },
    ...(videoEnabled
      ? [
          {
            key: "video",
            title: t("مكتب المقابلات المرئية", "Video Interview Desk", "ভিডিও সাক্ষাৎকার ডেস্ক"),
            detail: t(
              permissionSet.has("video.manage") || root
                ? permissionSet.has("video.transfer") || root
                  ? "يظهر كنافذة مساعدة: يمكنك استقبال المقابلات وإدارتها وتحويلها وإنهاءها حسب الحالة."
                  : "يظهر كنافذة مساعدة: يمكنك استقبال المقابلات وإدارتها، لكن التحويل يحتاج صلاحية مستقلة."
                : "يظهر كنافذة مساعدة للعرض؛ إدارة المقابلة أو تحويلها تحتاج صلاحيات مستقلة.",
              permissionSet.has("video.manage") || root
                ? permissionSet.has("video.transfer") || root
                  ? "Appears as a helper window: you can receive, manage, transfer, and complete interviews."
                  : "Appears as a helper window: you can receive and manage interviews, while transfer requires a separate permission."
                : "Appears as a view-only helper window; managing or transferring requires separate permissions.",
              permissionSet.has("video.manage") || root
                ? permissionSet.has("video.transfer") || root
                  ? "সহায়ক উইন্ডো হিসেবে আসে: সাক্ষাৎকার গ্রহণ, পরিচালনা, হস্তান্তর ও সমাপ্ত করতে পারেন।"
                  : "সহায়ক উইন্ডো হিসেবে আসে: সাক্ষাৎকার গ্রহণ ও পরিচালনা পারেন; হস্তান্তরে আলাদা অনুমতি লাগে।"
                : "শুধু দেখার সহায়ক উইন্ডো; পরিচালনা বা হস্তান্তরে আলাদা অনুমতি লাগে।",
            ),
          },
        ]
      : []),
  ];

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
            <div><dt>{c.accountType}</dt><dd>{accountRoleLabels[role][locale]}</dd></div>
            <div><dt>{c.department}</dt><dd>{(departmentLabels[department] || departmentLabels.general)[locale]}</dd></div>
            <div className="guide-role-row"><dt>{c.assignedRoles}</dt><dd>{localizedRoles.join(" · ")}</dd></div>
            <div><dt>{c.pages}</dt><dd>{availablePages.length}</dd></div>
            <div><dt>{c.capabilities}</dt><dd>{root ? c.fullAccess : availableActionCount}</dd></div>
          </dl>
        </aside>
      </header>

      <label className="guide-search">
        <span aria-hidden="true">⌕</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={c.search}
          aria-label={c.search}
        />
        <kbd>⌘ K</kbd>
      </label>

      <section className="guide-access-note">
        <span aria-hidden="true">✓</span>
        <div>
          <h2>{c.accessTitle}</h2>
          <p>{c.accessBody}</p>
        </div>
      </section>

      <div className="guide-two-column">
        <section className="guide-card guide-start">
          <header><span>01</span><div><h2>{c.startTitle}</h2><p>{c.workflowBody}</p></div></header>
          <ol>{quickSteps[locale].map((step, index) => <li key={step}><b>{index + 1}</b><span>{step}</span></li>)}</ol>
        </section>

        <section className="guide-card guide-permissions">
          <header><span>02</span><div><h2>{c.permissionTitle}</h2><p>{c.permissionBody}</p></div></header>
          <div>
            {root ? (
              <span><b>{c.fullAccess}</b><code dir="ltr">*</code></span>
            ) : namedPermissions.length ? (
              namedPermissions.map((permission) => (
                <span key={permission} title={permission}>
                  <b>{permissionLabels[permission]?.[locale] || permission}</b>
                  <code dir="ltr">{permission}</code>
                </span>
              ))
            ) : (
              <p>{c.accessBody}</p>
            )}
          </div>
        </section>
      </div>

      <section className="guide-card guide-workflow">
        <header><span>03</span><div><h2>{c.workflowTitle}</h2><p>{c.workflowBody}</p></div></header>
        <ol>{workflowSteps[locale].map((step, index) => <li key={step}><b>{String(index + 1).padStart(2, "0")}</b><span>{step}</span></li>)}</ol>
      </section>

      <section className="guide-modules">
        <header>
          <div><span>04</span><div><h2>{c.modulesTitle}</h2><p>{c.modulesBody}</p></div></div>
          <b>{visiblePages.length}/{availablePages.length}</b>
        </header>
        <div>
          {visiblePages.map((page, index) => {
            const availableActions = page.actions.filter((item) => requirementAllowed(item));
            const unavailableActions = page.actions.filter((item) => !requirementAllowed(item));
            return (
              <details key={page.view} open={!query && index === 0}>
                <summary>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <strong>{page.title[locale]}</strong>
                    <small>{page.description[locale]}</small>
                  </div>
                  <b>{availableActions.length}/{page.actions.length}</b>
                  <i aria-hidden="true">＋</i>
                </summary>
                <div className="guide-page-body">
                  <section className="guide-page-section">
                    <h3>{c.sectionsTitle}</h3>
                    <ul className="guide-page-sections">
                      {page.sections.map((item) => <li key={item.label[locale]}>{item.label[locale]}</li>)}
                    </ul>
                  </section>

                  <section className="guide-page-section">
                    <h3>{c.availableTitle}</h3>
                    <div className="guide-page-actions">
                      {availableActions.map((item) => (
                        <article className="guide-action available" key={item.label[locale]}>
                          <span aria-hidden="true">✓</span>
                          <div>
                            <strong>{item.label[locale]}</strong>
                            <p>{item.detail[locale]}</p>
                            <small>{c.requirement}: {requirementText(item)}</small>
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>

                  {unavailableActions.length > 0 && (
                    <section className="guide-page-section">
                      <h3>{c.unavailableTitle}</h3>
                      <p className="guide-restricted-intro">{c.unavailableBody}</p>
                      <div className="guide-page-actions">
                        {unavailableActions.map((item) => (
                          <article className="guide-action unavailable" key={item.label[locale]}>
                            <span aria-hidden="true">—</span>
                            <div>
                              <strong>{item.label[locale]}</strong>
                              <p>{item.detail[locale]}</p>
                              <small>{c.requirement}: {requirementText(item)}</small>
                            </div>
                          </article>
                        ))}
                      </div>
                    </section>
                  )}

                  <section className="guide-page-section guide-page-steps">
                    <h3>{c.stepsTitle}</h3>
                    <ol>{page.steps[locale].map((step) => <li key={step}>{step}</li>)}</ol>
                  </section>

                  <aside className="guide-caution">
                    <strong>{c.cautionTitle}</strong>
                    <p>{page.caution[locale]}</p>
                  </aside>

                  <button className="guide-open-page" type="button" onClick={() => onOpenView(page.view)}>
                    {c.openPage}: {page.title[locale]}
                    <span aria-hidden="true">←</span>
                  </button>
                </div>
              </details>
            );
          })}
        </div>
        {!visiblePages.length && <p className="guide-empty">{c.noPages}</p>}
      </section>

      <section className="guide-card guide-tools">
        <header><span>05</span><div><h2>{c.toolsTitle}</h2><p>{c.toolsBody}</p></div></header>
        <div>
          {sharedTools.map((tool) => (
            <article key={tool.key}>
              <strong>{tool.title[locale]}</strong>
              <p>{tool.detail[locale]}</p>
            </article>
          ))}
        </div>
      </section>

      <div className="guide-two-column guide-closing">
        <section className="guide-card guide-notes">
          <header><span>06</span><div><h2>{c.notesTitle}</h2><p>{c.notesBody}</p></div></header>
          <p className="guide-note-example">{c.notesExample}</p>
          <blockquote>{c.notesRule}</blockquote>
        </section>
        <section className="guide-card guide-security">
          <header><span>07</span><div><h2>{c.securityTitle}</h2></div></header>
          <ul>{c.securityRules.map((rule) => <li key={rule}>{rule}</li>)}</ul>
        </section>
      </div>
    </section>
  );
}
