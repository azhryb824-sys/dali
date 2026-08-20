import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { portalSettings } from "@/db/schema";
import { insights } from "@/lib/insights";
import { serviceCatalog } from "@/lib/service-catalog";

export type PublicationStatus = "draft" | "published";
export type WebsiteCollectionKey = "services" | "sectors" | "locations" | "projects" | "credentials" | "articles" | "jobs" | "partners";

export type ManagedFaq = { question: string; answer: string };
export type ManagedBlock = { title: string; text: string; checklist: string[] };
export type ManagedEntry = {
  id: string;
  slug: string;
  title: string;
  shortTitle: string;
  summary: string;
  body: string;
  image: string;
  imageAlt: string;
  status: PublicationStatus;
  featured: boolean;
  sortOrder: number;
  seoTitle: string;
  seoDescription: string;
  focusKeywords: string;
  tags: string[];
  checklist: string[];
  blocks: ManagedBlock[];
  faqs: ManagedFaq[];
  publishedAt: string;
  updatedAt: string;
};

export type WebsiteContent = {
  version: number;
  updatedAt: string;
  updatedBy: string;
  site: {
    companyName: string;
    shortName: string;
    tagline: string;
    description: string;
    city: string;
    district: string;
    address: string;
    phone: string;
    email: string;
    commercialRegistration: string;
    vatNumber: string;
    googleBusinessUrl: string;
    mapUrl: string;
  };
  seo: {
    homeTitle: string;
    homeDescription: string;
    organizationDescription: string;
    focusKeywords: string;
  };
  home: {
    heroKicker: string;
    heroTitle: string;
    heroAccent: string;
    heroDescription: string;
    aboutTitle: string;
    aboutDescription: string;
    servicesTitle: string;
    servicesDescription: string;
    sectorsTitle: string;
    sectorsDescription: string;
    localTitle: string;
    localDescription: string;
    quoteTitle: string;
    quoteDescription: string;
    professions: string[];
    process: { title: string; text: string }[];
  };
  visibility: {
    hajj: boolean;
    services: boolean;
    sectors: boolean;
    locations: boolean;
    projects: boolean;
    credentials: boolean;
    articles: boolean;
    jobs: boolean;
    partners: boolean;
    faq: boolean;
  };
  collections: Record<WebsiteCollectionKey, ManagedEntry[]>;
  faq: ManagedFaq[];
};

export const WEBSITE_CONTENT_KEY = "website-content-v1";
const TODAY = "2026-08-14";

function makeId(prefix: string, slug: string) {
  return `${prefix}-${slug}`;
}

function defaultServiceEntries(): ManagedEntry[] {
  return serviceCatalog.map((service, index) => ({
    id: makeId("service", service.slug),
    slug: service.slug,
    title: service.title,
    shortTitle: service.shortTitle,
    summary: service.description,
    body: service.intro,
    image: service.image,
    imageAlt: service.imageAlt,
    status: "published",
    featured: true,
    sortOrder: index + 1,
    seoTitle: service.seoTitle,
    seoDescription: service.description,
    focusKeywords: `${service.shortTitle}، توفير عمالة مكة، شركة تشغيل وصيانة مكة، عمالة للشركات في مكة`,
    tags: service.suitableFor,
    checklist: service.requestChecklist,
    blocks: [
      ...service.scope.map((item) => ({ title: item.title, text: item.text, checklist: [] })),
      ...service.process.map((item) => ({ title: `خطوة: ${item.title}`, text: item.text, checklist: [] })),
    ],
    faqs: service.faq.map((item) => ({ question: item.q, answer: item.a })),
    publishedAt: service.updatedAt,
    updatedAt: service.updatedAt,
  }));
}

function defaultArticleEntries(): ManagedEntry[] {
  return insights.map((insight, index) => ({
    id: makeId("article", insight.slug),
    slug: insight.slug,
    title: insight.title,
    shortTitle: insight.title,
    summary: insight.excerpt,
    body: insight.description,
    image: "/images/dali-capabilities.webp",
    imageAlt: "بيئة تشغيل وصيانة منظمة خالية من الكائنات الحية",
    status: "published",
    featured: index < 3,
    sortOrder: index + 1,
    seoTitle: insight.seoTitle,
    seoDescription: insight.description,
    focusKeywords: `${insight.seoTitle}، تشغيل وصيانة مكة، توفير عمالة في مكة`,
    tags: insight.relatedServiceSlugs,
    checklist: [],
    blocks: insight.sections.map((section) => ({
      title: section.heading,
      text: section.paragraphs.join("\n\n"),
      checklist: section.checklist ?? [],
    })),
    faqs: [],
    publishedAt: insight.publishedAt,
    updatedAt: insight.updatedAt,
  }));
}

