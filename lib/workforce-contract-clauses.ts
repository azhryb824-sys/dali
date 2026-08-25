export type WorkforceContractDirection = "dali_supplier" | "dali_purchaser";

export type WorkforceContractClause = {
  section: string;
  sectionEn?: string;
  title: string;
  titleEn?: string;
  body: string;
  bodyEn?: string;
  included: boolean;
};

const shared: WorkforceContractClause[] = [
  { section: "الأحكام التمهيدية", title: "التمهيد والملاحق", body: "يعد التمهيد ونطاق العمل وجداول المهن والأعداد والأسعار والدفعات والملاحق والتعاميد والمراسلات المعتمدة جزءاً مكملاً لهذا العقد ومفسراً له.", included: true },
  { section: "مدة العقد والتنفيذ", title: "مدة العقد والمباشرة", body: "تبدأ مدة العقد من تاريخ مباشرة العمالة المثبت بمحضر أو كشف حضور معتمد، وتنتهي في التاريخ المحدد بالعقد، ولا تمدد أو تجدد إلا بمستند كتابي معتمد من الطرفين.", included: true },
  { section: "مدة العقد والتنفيذ", title: "مواقع العمل والتغيير", body: "تنفذ الخدمة في المواقع المحددة، ولا يجوز تغيير الموقع أو طبيعة المهام تغييراً جوهرياً إلا بموافقة كتابية، وتوثق أي زيادة أو خفض في العمالة بتعميد أو ملحق معتمد.", included: true },
  { section: "التشغيل والسلامة", title: "ساعات العمل والراحة", body: "تحدد ساعات العمل والورديات والراحة الأسبوعية في نطاق العقد، وتحتسب الساعات الإضافية والخدمات الخارجة عن النطاق وفق موافقة كتابية وتسعير معتمد.", included: true },
  { section: "التشغيل والسلامة", title: "السلامة والمسؤولية في الموقع", body: "يلتزم الطرف المشرف على موقع العمل بتوفير بيئة عمل آمنة وتعليمات الموقع ومستلزمات الوقاية الخاصة بالمهمة، ويلتزم الطرفان بالتحقيق المشترك في الحوادث وتحديد المسؤولية وفق الوقائع والمستندات.", included: true },
  { section: "التشغيل والسلامة", title: "الغياب والاستبدال", body: "يثبت الغياب والملاحظات التشغيلية في كشف أو إشعار معتمد، ويعالج الطرف المورد النقص أو يستبدل العامل خلال اثنتين وسبعين ساعة متى كان البديل متاحاً، وتسوّى الأيام غير المنفذة في الفاتورة ذات الصلة.", included: true },
  { section: "الفوترة والسداد", title: "كشف الحضور والفاتورة", body: "يعتمد كشف الحضور والانصراف في اليوم الأخير من دورة العمل الشهرية، وتصدر الفاتورة بعد اعتماده، وتستحق في التاريخ المبين بجدول الدفعات أو خلال عشرة أيام من إصدارها عند عدم تحديد تاريخ مستقل.", included: true },
  { section: "الفوترة والسداد", title: "الضريبة والتسويات", body: "تظهر ضريبة القيمة المضافة بصورة مستقلة متى كانت مفعلة، ولا يجوز الخصم أو المقاصة أو تعديل قيمة الفاتورة إلا بمستند معتمد يبين السبب والقيمة، مع إصدار التسوية المالية اللازمة.", included: true },
  { section: "السرية والاتصالات", title: "السرية وحماية البيانات", body: "يحافظ الطرفان على سرية المعلومات والبيانات الشخصية والتشغيلية والمالية، ويقصران استخدامها على تنفيذ العقد، ولا يفصحان عنها إلا في حدود الحاجة أو بموافقة مكتوبة.", included: true },
  { section: "السرية والاتصالات", title: "الإشعارات", body: "تعد المراسلات الصادرة عبر العناوين والبريد الإلكتروني وأرقام الاتصال المسجلة وسائل إخطار معتمدة، ويلتزم كل طرف بإبلاغ الآخر كتابة بأي تغيير يطرأ عليها.", included: true },
  { section: "الإنهاء والتسوية", title: "الإخلال والمعالجة", body: "يجوز للطرف المتضرر إشعار الطرف المخل ومنحه ثلاثين يوماً لمعالجة الإخلال الجوهري، ما لم يرد في العقد استثناء صريح لحالة تستوجب التعليق أو الإنهاء الفوري.", included: true },
  { section: "الإنهاء والتسوية", title: "أثر الإنهاء", body: "لا يمس انتهاء العقد أو إلغاؤه الحقوق والمبالغ المستحقة حتى تاريخ نفاذ الإنهاء، وتوقف الالتزامات والدفعات المستقبلية غير المكتسبة وتجرى التسويات المحاسبية بمستندات مستقلة.", included: true },
  { section: "الإنهاء والتسوية", title: "التسوية الودية", body: "يسعى الطرفان إلى تسوية أي خلاف ودياً خلال خمسة عشر يوماً من تاريخ الإشعار به، مع استمرار تنفيذ الالتزامات التي لا يشملها النزاع متى كان ذلك ممكناً.", included: true },
  { section: "الاعتماد", title: "النسخ والاعتماد", body: "حرر العقد إلكترونياً من نسختين متطابقتين، ولا يصبح نافذاً إلا بعد اعتماده وتوقيعه من الطرفين، ويحتفظ النظام بسجل الإصدارات والتعديلات المرتبطة به.", included: true },
];

