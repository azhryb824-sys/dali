import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { portalSettings } from "@/db/schema";
import type { BusinessHoursState } from "@/lib/business-hours";

export type ChatAutomationRule = {
  id: string;
  label: string;
  enabled: boolean;
  keywords: string[];
  response: string;
};

export type ChatAutomationConfig = {
  enabled: boolean;
  welcomeEnabled: boolean;
  afterHoursEnabled: boolean;
  intentRepliesEnabled: boolean;
  welcomeReply: string;
  rules: ChatAutomationRule[];
};

export type AutomatedReplyPlan = {
  key: string;
  body: string;
  kind: "welcome" | "after-hours" | "intent";
  ruleId?: string;
};

export const defaultChatAutomation: ChatAutomationConfig = {
  enabled: true,
  welcomeEnabled: true,
  afterHoursEnabled: true,
  intentRepliesEnabled: true,
  welcomeReply: "مرحباً {{name}}، يسعدنا تواصلك مع شركة دالي للتشغيل والصيانة. تم استلام محادثتك برقم {{trackingCode}}، وسيطّلع عليها أحد المختصين. اذكر المهنة والعدد وموقع العمل والمدة لنخدمك بدقة.",
  rules: [
    { id: "complaint", label: "شكوى أو ملاحظة", enabled: true, keywords: ["شكوى", "ملاحظة", "اقتراح", "اعتراض", "تجربة سيئة"], response: "نقدّر مشاركتك لملاحظتك، وسنوجّهها إلى المسؤول المختص بسرية واهتمام. اذكر ما حدث والنتيجة التي تتطلع إليها، وتجنب إرسال أي بيانات حساسة غير لازمة." },
    { id: "jobs", label: "التوظيف", enabled: true, keywords: ["وظيفة", "توظيف", "سيرة ذاتية", "cv", "فرصة عمل", "باحث عن عمل"], response: "شكراً لاهتمامك بالانضمام إلى دالي. تُستقبل طلبات التوظيف عبر قسم الوظائف في الموقع عند وجود فرص منشورة. اذكر تخصصك وخبرتك، ولا ترسل وثائق هوية داخل المحادثة." },
    { id: "quotation", label: "عرض سعر", enabled: true, keywords: ["عرض سعر", "سعر", "اسعار", "تكلفة", "تسعير", "كم السعر"], response: "يسعدنا إعداد عرض يناسب احتياجك. أرسل اسم المنشأة، والمهنة أو نوع الخدمة، والعدد، وموقع العمل، وموعد البداية والمدة؛ أو استخدم نموذج طلب عرض السعر للحصول على رقم متابعة مستقل." },
    { id: "hajj", label: "موسم الحج", enabled: true, keywords: ["الحج", "موسم الحج", "المشاعر", "موسمي", "موسم", "منى", "عرفات", "مزدلفة"], response: "لدعم احتياج موسم الحج في مكة، شاركنا المواقع والفترات والورديات والمهن والأعداد المتوقعة. سيبحث الفريق معك الحل الأنسب بحسب نطاق الخدمة والجاهزية المتاحة." },
    { id: "maintenance", label: "التشغيل والصيانة", enabled: true, keywords: ["تشغيل", "صيانة", "فني", "فنيين", "تكييف", "كهرباء", "سباكة", "مرافق"], response: "نوفر حلول تشغيل وصيانة وفرقاً فنية بحسب طبيعة المنشأة وموقعها وساعات العمل. صف نوع الموقع والمهام والتخصصات المطلوبة لنوجّه محادثتك إلى المختص المناسب." },
    { id: "workforce", label: "توفير القوى العاملة", enabled: true, keywords: ["عمالة", "عمال", "توفير عمالة", "توريد عمالة", "كوادر", "مشرفين", "سائقين"], response: "نساعد الشركات والمنشآت في مكة على توفير القوى العاملة والكوادر الفنية وفق الاحتياج. اذكر المهن والأعداد والمدة وموقع العمل والورديات ليتمكن الفريق من خدمتك بسرعة." },
    { id: "partnership", label: "شراكة أو توريد", enabled: true, keywords: ["شراكة", "مورد", "موردين", "تعاون", "توريد", "اعتماد مورد"], response: "نرحب بفرص التعاون المؤسسي. عرّف بالمنشأة ونوع الشراكة أو التوريد المقترح وبيانات التواصل المهنية، وسيُحال الطلب إلى الجهة المعنية." },
  ],
};

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, maxLength) : "";
}

function keywords(value: unknown, fallback: string[]) {
  const values = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[\n,،]+/) : fallback;
  return Array.from(new Set(values.map((item) => cleanText(item, 60)).filter((item) => item.length >= 2))).slice(0, 20);
}

