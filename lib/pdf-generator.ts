import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, PDFFont, PDFImage, PDFPage, rgb } from "pdf-lib";
import cairoArabicBoldDataUrl from "@fontsource/cairo/files/cairo-arabic-700-normal.woff?inline";
import cairoLatinBoldDataUrl from "@fontsource/cairo/files/cairo-latin-700-normal.woff?inline";
import { getRuntimeEnv } from "@/lib/runtime-env";
import { halalasToArabicWords } from "@/lib/arabic-money";

export const issuedDocumentLabels = {
  workforce_contract: "عقد توريد وتشغيل قوى عاملة",
  quotation: "عرض سعر",
  progress_claim: "مستخلص أعمال",
  invoice: "فاتورة",
  receipt: "سند قبض",
  payment_voucher: "سند صرف",
  construction_record: "سجل مشروع مقاولات",
} as const;

export type IssuedDocumentType = keyof typeof issuedDocumentLabels;

export type IssuedDocumentInput = {
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
    assignedWorkers?: Array<{ fullName: string; iqamaNumber: string | null }>;
  }>;
  paymentSchedule?: Array<{ title: string; dueDate: string; percentageBps: number; amountHalalas: number }>;
  startDate?: string;
  endDate?: string;
  activityLabel?: string;
  quantityMode?: "fixed" | "open";
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
  }>;
};

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

function dataUrlBytes(value: string) {
  const encoded = value.slice(value.indexOf(",") + 1);
  const binary = atob(encoded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function embedImage(pdf: PDFDocument, bytes: Uint8Array, contentType: string) {
  if (contentType === "image/png") return pdf.embedPng(bytes);
  if (contentType === "image/jpeg" || contentType === "image/jpg") return pdf.embedJpg(bytes);
  throw new Error("صيغة صورة الختم أو التوقيع غير مدعومة");
}

async function loadResources(pdf: PDFDocument, assets: CompanyAsset[]): Promise<PdfResources> {
  pdf.registerFontkit(fontkit);
  const [regular, bold, latinRegular, latinBold] = await Promise.all([
    pdf.embedFont(dataUrlBytes(cairoArabicBoldDataUrl), { subset: true }),
    pdf.embedFont(dataUrlBytes(cairoArabicBoldDataUrl), { subset: true }),
    pdf.embedFont(dataUrlBytes(cairoLatinBoldDataUrl), { subset: true }),
    pdf.embedFont(dataUrlBytes(cairoLatinBoldDataUrl), { subset: true }),
  ]);

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
  return String(value).replace(/\d/g, (digit) => "٠١٢٣٤٥٦٧٨٩"[Number(digit)]);
}

function printableText(font: PDFFont, value: string) {
  const supported = new Set(font.getCharacterSet());
  const normalized = String(value || "-")
    .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "")
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/\u00a0/g, " ");
  return Array.from(normalized).map((character) => {
    const code = character.codePointAt(0)!;
    if (supported.has(code)) return character;
    if (/\d/.test(character)) {
      const alternative = "٠١٢٣٤٥٦٧٨٩"[Number(character)];
      if (supported.has(alternative.codePointAt(0)!)) return alternative;
    }
    const alternatives: Record<string, string> = { ".": "٫", ",": "،", ";": "؛", "?": "؟", "%": "٪", ":": " ", "-": " " };
    const alternative = alternatives[character];
    return alternative && supported.has(alternative.codePointAt(0)!) ? alternative : " ";
  }).join("").replace(/\s{2,}/g, " ").trim() || "-";
}

function textWidth(font: PDFFont, value: string, size: number) {
  return font.widthOfTextAtSize(printableText(font, value), size);
}

function drawRight(page: PDFPage, value: string, y: number, font: PDFFont, size: number, color = COLORS.text, right = PAGE.width - PAGE.margin) {
  const text = printableText(font, value);
  page.drawText(text, { x: right - textWidth(font, text, size), y, font, size, color });
}

