import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { portalSettings } from "@/db/schema";

export type BusinessHoursConfig = {
  timezone: "Asia/Riyadh";
  workingDays: number[];
  opensAt: string;
  closesAt: string;
  autoReply: string;
  closedDates: string[];
  specialOpenDates: string[];
};

export type BusinessHoursState = BusinessHoursConfig & {
  isOpen: boolean;
  exception: "open" | "closed" | null;
  replyKey: string;
  nextOpenLabel: string;
};

export const defaultBusinessHours: BusinessHoursConfig = {
  timezone: "Asia/Riyadh",
  workingDays: [0, 1, 2, 3, 4],
  opensAt: "08:00",
  closesAt: "17:00",
  autoReply: "شكراً لتواصلك يا {{name}}. استلمنا رسالتك برقم {{trackingCode}} خارج ساعات العمل، وسيعود فريق دالي لمتابعتك {{nextOpen}}. يمكنك الآن إضافة المهنة والعدد وموقع العمل والمدة لتسريع خدمتك.",
  closedDates: [],
  specialOpenDates: [],
};

const weekdayNumbers: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function validTime(value: unknown, fallback: string) {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : fallback;
}

function validDates(value: unknown) {
  const items = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[\s,،]+/) : [];
  return Array.from(new Set(items.filter((item): item is string => typeof item === "string" && /^\d{4}-\d{2}-\d{2}$/.test(item)))).sort().slice(0, 180);
}

export function normalizeBusinessHoursConfig(value: unknown): BusinessHoursConfig {
  const input = value && typeof value === "object" ? value as Partial<BusinessHoursConfig> : {};
  const workingDays = Array.isArray(input.workingDays)
    ? Array.from(new Set(input.workingDays.map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))).sort()
    : defaultBusinessHours.workingDays;
  const autoReply = typeof input.autoReply === "string" ? input.autoReply.trim().slice(0, 700) : "";
  const legacyAutoReply = "شكراً لتواصلك مع شركة دالي للتشغيل والصيانة. رسالتك وصلت خارج ساعات الدوام الرسمي، وسيتم الرد عليك خلال ساعات العمل القادمة.";
  return {
    timezone: "Asia/Riyadh",
    workingDays: workingDays.length ? workingDays : defaultBusinessHours.workingDays,
    opensAt: validTime(input.opensAt, defaultBusinessHours.opensAt),
    closesAt: validTime(input.closesAt, defaultBusinessHours.closesAt),
    autoReply: autoReply.length >= 10 && autoReply !== legacyAutoReply ? autoReply : defaultBusinessHours.autoReply,
    closedDates: validDates(input.closedDates),
    specialOpenDates: validDates(input.specialOpenDates),
  };
}

export async function getBusinessHoursConfig(): Promise<BusinessHoursConfig> {
  const saved = await getDb().query.portalSettings.findFirst({ where: eq(portalSettings.key, "business-hours") }).catch((error) => { console.error("business-hours-load-failed", error instanceof Error ? error.message : String(error)); return undefined; });
  if (!saved) return defaultBusinessHours;
  try {
    return normalizeBusinessHoursConfig(JSON.parse(saved.valueJson));
  } catch {
    return defaultBusinessHours;
  }
}

function minutes(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function riyadhParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const map = new Map(parts.map((part) => [part.type, part.value]));
  return {
    weekday: weekdayNumbers[map.get("weekday") || "Sun"] ?? 0,
    dateKey: `${map.get("year")}-${map.get("month")}-${map.get("day")}`,
    minuteOfDay: Number(map.get("hour") || 0) * 60 + Number(map.get("minute") || 0),
  };
}

function isServiceDay(config: BusinessHoursConfig, local: ReturnType<typeof riyadhParts>) {
  if (config.closedDates.includes(local.dateKey)) return false;
  return config.specialOpenDates.includes(local.dateKey) || config.workingDays.includes(local.weekday);
}

function nextOpenLabel(config: BusinessHoursConfig, date: Date, current: ReturnType<typeof riyadhParts>) {
  const openMinute = minutes(config.opensAt);
  for (let offset = 0; offset <= 45; offset += 1) {
    const candidate = new Date(date.getTime() + offset * 86_400_000);
    const local = riyadhParts(candidate);
    if (!isServiceDay(config, local)) continue;
    const canOpenToday = offset > 0 || current.minuteOfDay < openMinute;
    if (!canOpenToday) continue;
    const dayLabel = offset === 0 ? "اليوم" : offset === 1 ? "غداً" : new Intl.DateTimeFormat("ar-SA", {
      timeZone: "Asia/Riyadh",
      weekday: "long",
      day: "numeric",
      month: "long",
    }).format(candidate);
    return `${dayLabel} عند ${config.opensAt} بتوقيت مكة`;
  }
  return "خلال أول يوم عمل معلن";
}

export async function getBusinessHoursState(date = new Date()): Promise<BusinessHoursState> {
  const config = await getBusinessHoursConfig();
  const local = riyadhParts(date);
  const openMinute = minutes(config.opensAt);
  const closeMinute = minutes(config.closesAt);
  const timeOpen = openMinute <= closeMinute
    ? local.minuteOfDay >= openMinute && local.minuteOfDay < closeMinute
    : local.minuteOfDay >= openMinute || local.minuteOfDay < closeMinute;
  const serviceLocal = openMinute > closeMinute && local.minuteOfDay < closeMinute
    ? riyadhParts(new Date(date.getTime() - 86_400_000))
    : local;
  const exceptionalClosure = config.closedDates.includes(serviceLocal.dateKey);
  const exceptionalOpening = config.specialOpenDates.includes(serviceLocal.dateKey);
  const isOpen = !exceptionalClosure && (exceptionalOpening || config.workingDays.includes(serviceLocal.weekday)) && timeOpen;
  return {
    isOpen,
    timezone: config.timezone,
    workingDays: config.workingDays,
    opensAt: config.opensAt,
    closesAt: config.closesAt,
    autoReply: config.autoReply,
    closedDates: config.closedDates,
    specialOpenDates: config.specialOpenDates,
    exception: exceptionalClosure ? "closed" : exceptionalOpening ? "open" : null,
    replyKey: `${local.dateKey}:${isOpen ? "open" : "closed"}`,
    nextOpenLabel: isOpen ? "الآن خلال ساعات العمل" : nextOpenLabel(config, date, local),
  };
}
