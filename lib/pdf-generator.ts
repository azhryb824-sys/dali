import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, PDFFont, PDFImage, PDFPage, rgb } from "pdf-lib";
import { getRuntimeEnv } from "@/lib/runtime-env";
import { halalasToArabicWords } from "@/lib/arabic-money";
import { cairoFontBytes } from "@/lib/cairo-font-bytes";
import { latinDigits, rtlPdfDigits } from "@/lib/latin-digits";
import { defaultWorkforceContractClauses, publicManpowerText, type WorkforceContractClause, type WorkforceContractDirection } from "@/lib/workforce-contract-clauses";

export const issuedDocumentLabels = {
  workforce_contract: "عقد توريد وتشغيل قوى عاملة",
  quotation: "عرض سعر",
  progress_claim: "مستخلص أعمال",
  invoice: "فاتورة",
  receipt: "سند قبض",
  payment_voucher: "سند صرف",
  construction_record: "سجل مشروع مقاولات",
  official_letter: "خطاب رسمي",
} as const;

export type IssuedDocumentType = keyof typeof issuedDocumentLabels;

export type IssuedDocumentInput = {
  pdfLanguage?: "ar" | "bilingual";
  approvalState?: "draft" | "approved";
  documentType: IssuedDocumentType;
  referenceCode: string;
  clientName: string;
  clientCr?: string;
  clientVat?: string;
  clientAddress?: string;
  clientRepresentative?: string;
  clientRepresentativeTitle?: string;
  title: string;
  issueDate: string;
  expiryDate?: string;
  amountHalalas?: number;
  subtotalHalalas?: number;
  vatHalalas?: number;
  vatRateBps?: number;
  paymentTerms?: string;
  workingHours?: string;
  weeklyOff?: string;
  accommodationParty?: string;
  transportParty?: string;
  specialTerms?: string;
  details: string;
  workSite?: string;
  profession?: string;
  workerCount?: number;
  professions?: Array<{
    profession: string;
    requiredCount: number;
    unitSalaryHalalas?: number;
    sponsorshipType?: "dali" | "other" | null;
    sponsorName?: string | null;
    ajirContractStatus?: "not_applicable" | "with_ajir" | "without_ajir" | null;
    assignedWorkers?: Array<{ fullName: string; iqamaNumber: string | null }>;
  }>;
  paymentSchedule?: Array<{ title: string; dueDate: string; percentageBps: number; amountHalalas: number }>;
  startDate?: string;
  endDate?: string;
  activityLabel?: string;
  quantityMode?: "fixed" | "open";
  contractDirection?: WorkforceContractDirection;
  contractClauses?: WorkforceContractClause[];
  discountHalalas?: number;
  terms?: string;
  assumptions?: string;
  quotationItems?: Array<{
    description: string;
    quantity: number;
    durationMonths: number;
    unitPriceHalalas: number;
    lineTotalHalalas: number;
    notes?: string | null;
    sponsorshipType?: "dali" | "other" | null;
    sponsorName?: string | null;
    ajirContractStatus?: "not_applicable" | "with_ajir" | "without_ajir" | null;
  }>;
};

const englishDocumentLabels: Record<IssuedDocumentType, string> = {
  workforce_contract: "Manpower Supply and Operations Contract",
  quotation: "Quotation",
  progress_claim: "Progress Claim",
  invoice: "Invoice",
  receipt: "Receipt Voucher",
  payment_voucher: "Payment Voucher",
  construction_record: "Construction Project Record",
  official_letter: "Official Letter",
};

function englishText(value?: string | null) {
  if (!value) return "Not specified";
  const replacements: Array<[RegExp, string]> = [
    [/توريد وتشغيل القوى العاملة وفق البنود والكميات والمواقع المعتمدة\./g, "Supply and operation of manpower according to the approved items, quantities and locations."],
    [/تستحق الدفعات وفق الجدول أدناه\./g, "Installments are due according to the payment schedule below."],
    [/تخضع الخدمات للأنظمة المعمول بها في المملكة العربية السعودية\./g, "Services are governed by the applicable laws and regulations of the Kingdom of Saudi Arabia."],
    [/توريد العمالة/g, "Manpower supply"], [/التشغيل والصيانة/g, "Operations and maintenance"], [/المقاولات/g, "Contracting"], [/الخدمات الموسمية/g, "Seasonal services"],
    [/عامل نظافة/g, "Cleaner"], [/عامل/g, "Worker"], [/مشرف/g, "Supervisor"], [/فني/g, "Technician"], [/كهربائي/g, "Electrician"], [/سباك/g, "Plumber"],
    [/الدفعة الأولى/g, "First installment"], [/الدفعة الثانية/g, "Second installment"], [/الدفعة/g, "Installment"], [/موسم الحج/g, "Hajj season"], [/موسم رمضان/g, "Ramadan season"],
    [/مكة المكرمة/g, "Makkah"], [/المشاعر المقدسة/g, "Holy Sites"], [/الرياض/g, "Riyadh"], [/المملكة العربية السعودية/g, "Kingdom of Saudi Arabia"],
    [/شركة الكفيل/g, "Sponsor Company"], [/شركة العميل التجريبية/g, "Sample Client Company"],
  ];
  return replacements.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), value);
}

