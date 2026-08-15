import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, PDFFont, PDFImage, PDFPage, rgb } from "pdf-lib";
import tajawalRegularDataUrl from "@fontsource/tajawal/files/tajawal-arabic-400-normal.woff?inline";
import tajawalBoldDataUrl from "@fontsource/tajawal/files/tajawal-arabic-700-normal.woff?inline";
import { getRuntimeEnv } from "@/lib/runtime-env";

export const issuedDocumentLabels = {
  workforce_contract: "عقد مقاولات لتوفير العمالة",
  quotation: "عرض سعر",
  progress_claim: "مستخلص أعمال",
  invoice: "فاتورة",
  receipt: "سند قبض",
  payment_voucher: "سند صرف",
} as const;

export type IssuedDocumentType = keyof typeof issuedDocumentLabels;

export type IssuedDocumentInput = {
  documentType: IssuedDocumentType;
  referenceCode: string;
  clientName: string;
  clientCr?: string;
  clientVat?: string;
  title: string;
  issueDate: string;
  expiryDate?: string;
  amountHalalas?: number;
  details: string;
  workSite?: string;
  profession?: string;
  workerCount?: number;
  professions?: Array<{
    profession: string;
    requiredCount: number;
    assignedWorkers?: Array<{ fullName: string; iqamaNumber: string | null }>;
  }>;
  startDate?: string;
  endDate?: string;
};

type CompanyAsset = {
  slot: "stamp" | "signature";
  storageKey: string;
  contentType: string;
};

type PdfResources = {
  regular: PDFFont;
  bold: PDFFont;
  logo: PDFImage | null;
  stamp: PDFImage;
  signature: PDFImage;
};

const PAGE = { width: 595.28, height: 841.89, margin: 48, footerTop: 184 };
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
  const [regular, bold] = await Promise.all([
    pdf.embedFont(dataUrlBytes(tajawalRegularDataUrl), { subset: true }),
    pdf.embedFont(dataUrlBytes(tajawalBoldDataUrl), { subset: true }),
  ]);

  const runtime = getRuntimeEnv();
  const logoResponse = await runtime.ASSETS.fetch(new Request("https://assets.local/dally-logo.jpg"));
  const logo = logoResponse.ok
    ? await pdf.embedJpg(new Uint8Array(await logoResponse.arrayBuffer()))
    : null;

  const stampAsset = assets.find((asset) => asset.slot === "stamp");
  const signatureAsset = assets.find((asset) => asset.slot === "signature");
  if (!stampAsset || !signatureAsset) {
    throw new Error("يجب رفع الختم والتوقيع المعتمدين قبل إصدار المستند");
  }

  const [stampObject, signatureObject] = await Promise.all([
    runtime.BUCKET.get(stampAsset.storageKey),
    runtime.BUCKET.get(signatureAsset.storageKey),
  ]);
  if (!stampObject || !signatureObject) throw new Error("تعذّر تحميل الختم أو التوقيع المعتمد");

  const [stamp, signature] = await Promise.all([
    embedImage(pdf, new Uint8Array(await stampObject.arrayBuffer()), stampAsset.contentType),
    embedImage(pdf, new Uint8Array(await signatureObject.arrayBuffer()), signatureAsset.contentType),
  ]);
  return { regular, bold, logo, stamp, signature };
}

function textWidth(font: PDFFont, value: string, size: number) {
  return font.widthOfTextAtSize(value || " ", size);
}

function drawRight(page: PDFPage, value: string, y: number, font: PDFFont, size: number, color = COLORS.text, right = PAGE.width - PAGE.margin) {
  page.drawText(value || "—", { x: right - textWidth(font, value || "—", size), y, font, size, color });
}

function drawLeft(page: PDFPage, value: string, y: number, font: PDFFont, size: number, color = COLORS.text, left = PAGE.margin) {
  page.drawText(value || "—", { x: left, y, font, size, color });
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
  return new Intl.NumberFormat("ar-SA", { style: "currency", currency: "SAR", maximumFractionDigits: 2 }).format(halalas / 100);
}

function drawHeader(page: PDFPage, resources: PdfResources, input: IssuedDocumentInput, pageNumber: number) {
  const top = PAGE.height - PAGE.margin;
  page.drawRectangle({ x: 0, y: PAGE.height - 10, width: PAGE.width, height: 10, color: COLORS.navy });
  page.drawRectangle({ x: PAGE.width - 10, y: PAGE.height - 10, width: 10, height: 10, color: COLORS.red });
  if (resources.logo) {
    const ratio = resources.logo.width / resources.logo.height;
    const height = 42;
    page.drawImage(resources.logo, { x: PAGE.width - PAGE.margin - height * ratio, y: top - height, width: height * ratio, height });
  } else {
    drawRight(page, "شركة دالي للتشغيل والصيانة", top - 26, resources.bold, 16, COLORS.navy);
  }
  drawLeft(page, input.referenceCode, top - 10, resources.bold, 9, COLORS.navy);
  drawLeft(page, `صفحة ${pageNumber}`, top - 28, resources.regular, 8, COLORS.muted);
  page.drawLine({ start: { x: PAGE.margin, y: top - 58 }, end: { x: PAGE.width - PAGE.margin, y: top - 58 }, thickness: 1, color: COLORS.line });
}