const supplier: WorkforceContractClause[] = [
  { section: "التزامات دالي بصفتها المورد", title: "التوريد والإشراف", body: "تلتزم دالي بتوفير العمالة وفق المهن والأعداد المعتمدة والإشراف الإداري عليها وتزويد الطرف المشتري بقائمة الأسماء والوثائق التشغيلية المتفق عليها.", included: true },
  { section: "التزامات دالي بصفتها المورد", title: "الرواتب والالتزامات الإدارية", body: "تتولى دالي الرواتب والالتزامات الإدارية الواقعة عليها تجاه العمالة، ولا يجوز للطرف المشتري تكليف العامل بمهنة أو مهمة تختلف جوهرياً عن نطاق العقد.", included: true },
  { section: "التزامات الطرف المشتري", title: "الحضور والتوجيه اليومي", body: "يتولى الطرف المشتري تنظيم العمل اليومي واعتماد الحضور والانصراف وتزويد دالي بالكشف في الموعد المحدد، ويعد العامل مستحقاً للمقابل إذا تعذر تشغيله لسبب يرجع إلى الطرف المشتري بعد مباشرته.", included: true },
  { section: "التزامات الطرف المشتري", title: "السكن والنقل والإعاشة", body: "يتحمل الطرف المحدد في نطاق العقد مسؤولية السكن والنقل والإعاشة والزي، ولا تنتقل أي منها إلى الطرف الآخر إلا بموافقة مكتوبة تبين المقابل والأثر المالي.", included: true },
  { section: "الفوترة والسداد", title: "التأخر في السداد", body: "إذا تأخر الطرف المشتري عن سداد مبلغ مستحق بعد إشعاره، جاز لدالي تعليق الخدمة وسحب العمالة أو إنهاء العقد وفق الإجراء المعتمد، مع بقاء الفاتورة والخسائر المثبتة مستحقة.", included: true },
  { section: "حماية العلاقة التجارية", title: "عدم الاستقطاب", body: "لا يجوز للطرف المشتري استقطاب أو تشغيل العمالة المقدمة بموجب العقد مباشرة أو بواسطة طرف آخر أثناء سريان العقد ولمدة سنتين بعد انتهائه إلا بموافقة كتابية من دالي.", included: true },
];