const sectors: ManagedEntry[] = [
  {
    id: "sector-hotels-hospitality", slug: "hotels-hospitality", title: "حلول القوى العاملة للفنادق والضيافة في مكة", shortTitle: "الفنادق والضيافة",
    summary: "دعم احتياجات الفنادق ومرافق الضيافة بفرق تشغيل وصيانة وخدمات مساندة بحسب المهن والورديات والموسم.",
    body: "نساعد منشآت الضيافة في مكة على مواكبة تغير الإشغال والمواسم بفرق تشغيل وصيانة وخدمات مساندة مرنة، تراعي طبيعة كل مرفق ووردياته وأولويات تجربة الضيف.",
    image: "/images/dali-mecca.webp", imageAlt: "منشآت ضيافة ومبانٍ حديثة خالية في مكة المكرمة", status: "published", featured: true, sortOrder: 1,
    seoTitle: "توفير عمالة للفنادق والضيافة في مكة", seoDescription: "حلول توفير عمالة وفرق تشغيل وصيانة للفنادق ومنشآت الضيافة في مكة المكرمة وفق المهن والورديات والموسم.",
    focusKeywords: "توفير عمالة فنادق مكة، عمالة ضيافة مكة، تشغيل وصيانة فنادق مكة", tags: ["الفنادق", "الضيافة", "موسم الحج"], checklist: ["عدد المواقع والورديات", "المهن والمهام", "موعد البداية والمدة", "متطلبات الدخول والتدريب"],
    blocks: [{ title: "تغطية تناسب التشغيل", text: "نوزع الاحتياج بحسب الورديات والمواقع ونقاط الخدمة لتبقى المنشأة جاهزة في أوقات الطلب.", checklist: [] }, { title: "جاهزية للمواسم", text: "نستعد معك قبل فترات ارتفاع الإشغال بخيارات مرنة تقلل أثر النقص المفاجئ.", checklist: [] }],
    faqs: [{ question: "ما البيانات اللازمة لطلب عمالة لفندق في مكة؟", answer: "المهن والأعداد والمهام والورديات والموقع وموعد البداية والمدة وأي متطلبات دخول أو تدريب خاصة بالمنشأة." }], publishedAt: TODAY, updatedAt: TODAY,
  },
  {
    id: "sector-commercial-facilities", slug: "commercial-facilities", title: "قوى عاملة للمنشآت التجارية والإدارية في مكة", shortTitle: "المنشآت التجارية والإدارية",
    summary: "فرق تشغيلية وفنية لدعم المنشآت التجارية والإدارية والمجمعات وفق نطاق واضح ومتابعة مرتبطة بالموقع.",
    body: "نهيئ للمنشآت التجارية والإدارية فرقًا فنية وتشغيلية تلائم ساعات العمل وطبيعة المرفق، وتدعم استمرارية الخدمة وراحة الموظفين والزوار.",
    image: "/images/dali-capabilities.webp", imageAlt: "مرفق تجاري منظم خالٍ من الكائنات الحية", status: "published", featured: true, sortOrder: 2,
    seoTitle: "عمالة تشغيل وصيانة للمنشآت التجارية في مكة", seoDescription: "توفير كوادر تشغيل وصيانة وخدمات مساندة للمنشآت التجارية والإدارية في مكة المكرمة.",
    focusKeywords: "عمالة منشآت تجارية مكة، تشغيل وصيانة مباني مكة، فنيين صيانة مكة", tags: ["المجمعات التجارية", "المكاتب", "المرافق"], checklist: ["نوع المنشأة ومساحتها التشغيلية", "ساعات التشغيل", "المهن المطلوبة", "نطاق المسؤوليات"],
    blocks: [{ title: "خدمة واضحة النتائج", text: "نتفق على الأعمال الدورية والاستجابة والمسؤوليات لتعرف منشأتك ما الذي ستحصل عليه منذ البداية.", checklist: [] }], faqs: [], publishedAt: TODAY, updatedAt: TODAY,
  },
  {
    id: "sector-logistics-warehouses", slug: "logistics-warehouses", title: "عمالة للمستودعات والخدمات اللوجستية في مكة", shortTitle: "المستودعات والخدمات اللوجستية",
    summary: "توفير عمالة تشغيلية وفنية للمستودعات ومواقع الخدمات اللوجستية وفق الأحجام والورديات ومتطلبات السلامة.",
    body: "ندعم المستودعات والمواقع اللوجستية بقوى عاملة تناسب حجم المناولة والورديات ومتطلبات السلامة، لتبقى الحركة اليومية أكثر انسيابية واستعدادًا لتغير الطلب.",
    image: "/images/dali-capabilities.webp", imageAlt: "مستودع حديث منظم وخالٍ من الكائنات الحية", status: "published", featured: true, sortOrder: 3,
    seoTitle: "توفير عمالة مستودعات وخدمات لوجستية في مكة", seoDescription: "حلول توفير عمالة للمستودعات والخدمات اللوجستية في مكة بحسب المهام والورديات والمدة.",
    focusKeywords: "عمالة مستودعات مكة، عمال تحميل وتنزيل مكة، عمالة لوجستية مكة", tags: ["المستودعات", "اللوجستيات", "الورديات"], checklist: ["نوع المهام وحجم العمل", "الورديات", "متطلبات المعدات والسلامة", "المدة والموقع"], blocks: [], faqs: [], publishedAt: TODAY, updatedAt: TODAY,
  },
  {
    id: "sector-construction-projects", slug: "construction-projects", title: "قوى عاملة للمشروعات الإنشائية في مكة", shortTitle: "المشروعات الإنشائية",
    summary: "عمالة وفنيون للمشروعات ومراحل التنفيذ وفق البرنامج والمهن والأعداد والورديات.",
    body: "شركة دالي ليست شركة مقاولات؛ ويقتصر هذا النطاق على توفير القوى العاملة والفرق الفنية للمشروعات وفق العقد والمتطلبات النظامية السارية.",
    image: "/images/dali-hero.webp", imageAlt: "مشروع وبنية تحتية خالية من الكائنات الحية", status: "published", featured: true, sortOrder: 4,
    seoTitle: "توفير عمالة للمشروعات الإنشائية في مكة", seoDescription: "توفير عمالة وفنيين للمشروعات الإنشائية في مكة حسب المراحل والمهن والأعداد والورديات.",
    focusKeywords: "توفير عمالة مشاريع مكة، عمالة إنشائية مكة، فنيين مشاريع مكة", tags: ["المشروعات", "الإنشاءات", "الفنيون"], checklist: ["المرحلة والبرنامج", "المهن والأعداد", "الورديات", "اشتراطات الموقع"], blocks: [], faqs: [], publishedAt: TODAY, updatedAt: TODAY,
  },
  {
    id: "sector-seasonal-hajj", slug: "seasonal-hajj", title: "فرق تشغيل وخدمات مساندة لموسم الحج في مكة", shortTitle: "التشغيل الموسمي والحج",
    summary: "تخطيط احتياج الفرق الموسمية حسب المواقع والفترات والمهن والورديات والبدائل قبل بدء التشغيل.",
    body: "نساعدك على الاستعداد المبكر لموسم الحج والذروة بفرق موزعة حسب المواقع والفترات والمهن، مع خيارات بديلة تقلل أثر الغياب أو الارتفاع المفاجئ في الطلب.",
    image: "/images/hajj-readiness.webp", imageAlt: "بنية تشغيل موسمية خالية في مكة المكرمة", status: "published", featured: true, sortOrder: 5,
    seoTitle: "توفير عمالة موسم الحج في مكة", seoDescription: "تخطيط وتوفير فرق تشغيل وخدمات مساندة لموسم الحج في مكة وفق المواقع والمهن والورديات والبدائل.",
    focusKeywords: "توفير عمالة موسم الحج مكة، عمالة موسمية مكة، فرق تشغيل الحج", tags: ["موسم الحج", "العمالة الموسمية", "التشغيل"], checklist: ["المواقع والفترات", "المهن والأعداد", "الورديات", "خطة البدائل"], blocks: [], faqs: [], publishedAt: TODAY, updatedAt: TODAY,
  },
];

