import { parsePaymentSchedule, validateSeasonalSchedule } from "@/lib/payment-schedules";
import { readCommercialTerms } from "@/lib/commercial-terms";
import { normalizeSaudiWhatsAppNumber } from "@/lib/whatsapp";
const allowedSpecializations = new Set([
    "عمالة إنشائية",
    "فنيون متخصصون",
    "تشغيل وصيانة",
    "فريق متكامل",
    "جاهزية موسم الحج",
    "جاهزية موسم رمضان",
    "جاهزية موسمي رمضان والحج",
    "طلب عرض سعر",
    "استفسار عام",
    "شراكة أو توريد",
    "طلب توظيف",
    "شكاوى واقتراحات",
]);
const allowedDurations = new Set(["أقل من شهر", "من شهر إلى 3 أشهر", "من 3 إلى 6 أشهر", "من 6 إلى 12 شهراً", "أكثر من سنة", "غير محدد"]);
const allowedContactMethods = new Set(["phone", "email", "either"]);
const activityLabels = { workforce: "توريد العمالة", construction: "المقاولات", maintenance: "التشغيل والصيانة", seasonal: "الخدمات الموسمية" } as const;
const allowedQuantityModes = new Set(["fixed", "open"]);
function text(value: unknown, maxLength: number) {
    return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}