async function createEnglishIssuedPdf(input: IssuedDocumentInput, assets: CompanyAsset[]) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${englishDocumentLabels[input.documentType]} - ${input.referenceCode}`);
  const resources = await loadResources(pdf, assets);
  let page = pdf.addPage([PAGE.width, PAGE.height]);
  let y = PAGE.height - 58;
  let pageNumber = 1;
  const addPage = () => { page = pdf.addPage([PAGE.width, PAGE.height]); pageNumber += 1; y = PAGE.height - 58; header(); };
  const header = () => {
    page.drawRectangle({ x: 0, y: PAGE.height - 10, width: PAGE.width, height: 10, color: COLORS.navy });
    drawLeft(page, "DALI OPERATIONS & MAINTENANCE CO.", PAGE.height - 42, resources.latinBold, 12, COLORS.navy);
    drawRight(page, `Page ${pageNumber}`, PAGE.height - 42, resources.latinRegular, 8, COLORS.muted);
    page.drawLine({ start: { x: PAGE.margin, y: PAGE.height - 52 }, end: { x: PAGE.width - PAGE.margin, y: PAGE.height - 52 }, thickness: .7, color: COLORS.line });
  };
  const ensure = (height: number) => { if (y - height < 65) addPage(); };
  const heading = (value: string) => { ensure(38); drawLeft(page, value, y, resources.latinBold, 16, COLORS.navy); page.drawRectangle({ x: PAGE.margin, y: y - 11, width: 34, height: 3, color: COLORS.red }); y -= 34; };
  const row = (label: string, value: string) => { const lines = wrapWords(resources.latinRegular, value || "Not specified", 8, PAGE.width - PAGE.margin * 2 - 24); const height = 20 + lines.length * 11; ensure(height + 3); page.drawRectangle({ x: PAGE.margin, y: y - height + 7, width: PAGE.width - PAGE.margin * 2, height, color: COLORS.pale, borderColor: COLORS.line, borderWidth: .5 }); drawLeft(page, label, y - 3, resources.latinBold, 7, COLORS.red, PAGE.margin + 12); lines.forEach((line, index) => drawLeft(page, line, y - 16 - index * 11, resources.latinRegular, 8, COLORS.text, PAGE.margin + 12)); y -= height + 3; };
  header();
  heading(englishDocumentLabels[input.documentType]);
  row("Reference", input.referenceCode); row("Issue date", input.issueDate); row("Client / Entity", input.clientName);
  if (input.clientCr) row("Commercial registration", input.clientCr);
  if (input.clientVat) row("VAT number", input.clientVat);
  if (input.clientAddress) row("National address", englishText(input.clientAddress));
  if (input.workSite) row("Service location", englishText(input.workSite));
  if (input.accommodationParty) row("Accommodation", englishText(input.accommodationParty));
  if (input.transportParty) row("Transportation", englishText(input.transportParty));
  if (input.startDate || input.endDate) row("Term", `${input.startDate || "-"} to ${input.endDate || "-"}`);
  if (input.quotationItems?.length) {
    heading("Items and Pricing");
    input.quotationItems.forEach((item, index) => row(`Item ${index + 1}`, `${englishText(publicManpowerText(item.description))} | Qty: ${item.quantity || "Open"} | Duration: ${item.durationMonths} month(s) | Unit price: ${((item.unitPriceHalalas || 0) / 100).toFixed(2)} SAR | Total: ${((item.lineTotalHalalas || 0) / 100).toFixed(2)} SAR${item.notes ? ` | ${englishText(publicManpowerText(item.notes))}` : ""}`));
  }
  if (input.professions?.length) {
    heading("Manpower Requirements");
    input.professions.forEach((item, index) => row(`Requirement ${index + 1}`, `${englishText(item.profession)} | Required: ${input.quantityMode === "open" ? "Open" : item.requiredCount}`));
  }
  if (input.amountHalalas) { row("Subtotal", `${((input.subtotalHalalas || input.amountHalalas) / 100).toFixed(2)} SAR`); if (input.vatHalalas) row("VAT", `${(input.vatHalalas / 100).toFixed(2)} SAR`); row("Total", `${(input.amountHalalas / 100).toFixed(2)} SAR`); }
  if (input.paymentSchedule?.length) { heading("Payment Schedule"); input.paymentSchedule.forEach((payment, index) => row(`Installment ${index + 1}`, `${englishText(payment.title)} | Due: ${payment.dueDate} | ${(payment.percentageBps / 100).toFixed(2)}% | ${(payment.amountHalalas / 100).toFixed(2)} SAR`)); }
  if (input.documentType === "workforce_contract") {
    row("Scope", englishText(input.details));
    if (input.paymentTerms) row("Payment terms", englishText(input.paymentTerms));
    if (input.specialTerms) row("Special terms", englishText(input.specialTerms));
    addPage(); heading("Contract Terms and Conditions");
    const fallbackClauses = [
      ["1. Supply and Assignment", "The First Party shall provide manpower in the approved professions and numbers. Names may be completed or replaced according to availability and regulatory requirements without reducing the agreed profession or number."],
      ["2. Mobilization and Worksite", "Service begins on the approved date after completing site-entry requirements. Manpower shall not be moved to a materially different site or duty without the First Party's written approval."],
      ["3. Working Hours and Shifts", "Working hours, shifts and weekly rest are governed by the scope and applicable regulations. Additional hours or unagreed shifts are charged under the price appendix or a separate written approval."],
      ["4. Supervision and Safety", "The Second Party directs daily work at its site and provides a safe workplace, site instructions and task-specific protective equipment. The First Party provides administrative supervision and operational follow-up."],
      ["5. Replacement and Absence", "The Second Party shall promptly report absence or deficient performance through approved channels. The First Party shall remedy or replace within a reasonable operational period subject to profession and availability."],
      ["6. Fees and Invoicing", "Financial claims are issued under the approved billing cycle and payment schedule and fall due on their specified dates. No deduction or set-off is permitted without an approved document stating the reason and amount."],
      ["7. Taxes", "VAT is applied only when enabled in the financial document, at the applicable statutory rate, and is shown separately from the service value."],
      ["8. Employment Compliance", "The First Party manages employment documents, salaries and employer obligations. The Second Party shall not assign manpower duties that conflict with the profession, regulations or safety requirements."],
      ["9. Confidentiality and Data", "Both parties shall protect personal, operational and confidential information and use it only to perform this contract in accordance with applicable laws and approved policies."],
      ["10. Non-Solicitation", "The Second Party shall not directly or indirectly recruit or employ manpower supplied under this contract during its term and for the agreed period afterward without the First Party's written approval."],
      ["11. Force Majeure", "Neither party is liable for delay caused by circumstances beyond reasonable control, provided the other party is notified promptly and reasonable steps are taken to mitigate the effect."],
      ["12. Suspension and Termination", "Service may be suspended or the contract terminated for a material breach after written notice and a reasonable cure period, without prejudice to accrued rights and amounts due through the effective date."],
      ["13. Amendments and Renewal", "An amendment, extension or renewal is effective only when documented in an appendix or a new linked version approved by both parties, while the prior version remains preserved in the system record."],
      ["14. Notices", "Notices sent through the addresses and communication channels registered by the parties are recognized. Each party shall notify the other of any change."],
      ["15. Governing Law and Jurisdiction", "This contract is governed by the laws of the Kingdom of Saudi Arabia. The parties shall first seek amicable settlement; otherwise, jurisdiction lies with the competent judicial authority."],
    ];
    void fallbackClauses;
    const selectedClauses = input.contractClauses?.length
      ? input.contractClauses.filter((item) => item.included)
      : defaultWorkforceContractClauses(input.contractDirection || "dali_supplier", false);
    const clauses = selectedClauses.map((item, index) => [`${index + 1}. ${item.titleEn || englishText(item.title)}`, item.bodyEn || englishText(item.body)]);
    clauses.forEach(([label, body], index) => { if (index > 0 && index % 5 === 0) { addPage(); heading("Terms and Conditions — Continued"); } row(label, body); });
    const daliRole = input.contractDirection === "dali_purchaser" ? "Purchaser" : "Supplier";
    const counterpartyRole = input.contractDirection === "dali_purchaser" ? "Supplier" : "Purchaser";
    row("Approval and Signatures", `This contract becomes effective only after approval and signature by both parties. Appendices, schedules and linked versions form part of it. First Party: Dali Operations & Maintenance Co. (${daliRole}) | Second Party: ${counterpartyRole}.`);
  } else {
    heading("Terms and Details");
    row("Scope", englishText(input.details));
    if (input.paymentTerms) row("Payment terms", englishText(input.paymentTerms));
    if (input.specialTerms) row("Special terms", englishText(input.specialTerms));
  }
  return pdf.save();
}

async function createBilingualIssuedPdf(input: IssuedDocumentInput, assets: CompanyAsset[]) {
  if (!["workforce_contract", "quotation"].includes(input.documentType)) {
    const [arabicBytes, englishBytes] = await Promise.all([
      generateIssuedPdf({ ...input, pdfLanguage: "ar" }, assets),
      createEnglishIssuedPdf({ ...input, pdfLanguage: "ar" }, assets),
    ]);
    const [arabicPdf, englishPdf] = await Promise.all([
      PDFDocument.load(arabicBytes),
      PDFDocument.load(englishBytes),
    ]);
    const output = await PDFDocument.create();
    const pages = Math.max(arabicPdf.getPageCount(), englishPdf.getPageCount());
    for (let index = 0; index < pages; index += 1) {
      const page = output.addPage([PAGE.width * 2, PAGE.height]);
      if (index < englishPdf.getPageCount()) {
        const [embedded] = await output.embedPdf(englishPdf, [index]);
        page.drawPage(embedded, { x: 0, y: 0, width: PAGE.width, height: PAGE.height });
      }
      if (index < arabicPdf.getPageCount()) {
        const [embedded] = await output.embedPdf(arabicPdf, [index]);
        page.drawPage(embedded, { x: PAGE.width, y: 0, width: PAGE.width, height: PAGE.height });
      }
      page.drawLine({
        start: { x: PAGE.width, y: 0 },
        end: { x: PAGE.width, y: PAGE.height },
        thickness: 1.2,
        color: COLORS.navy,
      });
    }
    output.setTitle(`${englishDocumentLabels[input.documentType]} | ${issuedDocumentLabels[input.documentType]} - ${input.referenceCode}`);
    return output.save();
  }

  const pdf = await PDFDocument.create();
  pdf.setTitle(`${englishDocumentLabels[input.documentType]} | ${issuedDocumentLabels[input.documentType]} - ${input.referenceCode}`);
  pdf.setAuthor("شركة دالي للتشغيل والصيانة");
  pdf.setCreator("النظام الإداري لشركة دالي للتشغيل والصيانة");
  pdf.setCreationDate(new Date());

  const resources = await loadResources(pdf, assets);
  const centerX = PAGE.width / 2;
  const contentTop = PAGE.height - 126;
  const contentBottom = 72;
  const signedContentBottom = PAGE.footerTop + 22;
  const outerMargin = 38;
  const gutter = 12;
  const arabicRight = PAGE.width - outerMargin;
  const arabicLeft = centerX + gutter;
  const englishLeft = outerMargin;
  const englishRight = centerX - gutter;
  const columnWidth = englishRight - englishLeft;
  const bilingualHeader: IssuedDocumentInput = {
    ...input,
    title: `${issuedDocumentLabels[input.documentType]} | ${englishDocumentLabels[input.documentType]}`,
  };

  let page!: PDFPage;
  let pageNumber = 0;
  let y = contentTop;

  const addPage = () => {
    page = pdf.addPage([PAGE.width, PAGE.height]);
    pageNumber += 1;
    drawHeader(page, resources, bilingualHeader, pageNumber);
    page.drawLine({
      start: { x: centerX, y: contentBottom },
      end: { x: centerX, y: contentTop + 8 },
      thickness: 0.9,
      color: COLORS.navy,
    });
    y = contentTop;
  };

  const ensure = (height: number) => {
    if (y - height < contentBottom) addPage();
  };

  const ensureWithSignatures = (height: number) => {
    if (y - height < signedContentBottom) addPage();
  };

  const section = (arabic: string, english: string) => {
    ensure(82);
    page.drawRectangle({
      x: outerMargin,
      y: y - 25,
      width: PAGE.width - outerMargin * 2,
      height: 29,
      color: COLORS.navy,
    });
    drawRight(page, arabic, y - 14, resources.bold, 10, rgb(1, 1, 1), arabicRight - 7);
    drawLeft(page, english, y - 14, resources.latinBold, 9, rgb(1, 1, 1), englishLeft + 7);
    y -= 36;
  };

  const pairedBlock = (
    arabicLabel: string,
    arabicValue: string,
    englishLabel: string,
    englishValue: string,
    emphasized = false,
  ) => {
    const arValue = latinDigits(arabicValue || "غير محدد");
    const enValue = latinDigits(englishValue || "Not specified");
    const arLines = wrapWords(resources.regular, arValue, 7.2, columnWidth - 20);
    const enLines = wrapWords(resources.latinRegular, enValue, 7.1, columnWidth - 20);
    const lines = Math.max(arLines.length, enLines.length, 1);
    const height = 26 + lines * 10;
    ensure(height + 4);

    page.drawRectangle({
      x: outerMargin,
      y: y - height + 5,
      width: PAGE.width - outerMargin * 2,
      height,
      color: emphasized ? rgb(0.94, 0.96, 0.97) : COLORS.pale,
      borderColor: emphasized ? COLORS.navy : COLORS.line,
      borderWidth: emphasized ? 0.7 : 0.45,
    });
    drawRight(page, arabicLabel, y - 8, resources.bold, 7.2, COLORS.red, arabicRight - 7);
    drawLeft(page, englishLabel, y - 8, resources.latinBold, 7, COLORS.red, englishLeft + 7);
    arLines.forEach((line, index) =>
      drawRight(page, line, y - 22 - index * 10, resources.regular, 7.2, COLORS.text, arabicRight - 7),
    );
    enLines.forEach((line, index) =>
      drawLeft(page, line, y - 22 - index * 10, resources.latinRegular, 7.1, COLORS.text, englishLeft + 7),
    );
    y -= height + 4;
  };

  const moneyEnglish = (halalas?: number) =>
    `${((halalas || 0) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} SAR`;

  addPage();
  section(issuedDocumentLabels[input.documentType], englishDocumentLabels[input.documentType]);
  pairedBlock("المرجع", input.referenceCode, "Reference", input.referenceCode, true);
  pairedBlock("تاريخ الإصدار", dateLabel(input.issueDate), "Issue date", input.issueDate);
  pairedBlock("العميل / الجهة", input.clientName, "Client / Entity", englishText(input.clientName));
  if (input.clientCr) pairedBlock("السجل التجاري", input.clientCr, "Commercial registration", input.clientCr);
  if (input.clientVat) pairedBlock("الرقم الضريبي", input.clientVat, "VAT number", input.clientVat);
  if (input.clientAddress) pairedBlock("العنوان الوطني", input.clientAddress, "National address", englishText(input.clientAddress));
  if (input.clientRepresentative) {
    pairedBlock(
      "ممثل العميل",
      `${input.clientRepresentative}${input.clientRepresentativeTitle ? ` - ${input.clientRepresentativeTitle}` : ""}`,
      "Client representative",
      `${englishText(input.clientRepresentative)}${input.clientRepresentativeTitle ? ` - ${englishText(input.clientRepresentativeTitle)}` : ""}`,
    );
  }
  if (input.workSite) pairedBlock("موقع تقديم الخدمة", input.workSite, "Service location", englishText(input.workSite));
  if (input.startDate || input.endDate) {
    pairedBlock(
      "مدة العقد",
      `من ${dateLabel(input.startDate)} إلى ${dateLabel(input.endDate)}`,
      "Contract term",
      `${input.startDate || "-"} to ${input.endDate || "-"}`,
    );
  }

  if (input.documentType === "quotation") {
    section(
      input.activityLabel === "توريد العمالة" ? "بيان العمالة والمهن والأسعار" : "الخدمات والأسعار",
      input.activityLabel === "توريد العمالة" ? "Manpower, Professions and Pricing" : "Services and Pricing",
    );
    const quotationItems = input.quotationItems?.length
      ? input.quotationItems
      : [{
          description: input.details,
          quantity: 1,
          durationMonths: 1,
          unitPriceHalalas: input.subtotalHalalas || input.amountHalalas || 0,
          lineTotalHalalas: input.subtotalHalalas || input.amountHalalas || 0,
          notes: null,
        }];
    quotationItems.forEach((item, index) => {
      const quantityAr = input.quantityMode === "open" ? "مفتوح" : String(item.quantity);
      const quantityEn = input.quantityMode === "open" ? "Open" : String(item.quantity);
      pairedBlock(
        `البند ${index + 1}`,
        `${publicManpowerText(item.description)} | العدد: ${quantityAr} | ${input.activityLabel === "توريد العمالة" ? `سعر العامل: ${moneyLabel(item.unitPriceHalalas)} | السكن: ${input.accommodationParty || "غير محدد"} | النقل: ${input.transportParty || "غير محدد"}` : `المدة: ${item.durationMonths} شهر | سعر الوحدة: ${moneyLabel(item.unitPriceHalalas)} | الإجمالي: ${moneyLabel(item.lineTotalHalalas)}`}${item.notes ? ` | ${publicManpowerText(item.notes)}` : ""}`,
        `Item ${index + 1}`,
        `${englishText(publicManpowerText(item.description))} | Qty: ${quantityEn} | Duration: ${item.durationMonths} month(s) | Unit price: ${moneyEnglish(item.unitPriceHalalas)} | Total: ${moneyEnglish(item.lineTotalHalalas)}${item.notes ? ` | ${englishText(publicManpowerText(item.notes))}` : ""}`,
      );
    });

    if (input.quantityMode === "open") {
      pairedBlock(
        "آلية الاحتساب",
        `الكميات مفتوحة ولا تمثل التزاماً بعدد أو قيمة إجمالية. تطبق ضريبة القيمة المضافة بنسبة ${(input.vatRateBps || 0) / 100}% على الفواتير الفعلية.`,
        "Calculation method",
        `Quantities are open and do not represent a committed total quantity or value. VAT at ${(input.vatRateBps || 0) / 100}% applies to actual invoices.`,
        true,
      );
    } else {
      section("الملخص المالي", "Financial Summary");
      pairedBlock("الإجمالي قبل الخصم والضريبة", moneyLabel(input.subtotalHalalas), "Subtotal", moneyEnglish(input.subtotalHalalas));
      if (input.discountHalalas) pairedBlock("الخصم", moneyLabel(input.discountHalalas), "Discount", moneyEnglish(input.discountHalalas));
      if (input.vatHalalas) {
        pairedBlock(
          `ضريبة القيمة المضافة (${(input.vatRateBps || 0) / 100}%)`,
          moneyLabel(input.vatHalalas),
          `VAT (${(input.vatRateBps || 0) / 100}%)`,
          moneyEnglish(input.vatHalalas),
        );
      }
      pairedBlock("الإجمالي النهائي", moneyLabel(input.amountHalalas), "Grand total", moneyEnglish(input.amountHalalas), true);
      if (input.amountHalalas) {
        pairedBlock("الإجمالي كتابة", halalasToArabicWords(input.amountHalalas), "Amount in words", moneyEnglish(input.amountHalalas));
      }
    }

    section("الشروط والتفاصيل", "Terms and Details");
    pairedBlock("نطاق العرض", publicManpowerText(input.details), "Scope", englishText(publicManpowerText(input.details)));
    if (input.accommodationParty) pairedBlock("السكن", input.accommodationParty, "Accommodation", englishText(input.accommodationParty));
    if (input.transportParty) pairedBlock("النقل", input.transportParty, "Transportation", englishText(input.transportParty));
    if (input.expiryDate) pairedBlock("صلاحية العرض", dateLabel(input.expiryDate), "Quotation validity", input.expiryDate);
    if (input.paymentTerms) pairedBlock("شروط الدفع", input.paymentTerms, "Payment terms", englishText(input.paymentTerms));
    if (input.assumptions) pairedBlock("الافتراضات والاستثناءات", publicManpowerText(input.assumptions), "Assumptions and exclusions", englishText(publicManpowerText(input.assumptions)));
    if (input.terms) pairedBlock("الشروط والأحكام", publicManpowerText(input.terms), "Terms and conditions", englishText(publicManpowerText(input.terms)));
    ensureWithSignatures(92);
    pairedBlock(
      "اعتماد العرض",
      "هذا العرض صالح خلال المدة المحددة، ويبدأ التنفيذ بعد موافقة العميل واستكمال المتطلبات النظامية والتشغيلية وإصدار العقد أو أمر الإسناد المعتمد.",
      "Quotation approval",
      "This quotation remains valid for the stated period. Work starts after client approval, completion of regulatory and operational requirements, and issuance of the approved contract or assignment order.",
      true,
    );
  } else {
    section("نطاق التعاقد", "Contract Scope");
    const professions = input.professions?.length
      ? input.professions.map((item) => `${item.profession}: ${input.quantityMode === "open" ? "عدد مفتوح" : item.requiredCount}${item.unitSalaryHalalas ? ` | سعر العامل: ${moneyLabel(item.unitSalaryHalalas)}` : ""} | السكن: ${input.accommodationParty || "غير محدد"} | النقل: ${input.transportParty || "غير محدد"}`).join(" | ")
      : input.profession
        ? `${input.profession}: ${input.workerCount || 0}`
        : "حسب النطاق المعتمد";
    pairedBlock("المهن والأعداد المطلوبة", professions, "Required professions and quantities", englishText(professions));
    pairedBlock("نطاق العمل", publicManpowerText(input.details), "Scope of work", englishText(publicManpowerText(input.details)));
    if (input.accommodationParty) pairedBlock("السكن", input.accommodationParty, "Accommodation", englishText(input.accommodationParty));
    if (input.transportParty) pairedBlock("النقل", input.transportParty, "Transportation", englishText(input.transportParty));

    if (input.amountHalalas) {
      section("القيمة والدفعات", "Value and Payments");
      pairedBlock("القيمة التعاقدية", moneyLabel(input.amountHalalas), "Contract value", moneyEnglish(input.amountHalalas), true);
      pairedBlock("القيمة كتابة", halalasToArabicWords(input.amountHalalas), "Amount in words", moneyEnglish(input.amountHalalas));
    }
    if (input.paymentSchedule?.length) {
      input.paymentSchedule.forEach((payment, index) =>
        pairedBlock(
          `الدفعة ${index + 1}`,
          `${payment.title} | الاستحقاق: ${dateLabel(payment.dueDate)} | النسبة: ${(payment.percentageBps / 100).toFixed(2)}% | القيمة: ${moneyLabel(payment.amountHalalas)}`,
          `Installment ${index + 1}`,
          `${englishText(payment.title)} | Due: ${payment.dueDate} | Percentage: ${(payment.percentageBps / 100).toFixed(2)}% | Amount: ${moneyEnglish(payment.amountHalalas)}`,
        ),
      );
    }

    section("الشروط والأحكام", "Terms and Conditions");
    const selectedClauses = input.contractClauses?.length
      ? input.contractClauses.filter((item) => item.included)
      : defaultWorkforceContractClauses(input.contractDirection || "dali_supplier", false);
    selectedClauses.forEach((item, index) =>
      pairedBlock(
        `${index + 1}. ${item.title}`,
        item.body,
        `${index + 1}. ${item.titleEn || englishText(item.title)}`,
        item.bodyEn || englishText(item.body),
      ),
    );
    if (input.paymentTerms) pairedBlock("شروط الدفع", input.paymentTerms, "Payment terms", englishText(input.paymentTerms));
    if (input.specialTerms) pairedBlock("الشروط الخاصة", input.specialTerms, "Special terms", englishText(input.specialTerms));
    ensureWithSignatures(92);
    pairedBlock(
      "الاعتماد",
      "حرر هذا العقد إلكترونياً، ولا يصبح نافذاً إلا بعد اعتماده وتوقيعه من الطرفين. وتعد الملاحق والجداول والإصدارات المرتبطة به جزءاً منه.",
      "Approval",
      "This contract is issued electronically and becomes effective only after approval and signature by both parties. Its appendices, schedules and linked versions form an integral part of it.",
      true,
    );
  }

  if (input.approvalState === "approved") drawContractSignatures(page, resources, input.referenceCode, input.clientName);
  else drawDraftEndorsement(page, resources, input.referenceCode);
  return pdf.save();
}

export type CompanyAsset = {
  slot: "stamp" | "signature";
  storageKey: string;
  contentType: string;
};

type PdfResources = {
  regular: PDFFont;
  bold: PDFFont;
  latinRegular: PDFFont;
  latinBold: PDFFont;
  logo: PDFImage | null;
  stamp: PDFImage;
  signature: PDFImage;
  letterhead: PDFImage | null;
};

const PAGE = { width: 595.28, height: 841.89, margin: 48, footerTop: 230 };
const COLORS = {
  navy: rgb(0, 0.114, 0.176),
  red: rgb(0.886, 0.11, 0.145),
  text: rgb(0.1, 0.15, 0.18),
  muted: rgb(0.42, 0.48, 0.52),
  line: rgb(0.88, 0.9, 0.91),
  pale: rgb(0.965, 0.972, 0.976),
};

async function embedImage(pdf: PDFDocument, bytes: Uint8Array, contentType: string) {
  if (contentType === "image/png") return pdf.embedPng(bytes);
  if (contentType === "image/jpeg" || contentType === "image/jpg") return pdf.embedJpg(bytes);
  throw new Error("صيغة صورة الختم أو التوقيع غير مدعومة");
}

const rtlFonts = new WeakSet<PDFFont>();
const latinFontByRtlFont = new WeakMap<PDFFont, PDFFont>();

async function loadResources(pdf: PDFDocument, assets: CompanyAsset[]): Promise<PdfResources> {
  pdf.registerFontkit(fontkit);
  const [arabicRegularBytes, arabicBoldBytes, latinRegularBytes, latinBoldBytes] = await Promise.all([
    cairoFontBytes("arabicRegular"),
    cairoFontBytes("arabicBold"),
    cairoFontBytes("latinRegular"),
    cairoFontBytes("latinBold"),
  ]);
  const [regular, bold, latinRegular, latinBold] = await Promise.all([
    pdf.embedFont(arabicRegularBytes, { subset: true }),
    pdf.embedFont(arabicBoldBytes, { subset: true }),
    pdf.embedFont(latinRegularBytes, { subset: true }),
    pdf.embedFont(latinBoldBytes, { subset: true }),
  ]);

  rtlFonts.add(regular);
  rtlFonts.add(bold);
  latinFontByRtlFont.set(regular, latinRegular);
  latinFontByRtlFont.set(bold, latinBold);

  const runtime = getRuntimeEnv();

  const [logoResponse, letterheadResponse, transparentStampResponse, transparentSignatureResponse] = await Promise.all([
    runtime.ASSETS.fetch(new Request("https://assets.local/dally-logo.jpg")),
    runtime.ASSETS.fetch(new Request("https://assets.local/images/dali-letterhead.png")),
    runtime.ASSETS.fetch(new Request("https://assets.local/images/company-stamp-transparent.png")),
    runtime.ASSETS.fetch(new Request("https://assets.local/images/company-signature-transparent.png")),
  ]);
  const logo = logoResponse.ok
    ? await pdf.embedJpg(new Uint8Array(await logoResponse.arrayBuffer()))
    : null;
  const letterhead = letterheadResponse.ok
    ? await pdf.embedPng(new Uint8Array(await letterheadResponse.arrayBuffer()))
    : null;

  const stampAsset = assets.find((asset) => asset.slot === "stamp");
  const signatureAsset = assets.find((asset) => asset.slot === "signature");
  if (!stampAsset || !signatureAsset) {
    throw new Error("يجب رفع الختم والتوقيع المعتمدين قبل إصدار المستند");
  }

  const [stampObject, signatureObject] = await Promise.all([
    transparentStampResponse.ok ? Promise.resolve(null) : runtime.BUCKET.get(stampAsset.storageKey),
    transparentSignatureResponse.ok ? Promise.resolve(null) : runtime.BUCKET.get(signatureAsset.storageKey),
  ]);
  if ((!transparentStampResponse.ok && !stampObject) || (!transparentSignatureResponse.ok && !signatureObject)) throw new Error("تعذّر تحميل الختم أو التوقيع المعتمد");

  const [stamp, signature] = await Promise.all([
    transparentStampResponse.ok
      ? pdf.embedPng(new Uint8Array(await transparentStampResponse.arrayBuffer()))
      : embedImage(pdf, new Uint8Array(await stampObject!.arrayBuffer()), stampAsset.contentType),
    transparentSignatureResponse.ok
      ? pdf.embedPng(new Uint8Array(await transparentSignatureResponse.arrayBuffer()))
      : embedImage(pdf, new Uint8Array(await signatureObject!.arrayBuffer()), signatureAsset.contentType),
  ]);
  return { regular, bold, latinRegular, latinBold, logo, stamp, signature, letterhead };
}

function arabicDigits(value: string | number) {
  return latinDigits(value);
}

function normalizedPdfText(value: string, rtl = false) {
  return (rtl ? rtlPdfDigits(value) : latinDigits(value))
    .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "")
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/\u00a0/g, " ");
}

function printableText(font: PDFFont, value: string, preserveSpacing = false) {
  const supported = new Set(font.getCharacterSet());
  const text = Array.from(normalizedPdfText(value, rtlFonts.has(font))).map((character) => {
    const code = character.codePointAt(0)!;
    if (supported.has(code)) return character;
    const alternatives: Record<string, string> = { ".": "٫", ",": "،", ";": "؛", "?": "؟", "%": "٪", ":": " ", "-": " " };
    const alternative = alternatives[character];
    return alternative && supported.has(alternative.codePointAt(0)!) ? alternative : " ";
  }).join("");
  return preserveSpacing ? text : text.replace(/\s{2,}/g, " ").trim();
}

function drawingFont(font: PDFFont, value: string) {
  const normalized = latinDigits(value).trim();
  const numericOnly = normalized.length > 0 && /^[0-9.,:/%+\-\s]+$/.test(normalized);
  return rtlFonts.has(font) && numericOnly ? latinFontByRtlFont.get(font) || font : font;
}

function textWidth(font: PDFFont, value: string, size: number) {
  const selected = drawingFont(font, value);
  return selected.widthOfTextAtSize(printableText(selected, value), size);
}

function drawRight(page: PDFPage, value: string, y: number, font: PDFFont, size: number, color = COLORS.text, right = PAGE.width - PAGE.margin) {
  const selected = drawingFont(font, value);
  const text = printableText(selected, value);
  page.drawText(text, { x: right - selected.widthOfTextAtSize(text, size), y, font: selected, size, color });
}

function drawLeft(page: PDFPage, value: string, y: number, font: PDFFont, size: number, color = COLORS.text, left = PAGE.margin) {
  const selected = drawingFont(font, value);
  page.drawText(printableText(selected, value), { x: left, y, font: selected, size, color });
}

function wrapWords(font: PDFFont, value: string, size: number, maxWidth: number) {
  const paragraphs = value.replace(/\r/g, "").split("\n");
  const lines: string[] = [];
  for (const paragraph of paragraphs) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (textWidth(font, candidate, size) <= maxWidth || !line) line = candidate;
      else {
        lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

function dateLabel(value?: string) {
  if (!value) return "غير محدد";
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(date);
}

function moneyLabel(halalas?: number) {
  if (!halalas) return "غير محدد";
  const value = (halalas / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${arabicDigits(value)} ريال سعودي`;
}