const locations: ManagedEntry[] = [{
  id: "location-makkah", slug: "makkah", title: "توفير العمالة والتشغيل والصيانة في مكة المكرمة", shortTitle: "مكة المكرمة",
  summary: "حلول قوى عاملة وفرق تشغيل وصيانة للمشروعات والمنشآت في مكة، انطلاقًا من مقر شركة دالي في حي الرصيفة.",
  body: "من مقرنا في حي الرصيفة نخدم احتياجات المنشآت والمشروعات في مكة بفهم محلي لطبيعة المدينة ومواسمها. نهيئ حلول قوى عاملة وتشغيل وصيانة تناسب الموقع والمهن والورديات والمدة المطلوبة.",
  image: "/images/dali-mecca.webp", imageAlt: "مبانٍ وبنية تحتية حديثة خالية في مكة المكرمة", status: "published", featured: true, sortOrder: 1,
  seoTitle: "شركة توفير عمالة وتشغيل وصيانة في مكة المكرمة", seoDescription: "شركة دالي للتشغيل والصيانة في حي الرصيفة بمكة: توفير عمالة وفنيين وفرق تشغيل وصيانة للمشروعات والمنشآت وموسم الحج.",
  focusKeywords: "شركة تشغيل وصيانة مكة، توفير عمالة مكة، توريد عمالة مكة، عمالة للشركات مكة، فنيين صيانة مكة", tags: ["مكة المكرمة", "حي الرصيفة", "موسم الحج"],
  checklist: ["اسم المهنة والعدد", "موقع العمل في مكة", "موعد البداية والمدة", "الورديات ومتطلبات الدخول"],
  blocks: [{ title: "قرب يدعم سرعة التواصل", text: "حضورنا في مكة يجعلنا أقرب إلى طبيعة مواقع العمل واحتياجات المنشآت داخل المدينة.", checklist: [] }, { title: "جاهزية لمواسم الذروة", text: "نساعدك على التخطيط المبكر للمهن والأعداد والفترات والبدائل خلال مواسم الذروة والحج.", checklist: [] }],
  faqs: [{ question: "هل تقدم شركة دالي خدماتها داخل مكة المكرمة؟", answer: "نعم، تُراجع طلبات توفير العمالة وفرق التشغيل والصيانة للمشروعات والمنشآت في مكة بحسب نطاق الطلب والجاهزية المتاحة." }, { question: "أين يقع مقر شركة دالي؟", answer: "يقع مقر الشركة في حي الرصيفة بمدينة مكة المكرمة." }], publishedAt: TODAY, updatedAt: TODAY,
}];

export const DEFAULT_WEBSITE_CONTENT: WebsiteContent = {
  version: 1,
  updatedAt: `${TODAY}T00:00:00.000Z`,
  updatedBy: "system",
  site: {
    companyName: "شركة دالي للتشغيل والصيانة",
    shortName: "دالي للتشغيل والصيانة",
    tagline: "قوى عاملة ومقاولات وحلول تشغيل في مدن المملكة",
    description: "شركة سعودية تقدم للمنشآت والمشروعات في مدن المملكة حلول القوى العاملة والتشغيل والصيانة والمقاولات، مع مراجعة القدرة الفعلية للموقع والنطاق قبل تأكيد البرنامج.",
    city: "مكة المكرمة",
    district: "حي الرصيفة",
    address: "مكة المكرمة — حي الرصيفة",
    phone: "",
    email: "",
    commercialRegistration: "",
    vatNumber: "",
    googleBusinessUrl: "",
    mapUrl: "",
  },
  seo: {
    homeTitle: "شركة دالي | قوى عاملة ومقاولات في السعودية",
    homeDescription: "حلول قوى عاملة وتشغيل وصيانة ومقاولات للمشروعات والمنشآت في مدن المملكة العربية السعودية، من دراسة الاحتياج إلى التنفيذ والمتابعة.",
    organizationDescription: "شركة سعودية تقدم حلول القوى العاملة والكوادر الفنية والتشغيل والصيانة والمقاولات للمشروعات والمنشآت في مدن المملكة.",
    focusKeywords: "شركة توفير عمالة السعودية، شركة مقاولات السعودية، تشغيل وصيانة منشآت، عمالة للشركات، إدارة مشاريع إنشائية",
  },
  home: {
    heroKicker: "حلول موثوقة لأعمالك في مدن المملكة",
    heroTitle: "الكوادر المناسبة،",
    heroAccent: "في الوقت الذي تحتاجها.",
    heroDescription: "نساعد منشأتك على مواصلة أعمالها عبر قوى عاملة وفرق فنية وخدمات تشغيل وصيانة ومقاولات مصممة للنطاق؛ مع استقبال الطلبات من جميع مناطق المملكة وتأكيد الجاهزية بعد مراجعة المدينة والبرنامج.",
    aboutTitle: "شريك محلي يضع نجاح أعمالك أولاً.",
    aboutDescription: "من فهم الاحتياج إلى انطلاق الفريق أو المشروع، نقدم مساراً واضحاً يقوده مختصون يراجعون طبيعة الموقع ومتطلبات القطاع والقدرة التشغيلية في المدينة.",
    servicesTitle: "حلول تدعم استمرارية أعمالك وتنمو معها.",
    servicesDescription: "سواء كنت تحتاج إلى متخصص واحد أو فريق متكامل، نهيئ لك الحل الأنسب بحسب طبيعة العمل والمدة والموقع.",
    sectorsTitle: "خبرة مرنة تناسب طبيعة قطاعك.",
    sectorsDescription: "نستمع إلى أولويات منشأتك ونقترح قوى عاملة وخدمات تشغيل وصيانة تلائم بيئة العمل ومتطلبات الأداء.",
    localTitle: "قريبون من أعمالك، وأسرع في خدمتك.",
    localDescription: "من مقرنا في حي الرصيفة بمكة المكرمة، نخدم المنشآت والمشروعات بفهم محلي لاحتياجات المدينة ومواسم الذروة والحج.",
    quoteTitle: "دعنا نبني لك الحل المناسب.",
    quoteDescription: "شاركنا نوع الخدمة والمهن والعدد والموقع وموعد البداية، وسيتواصل معك فريق دالي لفهم احتياجك وإعداد عرض ملائم.",
    professions: ["عمال تشغيل", "كهربائيون", "سباكون", "نجارون", "حدادون ولحامون", "فنيو تكييف", "فنيو صيانة", "مشغلو معدات", "سائقو معدات", "مشرفو مواقع"],
    process: [
      { title: "شاركنا هدفك", text: "أخبرنا بطبيعة العمل والموقع والمدة والكوادر التي تبحث عنها." },
      { title: "نقترح الحل", text: "يستمع فريقنا إلى أولوياتك ويقدم خياراً مناسباً لنطاق العمل." },
      { title: "نهيئ الفريق", text: "نجهز الكوادر المطلوبة للانطلاق وفق الموعد والمتطلبات المتفق عليها." },
      { title: "نبقى إلى جانبك", text: "نتابع مستوى الخدمة ونستجيب للمتغيرات طوال مدة التعاون." },
    ],
  },
  visibility: { hajj: true, services: true, sectors: true, locations: true, projects: true, credentials: true, articles: true, jobs: true, partners: true, faq: true },
  collections: {
    services: defaultServiceEntries(),
    sectors,
    locations,
    projects: [],
    credentials: [],
    articles: defaultArticleEntries(),
    jobs: [],
    partners: [],
  },
  faq: [
    { question: "كيف أطلب عمالة في مكة المكرمة؟", answer: "أرسل تفاصيل الاحتياج عبر نموذج طلب عرض السعر، متضمنًا المهن والأعداد وموقع العمل والمدة والورديات، ثم يراجع فريق دالي الطلب." },
    { question: "ما الفرق بين شركة دالي وشركة المقاولات؟", answer: "شركة دالي للتشغيل والصيانة وليست شركة مقاولات. تقدم حلول توفير القوى العاملة والفرق الفنية والتشغيلية للمشروعات والمنشآت وفق نطاق التعاقد." },
    { question: "هل يمكن طلب أكثر من مهنة في العقد نفسه؟", answer: "نعم، يمكن جمع عدة مهن في طلب أو عقد واحد، ويتابع فريق دالي جاهزية كل تخصص والتغطية المتفق عليها مع منشأتك." },
    { question: "هل توفرون فرق تشغيل وصيانة في مكة؟", answer: "تُراجع احتياجات فرق التشغيل والصيانة بحسب نوع المنشأة والمهام والورديات والمدة والوثائق المطلوبة للموقع." },
    { question: "هل يمكن طلب عمالة لموسم الحج؟", answer: "يمكن تقديم طلب للاحتياج الموسمي في مكة مع تحديد المواقع والفترات والمهن والأعداد والورديات، ثم تُراجع الجاهزية والبدائل قبل إعداد العرض." },
    { question: "كيف تُحدد تكلفة توفير العمالة؟", answer: "تتأثر التكلفة بالمهنة والعدد والمدة والورديات وموقع العمل ومتطلبات الدخول أو التدريب ونطاق المسؤوليات، لذلك تُحدد بعد مراجعة تفاصيل الطلب." },
  ],
};

