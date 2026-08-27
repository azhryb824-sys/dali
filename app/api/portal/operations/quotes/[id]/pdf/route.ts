import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { clients, companyAssets, documentStamps, quoteItems, quoteVersions, salesOpportunities } from "@/db/schema";
import { attachmentHeaders } from "@/lib/company-documents";
import { generateIssuedPdf } from "@/lib/pdf-generator";
import { parsePaymentSchedule } from "@/lib/payment-schedules";
import { hasPortalPermission, requirePortalApiRole } from "@/lib/portal-access";

function metadata(value: string | null) {
  const lines = (value || "").split("\n");
  const read = (prefix: string) => lines.find((line) => line.startsWith(prefix))?.slice(prefix.length).trim() || "";
  return {
    activityLabel: read("النشاط:"),
    workSite: read("موقع الخدمة:"),
    vatRateBps: Math.round(Number(read("الضريبة:")) * 100) || 0,
    assumptions: lines.filter((line) => !["النشاط:", "موقع الخدمة:", "الضريبة:"].some((prefix) => line.startsWith(prefix))).join("\n").trim(),
  };
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const access = await requirePortalApiRole(["admin", "manager", "employee"]);
  if (!access || !(await hasPortalPermission(access, "operations", "read"))) return Response.json({ error: "غير مصرح بتنزيل عرض السعر" }, { status: 403 });
  const id = Number((await context.params).id);
  if (!Number.isInteger(id) || id < 1) return Response.json({ error: "عرض السعر غير صحيح" }, { status: 400 });

  const db = getDb();
  const quote = await db.query.quoteVersions.findFirst({ where: eq(quoteVersions.id, id) });
  if (!quote) return Response.json({ error: "عرض السعر غير موجود" }, { status: 404 });
  const approved = Boolean(quote.approvedBy && ["approved", "sent", "accepted"].includes(quote.status));
  if (!approved && !(await hasPortalPermission(access, "documents", "preview"))) return Response.json({ error: "لا تملك صلاحية تنزيل معاينة PDF قبل الاعتماد" }, { status: 403 });
  const opportunity = await db.query.salesOpportunities.findFirst({ where: eq(salesOpportunities.id, quote.opportunityId) });
  if (!opportunity) return Response.json({ error: "فرصة المبيعات غير موجودة" }, { status: 404 });
  const [client, items, assets, selectedStamp] = await Promise.all([
    opportunity.clientId ? db.query.clients.findFirst({ where: eq(clients.id, opportunity.clientId) }) : Promise.resolve(undefined),
    db.select().from(quoteItems).where(eq(quoteItems.quoteVersionId, quote.id)).orderBy(quoteItems.sortOrder),
    db.select().from(companyAssets),
    quote.stampId ? db.query.documentStamps.findFirst({ where: eq(documentStamps.id, quote.stampId) }) : Promise.resolve(undefined),
  ]);
  if (!items.length) return Response.json({ error: "عرض السعر لا يحتوي على بنود" }, { status: 409 });

  const details = metadata(quote.assumptions);
  const taxableHalalas = Math.max(0, quote.subtotalHalalas - quote.discountHalalas);
  const vatHalalas = Math.round(taxableHalalas * details.vatRateBps / 10000);
  const totalHalalas = taxableHalalas + vatHalalas;
  const pdfLanguage = new URL(request.url).searchParams.get("language") === "bilingual" ? "bilingual" : "ar";
  const paymentDrafts = parsePaymentSchedule(quote.paymentScheduleJson);
  const paymentSchedule = paymentDrafts.map((payment, index) => {
    const amountHalalas = index === paymentDrafts.length - 1
      ? totalHalalas - paymentDrafts.slice(0, -1).reduce((sum, row) => sum + Math.round(totalHalalas * row.percentageBps / 10000), 0)
      : Math.round(totalHalalas * payment.percentageBps / 10000);
    return { ...payment, amountHalalas };
  });
  const bytes = await generateIssuedPdf({
    approvalState: approved ? "approved" : "draft",
    pdfLanguage,
    documentType: "quotation",
    referenceCode: `${quote.quoteCode}-V${quote.versionNumber}`,
    clientName: client?.legalName || opportunity.title,
    clientCr: client?.commercialRegistration || undefined,
    clientVat: client?.vatNumber || undefined,
    clientAddress: client?.address || undefined,
    title: opportunity.title,
    issueDate: quote.issueDate,
    expiryDate: quote.validUntil,
    details: `عرض فني ومالي لتقديم خدمات ${details.activityLabel || "التشغيل والصيانة"} وفق البنود والكميات المبينة أدناه.`,
    workSite: details.workSite || undefined,
    activityLabel: details.activityLabel || "خدمات التشغيل والصيانة",
    quantityMode: quote.quantityMode as "fixed" | "open",
    subtotalHalalas: quote.subtotalHalalas,
    discountHalalas: quote.discountHalalas,
    vatRateBps: quote.vatRateBps || details.vatRateBps,
    vatHalalas,
    amountHalalas: totalHalalas,
    paymentTerms: quote.terms || undefined,
    accommodationParty: quote.accommodationParty === "dali" ? "توفره دالي" : quote.accommodationParty === "counterparty" ? "يوفره الطرف الثاني" : undefined,
    transportParty: quote.transportParty === "dali" ? "توفره دالي" : quote.transportParty === "counterparty" ? "يوفره الطرف الآخر" : undefined,
    paymentSchedule,
    assumptions: details.assumptions || undefined,
    terms: "الأسعار خاصة بنطاق العمل والكميات والمدة المحددة. أي أعمال أو كميات إضافية تستلزم عرضًا أو ملحقًا مستقلًا. يخضع بدء الخدمة لتوفر الموارد واعتماد العميل والمتطلبات النظامية.",
    quotationItems: items.map((item) => ({ description: item.profession, quantity: item.quantity, durationMonths: item.durationMonths, unitPriceHalalas: item.unitPriceHalalas, lineTotalHalalas: item.lineTotalHalalas, notes: item.notes, sponsorshipType: item.sponsorshipType as "dali" | "other" | null, sponsorName: item.sponsorName, ajirContractStatus: item.ajirContractStatus as "not_applicable" | "with_ajir" | "without_ajir" | null })),
  }, assets.filter((asset) => asset.slot !== "stamp").map((asset) => ({ slot: asset.slot as "stamp" | "signature", storageKey: asset.storageKey, contentType: asset.contentType })).concat(selectedStamp ? [{ slot: "stamp" as const, storageKey: selectedStamp.storageKey, contentType: selectedStamp.contentType }] : assets.filter((asset) => asset.slot === "stamp").map((asset) => ({ slot: "stamp" as const, storageKey: asset.storageKey, contentType: asset.contentType }))));
  return new Response(new Uint8Array(bytes).buffer, { headers: attachmentHeaders(`${quote.quoteCode}-V${quote.versionNumber}-${pdfLanguage}.pdf`, "application/pdf") });
}