export function parseWorkforceRequestInput(payload: Record<string, unknown>) {
    const fullName = text(payload.fullName, 100);
    const mobile = normalizeSaudiWhatsAppNumber(text(payload.mobile, 30)) || text(payload.mobile, 30);
    const email = text(payload.email, 160).toLowerCase();
    const requestType = text(payload.requestType, 20) === "quotation" ? "quotation" : "general";
    const companyName = text(payload.companyName, 160);
    const workSite = text(payload.workSite, 180);
    const requiredStartDate = text(payload.requiredStartDate, 10);
    const duration = text(payload.duration, 80);
    let requestedCount = Number(payload.requestedCount);
    const preferredContact = text(payload.preferredContact, 20);
    const activityType = text(payload.activityType, 20) as keyof typeof activityLabels;
    const quantityMode = text(payload.quantityMode, 20) || "fixed";
    const clientCr = text(payload.clientCr, 10);
    const clientVat = text(payload.clientVat, 15);
    const clientAddress = text(payload.clientAddress, 240);
    const representativeTitle = text(payload.representativeTitle, 120);
    const rawItems = Array.isArray(payload.quotationItems) ? payload.quotationItems : [];
    const quotationItems = rawItems.slice(0, 30).map((raw) => {
        const item = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
        const sponsorshipType = item.sponsorshipType === "other" ? "other" : "dali";
        return {
            description: text(item.description, 160),
            quantity: quantityMode === "open" ? 0 : Number(item.quantity),
            durationMonths: Number(item.durationMonths),
            unit: text(item.unit, 40) || (activityType === "workforce" ? "عامل/شهر" : "وحدة"),
            notes: text(item.notes, 500) || null,
            unitPrice: Number(item.unitPrice || 0),
            actualSalary: Number(item.actualSalary || 0),
            sponsorshipType: activityType === "workforce" ? sponsorshipType : null,
            sponsorName: activityType === "workforce" && sponsorshipType === "other" ? text(item.sponsorName, 160) : null,
            ajirContractStatus: activityType === "workforce" ? (item.ajirContractStatus === "with_ajir" ? "with_ajir" : item.ajirContractStatus === "without_ajir" ? "without_ajir" : sponsorshipType === "dali" ? "not_applicable" : null) : null,
        };
    });
    const rawTerms = payload.quotationTerms && typeof payload.quotationTerms === "object" ? payload.quotationTerms as Record<string, unknown> : {};
    const quotationTerms = {
        ...readCommercialTerms(rawTerms),
        vatRate: rawTerms.vatRate == null || rawTerms.vatRate === "" ? 15 : Number(rawTerms.vatRate),
        issueDate: text(rawTerms.issueDate, 10) || null,
        seasonType: rawTerms.seasonType === "hajj" || rawTerms.seasonType === "ramadan" ? rawTerms.seasonType : "regular",
        paymentSchedule: parsePaymentSchedule(rawTerms.paymentSchedule),
        endDate: text(rawTerms.endDate, 10) || null,
        workingHours: text(rawTerms.workingHours, 240) || null,
        weeklyOff: text(rawTerms.weeklyOff, 120) || null,
        accommodationParty: text(rawTerms.accommodationParty, 40) || null,
        transportParty: text(rawTerms.transportParty, 40) || null,
        paymentTerms: text(rawTerms.paymentTerms, 1200) || null,
        specialTerms: text(rawTerms.specialTerms, 2000) || null,
    };
    if (quotationTerms.paymentSchedule.length && !validateSeasonalSchedule(quotationTerms.paymentSchedule))
        throw new Error("أكمل جدول الدفعات المقترح بمواعيد صحيحة ومجموع نسب 100٪");
    const specialization = requestType === "quotation" && activityLabels[activityType] ? activityLabels[activityType] : text(payload.specialization, 80);
    const details = text(payload.details, 4000);
    const idempotencyKey = text(payload.idempotencyKey, 80);
    if (fullName.length < 2 ||
        !/^\+?[0-9\s()-]{8,20}$/.test(mobile) ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
        (!allowedSpecializations.has(specialization) && requestType !== "quotation") ||
        details.length < 10 ||
        (idempotencyKey && !/^[a-zA-Z0-9-]{16,80}$/.test(idempotencyKey)) ||
        (requestType === "quotation" && (companyName.length < 2 ||
            workSite.length < 2 ||
            !activityLabels[activityType] ||
            !allowedQuantityModes.has(quantityMode) ||
            clientAddress.length < 5 ||
            representativeTitle.length < 2 ||
            (clientCr && !/^\d{10}$/.test(clientCr)) ||
            (clientVat && !/^3\d{13}3$/.test(clientVat)) ||
            !Number.isFinite(quotationTerms.vatRate) || quotationTerms.vatRate < 0 || quotationTerms.vatRate > 100 || rawItems.length > 30 || !quotationItems.length || quotationItems.some((item) => !Number.isFinite(item.unitPrice) || item.unitPrice < 0 || item.unitPrice > 1000000 || !Number.isFinite(item.actualSalary) || item.actualSalary < 0 || item.actualSalary > 1000000 || !item.description || !Number.isInteger(item.durationMonths) || item.durationMonths < 1 || item.durationMonths > 120 || (quantityMode === "fixed" && (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 100000)) || (item.sponsorshipType === "other" && (!item.sponsorName || !item.ajirContractStatus))) ||
            !allowedDurations.has(duration) ||
            !allowedContactMethods.has(preferredContact) ||
            !/^\d{4}-\d{2}-\d{2}$/.test(requiredStartDate) ||
            (quotationTerms.endDate && (!/^\d{4}-\d{2}-\d{2}$/.test(quotationTerms.endDate) || quotationTerms.endDate < requiredStartDate))))) {
        throw new Error("بيانات الطلب غير مكتملة أو غير صحيحة.");
    }
    if (requestType === "quotation")
        requestedCount = quantityMode === "open" ? 0 : quotationItems.reduce((sum, item) => sum + item.quantity, 0);
    return {
        fullName,
        mobile,
        email,
        requestType,
        companyName: companyName || null,
        workSite: workSite || null,
        requiredStartDate: requiredStartDate || null,
        duration: duration || null,
        requestedCount: requestType === "quotation" ? requestedCount : null,
        preferredContact: preferredContact || null,
        activityType: requestType === "quotation" ? activityType : null,
        quantityMode: requestType === "quotation" ? quantityMode : null,
        clientCr: requestType === "quotation" ? clientCr || null : null,
        clientVat: requestType === "quotation" ? clientVat || null : null,
        clientAddress: requestType === "quotation" ? clientAddress : null,
        representativeTitle: requestType === "quotation" ? representativeTitle : null,
        quotationItemsJson: requestType === "quotation" ? JSON.stringify(quotationItems) : null,
        quotationTermsJson: requestType === "quotation" ? JSON.stringify(quotationTerms) : null,
        specialization,
        details,
        idempotencyKey: idempotencyKey || null,
        privacyNoticeVersion: "2026-08-14",
        privacyAcknowledgedAt: new Date().toISOString(),
    };
}
