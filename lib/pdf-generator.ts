import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, PDFFont, PDFImage, PDFPage, rgb } from "pdf-lib";
import { getRuntimeEnv } from "@/lib/runtime-env";

export const issuedDocumentLabels = {
  workforce_contract: "عقد توريد عمالة",
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
  clientAddress?: string;
  clientRepresentative?: string;
  clientRepresentativeTitle?: string;
  paymentTerms?: string;
  workingHours?: string;
  weeklyOff?: string;
  accommodationParty?: string;
  transportParty?: string;
  specialTerms?: string;
};

type CompanyAsset = {
  slot: "stamp" | "signature";
  storageKey: string;
  contentType: string;
};

type PdfResources = {
  regular: PDFFont;
  bold: PDFFont;
  letterhead: PDFImage;
  stamp: PDFImage;
  signature: PDFImage;
};

const PAGE = { width: 595.28, height: 841.89, margin: 42, footerTop: 58 };
const COLORS = {
  navy: rgb(0, 0.114, 0.176),
  red: rgb(0.886, 0.11, 0.145),
  text: rgb(0.1, 0.15, 0.18),
  muted: rgb(0.42, 0.48, 0.52),
  line: rgb(0.88, 0.9, 0.91),
  pale: rgb(0.965, 0.972, 0.976),
  white: rgb(1, 1, 1),
  softNavy: rgb(0.925, 0.945, 0.955),
};

async function embedImage(pdf: PDFDocument, bytes: Uint8Array, contentType: string) {
  if (contentType === "image/png") return pdf.embedPng(bytes);
  if (contentType === "image/jpeg" || contentType === "image/jpg") return pdf.embedJpg(bytes);
  throw new Error("صيغة صورة الختم أو التوقيع غير مدعومة");
}

async function loadResources(pdf: PDFDocument, assets: CompanyAsset[]): Promise<PdfResources> {
  pdf.registerFontkit(fontkit);
  const runtime = getRuntimeEnv();
  const [regularResponse, boldResponse] = await Promise.all([
    runtime.ASSETS.fetch(new Request("https://assets.local/fonts/DaliArabic-Regular.ttf")),
    runtime.ASSETS.fetch(new Request("https://assets.local/fonts/DaliArabic-Bold.ttf")),
  ]);
  if (!regularResponse.ok || !boldResponse.ok) throw new Error("تعذّر تحميل الخط العربي المعتمد للمستند");
  const [regular, bold] = await Promise.all([
    pdf.embedFont(new Uint8Array(await regularResponse.arrayBuffer()), { subset: true }),
    pdf.embedFont(new Uint8Array(await boldResponse.arrayBuffer()), { subset: true }),
  ]);

  const letterheadResponse = await runtime.ASSETS.fetch(new Request("https://assets.local/dali-letterhead-a4.png"));
  if (!letterheadResponse.ok) throw new Error("تعذّر تحميل تصميم الليترهيد المعتمد");
  const letterhead = await pdf.embedPng(new Uint8Array(await letterheadResponse.arrayBuffer()));

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
  return { regular, bold, letterhead, stamp, signature };
}

function textWidth(font: PDFFont, value: string, size: number) {
  return font.widthOfTextAtSize(value || " ", size);
}

function rtlDisplay(value: string) {
  return /[\u0600-\u06ff]/.test(value) ? value.replace(/\d{2,}/g, (digits) => [...digits].reverse().join("")) : value;
}

function drawRight(page: PDFPage, value: string, y: number, font: PDFFont, size: number, color = COLORS.text, right = PAGE.width - PAGE.margin) {
  const displayed = rtlDisplay(value || "—");
  page.drawText(displayed, { x: right - textWidth(font, displayed, size), y, font, size, color });
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
  page.drawImage(resources.letterhead, { x: 0, y: 0, width: PAGE.width, height: PAGE.height });
}

function drawFooter(page: PDFPage, resources: PdfResources, referenceCode: string) {
  drawLeft(page, referenceCode, 31, resources.regular, 7, COLORS.navy);
  drawRight(page, "شركة دالي للتشغيل والصيانة · مكة المكرمة · حي ولي العهد · الدائري الخامس", 31, resources.regular, 7, COLORS.navy);
}

