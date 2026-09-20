import { readCommercialTerms } from "@/lib/commercial-terms";
import { commercialAttachmentRefs, withCommercialAttachments } from "@/lib/commercial-attachments";
import { parseCommercialLineItems, commercialTotals } from "@/lib/commercial-line-items";
import { annualContractSchedule, annualInstallmentPercentages, parsePaymentSchedule, validateSeasonalSchedule } from "@/lib/payment-schedules";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { quoteItems, quoteVersions, workflowApprovals, workforceRequestAttachments } from "@/db/schema";
import { auditPortalAction } from "@/lib/audit";
import { emitPortalNotification } from "@/lib/portal-notifications";
import { canAdministerPortalUsers, hasPortalPermission, requirePortalApiRole } from "@/lib/portal-access";
import { cleanDate } from "@/lib/company-documents";
import { jsonNoStore, readLimitedJson, rejectCrossSiteRequest } from "@/lib/security";

const clean = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (rejectCrossSiteRequest(request)) return jsonNoStore({ error: "مصدر الطلب غير مسموح" }, { status: 403 });
  const access = await requirePortalApiRole(["admin", "manager", "employee"]);
  if (!access || !(canAdministerPortalUsers(access) || await hasPortalPermission(access, "contracts", "write"))) return jsonNoStore({ error: "غير مصرح بتعديل عرض السعر" }, { status: 403 });
  const id = Number((await context.params).id);
  if (!Number.isSafeInteger(id) || id < 1) return jsonNoStore({ error: "عرض السعر غير صحيح" }, { status: 400 });
  const parsed = await readLimitedJson(request, 500000);
  if (!parsed.ok) return parsed.response;
  const payload = parsed.value as Record<string, unknown>;
  const db = getDb();
  const quote = await db.query.quoteVersions.findFirst({ where: eq(quoteVersions.id, id) });
  if (!quote) return jsonNoStore({ error: "عرض السعر غير موجود" }, { status: 404 });
  if (!["draft", "rejected"].includes(quote.status) || quote.approvedBy) return jsonNoStore({ error: "العرض المعتمد لا يعدل مباشرة؛ أنشئ إصدارًا جديدًا للحفاظ على السجل" }, { status: 409 });
  if (payload.recordVersion !== undefined && Number(payload.recordVersion) !== quote.recordVersion) return jsonNoStore({ error: "تغير العرض قبل حفظ التعديل؛ حدّث الصفحة" }, { status: 409 });
  try {
    const issueDate = cleanDate(payload.issueDate ?? quote.issueDate);
    const validUntil = cleanDate(payload.validUntil ?? quote.validUntil);
    if (!issueDate || !validUntil || validUntil < issueDate) throw new Error("تاريخ الإصدار أو صلاحية العرض غير صحيح");
    const quantityMode = payload.quantityMode === undefined ? quote.quantityMode as "fixed" | "open" : payload.quantityMode === "open" ? "open" : payload.quantityMode === "fixed" ? "fixed" : null;
    const seasonType = String(payload.seasonType ?? quote.seasonType);
    if (!quantityMode || !["regular", "ramadan", "hajj"].includes(seasonType)) throw new Error("نوع العدد أو الموسم غير صحيح");
    const originalActivity = quote.assumptions?.split("\n").find(line => line.startsWith("النشاط:"))?.slice(7).trim() || "توريد العمالة";
    const activityLabel = clean(payload.activityLabel, 120) || originalActivity;
    if (!["توريد العمالة", "المقاولات", "التشغيل والصيانة", "الخدمات الموسمية"].includes(activityLabel)) throw new Error("نوع النشاط غير صحيح");
    const commercialTerms = readCommercialTerms({ ...readCommercialTerms(quote.commercialTermsJson), ...payload });
    const existingItems = await db.select().from(quoteItems).where(eq(quoteItems.quoteVersionId, id)).orderBy(quoteItems.sortOrder);
    const items = parseCommercialLineItems(payload.items ?? existingItems.map(item => ({ ...item, unitPrice: item.unitPriceHalalas / 100, actualSalary: item.actualSalaryHalalas / 100 })), { quantityMode, seasonType, workforce: activityLabel === "توريد العمالة" });
    const discount = Number(payload.discount ?? quote.discountHalalas / 100);
    if (activityLabel === "توريد العمالة" && discount > 0) throw new Error("عدّل سعر العميل في البنود لتطبيق الخصم مع الحفاظ على مطابقة العقد");
    const totals = commercialTotals(items, Number(payload.vatRate ?? quote.vatRateBps / 100), discount);
    let payments = parsePaymentSchedule(payload.paymentSchedule ?? quote.paymentScheduleJson);
    if (seasonType === "regular" && activityLabel === "توريد العمالة" && commercialTerms.startDate) {
      const annual = annualContractSchedule(commercialTerms.startDate);
      if (!annual.endDate) throw new Error("تاريخ بداية العقد السنوي غير صحيح");
      commercialTerms.endDate = annual.endDate;
      const percentages = annualInstallmentPercentages();
      payments = quantityMode === "fixed" ? annual.dueDates.map((dueDate, index) => ({ title: `الدفعة الشهرية ${index + 1}`, titleEn: `Monthly installment ${index + 1}`, dueDate, percentageBps: percentages[index] })) : [];
    }
    if (quantityMode === "open") payments = [];
    if (quantityMode === "fixed" && seasonType !== "regular" && !validateSeasonalSchedule(payments)) throw new Error("جدول الدفعات غير صحيح؛ يجب أن يكون مجموع النسب 100%");
    if (commercialTerms.startDate && !cleanDate(commercialTerms.startDate) || commercialTerms.endDate && (!cleanDate(commercialTerms.endDate) || commercialTerms.startDate && commercialTerms.endDate < commercialTerms.startDate)) throw new Error("تواريخ مدة العقد غير صحيحة");
    const responsibility = (value: unknown) => { const party = value === "client" ? "counterparty" : String(value || "dali"); if (!["dali", "counterparty", "not_applicable"].includes(party)) throw new Error("مسؤولية السكن أو النقل غير صحيحة"); return party; };
    const assumptionsText = payload.assumptions === undefined ? (quote.assumptions || "").split("\n").filter(line => !["النشاط:", "موقع الخدمة:", "الضريبة:"].some(prefix => line.startsWith(prefix))).join("\n") : clean(payload.assumptions, 2500);
    const changes = {
      issueDate, validUntil, quantityMode, seasonType,
      ...totals,
      accommodationParty: responsibility(payload.accommodationParty ?? quote.accommodationParty),
      transportParty: responsibility(payload.transportParty ?? quote.transportParty),
      commercialTermsJson: withCommercialAttachments(commercialTerms, commercialAttachmentRefs(quote.commercialTermsJson)),
      paymentScheduleJson: payments.length ? JSON.stringify(payments) : null,
      documentId: null,
      terms: payload.paymentTerms === undefined && payload.terms === undefined ? quote.terms : clean(payload.paymentTerms ?? payload.terms, 1200) || null,
      assumptions: [`النشاط: ${activityLabel}`, `موقع الخدمة: ${commercialTerms.workSite || ""}`, `الضريبة: ${totals.vatRateBps / 100}`, assumptionsText].filter(Boolean).join("\n"),
      status: "draft", approvalReason: null, approvedBy: null, approvedAt: null,
      updatedAt: new Date().toISOString(), recordVersion: quote.recordVersion + 1,
    };
    const updated = await db.transaction(async tx => {
      const [current] = await tx.select().from(quoteVersions).where(eq(quoteVersions.id, id)).for("update");
      if (!current || current.recordVersion !== quote.recordVersion || current.approvedBy || !["draft", "rejected"].includes(current.status)) return null;
      const [saved] = await tx.update(quoteVersions).set(changes).where(and(eq(quoteVersions.id, id), eq(quoteVersions.recordVersion, quote.recordVersion))).returning();
      if (!saved) return null;
      await tx.delete(quoteItems).where(eq(quoteItems.quoteVersionId, id));
      await tx.insert(quoteItems).values(items.map(item => ({ ...item, quoteVersionId: id })));
      return saved;
    });
    if (!updated) return jsonNoStore({ error: "تغير العرض قبل حفظ التعديل؛ حدّث الصفحة" }, { status: 409 });
    await auditPortalAction({ actorEmail: access.user.email, action: "quote-edited", entityType: "quote-version", entityId: id, before: { quote, items: existingItems }, after: { quote: updated, items } }).catch(error => console.error("quote-edit-audit", error));
    await emitPortalNotification({ eventType: "quote-edited", title: "عُدّل عرض سعر", message: `${quote.quoteCode} — الإصدار ${quote.versionNumber} ويتطلب اعتماد المالك.`, severity: "warning", module: "sales", entityType: "quote-version", entityId: id, actionView: "operations", targetRole: "admin" }).catch(() => undefined);
    return jsonNoStore({ quote: updated });
  } catch (error) {
    console.error("quote-full-edit-failed", error);
    const message = error instanceof Error && /^[\u0600-\u06ff]/.test(error.message) ? error.message : "تعذر حفظ عرض السعر";
    return jsonNoStore({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  if (rejectCrossSiteRequest(request)) return jsonNoStore({ error: "مصدر الطلب غير مسموح" }, { status: 403 });
  const access = await requirePortalApiRole(["admin", "manager", "employee"]);
  if (!access || !(await hasPortalPermission(access, "contracts", "write"))) return jsonNoStore({ error: "غير مصرح بحذف عرض السعر" }, { status: 403 });
  const id = Number((await context.params).id);
  const db = getDb();
  const quote = await db.query.quoteVersions.findFirst({ where: eq(quoteVersions.id, id) });
  if (!quote) return jsonNoStore({ error: "عرض السعر غير موجود" }, { status: 404 });
  if (quote.approvedBy || !["draft", "rejected"].includes(quote.status)) return jsonNoStore({ error: "لا يمكن حذف عرض سعر دخل مسار الاعتماد أو تم اعتماده؛ أنشئ إصدارًا بديلًا", code: "QUOTE_DELETE_BLOCKED" }, { status: 409 });
  await db.transaction(async (tx) => {
    await tx.delete(workflowApprovals).where(and(eq(workflowApprovals.entityType, "quote-version"), eq(workflowApprovals.entityId, String(id))));
    await tx.delete(quoteItems).where(eq(quoteItems.quoteVersionId, id));
    await tx.delete(workforceRequestAttachments).where(eq(workforceRequestAttachments.quoteVersionId, id));
    await tx.delete(quoteVersions).where(eq(quoteVersions.id, id));
  });
  await auditPortalAction({ actorEmail: access.user.email, action: "quote-deleted", entityType: "quote-version", entityId: id, before: quote });
  await emitPortalNotification({ eventType: "quote-deleted", title: "حُذف عرض سعر", message: `${quote.quoteCode} — الإصدار ${quote.versionNumber}.`, severity: "warning", module: "sales", entityType: "quote-version", entityId: id, actionView: "operations", targetDepartment: "workforce" }).catch(() => undefined);
  return jsonNoStore({ deleted: true, id });
}