export function normalizeChatAutomationConfig(value: unknown): ChatAutomationConfig {
  const input = value && typeof value === "object" ? value as Partial<ChatAutomationConfig> : {};
  const providedRules = Array.isArray(input.rules) ? input.rules : defaultChatAutomation.rules;
  const seen = new Set<string>();
  const rules = providedRules.slice(0, 12).map((value, index) => {
    const candidate = value && typeof value === "object" ? value as Partial<ChatAutomationRule> : {};
    const fallback = defaultChatAutomation.rules.find((item) => item.id === candidate.id) || defaultChatAutomation.rules[index] || defaultChatAutomation.rules[0];
    const idCandidate = cleanText(candidate.id, 32).toLowerCase();
    const id = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(idCandidate) && !seen.has(idCandidate) ? idCandidate : `${fallback.id}-${index + 1}`;
    seen.add(id);
    const response = cleanText(candidate.response, 900);
    return {
      id,
      label: cleanText(candidate.label, 80) || fallback.label,
      enabled: candidate.enabled !== false,
      keywords: keywords(candidate.keywords, fallback.keywords),
      response: response.length >= 10 ? response : fallback.response,
    };
  }).filter((rule) => rule.keywords.length && rule.response.length >= 10);
  const welcomeReply = cleanText(input.welcomeReply, 900);
  return {
    enabled: input.enabled !== false,
    welcomeEnabled: input.welcomeEnabled !== false,
    afterHoursEnabled: input.afterHoursEnabled !== false,
    intentRepliesEnabled: input.intentRepliesEnabled !== false,
    welcomeReply: welcomeReply.length >= 10 ? welcomeReply : defaultChatAutomation.welcomeReply,
    rules: rules.length ? rules : defaultChatAutomation.rules,
  };
}

export async function getChatAutomationConfig() {
  const saved = await getDb().query.portalSettings.findFirst({ where: eq(portalSettings.key, "chat-automation") });
  if (!saved) return defaultChatAutomation;
  try {
    return normalizeChatAutomationConfig(JSON.parse(saved.valueJson));
  } catch {
    return defaultChatAutomation;
  }
}

function normalizedArabic(value: string) {
  return value.toLowerCase()
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, "")
    .replace(/ـ/g, "")
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ")
    .trim();
}

export function matchChatIntent(config: ChatAutomationConfig, text: string) {
  const haystack = normalizedArabic(text);
  let best: { rule: ChatAutomationRule; score: number } | null = null;
  for (const rule of config.rules) {
    if (!rule.enabled) continue;
    const score = rule.keywords.reduce((total, keyword) => total + (haystack.includes(normalizedArabic(keyword)) ? Math.max(1, normalizedArabic(keyword).split(" ").length) : 0), 0);
    if (score > 0 && (!best || score > best.score)) best = { rule, score };
  }
  return best?.rule || null;
}

function renderTemplate(template: string, context: { name: string; trackingCode: string; subject: string; nextOpen: string }) {
  return template
    .replaceAll("{{name}}", context.name)
    .replaceAll("{{trackingCode}}", context.trackingCode)
    .replaceAll("{{subject}}", context.subject)
    .replaceAll("{{nextOpen}}", context.nextOpen)
    .trim()
    .slice(0, 1_200);
}

export async function buildAutomatedReplyPlan(input: {
  conversationId: string;
  trackingCode: string;
  visitorName: string;
  subject: string;
  messageBody: string;
  isStart: boolean;
  businessHours: BusinessHoursState;
}) {
  const config = await getChatAutomationConfig();
  if (!config.enabled) return [];
  const context = { name: input.visitorName, trackingCode: input.trackingCode, subject: input.subject, nextOpen: input.businessHours.nextOpenLabel };
  const replies: AutomatedReplyPlan[] = [];
  if (input.isStart && input.businessHours.isOpen && config.welcomeEnabled) {
    replies.push({ key: `auto:${input.conversationId}:welcome`, body: renderTemplate(config.welcomeReply, context), kind: "welcome" });
  }
  if (!input.businessHours.isOpen && config.afterHoursEnabled) {
    replies.push({
      key: `auto:${input.conversationId}:hours:${input.businessHours.replyKey}`,
      body: renderTemplate(input.businessHours.autoReply, context),
      kind: "after-hours",
    });
  }
  if (config.intentRepliesEnabled) {
    const rule = matchChatIntent(config, `${input.subject} ${input.messageBody}`);
    if (rule) replies.push({
      key: `auto:${input.conversationId}:intent:${rule.id}`,
      body: renderTemplate(rule.response, context),
      kind: "intent",
      ruleId: rule.id,
    });
  }
  return replies.filter((reply) => reply.body.length >= 10).slice(0, 2);
}