function drawHeader(page: PDFPage, resources: PdfResources, input: IssuedDocumentInput, pageNumber: number) {
  const top = PAGE.height - PAGE.margin;
  if (resources.letterhead) page.drawImage(resources.letterhead, { x: 0, y: 0, width: PAGE.width, height: PAGE.height });
  else {
    page.drawRectangle({ x: 0, y: PAGE.height - 10, width: PAGE.width, height: 10, color: COLORS.navy });
    page.drawRectangle({ x: PAGE.width - 10, y: PAGE.height - 10, width: 10, height: 10, color: COLORS.red });
  }
  if (!resources.letterhead && resources.logo) {
    const ratio = resources.logo.width / resources.logo.height;
    const height = 42;
    page.drawImage(resources.logo, { x: PAGE.width - PAGE.margin - height * ratio, y: top - height, width: height * ratio, height });
    drawLeft(page, input.referenceCode, top - 10, resources.latinBold, 9, COLORS.navy);
    drawLeft(page, `صفحة ${arabicDigits(pageNumber)}`, top - 28, resources.regular, 8, COLORS.muted);
    page.drawLine({ start: { x: PAGE.margin, y: top - 58 }, end: { x: PAGE.width - PAGE.margin, y: top - 58 }, thickness: 1, color: COLORS.line });
  }
}