function plainText(value: unknown, maxLength: number, fallback = "") {
  if (typeof value !== "string") return fallback;
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, maxLength);
}

function safeSlug(value: unknown, fallback: string) {
  const slug = plainText(value, 80).toLowerCase();
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ? slug : fallback;
}

function safeDate(value: unknown, fallback: string) {
  const date = plainText(value, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : fallback;
}

function stringList(value: unknown, maxItems: number, itemLength: number, fallback: string[] = []) {
  if (!Array.isArray(value)) return fallback;
  return value.slice(0, maxItems).map((item) => plainText(item, itemLength)).filter(Boolean);
}

function safeImage(value: unknown, fallback: string) {
  const image = plainText(value, 180);
  return image === "/dally-logo.jpg" || /^\/images\/[a-zA-Z0-9][a-zA-Z0-9/_-]*\.(?:avif|gif|jpe?g|png|webp)$/.test(image) ? image : fallback;
}

function sanitizeFaqs(value: unknown, fallback: ManagedFaq[] = []) {
  if (!Array.isArray(value)) return fallback;
  return value.slice(0, 30).map((item) => {
    const record = item && typeof item === "object" ? item as Record<string, unknown> : {};
    return { question: plainText(record.question, 220), answer: plainText(record.answer, 1400) };
  }).filter((item) => item.question.length >= 4 && item.answer.length >= 8);
}

function sanitizeBlocks(value: unknown, fallback: ManagedBlock[] = []) {
  if (!Array.isArray(value)) return fallback;
  return value.slice(0, 24).map((item) => {
    const record = item && typeof item === "object" ? item as Record<string, unknown> : {};
    return { title: plainText(record.title, 180), text: plainText(record.text, 4000), checklist: stringList(record.checklist, 20, 240) };
  }).filter((item) => item.title.length >= 2 && item.text.length >= 5);
}

function sanitizeEntry(value: unknown, fallback: ManagedEntry, index: number): ManagedEntry {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const slug = safeSlug(record.slug, fallback.slug || `entry-${index + 1}`);
  return {
    id: plainText(record.id, 120, fallback.id || crypto.randomUUID()),
    slug,
    title: plainText(record.title, 220, fallback.title),
    shortTitle: plainText(record.shortTitle, 140, fallback.shortTitle || fallback.title),
    summary: plainText(record.summary, 500, fallback.summary),
    body: plainText(record.body, 8000, fallback.body),
    image: safeImage(record.image, fallback.image || "/images/dali-capabilities.webp"),
    imageAlt: plainText(record.imageAlt, 240, fallback.imageAlt),
    status: record.status === "draft" ? "draft" : "published",
    featured: typeof record.featured === "boolean" ? record.featured : fallback.featured,
    sortOrder: Number.isInteger(record.sortOrder) ? Math.max(0, Math.min(10000, Number(record.sortOrder))) : index + 1,
    seoTitle: plainText(record.seoTitle, 180, fallback.seoTitle || fallback.title),
    seoDescription: plainText(record.seoDescription, 500, fallback.seoDescription || fallback.summary),
    focusKeywords: plainText(record.focusKeywords, 800, fallback.focusKeywords),
    tags: stringList(record.tags, 30, 120, fallback.tags),
    checklist: stringList(record.checklist, 30, 240, fallback.checklist),
    blocks: sanitizeBlocks(record.blocks, fallback.blocks),
    faqs: sanitizeFaqs(record.faqs, fallback.faqs),
    publishedAt: safeDate(record.publishedAt, fallback.publishedAt || TODAY),
    updatedAt: safeDate(record.updatedAt, TODAY),
  };
}

function sanitizeCollection(value: unknown, fallback: ManagedEntry[], key: WebsiteCollectionKey) {
  if (!Array.isArray(value)) return fallback;
  const used = new Set<string>();
  return value.slice(0, key === "articles" ? 120 : 80).map((item, index) => {
    const base = fallback[index] ?? {
      id: `${key}-${crypto.randomUUID()}`, slug: `${key}-${index + 1}`, title: "", shortTitle: "", summary: "", body: "",
      image: "/images/dali-capabilities.webp", imageAlt: "", status: "draft" as const, featured: false, sortOrder: index + 1,
      seoTitle: "", seoDescription: "", focusKeywords: "", tags: [], checklist: [], blocks: [], faqs: [], publishedAt: TODAY, updatedAt: TODAY,
    };
    const entry = sanitizeEntry(item, base, index);
    if (used.has(entry.slug)) entry.slug = `${entry.slug}-${index + 1}`;
    used.add(entry.slug);
    return entry;
  }).filter((entry) => entry.title.length >= 2 && entry.slug.length >= 2).sort((a, b) => a.sortOrder - b.sortOrder);
}

function record(value: unknown) {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

export function sanitizeWebsiteContent(value: unknown, fallback = DEFAULT_WEBSITE_CONTENT): WebsiteContent {
  const root = record(value);
  const site = record(root.site);
  const seo = record(root.seo);
  const home = record(root.home);
  const visibility = record(root.visibility);
  const collections = record(root.collections);
  const processValue = Array.isArray(home.process) ? home.process.slice(0, 12).map((item) => {
    const row = record(item);
    return { title: plainText(row.title, 140), text: plainText(row.text, 500) };
  }).filter((item) => item.title && item.text) : fallback.home.process;
  const content: WebsiteContent = {
    version: Number.isInteger(root.version) ? Math.max(1, Number(root.version)) : fallback.version,
    updatedAt: plainText(root.updatedAt, 40, fallback.updatedAt),
    updatedBy: plainText(root.updatedBy, 180, fallback.updatedBy),
    site: {
      companyName: plainText(site.companyName, 180, fallback.site.companyName),
      shortName: plainText(site.shortName, 120, fallback.site.shortName),
      tagline: plainText(site.tagline, 220, fallback.site.tagline),
      description: plainText(site.description, 700, fallback.site.description),
      city: plainText(site.city, 100, fallback.site.city),
      district: plainText(site.district, 100, fallback.site.district),
      address: plainText(site.address, 240, fallback.site.address),
      phone: plainText(site.phone, 30, fallback.site.phone),
      email: plainText(site.email, 180, fallback.site.email),
      commercialRegistration: plainText(site.commercialRegistration, 40, fallback.site.commercialRegistration),
      vatNumber: plainText(site.vatNumber, 40, fallback.site.vatNumber),
      googleBusinessUrl: plainText(site.googleBusinessUrl, 500, fallback.site.googleBusinessUrl),
      mapUrl: plainText(site.mapUrl, 500, fallback.site.mapUrl),
    },
    seo: {
      homeTitle: plainText(seo.homeTitle, 180, fallback.seo.homeTitle),
      homeDescription: plainText(seo.homeDescription, 500, fallback.seo.homeDescription),
      organizationDescription: plainText(seo.organizationDescription, 700, fallback.seo.organizationDescription),
      focusKeywords: plainText(seo.focusKeywords, 1200, fallback.seo.focusKeywords),
    },
    home: {
      heroKicker: plainText(home.heroKicker, 180, fallback.home.heroKicker),
      heroTitle: plainText(home.heroTitle, 180, fallback.home.heroTitle),
      heroAccent: plainText(home.heroAccent, 180, fallback.home.heroAccent),
      heroDescription: plainText(home.heroDescription, 700, fallback.home.heroDescription),
      aboutTitle: plainText(home.aboutTitle, 180, fallback.home.aboutTitle),
      aboutDescription: plainText(home.aboutDescription, 800, fallback.home.aboutDescription),
      servicesTitle: plainText(home.servicesTitle, 180, fallback.home.servicesTitle),
      servicesDescription: plainText(home.servicesDescription, 700, fallback.home.servicesDescription),
      sectorsTitle: plainText(home.sectorsTitle, 180, fallback.home.sectorsTitle),
      sectorsDescription: plainText(home.sectorsDescription, 700, fallback.home.sectorsDescription),
      localTitle: plainText(home.localTitle, 180, fallback.home.localTitle),
      localDescription: plainText(home.localDescription, 700, fallback.home.localDescription),
      quoteTitle: plainText(home.quoteTitle, 180, fallback.home.quoteTitle),
      quoteDescription: plainText(home.quoteDescription, 700, fallback.home.quoteDescription),
      professions: stringList(home.professions, 40, 100, fallback.home.professions),
      process: processValue,
    },
    visibility: {
      hajj: typeof visibility.hajj === "boolean" ? visibility.hajj : fallback.visibility.hajj,
      services: typeof visibility.services === "boolean" ? visibility.services : fallback.visibility.services,
      sectors: typeof visibility.sectors === "boolean" ? visibility.sectors : fallback.visibility.sectors,
      locations: typeof visibility.locations === "boolean" ? visibility.locations : fallback.visibility.locations,
      projects: typeof visibility.projects === "boolean" ? visibility.projects : fallback.visibility.projects,
      credentials: typeof visibility.credentials === "boolean" ? visibility.credentials : fallback.visibility.credentials,
      articles: typeof visibility.articles === "boolean" ? visibility.articles : fallback.visibility.articles,
      jobs: typeof visibility.jobs === "boolean" ? visibility.jobs : fallback.visibility.jobs,
      partners: typeof visibility.partners === "boolean" ? visibility.partners : fallback.visibility.partners,
      faq: typeof visibility.faq === "boolean" ? visibility.faq : fallback.visibility.faq,
    },
    collections: {
      services: sanitizeCollection(collections.services, fallback.collections.services, "services"),
      sectors: sanitizeCollection(collections.sectors, fallback.collections.sectors, "sectors"),
      locations: sanitizeCollection(collections.locations, fallback.collections.locations, "locations"),
      projects: sanitizeCollection(collections.projects, fallback.collections.projects, "projects"),
      credentials: sanitizeCollection(collections.credentials, fallback.collections.credentials, "credentials"),
      articles: sanitizeCollection(collections.articles, fallback.collections.articles, "articles"),
      jobs: sanitizeCollection(collections.jobs, fallback.collections.jobs, "jobs"),
      partners: sanitizeCollection(collections.partners, fallback.collections.partners, "partners"),
    },
    faq: sanitizeFaqs(root.faq, fallback.faq),
  };
  return upgradeLegacyMarketingCopy(content);
}

function upgradeLegacyMarketingCopy(content: WebsiteContent) {
  const replacements: Array<[keyof WebsiteContent["home"], string, string]> = [
    ["heroKicker", "جاهزية تشغيلية في مكة المكرمة وموسم الحج", DEFAULT_WEBSITE_CONTENT.home.heroKicker],
    ["heroTitle", "قوى عاملة مؤهلة،", DEFAULT_WEBSITE_CONTENT.home.heroTitle],
    ["heroAccent", "جاهزة للموسم والمشروع.", DEFAULT_WEBSITE_CONTENT.home.heroAccent],
    ["heroDescription", "نوفر للشركات والمشروعات ومواقع الخدمة في مكة المكرمة عمالة وفنيين وفرق تشغيل وصيانة، مع استعداد خاص للاحتياج المتسارع ومتعدد المهن خلال موسم الحج.", DEFAULT_WEBSITE_CONTENT.home.heroDescription],
    ["aboutTitle", "شريكك في توفير الكوادر المناسبة.", DEFAULT_WEBSITE_CONTENT.home.aboutTitle],
    ["aboutDescription", "نربط الاحتياج الفعلي بالمهنة المناسبة، وننظم التعاقد والتوزيع والمتابعة ضمن مسار واضح يبدأ من الطلب وينتهي بقياس الجاهزية.", DEFAULT_WEBSITE_CONTENT.home.aboutDescription],
    ["servicesTitle", "حلول قوى عاملة تدعم استمرارية أعمالك.", DEFAULT_WEBSITE_CONTENT.home.servicesTitle],
    ["servicesDescription", "خدمات موجهة للشركات والمشروعات والمنشآت، من تحديد الاحتياج إلى التعاقد والإسناد والمتابعة.", DEFAULT_WEBSITE_CONTENT.home.servicesDescription],
    ["sectorsTitle", "حلول مرتبطة بطبيعة كل قطاع.", DEFAULT_WEBSITE_CONTENT.home.sectorsTitle],
    ["sectorsDescription", "نكيّف المهن والأعداد والورديات وآلية المتابعة مع طبيعة الموقع ونطاق الخدمة.", DEFAULT_WEBSITE_CONTENT.home.sectorsDescription],
    ["localTitle", "حضور محلي وفهم لطبيعة التشغيل في مكة.", DEFAULT_WEBSITE_CONTENT.home.localTitle],
    ["localDescription", "من مقرنا في حي الرصيفة نراجع احتياجات المشروعات والمنشآت ومواقع الخدمة في مكة، مع مراعاة مواسم الذروة والحج.", DEFAULT_WEBSITE_CONTENT.home.localDescription],
    ["quoteTitle", "احتياج واضح، وعرض أدق.", DEFAULT_WEBSITE_CONTENT.home.quoteTitle],
    ["quoteDescription", "أدخل بيانات المشروع والمهن والعدد التقريبي وموعد البدء ليصل الطلب إلى الفريق المختص مع رقم متابعة.", DEFAULT_WEBSITE_CONTENT.home.quoteDescription],
  ];
  for (const [key, legacy, next] of replacements) {
    if (typeof content.home[key] === "string" && content.home[key] === legacy) (content.home[key] as string) = next;
  }
  if (content.site.tagline === "حلول قوى عاملة وتشغيل وصيانة في مكة المكرمة") content.site.tagline = DEFAULT_WEBSITE_CONTENT.site.tagline;
  if (content.site.description === "شركة سعودية متخصصة في توفير العمالة والكوادر الفنية وفرق التشغيل والصيانة للمشروعات والمنشآت في مكة المكرمة.") content.site.description = DEFAULT_WEBSITE_CONTENT.site.description;
  const legacySteps = new Map([
    ["تحليل الاحتياج|نحدد المهن والأعداد وموقع العمل والمدة والورديات.", DEFAULT_WEBSITE_CONTENT.home.process[0]],
    ["مطابقة الكفاءات|نراجع العمالة المتاحة والوثائق والمتطلبات الخاصة بالموقع.", DEFAULT_WEBSITE_CONTENT.home.process[1]],
    ["التعاقد والإسناد|نوثق البنود ونربط كل عامل بالعقد والجهة المستفيدة.", DEFAULT_WEBSITE_CONTENT.home.process[2]],
    ["المتابعة المستمرة|نتابع الجاهزية والدوام والوثائق والتوزيع طوال مدة الخدمة.", DEFAULT_WEBSITE_CONTENT.home.process[3]],
  ]);
  content.home.process = content.home.process.map((step) => legacySteps.get(`${step.title}|${step.text}`) || step);

  // Saved CMS defaults are upgraded field by field so genuine editor changes remain untouched.
  const legacyEntryCopy = new Map<string, string>([
    ["حلول توفير عمالة في مكة للمشروعات والمنشآت، وفق المهن والأعداد والموقع والورديات والمدة، مع مسار واضح للعرض والتعاقد والإسناد.", "قوى عاملة وفرق مهنية تساعد منشأتك على تلبية احتياجها في مكة بثقة، سواء لمهمة محددة أو موسم أو تشغيل ممتد."],
    ["تبدأ الخدمة بفهم طبيعة الموقع والمهام الفعلية، لا بمجرد تسجيل عدد مطلوب. نحدد المهن والأعداد ومدة الاحتياج وساعات العمل ومتطلبات الموقع، ثم نبني نطاقًا يمكن تسعيره والتعاقد عليه ومتابعته بوضوح.", "نبدأ بفهم أهدافك وطبيعة العمل في الموقع، ثم نساعدك على اختيار المهن والأعداد والمدة والورديات المناسبة. والنتيجة حل مرن وواضح يخفف عبء البحث والتنسيق ويمنح فريقك وقتًا أكبر للتركيز على أعماله الأساسية."],
    ["الإسناد والمتابعة", "جاهزية ومتابعة"],
    ["ربط العمالة بأمر التشغيل والموقع والجهة المستفيدة ومتابعة اكتمال العدد.", "تنسيق انطلاق الفريق في الموقع ومتابعة اكتمال الاحتياج طوال مدة الخدمة."],
    ["خطوة: العرض والتعاقد", "خطوة: عرض واضح"],
    ["يُعد عرض قابل للمراجعة يوضح البنود والمدة وصلاحية العرض.", "نقدم عرضًا يوضح نطاق الخدمة والمدة والبنود لتتخذ قرارك بثقة."],
    ["خطوة: التشغيل", "خطوة: بدء الخدمة"],
    ["يُنشأ أمر التشغيل وتتم متابعة الإسناد والدوام وفق الاتفاق.", "ننسق جاهزية الفريق ونواصل المتابعة معك وفق ما تم الاتفاق عليه."],
    ["عمالة المقاولات والإنشاءات", "قوى عاملة للمشروعات الإنشائية"],
    ["عمالة المقاولات والإنشاءات للمشروعات في مكة", "قوى عاملة وفرق فنية للمشروعات الإنشائية في مكة"],
    ["عمالة مقاولات وإنشاءات في مكة المكرمة", "توفير عمالة للمشروعات الإنشائية في مكة"],
    ["تخطيط وتوفير عمالة مقاولات وإنشاءات في مكة بحسب مراحل المشروع والمهن والأعداد والورديات، مع متابعة الإسناد والوثائق المطلوبة للموقع.", "كوادر مهنية وفنية تدعم شركات المقاولات والمشروعات الإنشائية في مكة وفق المرحلة والبرنامج والورديات، دون أن تقدم دالي أعمال المقاولات نفسها."],
    ["يتغير احتياج مشروع المقاولات من مرحلة إلى أخرى؛ فقد تحتاج البداية إلى مهن تختلف عن أعمال التشطيب أو التسليم. لذلك نربط طلب العمالة بالمرحلة والبرنامج المتوقع والموقع، حتى يكون العدد والمزيج المهني قابلين للمراجعة والتحديث.", "تتغير احتياجات المشروع من التجهيز إلى التنفيذ والتشطيب. نوفر لشركات المقاولات والجهات المشغلة كوادر تناسب كل مرحلة، مع مرونة تساعدك على مواكبة البرنامج وتقليل أثر النقص المفاجئ. شركة دالي للتشغيل والصيانة مزود قوى عاملة وليست شركة مقاولات."],
    ["متطلبات الموقع", "جاهزية الموقع"],
    ["توثيق الوردية ونقطة التجمع ومتطلبات الدخول والسلامة قبل بدء الإسناد.", "تحديد الوردية ونقطة التجمع ومتطلبات الدخول والسلامة قبل بدء العمل."],
    ["مراجعة ما يلزم للمهنة والموقع من وثائق أو شهادات قبل الإسناد.", "مراجعة ما يلزم للمهنة والموقع من وثائق أو شهادات قبل بدء الخدمة."],
    ["خطوة: تحديث الإسناد", "خطوة: مرونة مع البرنامج"],
    ["متابعة العدد المسند والمتبقي عند تغير البرنامج أو ظهور احتياج إضافي.", "مراجعة الأعداد عند تغير مراحل المشروع أو ظهور احتياج إضافي."],
    ["فرق تشغيل وصيانة متعددة المهن للمنشآت في مكة، مع تحديد نطاق الأعمال الوقائية والتصحيحية والورديات ومتابعة الإسناد والدوام.", "فرق تشغيل وصيانة متعددة المهن تساعد منشآت مكة على رفع الجاهزية واستمرار الخدمة وتقليل أثر الأعطال والاحتياج المفاجئ."],
    ["استمرارية المنشأة تحتاج إلى توزيع واضح للمهن والورديات والمهام، وإلى تمييز الأعمال المجدولة عن البلاغات التصحيحية. تساعد الخدمة على تكوين فريق متعدد المهن ضمن نطاق تشغيلي يمكن متابعته وتعديله حسب طبيعة الموقع.", "استمرارية منشأتك تبدأ بفريق مناسب وتغطية واضحة للورديات والمهام. نساعدك على تكوين فريق متعدد المهن يلائم طبيعة الموقع والأعمال الوقائية والتصحيحية، مع مرونة تستجيب لتغير الاحتياج."],
    ["خطوة: متابعة الخدمة", "خطوة: متابعة مستمرة"],
    ["ربط الفريق بأمر التشغيل ومراجعة الدوام والفجوات مع الجهة المستفيدة.", "متابعة جاهزية الفريق والتغطية مع ممثل المنشأة والاستجابة للمتغيرات."],
    ["طلب فنيين وفرق متعددة المهن في مكة للكهرباء والسباكة والنجارة والحدادة واللحام والتكييف والصيانة، بحسب المهمة والوثائق المطلوبة.", "فنيون وفرق متعددة التخصصات في مكة للكهرباء والسباكة والنجارة والحدادة واللحام والتكييف والصيانة وفق احتياج منشأتك."],
    ["المسمى المهني وحده لا يوضح ملاءمة الفني للمهمة. لذلك نطلب وصف العمل والمستوى المتوقع والأدوات أو بيئة الموقع والوثائق اللازمة، ثم نبني احتياجًا متعدد المهن يمكن تتبع عدد كل تخصص فيه بصورة مستقلة.", "عندما تحتاج المهمة إلى أكثر من مسمى مهني، نساعدك على تكوين الفريق المناسب بدل التعامل مع كل تخصص بصورة منفصلة. نراجع طبيعة الأعمال والخبرة والمتطلبات، ثم ننسق فريقًا متكاملًا يدعم جودة التنفيذ واستمرارية الخدمة."],
    ["مراجعة المستندات أو الشهادات التي يحددها نطاق المهنة أو الموقع قبل الإسناد.", "مراجعة المستندات أو الشهادات التي يحددها نطاق المهنة أو الموقع قبل بدء الخدمة."],
    ["خطوة: الإسناد", "خطوة: جاهزية الفريق"],
    ["ربط كل فني بالمهنة المطلوبة وأمر التشغيل ومتابعة اكتمال الفريق.", "تنسيق كل تخصص ومتابعة اكتمال الفريق المطلوب قبل الانطلاق."],
    ["يُسجل لكل مهنة عدد مطلوب، ثم يرتبط الإسناد بأمر التشغيل والموقع، بما يوضح العدد المكتمل والمتبقي لكل تخصص.", "يُحدد عدد مستقل لكل مهنة، ويتابع فريق دالي اكتمال التخصصات المطلوبة والتغطية المتفق عليها مع ممثل المنشأة."],
    ["تتغير احتياجات منشآت الضيافة في مكة مع الإشغال والمواسم وطبيعة المرفق. تبدأ المراجعة بتحديد المواقع والورديات والمهام، ثم مطابقة المهن والأعداد والوثائق المطلوبة لكل موقع.", "نساعد منشآت الضيافة في مكة على مواكبة تغير الإشغال والمواسم بفرق تشغيل وصيانة وخدمات مساندة مرنة، تراعي طبيعة كل مرفق ووردياته وأولويات تجربة الضيف."],
    ["تخطيط الورديات", "تغطية تناسب التشغيل"],
    ["توزيع الاحتياج على الورديات والمواقع ونقاط الخدمة بدل الاكتفاء بعدد إجمالي.", "نوزع الاحتياج بحسب الورديات والمواقع ونقاط الخدمة لتبقى المنشأة جاهزة في أوقات الطلب."],
    ["الجاهزية الموسمية", "جاهزية للمواسم"],
    ["مراجعة الفجوة والبدائل قبل فترات ارتفاع الإشغال والطلب.", "نستعد معك قبل فترات ارتفاع الإشغال بخيارات مرنة تقلل أثر النقص المفاجئ."],
    ["يُبنى نطاق الخدمة على طبيعة المرفق وساعات العمل والأعمال الوقائية والتصحيحية ومتطلبات الوصول، ثم تُحدد المهن والأعداد وآلية المتابعة.", "نهيئ للمنشآت التجارية والإدارية فرقًا فنية وتشغيلية تلائم ساعات العمل وطبيعة المرفق، وتدعم استمرارية الخدمة وراحة الموظفين والزوار."],
    ["نطاق قابل للقياس", "خدمة واضحة النتائج"],
    ["تحديد الأعمال الدورية والبلاغات ومستويات الخدمة والمسؤوليات قبل بدء الإسناد.", "نتفق على الأعمال الدورية والاستجابة والمسؤوليات لتعرف منشأتك ما الذي ستحصل عليه منذ البداية."],
    ["تحتاج المواقع اللوجستية إلى وضوح في المهام والورديات وحجم المناولة ونقاط الدخول ومتطلبات السلامة. تساعد هذه البيانات على إعداد عرض أدق وخطة إسناد قابلة للمتابعة.", "ندعم المستودعات والمواقع اللوجستية بقوى عاملة تناسب حجم المناولة والورديات ومتطلبات السلامة، لتبقى الحركة اليومية أكثر انسيابية واستعدادًا لتغير الطلب."],
    ["يتطلب التشغيل الموسمي تقسيم الطلب إلى مواقع وفترات ومهن، مع قياس الفجوة ومراجعة الوثائق ووضع بدائل للغياب أو تغير حجم الطلب.", "نساعدك على الاستعداد المبكر لموسم الحج والذروة بفرق موزعة حسب المواقع والفترات والمهن، مع خيارات بديلة تقلل أثر الغياب أو الارتفاع المفاجئ في الطلب."],
    ["تراجع شركة دالي طلبات المنشآت والمشروعات داخل مكة المكرمة بحسب الموقع والمهن والأعداد والمدة والورديات. وجود المقر في حي الرصيفة يدعم فهم طبيعة الحركة التشغيلية والطلب الموسمي في المدينة، ولا يمثل وعدًا بزمن وصول أو توافر عدد قبل مراجعة الطلب.", "من مقرنا في حي الرصيفة نخدم احتياجات المنشآت والمشروعات في مكة بفهم محلي لطبيعة المدينة ومواسمها. نهيئ حلول قوى عاملة وتشغيل وصيانة تناسب الموقع والمهن والورديات والمدة المطلوبة."],
    ["مقر محلي في حي الرصيفة", "قرب يدعم سرعة التواصل"],
    ["تُدار طلبات الخدمة من مكة المكرمة مع توثيق موقع العمل والجهة المستفيدة ضمن مسار الطلب والتعاقد.", "حضورنا في مكة يجعلنا أقرب إلى طبيعة مواقع العمل واحتياجات المنشآت داخل المدينة."],
    ["استعداد للاحتياج الموسمي", "جاهزية لمواسم الذروة"],
    ["تخطيط المهن والأعداد والفترات والبدائل لمتطلبات التشغيل خلال مواسم الذروة والحج.", "نساعدك على التخطيط المبكر للمهن والأعداد والفترات والبدائل خلال مواسم الذروة والحج."],
    ["نعم، يمكن أن يتضمن الطلب أو العقد عدة مهن مع عدد مستقل لكل مهنة، ثم تتم متابعة الإسناد والجاهزية لكل تخصص.", "نعم، يمكن جمع عدة مهن في طلب أو عقد واحد، ويتابع فريق دالي جاهزية كل تخصص والتغطية المتفق عليها مع منشأتك."],
  ]);
  const promote = (value: string) => legacyEntryCopy.get(value) ?? value;
  for (const entries of Object.values(content.collections)) {
    for (const entry of entries) {
      entry.title = promote(entry.title);
      entry.shortTitle = promote(entry.shortTitle);
      entry.summary = promote(entry.summary);
      entry.body = promote(entry.body);
      entry.seoTitle = promote(entry.seoTitle);
      entry.seoDescription = promote(entry.seoDescription);
      entry.blocks = entry.blocks.map((block) => ({ ...block, title: promote(block.title), text: promote(block.text) }));
      entry.faqs = entry.faqs.map((faq) => ({ ...faq, question: promote(faq.question), answer: promote(faq.answer) }));
    }
  }
  content.faq = content.faq.map((faq) => ({ ...faq, question: promote(faq.question), answer: promote(faq.answer) }));
  return content;
}

export async function getWebsiteContent(): Promise<WebsiteContent> {
  try {
    const row = await getDb().query.portalSettings.findFirst({ where: eq(portalSettings.key, WEBSITE_CONTENT_KEY) });
    if (!row) return DEFAULT_WEBSITE_CONTENT;
    return sanitizeWebsiteContent(JSON.parse(row.valueJson));
  } catch {
    return DEFAULT_WEBSITE_CONTENT;
  }
}

export function isCollectionVisible(content: WebsiteContent, key: WebsiteCollectionKey) {
  if (key === "articles") return content.visibility.articles;
  return content.visibility[key];
}

export function toPublicWebsiteContent(content: WebsiteContent): WebsiteContent {
  const collectionKeys = Object.keys(content.collections) as WebsiteCollectionKey[];
  const collections = Object.fromEntries(collectionKeys.map((key) => [
    key,
    isCollectionVisible(content, key)
      ? content.collections[key].filter((entry) => entry.status === "published")
      : [],
  ])) as WebsiteContent["collections"];
  return { ...content, updatedBy: "", collections };
}

export function publishedEntries(content: WebsiteContent, key: WebsiteCollectionKey) {
  if (!isCollectionVisible(content, key)) return [];
  return content.collections[key].filter((entry) => entry.status === "published").sort((a, b) => a.sortOrder - b.sortOrder);
}

export function findPublishedEntry(content: WebsiteContent, key: WebsiteCollectionKey, slug: string) {
  return publishedEntries(content, key).find((entry) => entry.slug === slug);
}

export function collectionBasePath(key: WebsiteCollectionKey) {
  const paths: Record<WebsiteCollectionKey, string> = {
    services: "/services",
    sectors: "/sectors",
    locations: "/locations",
    projects: "/projects",
    credentials: "/credentials",
    articles: "/insights",
    jobs: "/careers",
    partners: "/partners",
  };
  return paths[key];
}

export function entryPath(key: WebsiteCollectionKey, entry: ManagedEntry) {
  const base = collectionBasePath(key);
  if (key === "credentials" || key === "partners") return base;
  return `${base}/${entry.slug}`;
}