function createComposer(pdf: PDFDocument, resources: PdfResources, input: IssuedDocumentInput) {
  let pageNumber = 0;
  let page: PDFPage;
  let y: number;

  function addPage() {
    page = pdf.addPage([PAGE.width, PAGE.height]);
    pageNumber += 1;
    drawHeader(page, resources, input, pageNumber);
    drawFooter(page, resources, input.referenceCode);
    y = PAGE.height - 132;
  }

  function ensure(height: number) {
    if (y - height < PAGE.footerTop + 22) addPage();
  }

  function heading(value: string) {
    ensure(38);
    page.drawRectangle({ x: PAGE.margin, y: y - 27, width: PAGE.width - PAGE.margin * 2, height: 32, color: COLORS.softNavy });
    page.drawRectangle({ x: PAGE.width - PAGE.margin - 5, y: y - 27, width: 5, height: 32, color: COLORS.red });
    drawRight(page, value, y - 15, resources.bold, 13, COLORS.navy, PAGE.width - PAGE.margin - 16);
    y -= 42;
  }

  function coverTitle(value: string) {
    ensure(86);
    page.drawRectangle({ x: PAGE.margin, y: y - 69, width: PAGE.width - PAGE.margin * 2, height: 72, color: COLORS.pale, borderColor: COLORS.line, borderWidth: .7 });
    page.drawRectangle({ x: PAGE.width - PAGE.margin - 6, y: y - 69, width: 6, height: 72, color: COLORS.red });
    drawRight(page, value, y - 28, resources.bold, 21, COLORS.navy, PAGE.width - PAGE.margin - 20);
    drawRight(page, input.title, y - 52, resources.regular, 10, COLORS.muted, PAGE.width - PAGE.margin - 20);
    drawLeft(page, input.referenceCode, y - 44, resources.bold, 8.5, COLORS.navy, PAGE.margin + 16);
    y -= 88;
  }

  function infoPair(rightLabel: string, rightValue: string, leftLabel: string, leftValue: string) {
    ensure(58);
    const gap = 8;
    const width = (PAGE.width - PAGE.margin * 2 - gap) / 2;
    const leftX = PAGE.margin;
    const rightX = PAGE.margin + width + gap;
    for (const cell of [{ x: rightX, label: rightLabel, value: rightValue }, { x: leftX, label: leftLabel, value: leftValue }]) {
      page.drawRectangle({ x: cell.x, y: y - 47, width, height: 50, color: COLORS.pale, borderColor: COLORS.line, borderWidth: .6 });
      drawRight(page, cell.label, y - 13, resources.bold, 7.5, COLORS.red, cell.x + width - 11);
      drawRight(page, cell.value || "غير محدد", y - 33, resources.bold, 9.5, COLORS.text, cell.x + width - 11);
    }
    y -= 58;
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

  function clause(number: number, title: string, value: string) {
    const lines = wrapWords(resources.regular, value, 9.5, PAGE.width - PAGE.margin * 2 - 26);
    const height = 35 + Math.max(1, lines.length) * 15;
    ensure(height + 8);
    page.drawRectangle({ x: PAGE.margin, y: y - height + 10, width: PAGE.width - PAGE.margin * 2, height, color: COLORS.pale, borderColor: COLORS.line, borderWidth: .6 });
    page.drawRectangle({ x: PAGE.width - PAGE.margin - 5, y: y - height + 10, width: 5, height, color: COLORS.red });
    drawRight(page, `${number}. ${title}`, y - 5, resources.bold, 10, COLORS.navy, PAGE.width - PAGE.margin - 16);
    let lineY = y - 25;
    for (const line of lines) { drawRight(page, line || " ", lineY, resources.regular, 9.5, COLORS.text, PAGE.width - PAGE.margin - 16); lineY -= 15; }
    y -= height + 8;
  }

  function parties(first: string, second: string) {
    ensure(108);
    const width = (PAGE.width - PAGE.margin * 2) / 2;
    page.drawRectangle({ x: PAGE.margin, y: y - 95, width: width * 2, height: 98, borderColor: COLORS.line, borderWidth: .8 });
    page.drawRectangle({ x: PAGE.margin, y: y - 22, width: width * 2, height: 25, color: COLORS.navy });
    page.drawLine({ start: { x: PAGE.margin + width, y: y - 95 }, end: { x: PAGE.margin + width, y: y + 3 }, thickness: .8, color: COLORS.line });
    drawRight(page, "الطرف الأول · المورد", y - 14, resources.bold, 9, COLORS.white, PAGE.margin + width * 2 - 12);
    drawRight(page, "الطرف الثاني · العميل", y - 14, resources.bold, 9, COLORS.white, PAGE.margin + width - 12);
    const firstLines = wrapWords(resources.regular, first, 8.7, width - 24).slice(0, 4);
    const secondLines = wrapWords(resources.regular, second, 8.7, width - 24).slice(0, 4);
    firstLines.forEach((line, index) => drawRight(page, line, y - 43 - index * 14, resources.regular, 8.7, COLORS.text, PAGE.margin + width * 2 - 12));
    secondLines.forEach((line, index) => drawRight(page, line, y - 43 - index * 14, resources.regular, 8.7, COLORS.text, PAGE.margin + width - 12));
    y -= 110;
  }

  function signatures() {
    ensure(205);
    heading("الاعتماد والتوقيع");
    const gap = 12;
    const width = (PAGE.width - PAGE.margin * 2 - gap) / 2;
    const boxY = y - 145;
    page.drawRectangle({ x: PAGE.margin, y: boxY, width, height: 145, color: COLORS.pale, borderColor: COLORS.line, borderWidth: .8 });
    page.drawRectangle({ x: PAGE.margin + width + gap, y: boxY, width, height: 145, color: COLORS.pale, borderColor: COLORS.line, borderWidth: .8 });
    drawRight(page, "الطرف الثاني · العميل", y - 20, resources.bold, 10, COLORS.navy, PAGE.margin + width - 13);
    drawRight(page, "الطرف الأول · شركة دالي", y - 20, resources.bold, 10, COLORS.navy, PAGE.margin + width * 2 + gap - 13);
    drawRight(page, "الاسم: ____________________", y - 48, resources.regular, 8, COLORS.muted, PAGE.margin + width - 13);
    drawRight(page, "الصفة: ____________________", y - 70, resources.regular, 8, COLORS.muted, PAGE.margin + width - 13);
    drawRight(page, "التوقيع والختم", y - 48, resources.regular, 8, COLORS.muted, PAGE.margin + width * 2 + gap - 13);
    const stampScale = Math.min(82 / resources.stamp.width, 72 / resources.stamp.height);
    const signatureScale = Math.min(120 / resources.signature.width, 48 / resources.signature.height);
    page.drawImage(resources.signature, { x: PAGE.margin + width + gap + 16, y: boxY + 24, width: resources.signature.width * signatureScale, height: resources.signature.height * signatureScale });
    page.drawImage(resources.stamp, { x: PAGE.margin + width * 2 + gap - 95, y: boxY + 13, width: resources.stamp.width * stampScale, height: resources.stamp.height * stampScale });
    y = boxY - 12;
  }

  addPage();
  return {
    coverTitle,
    heading,
    infoPair,
    field,
    paragraph,
    clause,
    parties,
    finish() { signatures(); },
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
  composer.coverTitle(issuedDocumentLabels[input.documentType]);
  composer.infoPair("الرقم المرجعي", input.referenceCode, "تاريخ الإصدار", dateLabel(input.issueDate));
  composer.infoPair("العميل / الجهة", input.clientName, "موضوع العقد", input.title);
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
    composer.heading("بيانات أطراف العقد");
    composer.parties("شركة دالي للتشغيل والصيانة، ويشار إليها في هذا العقد بـ «المورد».", `${input.clientName}${input.clientCr ? ` · سجل ${input.clientCr}` : ""}${input.clientVat ? ` · ضريبي ${input.clientVat}` : ""}${input.clientAddress ? ` · ${input.clientAddress}` : ""}${input.clientRepresentative ? ` · يمثلها ${input.clientRepresentative}${input.clientRepresentativeTitle ? ` (${input.clientRepresentativeTitle})` : ""}` : ""}`);
    composer.paragraph("التمهيد", "لما كان الطرف الأول متخصصاً في توفير القوى العاملة والحلول التشغيلية، ورغب الطرف الثاني في الاستفادة من خدماته؛ فقد اتفق الطرفان، وهما بكامل أهليتهما المعتبرة، على أن يكون التمهيد والبيانات والملاحق جزءاً لا يتجزأ من هذا العقد.");
    composer.heading("ملخص التعاقد");
    composer.field("موقع تقديم الخدمة", input.workSite || "حسب توجيه العميل المعتمد");
    composer.field("المهن والأعداد المتعاقد عليها", professionSummary);
    if (assignedSummary) composer.field("العمالة المسندة عند الإصدار", assignedSummary);
    else composer.field("العمالة المسندة عند الإصدار", "لم تُحدَّد أسماء العمالة عند الإصدار، ويجوز استكمال الإسناد لاحقاً من النظام وفق العدد المطلوب لكل مهنة.");
    composer.field("مدة العقد", `من ${dateLabel(input.startDate)} إلى ${dateLabel(input.endDate)}`);
    composer.field("القيمة التعاقدية", moneyLabel(input.amountHalalas));
    composer.field("ساعات العمل والراحة الأسبوعية", `${input.workingHours || "بحسب جدول العمل المعتمد"} — الراحة الأسبوعية: ${input.weeklyOff || "بحسب الاتفاق"}`);
    composer.field("السكن والنقل", `السكن على: ${input.accommodationParty || "حسب الاتفاق"} — النقل على: ${input.transportParty || "حسب الاتفاق"}`);
    composer.heading("أحكام العقد");
    composer.clause(1, "موضوع العقد", "يلتزم الطرف الأول بتوريد القوى العاملة المبينة في ملخص التعاقد للعمل لدى الطرف الثاني في الموقع المحدد، ضمن المهن والأعداد والنطاق المتفق عليه.");
    composer.clause(2, "نطاق الخدمة", input.details);
    composer.clause(3, "التزامات الطرف الأول", "توفير عمالة نظامية ومؤهلة بحسب المهنة، وإدارة ملفاتها النظامية، واستبدال العامل عند ثبوت عدم ملاءمته وفق مدة معقولة، والمحافظة على سرية معلومات الطرف الثاني.");
    composer.clause(4, "التزامات الطرف الثاني", "توفير بيئة عمل آمنة، وتعريف العمالة بمتطلبات الموقع، وعدم تكليفها بأعمال تختلف جوهرياً عن المهنة المتفق عليها، واعتماد كشوف الحضور خلال المدة المحددة.");
    composer.clause(5, "القيمة وآلية السداد", input.paymentTerms || `تبلغ القيمة الإجمالية ${moneyLabel(input.amountHalalas)}، وتُسدد وفق الفواتير والمواعيد المعتمدة بين الطرفين.`);
    composer.clause(6, "الحضور والعمل الإضافي", `تُحتسب الخدمة وفق ساعات العمل: ${input.workingHours || "الجدول المعتمد"}. ولا ينفذ العمل الإضافي إلا بموافقة الطرف الثاني، ويحتسب وفق العرض أو الملحق المالي المعتمد.`);
    composer.clause(7, "السلامة والصحة المهنية", "يلتزم الطرف الثاني بتوفير موقع عمل آمن وتعليمات ومعدات الوقاية الخاصة بالموقع، ويلتزم الطرف الأول بتوعية العمالة ومتابعة امتثالها. يبلغ كل طرف الآخر فوراً بأي حادث أو خطر أو مخالفة، وتحدد المسؤولية وفق سبب الواقعة والأنظمة السارية.");
    composer.clause(8, "مدة العقد والتجديد والإنهاء", `يسري العقد من ${dateLabel(input.startDate)} إلى ${dateLabel(input.endDate)}. ولا يتجدد إلا باتفاق مكتوب. ويجوز إنهاؤه بإشعار كتابي وفق المدة المتفق عليها، مع سداد الأعمال المنفذة وتسوية الالتزامات القائمة حتى تاريخ الإنهاء.`);
    composer.clause(9, "السرية وحماية المعلومات", "يحافظ الطرفان على سرية البيانات والمستندات والمعلومات التشغيلية التي يطلعان عليها بسبب تنفيذ العقد، ولا تستخدم إلا للغرض التعاقدي.");
    composer.clause(10, "القوة القاهرة", "لا يعد أي طرف مسؤولاً عن التأخير الناتج مباشرة عن قوة قاهرة خارجة عن السيطرة المعقولة، على أن يخطر الطرف الآخر ويتخذ الإجراءات الممكنة للحد من آثارها.");
    composer.clause(11, "الفوترة والضرائب", "تُصدر الفواتير وفق كشوف الحضور أو محاضر الإنجاز المعتمدة. تضاف ضريبة القيمة المضافة أو أي مبالغ نظامية عند انطباقها وفق الأنظمة واللوائح السارية، وتظل قيمة الخدمة الأساسية موضحة بصورة مستقلة.");
    composer.clause(13, "الغياب والاستبدال", "يبلغ الطرف الثاني عن الغياب أو القصور فوراً عبر الوسيلة المعتمدة، ويتحقق الطرف الأول من الواقعة ويتخذ إجراء الاستبدال أو المعالجة خلال مدة مناسبة لطبيعة المهنة وتوافر البديل، دون أن يعد ذلك تنازلاً عن أي حق.");
    composer.clause(14, "الإشراف وعدم انتقال العلاقة العمالية", "تبقى العلاقة العمالية والتنظيمية بين الطرف الأول والعمالة التابعة له وفق الأنظمة السارية. ويتولى الطرف الثاني التوجيه اليومي المتصل بالموقع ونطاق العمل دون اتخاذ قرارات وظيفية مباشرة تخص العامل.");
    composer.clause(15, "عدم الاستقطاب أو التنازل", "لا يجوز لأي طرف التنازل عن العقد أو نقل التزاماته الجوهرية إلى طرف آخر دون موافقة كتابية مسبقة. ولا يستقطب الطرف الثاني العمالة المقدمة مباشرة طوال مدة العقد إلا بموافقة الطرف الأول وبما لا يخالف الأنظمة.");
    composer.clause(16, "السجلات والتدقيق", "تعد كشوف الحضور والمراسلات ومحاضر الاستلام والسجلات الإلكترونية المعتمدة مرجعاً لتنفيذ الخدمة والفوترة. ويحق لكل طرف طلب ما يلزم للتحقق من الأداء مع مراعاة السرية وتقليل البيانات المتبادلة.");
    composer.clause(17, "حماية البيانات والخصوصية", "يعالج كل طرف البيانات الشخصية اللازمة لتنفيذ العقد في حدود الغرض النظامي، ويتخذ التدابير المناسبة لحمايتها، ولا يفصح عنها إلا لمن يلزم أو وفق متطلب نظامي، مع إشعار الطرف الآخر بالحوادث المؤثرة دون تأخير غير مبرر.");
    composer.clause(18, "الإشعارات وتسوية النزاعات", "تكون الإشعارات والموافقات عبر العناوين ووسائل الاتصال المعتمدة في العقد. يسعى الطرفان أولاً إلى التسوية الودية، وعند تعذرها يكون الاختصاص للجهة القضائية المختصة في المملكة العربية السعودية.");
    composer.clause(19, "قابلية الفصل وكامل الاتفاق", "إذا تعذر تنفيذ حكم من أحكام العقد فلا يؤثر ذلك في بقية الأحكام، ويستعاض عنه بحكم مشروع يحقق غرضه قدر الإمكان. ويمثل العقد وملاحقه كامل الاتفاق ويلغي ما سبقه في الموضوع نفسه.");
    if (input.specialTerms) composer.clause(20, "شروط خاصة", input.specialTerms);
    composer.paragraph("نسخ العقد والاعتماد", "حُرر هذا العقد إلكترونياً، وتسلم كل طرف نسخة للعمل بموجبها. لا يكون أي تعديل نافذاً إلا إذا كان مكتوباً ومعتمداً من الطرفين.");
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