const purchaser: WorkforceContractClause[] = [
  { section: "التزامات دالي بصفتها المشتري", title: "الحضور والتوجيه اليومي", body: "تتولى دالي تنظيم العمل اليومي واعتماد الحضور والانصراف وتزويد الطرف المورد بالكشف في الموعد المحدد، وتدفع القيم المعتمدة وفق جدول الاستحقاق.", included: true },
  { section: "التزامات دالي بصفتها المشتري", title: "السكن والنقل والزي", body: "تتحمل الجهة المحددة في نطاق العقد مسؤولية السكن والنقل والإعاشة والزي، ولا يجوز تحميل دالي تكلفة إضافية غير معتمدة كتابة.", included: true },
  { section: "التزامات الطرف المورد", title: "التوريد والإشراف", body: "يلتزم الطرف المورد بتوفير العمالة وفق المهن والأعداد والمواعيد المعتمدة والإشراف الإداري عليها وتسليم قائمة الأسماء والوثائق التشغيلية المطلوبة قبل المباشرة.", included: true },
  { section: "التزامات الطرف المورد", title: "النقص والاستبدال", body: "يلتزم الطرف المورد باستكمال النقص واستبدال العمالة غير المناسبة أو المتغيبة خلال اثنتين وسبعين ساعة من الإشعار، وتخصم الأيام أو الأعداد غير المنفذة من مستحقاته.", included: true },
  { section: "التزامات الطرف المورد", title: "مسؤولية الوثائق والغرامات", body: "يتحمل الطرف المورد صحة وسريان الوثائق التي يلتزم بتقديمها ويتحمل الغرامات أو الأضرار المثبتة الناتجة عن نقصها أو عدم صحتها متى كان السبب راجعاً إليه.", included: true },
  { section: "الجزاءات", title: "التأخر في التوريد", body: "عند تأخر الطرف المورد في توفير العدد المعتمد بعد تاريخ المباشرة، تطبق غرامة يومية بالقيمة المحددة في بيانات العقد وبحد أقصى متفق عليه، ولا يمنع ذلك دالي من المطالبة بالضرر الفعلي المثبت.", included: true },
  { section: "الإنهاء والتسوية", title: "فشل التوريد", body: "يجوز لدالي إنهاء العقد إذا استمر نقص التوريد أكثر من خمسة أيام عمل بعد إشعار الطرف المورد، مع تسوية قيمة الخدمة المنفذة والخصومات والجزاءات المستحقة.", included: true },
];

const jurisdiction: WorkforceContractClause = {
  section: "الإنهاء والتسوية",
  title: "النظام والاختصاص",
  body: "يخضع هذا العقد للأنظمة السارية في المملكة العربية السعودية، وعند تعذر التسوية الودية يكون الاختصاص للجهة القضائية المختصة.",
  included: true,
};