function drawEndorsement(page: PDFPage, resources: PdfResources, referenceCode: string) {
  const y = 92;
  page.drawLine({ start: { x: PAGE.margin, y: PAGE.footerTop }, end: { x: PAGE.width - PAGE.margin, y: PAGE.footerTop }, thickness: 1, color: COLORS.line });
  drawRight(page, "الختم والتوقيع المعتمدان", PAGE.footerTop - 22, resources.bold, 10, COLORS.navy);

  const stampScale = Math.min(96 / resources.stamp.width, 76 / resources.stamp.height);
  const signatureScale = Math.min(138 / resources.signature.width, 68 / resources.signature.height);
  page.drawImage(resources.stamp, { x: PAGE.width - PAGE.margin - 100, y, width: resources.stamp.width * stampScale, height: resources.stamp.height * stampScale });
  page.drawImage(resources.signature, { x: PAGE.margin + 40, y: y + 4, width: resources.signature.width * signatureScale, height: resources.signature.height * signatureScale });
  drawRight(page, "ختم الشركة", 78, resources.regular, 8, COLORS.muted, PAGE.width - PAGE.margin - 12);
  drawLeft(page, "التوقيع المفوض", 78, resources.regular, 8, COLORS.muted, PAGE.margin + 45);
  if (!resources.letterhead) {
    drawLeft(page, referenceCode, 21, resources.latinRegular, 7, COLORS.muted);
    drawRight(page, "أُصدر إلكترونياً من نظام شركة دالي للتشغيل والصيانة", 21, resources.regular, 7, COLORS.muted);
  }
}