function drawLeft(page: PDFPage, value: string, y: number, font: PDFFont, size: number, color = COLORS.text, left = PAGE.margin) {
  page.drawText(printableText(font, value), { x: left, y, font, size, color });
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
  return new Intl.DateTimeFormat("ar-SA-u-ca-gregory", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(date);
}

function moneyLabel(halalas?: number) {
  if (!halalas) return "غير محدد";
  const value = (halalas / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/,/g, "٬").replace(/\./g, "٫");
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

function drawContractSignatures(page: PDFPage, resources: PdfResources, referenceCode: string) {
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
  drawRight(page, "الطرف الثاني", cardBottom + cardHeight - 22, resources.bold, 8, COLORS.navy, leftCardX + cardWidth - 12);
  drawRight(page, "الاسم:", cardBottom + 68, resources.regular, 8, COLORS.muted, leftCardX + cardWidth - 12);
  page.drawLine({ start: { x: leftCardX + 12, y: cardBottom + 62 }, end: { x: leftCardX + cardWidth - 52, y: cardBottom + 62 }, thickness: 0.7, color: COLORS.muted });
  drawRight(page, "الصفة:", cardBottom + 42, resources.regular, 8, COLORS.muted, leftCardX + cardWidth - 12);
  page.drawLine({ start: { x: leftCardX + 12, y: cardBottom + 36 }, end: { x: leftCardX + cardWidth - 52, y: cardBottom + 36 }, thickness: 0.7, color: COLORS.muted });
  drawRight(page, "التوقيع:", cardBottom + 17, resources.regular, 8, COLORS.muted, leftCardX + cardWidth - 12);
  page.drawLine({ start: { x: leftCardX + 12, y: cardBottom + 11 }, end: { x: leftCardX + cardWidth - 59, y: cardBottom + 11 }, thickness: 0.7, color: COLORS.muted });
  if (!resources.letterhead) drawLeft(page, referenceCode, 21, resources.latinRegular, 7, COLORS.muted);
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

  function ensure(height: number) {
    if (y - height < PAGE.footerTop + 22) addPage();
  }

  function heading(value: string) {
    ensure(42);
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

  function paragraph(title: string, value: string) {
    const lines = wrapWords(resources.regular, value, 10, PAGE.width - PAGE.margin * 2);
    const height = 29 + Math.max(1, lines.length) * 16;
    ensure(height);
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
    const columns = { description: PAGE.width - PAGE.margin - 10, quantity: 302, duration: 242, unit: 173, total: 93 };
    const header = () => {
      ensure(34);
      page.drawRectangle({ x: PAGE.margin, y: y - 23, width: PAGE.width - PAGE.margin * 2, height: 28, color: COLORS.navy });
      drawRight(page, "الخدمة / البند", y - 13, resources.bold, 8, rgb(1, 1, 1), columns.description);
      drawRight(page, openQuantity ? "العدد" : "الكمية", y - 13, resources.bold, 8, rgb(1, 1, 1), columns.quantity);
      drawRight(page, "المدة", y - 13, resources.bold, 8, rgb(1, 1, 1), columns.duration);
      drawRight(page, workforcePricing ? "راتب العامل" : "سعر الوحدة", y - 13, resources.bold, 8, rgb(1, 1, 1), columns.unit);
      if (!workforcePricing) drawRight(page, "الإجمالي", y - 13, resources.bold, 8, rgb(1, 1, 1), columns.total);
      y -= 31;
    };
    header();
    items.forEach((item, index) => {
      const description = item.notes ? `${item.description} - ${item.notes}` : item.description;
      const lines = wrapWords(resources.regular, description, 8, 175);
      const height = Math.max(31, 14 + lines.length * 12);
      ensure(height + 4);
      if (y > PAGE.height - 145) header();
      if (index % 2 === 0) page.drawRectangle({ x: PAGE.margin, y: y - height + 5, width: PAGE.width - PAGE.margin * 2, height, color: COLORS.pale });
      lines.forEach((line, lineIndex) => drawRight(page, line, y - 9 - lineIndex * 12, resources.regular, 8, COLORS.text, columns.description));
      drawRight(page, openQuantity ? "مفتوح" : arabicDigits(item.quantity), y - 9, resources.regular, 8, COLORS.text, columns.quantity);
      drawRight(page, `${arabicDigits(item.durationMonths)} شهر`, y - 9, resources.regular, 8, COLORS.text, columns.duration);
      drawRight(page, moneyLabel(item.unitPriceHalalas), y - 9, resources.regular, 7.5, COLORS.text, columns.unit);
      if (!workforcePricing) drawRight(page, moneyLabel(item.lineTotalHalalas), y - 9, resources.bold, 7.5, COLORS.navy, columns.total);
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
      if (input.documentType === "workforce_contract") drawContractSignatures(page, resources, input.referenceCode);
      else drawEndorsement(page, resources, input.referenceCode);
    },
  };
}

export async function generateIssuedPdf(input: IssuedDocumentInput, assets: CompanyAsset[]) {
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
    const professionSummary = professions
      .map((item) => input.quantityMode === "open" ? `${item.profession}: العدد مفتوح بحسب طلبات الإسناد` : `${item.profession}: ${item.requiredCount} عامل/فني`)
      .join("\n");
    const assignedSummary = professions
      .flatMap((item) => (item.assignedWorkers || []).map((worker) => `${item.profession} — ${worker.fullName}${worker.iqamaNumber ? ` — إقامة ${worker.iqamaNumber}` : ""}`))
      .join("\n");
    composer.paragraph("تمهيد", `لما كان الطرف الأول شركة متخصصة في توفير وتشغيل القوى العاملة وخدمات التشغيل والصيانة، ورغب الطرف الثاني في الاستفادة من هذه الخدمات؛ فقد اتفق الطرفان، وهما بكامل أهليتهما المعتبرة، على إبرام هذا العقد وفق البنود والشروط الآتية، ويعد هذا التمهيد والملاحق جزءاً لا يتجزأ منه.`);
    composer.heading("بيانات طرفي العقد");
    composer.pair("الطرف الأول", "شركة دالي للتشغيل والصيانة", "الطرف الثاني", input.clientName);
    composer.pair("صفة الطرف الأول", "مورد ومشغل القوى العاملة", "السجل التجاري للطرف الثاني", input.clientCr || "غير محدد");
    composer.pair("العنوان التشغيلي", "مكة المكرمة – المملكة العربية السعودية", "الرقم الضريبي للطرف الثاني", input.clientVat || "غير محدد");
    composer.heading("نطاق التعاقد");
    composer.field("موقع العمل", input.workSite || "حسب توجيه العميل المعتمد");
    composer.field("المهن والأعداد المطلوبة", professionSummary);
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
    composer.paragraph("الشروط الخاصة ونطاق العمل", input.details);
    composer.heading("الشروط والأحكام");
    const clauses = [
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
    clauses.forEach(([title, body]) => composer.paragraph(title, body));
    composer.paragraph("الاعتماد", "حرر هذا العقد إلكترونياً، ولا يصبح نافذاً إلا بعد اعتماده وتوقيعه من الطرفين. وتعد الملاحق والجداول والإصدارات المرتبطة به جزءاً منه.");
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
    composer.paragraph("نطاق العرض", input.details);
    composer.heading(workforcePricing ? "بيان العمالة والمهن والرواتب" : "جدول الخدمات والأسعار");
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
    if (input.assumptions) composer.paragraph("الافتراضات والاستثناءات", input.assumptions);
    if (input.terms) composer.paragraph("الشروط والأحكام", input.terms);
    composer.paragraph("اعتماد العرض", "هذا العرض صالح خلال المدة المحددة أعلاه، ويبدأ التنفيذ بعد موافقة العميل واستكمال المتطلبات النظامية والتشغيلية وإصدار العقد أو أمر الإسناد المعتمد.");
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
  const pdf=await PDFDocument.create();pdf.setTitle(`القوائم المالية - ${input.referenceCode}`);pdf.setAuthor("شركة دالي للتشغيل والصيانة");pdf.setCreator("النظام الإداري لشركة دالي للتشغيل والصيانة");pdf.setCreationDate(new Date());
  const resources=await loadResources(pdf,assets);let page!:PDFPage;let pageNumber=0;let y=0;const headerInput:IssuedDocumentInput={documentType:"progress_claim",referenceCode:input.referenceCode,clientName:"شركة دالي للتشغيل والصيانة",title:"القوائم والتقارير المالية",issueDate:new Date().toISOString().slice(0,10),details:""};
  const addPage=()=>{if(pageNumber)drawEndorsement(page,resources,input.referenceCode);page=pdf.addPage([PAGE.width,PAGE.height]);pageNumber++;drawHeader(page,resources,headerInput,pageNumber);y=PAGE.height-128;};
  const ensure=(height:number)=>{if(y-height<PAGE.footerTop+20)addPage();};const heading=(text:string)=>{ensure(36);drawRight(page,text,y,resources.bold,16,COLORS.navy);page.drawRectangle({x:PAGE.width-PAGE.margin-32,y:y-11,width:32,height:3,color:COLORS.red});y-=35;};
  const summary=(label:string,value:number)=>{ensure(34);page.drawRectangle({x:PAGE.margin,y:y-25,width:PAGE.width-PAGE.margin*2,height:32,color:COLORS.pale,borderColor:COLORS.line,borderWidth:.5});drawRight(page,label,y-7,resources.bold,9,COLORS.text);drawLeft(page,moneyLabel(value),y-7,resources.bold,9,COLORS.navy);y-=39;};
  const textSummary=(label:string,value:string)=>{ensure(34);page.drawRectangle({x:PAGE.margin,y:y-25,width:PAGE.width-PAGE.margin*2,height:32,color:COLORS.pale,borderColor:COLORS.line,borderWidth:.5});drawRight(page,label,y-7,resources.bold,9,COLORS.text);drawLeft(page,value,y-7,resources.regular,8,COLORS.navy);y-=39;};
  const tableHeader=(columns:Array<{label:string;x:number}>)=>{ensure(28);page.drawRectangle({x:PAGE.margin,y:y-20,width:PAGE.width-PAGE.margin*2,height:25,color:COLORS.navy});columns.forEach(column=>drawRight(page,column.label,y-11,resources.bold,8,rgb(1,1,1),column.x));y-=27;};
  addPage();heading("القوائم المالية");textSummary("الفترة",`من ${dateLabel(input.from)} إلى ${dateLabel(input.to)}`);summary("إجمالي الإيرادات",input.income.revenueHalalas);summary("إجمالي المصروفات",input.income.expenseHalalas);summary("صافي الربح أو الخسارة",input.income.netIncomeHalalas);textSummary("صافي النتيجة كتابة",`${input.income.netIncomeHalalas<0?"خسارة مقدارها ":""}${halalasToArabicWords(Math.abs(input.income.netIncomeHalalas))}`);
  heading("قائمة المركز المالي");summary("الأصول",input.balanceSheet.assetsHalalas);summary("الالتزامات",input.balanceSheet.liabilitiesHalalas);summary("حقوق الملكية",input.balanceSheet.equityHalalas);summary("نتيجة الأعمال المتراكمة",input.balanceSheet.currentEarningsHalalas);summary("فرق الاتزان",input.balanceSheet.differenceHalalas);
  heading("ميزان المراجعة");const trialColumns=[{label:"الحساب",x:PAGE.width-PAGE.margin-8},{label:"مدين",x:330},{label:"دائن",x:225},{label:"الرصيد",x:120}];tableHeader(trialColumns);for(const row of input.trialBalance){ensure(28);if(y>PAGE.height-150)tableHeader(trialColumns);drawRight(page,`${row.code} - ${row.nameAr}`,y-8,resources.regular,7,COLORS.text,PAGE.width-PAGE.margin-8);drawRight(page,moneyLabel(row.debitHalalas),y-8,resources.regular,7,COLORS.text,330);drawRight(page,moneyLabel(row.creditHalalas),y-8,resources.regular,7,COLORS.text,225);drawRight(page,moneyLabel(row.netHalalas),y-8,resources.bold,7,COLORS.navy,120);page.drawLine({start:{x:PAGE.margin,y:y-14},end:{x:PAGE.width-PAGE.margin,y:y-14},thickness:.4,color:COLORS.line});y-=24;}
  heading("ربحية العقود");const profitColumns=[{label:"العقد والعميل",x:PAGE.width-PAGE.margin-8},{label:"الإيرادات",x:320},{label:"التكاليف",x:210},{label:"النتيجة",x:105}];tableHeader(profitColumns);for(const row of input.profitability){ensure(31);drawRight(page,`${row.referenceCode} - ${row.clientName}`,y-8,resources.regular,7,COLORS.text,PAGE.width-PAGE.margin-8);drawRight(page,moneyLabel(row.revenueHalalas),y-8,resources.regular,7,COLORS.text,320);drawRight(page,moneyLabel(row.costHalalas),y-8,resources.regular,7,COLORS.text,210);drawRight(page,`${moneyLabel(row.profitHalalas)} (${row.marginPercent}%)`,y-8,resources.bold,7,row.profitHalalas<0?COLORS.red:COLORS.navy,105);page.drawLine({start:{x:PAGE.margin,y:y-14},end:{x:PAGE.width-PAGE.margin,y:y-14},thickness:.4,color:COLORS.line});y-=26;}
  drawEndorsement(page,resources,input.referenceCode);return pdf.save();
}