const englishDefaults: Record<string, { sectionEn: string; titleEn: string; bodyEn: string }> = {
  "التمهيد والملاحق": { sectionEn: "Preliminary Provisions", titleEn: "Recitals and Appendices", bodyEn: "The recitals, scope of work, profession, quantity, price and payment schedules, appendices, assignments and approved correspondence form an integral and interpretive part of this Contract." },
  "مدة العقد والمباشرة": { sectionEn: "Term and Performance", titleEn: "Term and Mobilization", bodyEn: "The Contract term starts on the manpower mobilization date evidenced by an approved handover or attendance record and ends on the stated expiry date. It may only be extended or renewed by a written instrument approved by both Parties." },
  "مواقع العمل والتغيير": { sectionEn: "Term and Performance", titleEn: "Worksites and Changes", bodyEn: "Services shall be performed at the stated worksites. No material change to the site or duties is permitted without written approval, and any increase or reduction in manpower shall be recorded in an approved assignment or amendment." },
  "ساعات العمل والراحة": { sectionEn: "Operations and Safety", titleEn: "Working Hours and Rest", bodyEn: "Working hours, shifts and weekly rest shall be stated in the Contract scope. Overtime and out-of-scope services shall be calculated under written approval and agreed pricing." },
  "السلامة والمسؤولية في الموقع": { sectionEn: "Operations and Safety", titleEn: "Worksite Safety and Liability", bodyEn: "The Party supervising the worksite shall provide a safe workplace, site instructions and task-specific protective equipment. The Parties shall jointly investigate incidents and determine responsibility from documented facts." },
  "الغياب والاستبدال": { sectionEn: "Operations and Safety", titleEn: "Absence and Replacement", bodyEn: "Absence and performance observations shall be recorded in an approved attendance record or notice. The Supplier shall remedy shortages or replace a worker within seventy-two hours when a replacement is available, and unperformed days shall be settled in the relevant invoice." },
  "كشف الحضور والفاتورة": { sectionEn: "Invoicing and Payment", titleEn: "Attendance and Invoice", bodyEn: "Attendance shall be approved on the final day of the monthly service cycle. The invoice shall be issued after approval and shall fall due on the payment schedule date or within ten days of issue when no separate due date is stated." },
  "الضريبة والتسويات": { sectionEn: "Invoicing and Payment", titleEn: "VAT and Adjustments", bodyEn: "VAT shall be shown separately when enabled. No deduction, set-off or invoice adjustment is permitted without an approved document stating the reason and amount and the corresponding financial adjustment." },
  "السرية وحماية البيانات": { sectionEn: "Confidentiality and Communications", titleEn: "Confidentiality and Data Protection", bodyEn: "Both Parties shall protect confidential, personal, operational and financial information, use it only to perform this Contract and disclose it solely on a need-to-know basis or with written approval." },
  "الإشعارات": { sectionEn: "Confidentiality and Communications", titleEn: "Notices", bodyEn: "Correspondence sent through the registered addresses, email accounts and contact numbers constitutes approved notice. Each Party shall notify the other in writing of any change." },
  "الإخلال والمعالجة": { sectionEn: "Termination and Settlement", titleEn: "Breach and Cure", bodyEn: "The affected Party may notify the breaching Party and allow thirty days to cure a material breach unless this Contract expressly provides for immediate suspension or termination in a specific case." },
  "أثر الإنهاء": { sectionEn: "Termination and Settlement", titleEn: "Effect of Termination", bodyEn: "Termination or cancellation does not affect accrued rights and amounts through its effective date. Unearned future obligations and installments shall cease and the required accounting adjustments shall be documented separately." },
  "التسوية الودية": { sectionEn: "Termination and Settlement", titleEn: "Amicable Settlement", bodyEn: "The Parties shall seek to settle disputes amicably within fifteen days after notice while continuing unaffected obligations whenever reasonably possible." },
  "النسخ والاعتماد": { sectionEn: "Approval", titleEn: "Counterparts and Approval", bodyEn: "This Contract is electronically issued in two identical counterparts and becomes effective only after approval and signature by both Parties. The system shall retain its linked versions and amendments." },
  "التوريد والإشراف": { sectionEn: "Supply Obligations", titleEn: "Supply and Supervision", bodyEn: "The manpower Supplier shall provide the approved professions and numbers, maintain administrative supervision and provide the agreed personnel list and operational documents." },
  "الرواتب والالتزامات الإدارية": { sectionEn: "Dali Obligations as Supplier", titleEn: "Payroll and Administrative Obligations", bodyEn: "Dali shall manage payroll and its administrative obligations toward the manpower. The Purchaser shall not assign a worker to a profession or duty materially outside the Contract scope." },
  "الحضور والتوجيه اليومي": { sectionEn: "Purchaser Obligations", titleEn: "Attendance and Daily Direction", bodyEn: "The Purchaser shall organize daily work, approve attendance and deliver the record on time. Compensation remains due when a mobilized worker cannot be utilized for a reason attributable to the Purchaser." },
  "السكن والنقل والإعاشة": { sectionEn: "Purchaser Obligations", titleEn: "Accommodation, Transport and Subsistence", bodyEn: "The Party identified in the Contract scope shall bear accommodation, transport, subsistence and uniform responsibilities. No responsibility transfers without written approval stating its price and financial effect." },
  "التأخر في السداد": { sectionEn: "Invoicing and Payment", titleEn: "Late Payment", bodyEn: "If the Purchaser delays an amount after notice, Dali may suspend services, withdraw manpower or terminate under the approved procedure, without prejudice to the invoice and documented losses." },
  "عدم الاستقطاب": { sectionEn: "Commercial Relationship Protection", titleEn: "Non-Solicitation", bodyEn: "The Purchaser shall not directly or indirectly recruit or employ manpower supplied under this Contract during its term and for two years afterward without Dali's written approval." },
  "السكن والنقل والزي": { sectionEn: "Dali Obligations as Purchaser", titleEn: "Accommodation, Transport and Uniform", bodyEn: "The Party identified in the Contract scope shall bear accommodation, transport, subsistence and uniform obligations. Dali shall not bear any unapproved additional cost." },
  "النقص والاستبدال": { sectionEn: "Supplier Obligations", titleEn: "Shortage and Replacement", bodyEn: "The Supplier shall complete shortages and replace unsuitable or absent manpower within seventy-two hours after notice. Unperformed days or quantities shall be deducted from its entitlements." },
  "مسؤولية الوثائق والغرامات": { sectionEn: "Supplier Obligations", titleEn: "Document and Penalty Responsibility", bodyEn: "The Supplier is responsible for the validity and accuracy of the documents it must provide and for documented penalties or losses caused by their deficiency or inaccuracy when attributable to the Supplier." },
  "التأخر في التوريد": { sectionEn: "Penalties", titleEn: "Supply Delay", bodyEn: "If the Supplier delays the approved manpower after the mobilization date, the daily penalty stated in the Contract data shall apply up to the agreed cap, without limiting Dali's right to proven actual loss." },
  "فشل التوريد": { sectionEn: "Termination and Settlement", titleEn: "Failure to Supply", bodyEn: "Dali may terminate if a supply shortage continues for more than five business days after notice. Performed services, deductions and accrued penalties shall then be settled." },
  "النظام والاختصاص": { sectionEn: "Termination and Settlement", titleEn: "Governing Law and Jurisdiction", bodyEn: "This Contract is governed by the applicable laws of the Kingdom of Saudi Arabia. If amicable settlement fails, the competent judicial authority shall have jurisdiction." },
};