function drawContractSignatures(page: PDFPage, resources: PdfResources, referenceCode: string, clientName: string) {
  const gap = 12;
  const cardWidth = (PAGE.width - PAGE.margin * 2 - gap) / 2;
  const cardBottom = 96;
  const cardHeight = 108;
  const rightCardX = PAGE.margin + cardWidth + gap;
  const leftCardX = PAGE.margin;
  page.drawLine({ start: { x: PAGE.margin, y: PAGE.footerTop }, end: { x: PAGE.width - PAGE.margin, y: PAGE.footerTop }, thickness: 1, color: COLORS.line });
  drawRight(page, "توقيعات طرفي العقد", PAGE.footerTop - 20, resources.bold, 11, COLORS.navy);
  page.drawRectangle({ x: rightCardX, y: cardBottom, width: cardWidth, height: cardHeight, color: COLORS.pale, borderColor: COLORS.line, borderWidth: 0.8 });
  page.drawRectangle({ x: leftCardX, y: cardBottom, width: cardWidth, height: cardHeight, color: COLORS.pale, borderColor: COLORS.line, borderWidth: 0.8 });
  drawRight(page, "الطرف الأول - شركة دالي للتشغيل والصيانة", cardBottom + cardHeight - 22, resources.bold, 8, COLORS.navy, rightCardX + cardWidth - 12);
  drawRight(page, "الختم والتوقيع المعتمدان", cardBottom + cardHeight - 39, resources.regular, 7, COLORS.muted, rightCardX + cardWidth - 12);
  const stampScale = Math.min(74 / resources.stamp.width, 52 / resources.stamp.height);
  const signatureScale = Math.min(112 / resources.signature.width, 48 / resources.signature.height);
  page.drawImage(resources.stamp, { x: rightCardX + cardWidth - 86, y: cardBottom + 15, width: resources.stamp.width * stampScale, height: resources.stamp.height * stampScale });
  page.drawImage(resources.signature, { x: rightCardX + 16, y: cardBottom + 18, width: resources.signature.width * signatureScale, height: resources.signature.height * signatureScale });
  drawRight(page, `الطرف الثاني - ${clientName}`, cardBottom + cardHeight - 22, resources.bold, 8, COLORS.navy, leftCardX + cardWidth - 12);
  drawRight(page, "الاسم:", cardBottom + 68, resources.regular, 8, COLORS.muted, leftCardX + cardWidth - 12);
  page.drawLine({ start: { x: leftCardX + 12, y: cardBottom + 62 }, end: { x: leftCardX + cardWidth - 52, y: cardBottom + 62 }, thickness: 0.7, color: COLORS.muted });
  drawRight(page, "الصفة:", cardBottom + 42, resources.regular, 8, COLORS.muted, leftCardX + cardWidth - 12);
  page.drawLine({ start: { x: leftCardX + 12, y: cardBottom + 36 }, end: { x: leftCardX + cardWidth - 52, y: cardBottom + 36 }, thickness: 0.7, color: COLORS.muted });
  drawRight(page, "التوقيع:", cardBottom + 17, resources.regular, 8, COLORS.muted, leftCardX + cardWidth - 12);
  page.drawLine({ start: { x: leftCardX + 12, y: cardBottom + 11 }, end: { x: leftCardX + cardWidth - 59, y: cardBottom + 11 }, thickness: 0.7, color: COLORS.muted });
  if (!resources.letterhead) drawLeft(page, referenceCode, 21, resources.latinRegular, 7, COLORS.muted);
}

function drawDraftEndorsement(page: PDFPage, resources: PdfResources, referenceCode: string) {
  page.drawLine({ start: { x: PAGE.margin, y: PAGE.footerTop }, end: { x: PAGE.width - PAGE.margin, y: PAGE.footerTop }, thickness: 1, color: COLORS.line });
  drawRight(page, "مسودة للمعاينة — غير معتمدة ولا تحمل ختماً أو توقيعاً", PAGE.footerTop - 28, resources.bold, 11, COLORS.red);
  drawLeft(page, referenceCode, 21, resources.latinRegular, 7, COLORS.muted);
}

function createComposer(pdf: PDFDocument, resources: PdfResources, input: IssuedDocumentInput) {
  let pageNumber = 0;
  let page: PDFPage;
  let y: number;

  function addPage() {
    page = pdf.addPage([PAGE.width, PAGE.height]);
    pageNumber += 1;
    drawHeader(page, resources, input, pageNumber);
    y = PAGE.height - (resources.letterhead ? 148 : 128);
  }

  const contentBottom = 72;
  const signedContentBottom = PAGE.footerTop + 22;

  function ensure(height: number) {
    if (y - height < contentBottom) addPage();
  }

  function ensureWithSignatures(height: number) {
    if (y - height < signedContentBottom) addPage();
  }

  function heading(value: string, followingHeight = 52) {
    ensure(42 + followingHeight);
    drawRight(page, value, y, resources.bold, 18, COLORS.navy);
    page.drawRectangle({ x: PAGE.width - PAGE.margin - 34, y: y - 13, width: 34, height: 3, color: COLORS.red });
    y -= 43;
  }

  function field(label: string, value: string, width = PAGE.width - PAGE.margin * 2) {
    const lines = wrapWords(resources.regular, value || "غير محدد", 10, width - 24);
    const height = 25 + Math.max(1, lines.length) * 15;
    ensure(height + 8);
    page.drawRectangle({ x: PAGE.margin, y: y - height + 9, width, height, color: COLORS.pale, borderColor: COLORS.line, borderWidth: 0.6 });
    drawRight(page, label, y - 4, resources.bold, 8, COLORS.red, PAGE.margin + width - 12);
    let lineY = y - 22;
    for (const line of lines) {
      drawRight(page, line || " ", lineY, resources.regular, 10, COLORS.text, PAGE.margin + width - 12);
      lineY -= 15;
    }
    y -= height + 8;
  }

  function latinField(label: string, value: string) {
    const width = PAGE.width - PAGE.margin * 2;
    const height = 40;
    ensure(height + 8);
    page.drawRectangle({ x: PAGE.margin, y: y - height + 9, width, height, color: COLORS.pale, borderColor: COLORS.line, borderWidth: 0.6 });
    drawRight(page, label, y - 4, resources.bold, 8, COLORS.red, PAGE.margin + width - 12);
    drawRight(page, value, y - 22, resources.latinRegular, 10, COLORS.text, PAGE.margin + width - 12);
    y -= height + 8;
  }

  function paragraph(title: string, value: string, reserveSignatures = false) {
    const cleanValue = latinDigits(value).trim();
    if (!cleanValue) return;
    const lines = wrapWords(resources.regular, cleanValue, 10, PAGE.width - PAGE.margin * 2);
    const height = 29 + Math.max(1, lines.length) * 16;
    if (reserveSignatures) ensureWithSignatures(height + 8);
    else ensure(height);
    drawRight(page, title, y, resources.bold, 10, COLORS.navy);
    y -= 20;
    for (const line of lines) {
      drawRight(page, line || " ", y, resources.regular, 10, COLORS.text);
      y -= 16;
    }
    y -= 10;
  }

  function pair(rightLabel: string, rightValue: string, leftLabel: string, leftValue: string, rightLatin = false, leftLatin = false) {
    const gap = 10;
    const width = (PAGE.width - PAGE.margin * 2 - gap) / 2;
    const rightFont = rightLatin ? resources.latinBold : resources.regular;
    const leftFont = leftLatin ? resources.latinBold : resources.regular;
    const rightLines = wrapWords(rightFont, rightValue || "غير محدد", 9, width - 22);
    const leftLines = wrapWords(leftFont, leftValue || "غير محدد", 9, width - 22);
    const height = 28 + Math.max(1, rightLines.length, leftLines.length) * 14;
    ensure(height + 8);
    const rightX = PAGE.margin + width + gap;
    page.drawRectangle({ x: rightX, y: y - height + 9, width, height, color: COLORS.pale, borderColor: COLORS.line, borderWidth: 0.6 });
    page.drawRectangle({ x: PAGE.margin, y: y - height + 9, width, height, color: COLORS.pale, borderColor: COLORS.line, borderWidth: 0.6 });
    drawRight(page, rightLabel, y - 4, resources.bold, 8, COLORS.red, rightX + width - 11);
    drawRight(page, leftLabel, y - 4, resources.bold, 8, COLORS.red, PAGE.margin + width - 11);
    rightLines.forEach((line, index) => drawRight(page, line || " ", y - 22 - index * 14, rightFont, 9, COLORS.text, rightX + width - 11));
    leftLines.forEach((line, index) => drawRight(page, line || " ", y - 22 - index * 14, leftFont, 9, COLORS.text, PAGE.margin + width - 11));
    y -= height + 8;
  }

  function quotationTable(items: NonNullable<IssuedDocumentInput["quotationItems"]>, workforcePricing = false, openQuantity = false) {
    const columns = workforcePricing
      ? { description: PAGE.width - PAGE.margin - 10, quantity: 382, duration: 0, unit: 292, total: 0, accommodation: 184, transport: 86 }
      : { description: PAGE.width - PAGE.margin - 10, quantity: 302, duration: 242, unit: 173, total: 93, accommodation: 0, transport: 0 };
    const header = () => {
      ensure(34);
      page.drawRectangle({ x: PAGE.margin, y: y - 23, width: PAGE.width - PAGE.margin * 2, height: 28, color: COLORS.navy });
      drawRight(page, "الخدمة / البند", y - 13, resources.bold, 8, rgb(1, 1, 1), columns.description);
      drawRight(page, openQuantity ? "العدد" : "الكمية", y - 13, resources.bold, 8, rgb(1, 1, 1), columns.quantity);
      if (workforcePricing) {
        drawRight(page, "سعر العامل", y - 13, resources.bold, 8, rgb(1, 1, 1), columns.unit);
        drawRight(page, "السكن", y - 13, resources.bold, 8, rgb(1, 1, 1), columns.accommodation);
        drawRight(page, "النقل", y - 13, resources.bold, 8, rgb(1, 1, 1), columns.transport);
      } else {
        drawRight(page, "المدة", y - 13, resources.bold, 8, rgb(1, 1, 1), columns.duration);
        drawRight(page, "سعر الوحدة", y - 13, resources.bold, 8, rgb(1, 1, 1), columns.unit);
        drawRight(page, "الإجمالي", y - 13, resources.bold, 8, rgb(1, 1, 1), columns.total);
      }
      y -= 31;
    };
    header();
    items.forEach((item, index) => {
      const description = [publicManpowerText(item.description), publicManpowerText(item.notes)].filter(Boolean).join(" - ");
      const lines = wrapWords(resources.regular, description, 8, 175);
      const height = Math.max(31, 14 + lines.length * 12);
      ensure(height + 4);
      if (y > PAGE.height - 145) header();
      if (index % 2 === 0) page.drawRectangle({ x: PAGE.margin, y: y - height + 5, width: PAGE.width - PAGE.margin * 2, height, color: COLORS.pale });
      lines.forEach((line, lineIndex) => drawRight(page, line, y - 9 - lineIndex * 12, resources.regular, 8, COLORS.text, columns.description));
      drawRight(page, openQuantity ? "مفتوح" : arabicDigits(item.quantity), y - 9, resources.regular, 8, COLORS.text, columns.quantity);
      drawRight(page, moneyLabel(item.unitPriceHalalas), y - 9, resources.regular, 7.5, COLORS.text, columns.unit);
      if (workforcePricing) {
        drawRight(page, input.accommodationParty || "غير محدد", y - 9, resources.regular, 7.5, COLORS.text, columns.accommodation);
        drawRight(page, input.transportParty || "غير محدد", y - 9, resources.regular, 7.5, COLORS.text, columns.transport);
      } else {
        drawRight(page, `${arabicDigits(item.durationMonths)} شهر`, y - 9, resources.regular, 8, COLORS.text, columns.duration);
        drawRight(page, moneyLabel(item.lineTotalHalalas), y - 9, resources.bold, 7.5, COLORS.navy, columns.total);
      }
      page.drawLine({ start: { x: PAGE.margin, y: y - height + 5 }, end: { x: PAGE.width - PAGE.margin, y: y - height + 5 }, thickness: 0.45, color: COLORS.line });
      y -= height;
    });
    y -= 8;
  }

  addPage();
  return {
    heading,
    field,
    latinField,
    pair,
    paragraph,
    quotationTable,
    finish() {
      if (y < signedContentBottom) addPage();
      if (input.approvalState === "draft") drawDraftEndorsement(page, resources, input.referenceCode);
      else if (input.documentType === "workforce_contract") drawContractSignatures(page, resources, input.referenceCode, input.clientName);
      else drawEndorsement(page, resources, input.referenceCode);
    },
  };
}