function drawEndorsement(page: PDFPage, resources: PdfResources, referenceCode: string) {
  const y = 53;
  page.drawLine({ start: { x: PAGE.margin, y: PAGE.footerTop }, end: { x: PAGE.width - PAGE.margin, y: PAGE.footerTop }, thickness: 1, color: COLORS.line });
  drawRight(page, "الختم والتوقيع المعتمدان", PAGE.footerTop - 22, resources.bold, 10, COLORS.navy);

  const stampScale = Math.min(96 / resources.stamp.width, 76 / resources.stamp.height);
  const signatureScale = Math.min(138 / resources.signature.width, 68 / resources.signature.height);
  page.drawImage(resources.stamp, { x: PAGE.width - PAGE.margin - 100, y, width: resources.stamp.width * stampScale, height: resources.stamp.height * stampScale });
  page.drawImage(resources.signature, { x: PAGE.margin + 40, y: y + 4, width: resources.signature.width * signatureScale, height: resources.signature.height * signatureScale });
  drawRight(page, "ختم الشركة", 39, resources.regular, 8, COLORS.muted, PAGE.width - PAGE.margin - 12);
  drawLeft(page, "التوقيع المفوض", 39, resources.regular, 8, COLORS.muted, PAGE.margin + 45);
  drawLeft(page, referenceCode, 21, resources.regular, 7, COLORS.muted);
  drawRight(page, "أُصدر إلكترونياً من نظام شركة دالي للتشغيل والصيانة", 21, resources.regular, 7, COLORS.muted);
}

function createComposer(pdf: PDFDocument, resources: PdfResources, input: IssuedDocumentInput) {
  let pageNumber = 0;
  let page: PDFPage;
  let y: number;

  function addPage() {
    if (pageNumber > 0) drawEndorsement(page, resources, input.referenceCode);
    page = pdf.addPage([PAGE.width, PAGE.height]);
    pageNumber += 1;
    drawHeader(page, resources, input, pageNumber);
    y = PAGE.height - 128;
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

  addPage();
  return {
    heading,
    field,
    paragraph,
    finish() { drawEndorsement(page, resources, input.referenceCode); },
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
  composer.field("الرقم المرجعي", input.referenceCode);
  composer.field("تاريخ الإصدار", dateLabel(input.issueDate));
  composer.field("العميل / الجهة", input.clientName);
  if (input.clientCr) composer.field("السجل التجاري للعميل", input.clientCr);
  if (input.clientVat) composer.field("الرقم الضريبي للعميل", input.clientVat);
  composer.field("الموضوع", input.title);

  if (input.documentType === "workforce_contract") {
    const professions = input.professions?.length
      ? input.professions
      : [{ profession: input.profession || "عمالة فنية وإنشائية", requiredCount: input.workerCount || 0, assignedWorkers: [] }];
    const professionSummary = professions
      .map((item) => `${item.profession}: ${item.requiredCount} عامل/فني`)
      .join("\n");
    const assignedSummary = professions
      .flatMap((item) => (item.assignedWorkers || []).map((worker) => `${item.profession} — ${worker.fullName}${worker.iqamaNumber ? ` — إقامة ${worker.iqamaNumber}` : ""}`))
      .join("\n");
    composer.paragraph("تمهيد", `اتفق الطرفان على أن توفر شركة دالي للتشغيل والصيانة القوى العاملة المبينة في هذا العقد لصالح ${input.clientName}، وفق نطاق العمل والمدد والشروط الواردة أدناه.`);
    composer.field("موقع العمل", input.workSite || "حسب توجيه العميل المعتمد");
    composer.field("المهن والأعداد المطلوبة", professionSummary);
    if (assignedSummary) composer.field("العمالة المسندة عند الإصدار", assignedSummary);
    else composer.field("العمالة المسندة عند الإصدار", "لم تُحدَّد أسماء العمالة عند الإصدار، ويجوز استكمال الإسناد لاحقاً من النظام وفق العدد المطلوب لكل مهنة.");
    composer.field("مدة العقد", `من ${dateLabel(input.startDate)} إلى ${dateLabel(input.endDate)}`);
    composer.field("القيمة التعاقدية", moneyLabel(input.amountHalalas));
    composer.paragraph("نطاق العمل والشروط الخاصة", input.details);
    composer.paragraph("الاعتماد", "يصبح هذا العقد نافذاً بعد اعتماده من الطرفين، وتخضع أي أعمال إضافية أو تعديلات لموافقة كتابية موثقة.");
  } else {
    if (input.amountHalalas) composer.field("القيمة", moneyLabel(input.amountHalalas));
    if (input.expiryDate) composer.field(input.documentType === "quotation" ? "صلاحية العرض" : "تاريخ الاستحقاق", dateLabel(input.expiryDate));
    composer.paragraph("البيان والتفاصيل", input.details);
    if (["quotation", "invoice", "progress_claim"].includes(input.documentType)) {
      composer.paragraph("ملاحظات", "القيم مبينة بالريال السعودي، وتُطبَّق الضرائب والاستقطاعات النظامية وفق البيانات المعتمدة في المستند والعقد المرتبط به.");
    }
  }

  composer.finish();
  return pdf.save();
}