function withEnglish(item: WorkforceContractClause) { return { ...item, ...(englishDefaults[item.title] || {}) }; }

export function defaultWorkforceContractClauses(direction: WorkforceContractDirection, includeJurisdiction = false) {
  const directional = direction === "dali_purchaser" ? purchaser : supplier;
  const clauses = [...shared.slice(0, 2), ...directional, ...shared.slice(2)];
  return (includeJurisdiction ? [...clauses, jurisdiction] : clauses).map(withEnglish);
}

const forbiddenDisclosure = /أجير|كفال|كفيل|ajeer|sponsor/i;
const saudiJurisdiction = /الأنظمة\s+(?:السارية|المعمول بها)\s+في\s+(?:المملكة العربية السعودية|السعودية)|laws?\s+of\s+(?:the\s+)?kingdom\s+of\s+saudi\s+arabia/i;

export function parseWorkforceContractClauses(value: unknown, direction: WorkforceContractDirection, allWorkersWithAjir: boolean) {
  let raw = value;
  if (typeof raw === "string") { try { raw = JSON.parse(raw); } catch { raw = null; } }
  const source = Array.isArray(raw) && raw.length ? raw : defaultWorkforceContractClauses(direction, allWorkersWithAjir);
  const clauses = source.slice(0, 80).map((item) => {
    const row = item && typeof item === "object" ? item as Record<string, unknown> : {};
    return {
      section: String(row.section || "بنود إضافية").trim().slice(0, 120),
      sectionEn: String(row.sectionEn || "Additional Terms").trim().slice(0, 160),
      title: String(row.title || "").trim().slice(0, 180),
      titleEn: String(row.titleEn || "").trim().slice(0, 220),
      body: String(row.body || "").trim().slice(0, 4000),
      bodyEn: String(row.bodyEn || "").trim().slice(0, 6000),
      included: row.included !== false,
    };
  }).filter((item) => item.section.length >= 2 && item.title.length >= 2 && item.body.length >= 5);
  return clauses.filter((item) => !forbiddenDisclosure.test(`${item.section} ${item.title} ${item.body}`) && (allWorkersWithAjir || !saudiJurisdiction.test(item.body)));
}

export function publicManpowerText(value?: string | null) {
  if (!value) return value || "";
  return value.split(/(?<=[.!؟\n])|\s*\|\s*/).filter((part) => !forbiddenDisclosure.test(part)).join(" ").replace(/\s+/g, " ").trim();
}