export async function generateIssuedPdf(input: IssuedDocumentInput, assets: CompanyAsset[]) {
  if (input.pdfLanguage === "bilingual") {
    const incompleteClause = input.documentType === "workforce_contract" && input.contractClauses
      ?.filter((item) => item.included)
      .some((item) => !item.sectionEn?.trim() || !item.titleEn?.trim() || !item.bodyEn?.trim());
    if (incompleteClause) throw new Error("BILINGUAL_CONTRACT_TRANSLATION_INCOMPLETE");
    return createBilingualIssuedPdf(input, assets);
  }
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${issuedDocumentLabels[input.documentType]} - ${input.referenceCode}`);
  pdf.setAuthor("شركة دالي للتشغيل والصيانة");
  pdf.setCreator("النظام الإداري لشركة دالي للتشغيل والصيانة");
  pdf.setProducer("شركة دالي للتشغيل والصيانة");
  pdf.setCreationDate(new Date());

  const resources = await loadResources(pdf, assets);
  const composer = createComposer(pdf, resources, input);
  composer.heading(issuedDocumentLabels[input.documentType]);
  composer.pair("الرقم المرجعي", input.referenceCode, "تاريخ الإصدار", dateLabel(input.issueDate), true);
  composer.pair("العميل / الجهة", input.clientName, input.clientCr ? "السجل التجاري للعميل" : "نوع المستند", input.clientCr ? arabicDigits(input.clientCr) : issuedDocumentLabels[input.documentType]);
  if (input.clientVat) composer.pair("الرقم الضريبي للعميل", arabicDigits(input.clientVat), "عنوان المستند", input.title);
  if (input.documentType === "workforce_contract") {
    const professions = input.professions?.length
      ? input.professions
      : [{ profession: input.profession || "عمالة فنية وإنشائية", requiredCount: input.workerCount || 0, assignedWorkers: [] }];
    const assignedSummary = professions
      .flatMap((item) => (item.assignedWorkers || []).map((worker) => `${item.profession} — ${worker.fullName}${worker.iqamaNumber ? ` — إقامة ${worker.iqamaNumber}` : ""}`))
      .join("\n");
    const daliPurchaser = input.contractDirection === "dali_purchaser";
    composer.paragraph("تمهيد", daliPurchaser ? `لما كانت شركة دالي بحاجة إلى توفير قوى عاملة لأعمالها ومواقعها، وأبدى الطرف الثاني استعداده لتوريد العمالة وفق المهن والأعداد المعتمدة؛ فقد اتفق الطرفان على إبرام هذا العقد، ويعد التمهيد والملاحق جزءاً لا يتجزأ منه.` : `لما كانت شركة دالي متخصصة في توفير وتشغيل القوى العاملة وخدمات التشغيل والصيانة، ورغب الطرف الثاني في الاستفادة من هذه الخدمات؛ فقد اتفق الطرفان على إبرام هذا العقد، ويعد التمهيد والملاحق جزءاً لا يتجزأ منه.`);
    composer.heading("بيانات طرفي العقد");
    composer.pair("الطرف الأول", "شركة دالي للتشغيل والصيانة", "الطرف الثاني", input.clientName);
    composer.pair("صفة الطرف الأول", daliPurchaser ? "مشتري ومستفيد من خدمة توريد العمالة" : "مورد ومشغل القوى العاملة", "صفة الطرف الثاني", daliPurchaser ? "مورد القوى العاملة" : "المشتري والمستفيد من الخدمة");
    composer.pair("العنوان التشغيلي", "مكة المكرمة – المملكة العربية السعودية", "الرقم الضريبي للطرف الثاني", input.clientVat || "غير محدد");
    composer.heading("نطاق التعاقد");
    composer.field("موقع العمل", input.workSite || "حسب توجيه العميل المعتمد");
    composer.heading("جدول المهن والأسعار والخدمات");
    composer.quotationTable(professions.map((item) => ({ description: item.profession, quantity: item.requiredCount, durationMonths: 1, unitPriceHalalas: item.unitSalaryHalalas || 0, lineTotalHalalas: 0, notes: null })), true, input.quantityMode === "open");
    if (assignedSummary) composer.field("العمالة المسندة عند الإصدار", assignedSummary);
    else composer.field("العمالة المسندة عند الإصدار", "لم تُحدَّد أسماء العمالة عند الإصدار، ويجوز استكمال الإسناد لاحقاً من النظام وفق العدد المطلوب لكل مهنة.");
    composer.field("مدة العقد", `من ${dateLabel(input.startDate)} إلى ${dateLabel(input.endDate)}`);
    if (input.quantityMode === "open") composer.paragraph("آلية القيمة والضريبة", `هذا عقد بعدد مفتوح ولا يقرر قيمة إجمالية عند الإصدار. تحتسب الفواتير على العدد الفعلي والخدمة المنفذة، وتطبق ضريبة القيمة المضافة بنسبة ${arabicDigits((input.vatRateBps || 0) / 100)}٪ على كل فاتورة فعلية.`);
    else {
      composer.field("القيمة التعاقدية", moneyLabel(input.amountHalalas));
      if (input.amountHalalas) composer.field("القيمة التعاقدية كتابة", halalasToArabicWords(input.amountHalalas));
    }
    if (input.paymentSchedule?.length) {
      composer.heading("جدول الدفعات");
      input.paymentSchedule.forEach((payment, index) => composer.pair(`الدفعة ${index + 1}`, payment.title, "الاستحقاق والقيمة", `${dateLabel(payment.dueDate)} · ${(payment.percentageBps / 100).toFixed(2)}% · ${moneyLabel(payment.amountHalalas)}`));
    }
    composer.paragraph("الشروط الخاصة ونطاق العمل", publicManpowerText(input.details));
    composer.heading("الشروط والأحكام", 96);
    const fallbackClauses = [
      ["1. التوريد والإسناد", "يلتزم الطرف الأول بتوفير القوى العاملة وفق المهن والأعداد المعتمدة، ويجوز استكمال أسماء العمالة أو استبدالها وفق الجاهزية والمتطلبات النظامية دون الإخلال بالعدد أو المهنة المتفق عليها."],
      ["2. المباشرة وموقع العمل", "تبدأ الخدمة في التاريخ المعتمد وبعد استكمال متطلبات الدخول للموقع. ولا يجوز نقل العمالة إلى موقع أو مهام مختلفة جوهرياً إلا بموافقة مكتوبة من الطرف الأول."],
      ["3. ساعات العمل والورديات", "تحدد ساعات العمل والورديات والإجازات الأسبوعية وفق نطاق العمل والأنظمة السارية، وتحتسب الساعات الإضافية أو الورديات غير المتفق عليها وفق ملحق الأسعار أو موافقة كتابية مستقلة."],
      ["4. الإشراف والسلامة", "يتولى الطرف الثاني توجيه الأعمال اليومية داخل موقعه وتوفير بيئة عمل آمنة وتعليمات الموقع ومعدات الحماية الخاصة بالمهمة، ويلتزم الطرف الأول بالإشراف الإداري والمتابعة والاستجابة للملاحظات التشغيلية."],
      ["5. الاستبدال والغياب", "يبلغ الطرف الثاني عن الغياب أو ضعف الأداء فوراً من خلال القنوات المعتمدة، ويعمل الطرف الأول على المعالجة أو الاستبدال خلال مدة تشغيلية معقولة بحسب المهنة وتوفر البديل."],
      ["6. المقابل المالي والفوترة", "تصدر المطالبات المالية وفق دورة الفوترة والدفعات المعتمدة، وتستحق في تاريخها المحدد. ولا يجوز حسم أي مبلغ أو إجراء مقاصة إلا بمستند معتمد يبين السبب والقيمة."],
      ["7. الضرائب", "تطبق ضريبة القيمة المضافة فقط عندما تكون مفعلة في المستند المالي وبالنسبة النظامية السارية، وتظهر بصورة مستقلة عن قيمة الخدمة."],
      ["8. التزامات العمالة النظامية", "يتولى الطرف الأول إدارة المستندات النظامية والرواتب والالتزامات الواقعة عليه بصفته صاحب العمل، بينما يلتزم الطرف الثاني بعدم تكليف العمالة بما يخالف المهنة أو الأنظمة أو شروط السلامة."],
      ["9. السرية وحماية البيانات", "يلتزم الطرفان بالمحافظة على سرية المعلومات والبيانات الشخصية والتشغيلية التي يطلعان عليها، وقصر استخدامها على تنفيذ العقد وفق الأنظمة والسياسات المعتمدة."],
      ["10. عدم الاستقطاب", "لا يجوز للطرف الثاني استقطاب أو تشغيل أي عامل مقدم بموجب هذا العقد مباشرة أو بواسطة طرف آخر أثناء سريان العقد ولمدة يتفق عليها الطرفان بعد انتهائه، إلا بموافقة مكتوبة من الطرف الأول."],
      ["11. القوة القاهرة", "لا يعد أي طرف مسؤولاً عن التأخير الناشئ عن سبب خارج عن السيطرة المعقولة، على أن يخطر الطرف الآخر فوراً وأن يتخذ الإجراءات الممكنة للحد من أثره."],
      ["12. التعليق والإنهاء", "يجوز تعليق الخدمة أو إنهاء العقد عند الإخلال الجوهري بعد إشعار مكتوب ومنح مهلة معالجة مناسبة، مع بقاء الحقوق والمبالغ المستحقة حتى تاريخ التعليق أو الإنهاء."],
      ["13. التعديلات والتجديد", "لا يكون أي تعديل أو تمديد أو تجديد نافذاً إلا إذا وثق في ملحق أو إصدار جديد مرتبط بهذا العقد ومعتمد من الطرفين، مع الاحتفاظ بالإصدار السابق في السجل."],
      ["14. الإشعارات", "تعتمد المراسلات الصادرة من العناوين ووسائل الاتصال المسجلة لدى الطرفين، ويلتزم كل طرف بإبلاغ الآخر بأي تغيير يطرأ عليها."],
      ["15. النظام والاختصاص", "يخضع العقد للأنظمة السارية في المملكة العربية السعودية، ويسعى الطرفان لتسوية النزاع ودياً، فإن تعذر ذلك يكون الاختصاص للجهة القضائية المختصة."],
    ];
    void fallbackClauses;
    const selectedClauses = input.contractClauses?.length
      ? input.contractClauses.filter((item) => item.included)
      : defaultWorkforceContractClauses(input.contractDirection || "dali_supplier", false);
    const clauses = selectedClauses.map((item, index) => [`${index + 1}. ${item.title}`, item.body]);
    let currentSection = "";
    clauses.forEach(([title, body], index) => {
      const source = selectedClauses[index];
      if (source?.section && source.section !== currentSection) { currentSection = source.section; composer.heading(currentSection, 72); }
      composer.paragraph(title, body);
    });
    composer.paragraph("الاعتماد", "حرر هذا العقد إلكترونياً، ولا يصبح نافذاً إلا بعد اعتماده وتوقيعه من الطرفين. وتعد الملاحق والجداول والإصدارات المرتبطة به جزءاً منه.", true);
  } else if (input.documentType === "quotation") {
    const workforcePricing = input.activityLabel === "توريد العمالة";
    const openQuantity = input.quantityMode === "open";
    const quotationItems = input.quotationItems?.length
      ? input.quotationItems
      : [{
          description: input.details,
          quantity: 1,
          durationMonths: 1,
          unitPriceHalalas: input.subtotalHalalas || input.amountHalalas || 0,
          lineTotalHalalas: input.subtotalHalalas || input.amountHalalas || 0,
          notes: null,
        }];
    if (input.activityLabel) composer.field("نشاط العرض", input.activityLabel);
    if (input.workSite) composer.field("موقع تقديم الخدمة", input.workSite);
    composer.paragraph("نطاق العرض", publicManpowerText(input.details));
    composer.heading(workforcePricing ? "جدول المهن والأسعار والخدمات" : "جدول الخدمات والأسعار");
    composer.quotationTable(quotationItems, workforcePricing, openQuantity);
    if (openQuantity) composer.paragraph("آلية الاحتساب", `الكميات مفتوحة ولا تمثل التزاماً بعدد أو قيمة إجمالية. تطبق ضريبة القيمة المضافة بنسبة ${arabicDigits((input.vatRateBps || 0) / 100)}٪ على قيمة الفواتير الفعلية بحسب العمالة أو الأعمال المنفذة.`);
    if (!workforcePricing && !openQuantity) {
      composer.field("الإجمالي قبل الخصم والضريبة", moneyLabel(input.subtotalHalalas));
      if (input.discountHalalas) composer.field("الخصم", moneyLabel(input.discountHalalas));
      if (input.vatHalalas) composer.pair("القيمة بعد الخصم", moneyLabel((input.subtotalHalalas || 0) - (input.discountHalalas || 0)), `ضريبة القيمة المضافة (${arabicDigits((input.vatRateBps || 0) / 100)}٪)`, moneyLabel(input.vatHalalas));
      composer.field("الإجمالي النهائي", moneyLabel(input.amountHalalas));
      composer.field("الإجمالي كتابة", halalasToArabicWords(input.amountHalalas || 0));
    }
    if (input.expiryDate) composer.field("صلاحية العرض", dateLabel(input.expiryDate));
    if (input.paymentTerms) composer.paragraph("شروط الدفع", input.paymentTerms);
    if (input.assumptions) composer.paragraph("الافتراضات والاستثناءات", publicManpowerText(input.assumptions));
    if (input.terms) composer.paragraph("الشروط والأحكام", publicManpowerText(input.terms));
    composer.paragraph("اعتماد العرض", "هذا العرض صالح خلال المدة المحددة أعلاه، ويبدأ التنفيذ بعد موافقة العميل واستكمال المتطلبات النظامية والتشغيلية وإصدار العقد أو أمر الإسناد المعتمد.", true);
  } else {
    if (input.amountHalalas) {
      if (input.vatHalalas && input.subtotalHalalas) {
        composer.pair("قيمة الخدمة قبل الضريبة", moneyLabel(input.subtotalHalalas), `ضريبة القيمة المضافة (${(input.vatRateBps || 0) / 100}%)`, moneyLabel(input.vatHalalas));
        composer.field("الإجمالي شامل الضريبة", moneyLabel(input.amountHalalas));
      } else composer.field("القيمة", moneyLabel(input.amountHalalas));
      composer.field("المبلغ كتابة", halalasToArabicWords(input.amountHalalas));
    }
    if (input.expiryDate) composer.field("تاريخ الاستحقاق", dateLabel(input.expiryDate));
    composer.paragraph("البيان والتفاصيل", input.details);
    if (["invoice", "progress_claim"].includes(input.documentType)) {
      composer.paragraph("ملاحظات", "القيم مبينة بالريال السعودي، وتُطبَّق الضرائب والاستقطاعات النظامية وفق البيانات المعتمدة في المستند والعقد المرتبط به.");
    }
  }

  composer.finish();
  return pdf.save();
}

export type FinancialReportPdfInput = {
  referenceCode: string;
  from: string;
  to: string;
  trialBalance: Array<{ code: string; nameAr: string; debitHalalas: number; creditHalalas: number; netHalalas: number }>;
  income: { revenueHalalas: number; expenseHalalas: number; netIncomeHalalas: number };
  balanceSheet: { assetsHalalas: number; liabilitiesHalalas: number; equityHalalas: number; currentEarningsHalalas: number; differenceHalalas: number };
  profitability: Array<{ referenceCode: string; clientName: string; revenueHalalas: number; costHalalas: number; profitHalalas: number; marginPercent: number }>;
};

export async function generateFinancialReportPdf(input: FinancialReportPdfInput, assets: CompanyAsset[]) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`القوائم المالية - ${input.referenceCode}`);
  pdf.setAuthor("شركة دالي للتشغيل والصيانة");
  pdf.setCreator("النظام الإداري لشركة دالي للتشغيل والصيانة");
  pdf.setCreationDate(new Date());

  const resources = await loadResources(pdf, assets);
  const reportDate = new Date().toISOString().slice(0, 10);
  const headerInput: IssuedDocumentInput = {
    documentType: "progress_claim",
    referenceCode: input.referenceCode,
    clientName: "شركة دالي للتشغيل والصيانة",
    title: "القوائم والتقارير المالية",
    issueDate: reportDate,
    details: "",
  };

  let page!: PDFPage;
  let pageNumber = 0;
  let y = 0;

  const addPage = () => {
    if (pageNumber) drawEndorsement(page, resources, input.referenceCode);
    page = pdf.addPage([PAGE.width, PAGE.height]);
    pageNumber += 1;
    drawHeader(page, resources, headerInput, pageNumber);
    y = PAGE.height - 128;
  };

  const ensure = (height: number) => {
    if (y - height < PAGE.footerTop + 20) {
      addPage();
      return true;
    }
    return false;
  };

  const amountLabel = (halalas: number) =>
    `${(halalas / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س`;

  const sectionHeading = (title: string, subtitle?: string) => {
    ensure(subtitle ? 52 : 40);
    drawRight(page, title, y, resources.bold, 15, COLORS.navy);
    page.drawRectangle({
      x: PAGE.width - PAGE.margin - 38,
      y: y - 12,
      width: 38,
      height: 3,
      color: COLORS.red,
    });
    if (subtitle) drawRight(page, subtitle, y - 24, resources.regular, 7.5, COLORS.muted);
    y -= subtitle ? 48 : 36;
  };

  const infoRow = (label: string, value: string) => {
    ensure(34);
    page.drawRectangle({
      x: PAGE.margin,
      y: y - 25,
      width: PAGE.width - PAGE.margin * 2,
      height: 32,
      color: COLORS.pale,
      borderColor: COLORS.line,
      borderWidth: 0.5,
    });
    drawRight(page, label, y - 7, resources.bold, 8.5, COLORS.text);
    drawLeft(page, value, y - 7, resources.bold, 8.5, COLORS.navy);
    y -= 39;
  };

  const metricCard = (
    x: number,
    width: number,
    label: string,
    value: number,
    accent: ReturnType<typeof rgb>,
  ) => {
    page.drawRectangle({
      x,
      y: y - 64,
      width,
      height: 64,
      color: rgb(0.985, 0.988, 0.99),
      borderColor: COLORS.line,
      borderWidth: 0.7,
    });
    page.drawRectangle({ x: x + width - 4, y: y - 64, width: 4, height: 64, color: accent });
    drawRight(page, label, y - 20, resources.bold, 7.8, COLORS.muted, x + width - 12);
    drawRight(page, amountLabel(value), y - 46, resources.bold, 10.5, accent, x + width - 12);
  };

  const balanceItem = (x: number, width: number, label: string, value: number, accent = COLORS.navy) => {
    page.drawRectangle({
      x,
      y: y - 43,
      width,
      height: 43,
      color: COLORS.pale,
      borderColor: COLORS.line,
      borderWidth: 0.5,
    });
    drawRight(page, label, y - 16, resources.bold, 7.5, COLORS.muted, x + width - 10);
    drawRight(page, amountLabel(value), y - 34, resources.bold, 9, accent, x + width - 10);
  };

  const tableHeading = (title: string, subtitle: string) => {
    sectionHeading(title, subtitle);
  };

  const trialHeader = () => {
    page.drawRectangle({
      x: PAGE.margin,
      y: y - 23,
      width: PAGE.width - PAGE.margin * 2,
      height: 27,
      color: COLORS.navy,
    });
    drawRight(page, "الحساب", y - 13, resources.bold, 8, rgb(1, 1, 1), PAGE.width - PAGE.margin - 9);
    drawRight(page, "مدين", y - 13, resources.bold, 8, rgb(1, 1, 1), 318);
    drawRight(page, "دائن", y - 13, resources.bold, 8, rgb(1, 1, 1), 218);
    drawRight(page, "الرصيد", y - 13, resources.bold, 8, rgb(1, 1, 1), 118);
    y -= 29;
  };

  const profitabilityHeader = () => {
    page.drawRectangle({
      x: PAGE.margin,
      y: y - 23,
      width: PAGE.width - PAGE.margin * 2,
      height: 27,
      color: COLORS.navy,
    });
    drawRight(page, "العقد والعميل", y - 13, resources.bold, 8, rgb(1, 1, 1), PAGE.width - PAGE.margin - 9);
    drawRight(page, "الإيرادات", y - 13, resources.bold, 8, rgb(1, 1, 1), 315);
    drawRight(page, "التكاليف", y - 13, resources.bold, 8, rgb(1, 1, 1), 211);
    drawRight(page, "الربح / الهامش", y - 13, resources.bold, 8, rgb(1, 1, 1), 108);
    y -= 29;
  };

  addPage();

  page.drawRectangle({
    x: PAGE.margin,
    y: y - 82,
    width: PAGE.width - PAGE.margin * 2,
    height: 82,
    color: COLORS.navy,
  });
  page.drawRectangle({
    x: PAGE.width - PAGE.margin - 6,
    y: y - 82,
    width: 6,
    height: 82,
    color: COLORS.red,
  });
  drawRight(page, "القوائم المالية", y - 29, resources.bold, 20, rgb(1, 1, 1), PAGE.width - PAGE.margin - 18);
  drawRight(page, `تقرير مالي للفترة من ${dateLabel(input.from)} إلى ${dateLabel(input.to)}`, y - 53, resources.regular, 9, rgb(0.84, 0.88, 0.9), PAGE.width - PAGE.margin - 18);
  drawLeft(page, input.referenceCode, y - 29, resources.latinBold, 9, rgb(1, 1, 1), PAGE.margin + 16);
  drawLeft(page, dateLabel(reportDate), y - 53, resources.regular, 8, rgb(0.84, 0.88, 0.9), PAGE.margin + 16);
  y -= 104;

  sectionHeading("ملخص الأداء المالي", "القيم بالريال السعودي وتشمل الأرقام المسجلة خلال الفترة المحددة");
  ensure(74);
  const cardGap = 8;
  const cardWidth = (PAGE.width - PAGE.margin * 2 - cardGap * 2) / 3;
  metricCard(PAGE.margin, cardWidth, "صافي الربح أو الخسارة", input.income.netIncomeHalalas, input.income.netIncomeHalalas < 0 ? COLORS.red : rgb(0.05, 0.48, 0.33));
  metricCard(PAGE.margin + cardWidth + cardGap, cardWidth, "إجمالي المصروفات", input.income.expenseHalalas, COLORS.red);
  metricCard(PAGE.margin + (cardWidth + cardGap) * 2, cardWidth, "إجمالي الإيرادات", input.income.revenueHalalas, COLORS.navy);
  y -= 78;
  infoRow(
    "صافي النتيجة كتابة",
    `${input.income.netIncomeHalalas < 0 ? "خسارة مقدارها " : ""}${halalasToArabicWords(Math.abs(input.income.netIncomeHalalas))}`,
  );

  sectionHeading("قائمة المركز المالي", "عرض موجز للأصول والالتزامات وحقوق الملكية ونتيجة الاتزان");
  ensure(98);
  const halfWidth = (PAGE.width - PAGE.margin * 2 - 8) / 2;
  balanceItem(PAGE.margin, halfWidth, "الالتزامات", input.balanceSheet.liabilitiesHalalas);
  balanceItem(PAGE.margin + halfWidth + 8, halfWidth, "الأصول", input.balanceSheet.assetsHalalas);
  y -= 49;
  balanceItem(PAGE.margin, halfWidth, "نتيجة الأعمال المتراكمة", input.balanceSheet.currentEarningsHalalas);
  balanceItem(PAGE.margin + halfWidth + 8, halfWidth, "حقوق الملكية", input.balanceSheet.equityHalalas);
  y -= 49;
  const differenceColor = input.balanceSheet.differenceHalalas === 0 ? rgb(0.05, 0.48, 0.33) : COLORS.red;
  infoRow("فرق الاتزان", amountLabel(input.balanceSheet.differenceHalalas));
  page.drawRectangle({
    x: PAGE.margin,
    y: y + 14,
    width: 4,
    height: 32,
    color: differenceColor,
  });

  tableHeading("ميزان المراجعة", "تفاصيل حركة وأرصدة الحسابات خلال الفترة");
  trialHeader();
  if (!input.trialBalance.length) {
    infoRow("الحالة", "لا توجد حركات مالية ضمن الفترة المحددة");
  } else {
    input.trialBalance.forEach((row, index) => {
      if (ensure(27)) {
        tableHeading("ميزان المراجعة - تابع", "تفاصيل حركة وأرصدة الحسابات خلال الفترة");
        trialHeader();
      }
      if (index % 2 === 0) {
        page.drawRectangle({
          x: PAGE.margin,
          y: y - 21,
          width: PAGE.width - PAGE.margin * 2,
          height: 25,
          color: COLORS.pale,
        });
      }
      drawRight(page, `${row.code} - ${row.nameAr}`, y - 12, resources.regular, 7.2, COLORS.text, PAGE.width - PAGE.margin - 9);
      drawRight(page, amountLabel(row.debitHalalas), y - 12, resources.regular, 7, COLORS.text, 318);
      drawRight(page, amountLabel(row.creditHalalas), y - 12, resources.regular, 7, COLORS.text, 218);
      drawRight(page, amountLabel(row.netHalalas), y - 12, resources.bold, 7, row.netHalalas < 0 ? COLORS.red : COLORS.navy, 118);
      page.drawLine({
        start: { x: PAGE.margin, y: y - 21 },
        end: { x: PAGE.width - PAGE.margin, y: y - 21 },
        thickness: 0.35,
        color: COLORS.line,
      });
      y -= 25;
    });

    if (ensure(34)) {
      tableHeading("ميزان المراجعة - تابع", "إجماليات الحسابات خلال الفترة");
      trialHeader();
    }
    const trialTotals = input.trialBalance.reduce(
      (totals, row) => ({
        debit: totals.debit + row.debitHalalas,
        credit: totals.credit + row.creditHalalas,
        net: totals.net + row.netHalalas,
      }),
      { debit: 0, credit: 0, net: 0 },
    );
    page.drawRectangle({
      x: PAGE.margin,
      y: y - 25,
      width: PAGE.width - PAGE.margin * 2,
      height: 29,
      color: rgb(0.91, 0.94, 0.95),
      borderColor: COLORS.navy,
      borderWidth: 0.6,
    });
    drawRight(page, "الإجمالي", y - 14, resources.bold, 8, COLORS.navy, PAGE.width - PAGE.margin - 9);
    drawRight(page, amountLabel(trialTotals.debit), y - 14, resources.bold, 7.2, COLORS.navy, 318);
    drawRight(page, amountLabel(trialTotals.credit), y - 14, resources.bold, 7.2, COLORS.navy, 218);
    drawRight(page, amountLabel(trialTotals.net), y - 14, resources.bold, 7.2, trialTotals.net < 0 ? COLORS.red : COLORS.navy, 118);
    y -= 35;
  }

  tableHeading("ربحية العقود", "مقارنة الإيرادات والتكاليف وصافي الربح لكل عقد");
  profitabilityHeader();
  if (!input.profitability.length) {
    infoRow("الحالة", "لا توجد عقود ذات حركة مالية ضمن الفترة المحددة");
  } else {
    input.profitability.forEach((row, index) => {
      if (ensure(30)) {
        tableHeading("ربحية العقود - تابع", "مقارنة الإيرادات والتكاليف وصافي الربح لكل عقد");
        profitabilityHeader();
      }
      if (index % 2 === 0) {
        page.drawRectangle({
          x: PAGE.margin,
          y: y - 23,
          width: PAGE.width - PAGE.margin * 2,
          height: 27,
          color: COLORS.pale,
        });
      }
      const party = `${row.referenceCode} - ${row.clientName}`;
      drawRight(page, party, y - 12, resources.regular, 7, COLORS.text, PAGE.width - PAGE.margin - 9);
      drawRight(page, amountLabel(row.revenueHalalas), y - 12, resources.regular, 6.8, COLORS.text, 315);
      drawRight(page, amountLabel(row.costHalalas), y - 12, resources.regular, 6.8, COLORS.text, 211);
      drawRight(
        page,
        `${amountLabel(row.profitHalalas)} (${row.marginPercent.toFixed(1)}%)`,
        y - 12,
        resources.bold,
        6.8,
        row.profitHalalas < 0 ? COLORS.red : rgb(0.05, 0.48, 0.33),
        108,
      );
      page.drawLine({
        start: { x: PAGE.margin, y: y - 23 },
        end: { x: PAGE.width - PAGE.margin, y: y - 23 },
        thickness: 0.35,
        color: COLORS.line,
      });
      y -= 27;
    });

    if (ensure(34)) {
      tableHeading("ربحية العقود - تابع", "إجماليات العقود خلال الفترة");
      profitabilityHeader();
    }
    const profitabilityTotals = input.profitability.reduce(
      (totals, row) => ({
        revenue: totals.revenue + row.revenueHalalas,
        cost: totals.cost + row.costHalalas,
        profit: totals.profit + row.profitHalalas,
      }),
      { revenue: 0, cost: 0, profit: 0 },
    );
    const totalMargin = profitabilityTotals.revenue
      ? (profitabilityTotals.profit / profitabilityTotals.revenue) * 100
      : 0;
    page.drawRectangle({
      x: PAGE.margin,
      y: y - 25,
      width: PAGE.width - PAGE.margin * 2,
      height: 29,
      color: rgb(0.91, 0.94, 0.95),
      borderColor: COLORS.navy,
      borderWidth: 0.6,
    });
    drawRight(page, "الإجمالي", y - 14, resources.bold, 8, COLORS.navy, PAGE.width - PAGE.margin - 9);
    drawRight(page, amountLabel(profitabilityTotals.revenue), y - 14, resources.bold, 7, COLORS.navy, 315);
    drawRight(page, amountLabel(profitabilityTotals.cost), y - 14, resources.bold, 7, COLORS.navy, 211);
    drawRight(
      page,
      `${amountLabel(profitabilityTotals.profit)} (${totalMargin.toFixed(1)}%)`,
      y - 14,
      resources.bold,
      7,
      profitabilityTotals.profit < 0 ? COLORS.red : rgb(0.05, 0.48, 0.33),
      108,
    );
    y -= 35;
  }

  drawEndorsement(page, resources, input.referenceCode);
  return pdf.save();
}
