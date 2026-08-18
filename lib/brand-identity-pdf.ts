import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, PDFFont, PDFPage, rgb } from "pdf-lib";
import tajawalRegularDataUrl from "@fontsource/tajawal/files/tajawal-arabic-400-normal.woff?inline";
import tajawalBoldDataUrl from "@fontsource/tajawal/files/tajawal-arabic-700-normal.woff?inline";
import { brandIdentityAssets, type BrandIdentityAssetId } from "@/lib/brand-identity";
import { getRuntimeEnv } from "@/lib/runtime-env";

const PAGE = { width: 595.28, height: 841.89, margin: 48 };
const C = { navy: rgb(0, .114, .176), red: rgb(.886, .11, .145), text: rgb(.12, .17, .2), muted: rgb(.42, .48, .52), pale: rgb(.96, .97, .975) };

function dataBytes(value: string) {
  const binary = atob(value.slice(value.indexOf(",") + 1));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
function width(font: PDFFont, value: string, size: number) { return font.widthOfTextAtSize(value || " ", size); }
function right(page: PDFPage, value: string, y: number, font: PDFFont, size: number, color = C.text, edge = PAGE.width - PAGE.margin) {
  page.drawText(value, { x: edge - width(font, value, size), y, font, size, color });
}
function wrap(font: PDFFont, value: string, size: number, maxWidth: number) {
  const lines: string[] = [];
  for (const paragraph of value.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (!line || width(font, candidate, size) <= maxWidth) line = candidate;
      else { lines.push(line); line = word; }
    }
    if (line) lines.push(line);
  }
  return lines;
}

const sections: Record<BrandIdentityAssetId, Array<[string, string]>> = {
  "brand-guidelines": [
    ["جوهر العلامة", "شركة دالي للتشغيل والصيانة علامة سعودية مهنية تعبّر عن الاعتمادية والجاهزية والجودة والسلامة وسرعة الاستجابة. تظهر الهوية بصورة حديثة وواضحة ومتزنة في جميع نقاط الاتصال."],
    ["الشعار المعتمد", "يُستخدم الشعار الموجود في النظام بوصفه الأصل الرسمي. يمنع إعادة رسمه أو تغيير نسبه أو ألوانه أو فصل عناصره. تحفظ مساحة خالية حوله تعادل ارتفاع أبرز عنصر داخلي فيه."],
    ["لوحة الألوان", "الأزرق الداكن #001D2D هو اللون المؤسسي الأساسي، والأحمر #E21C25 لون إبراز، مع الأبيض #FFFFFF والرمادي الفاتح #F4F7F8 والخط الداكن #1F2B31."],
    ["النظام الطباعي", "خط Tajawal هو الخط العربي المعتمد. يستخدم الوزن 700 للعناوين، و500 للعناوين الفرعية، و400 للنصوص والجداول. يجب المحافظة على تسلسل بصري ومسافات مريحة."],
    ["اللغة البصرية", "تعتمد الهوية على مساحات نظيفة، وخطوط هندسية دقيقة، وزوايا محدودة، وتباين قوي. تستخدم الصور المهنية الخالية من الكائنات الحية وفق سياسة الشركة."],
    ["نبرة التواصل", "لغة عربية فصحى، مباشرة، موثوقة، وخالية من المبالغة. تبدأ الرسائل بالقيمة المقدمة للعميل وتستخدم أفعالًا واضحة وبيانات قابلة للتحقق."],
    ["إدارة الإصدارات", "لا تستخدم إلا الملفات الموسومة بأنها معتمدة داخل النظام. عند إصدار نسخة أحدث يُوقف تداول النسخة السابقة مع الحفاظ عليها في سجل الإصدارات."],
  ],
  "logo-usage": [
    ["النسخة الأساسية", "تُستخدم النسخة الملونة على الخلفيات البيضاء والفاتحة. تستخدم النسخة البيضاء على الخلفية المؤسسية الداكنة، والنسخة الأحادية عند تعذر الطباعة الملونة."],
    ["المساحة الآمنة", "يجب ترك مساحة خالية حول الشعار من جميع الجهات، ولا يسمح بدخول نص أو صورة أو إطار داخل هذه المساحة."],
    ["الحجم الأدنى", "في الاستخدام الرقمي لا يقل عرض الشعار المقترح عن 120 بكسل، وفي الطباعة لا يقل عن 30 مم ما لم تعتمد نسخة مختصرة."],
    ["الممنوعات", "يمنع الضغط أو التمديد، وتغيير الألوان، وإضافة ظل أو حدود، وتدوير الشعار، ووضعه على خلفية مشوشة، وإعادة كتابة الاسم بخط مختلف."],
    ["الخلفيات", "تُختار النسخة التي تحقق أعلى وضوح. لا يوضع الشعار فوق صورة إلا داخل مساحة هادئة عالية التباين أو فوق حقل لوني معتمد."],
  ],
  "colors-typography": [
    ["الأزرق المؤسسي", "HEX #001D2D — RGB 0, 29, 45. يستخدم للعناوين والخلفيات الرسمية والتنقل الرئيسي."],
    ["الأحمر المميز", "HEX #E21C25 — RGB 226, 28, 37. يستخدم للإبراز والإجراءات المهمة بقدر محدود، وليس لمساحات النص الطويلة."],
    ["الألوان المحايدة", "الأبيض #FFFFFF، الخلفية #F4F7F8، الحدود #DDE5E8، النص #1F2B31، النص الثانوي #68777F."],
    ["إتاحة الألوان", "تحقق نسبة تباين 4.5:1 على الأقل للنصوص العادية و3:1 للعناصر التفاعلية. لا يستخدم اللون وحده للدلالة على الحالة."],
    ["Tajawal", "العناوين 700، العناوين الفرعية 500 أو 700، النص 400، والبيانات 500. يمنع خلط خطوط متعددة داخل المستند الواحد دون اعتماد."],
    ["الأرقام والجداول", "توحّد طريقة كتابة الأرقام داخل كل مستند، وتحاذى الأرقام المالية بوضوح، وتستخدم مسافات ثابتة وصفوف سهلة المسح البصري."],
  ],
  "digital-applications": [
    ["الموقع الإلكتروني", "يظهر الشعار في رأس الصفحة دون ازدحام، وتستخدم الألوان كمراتب وظيفية. تكون الواجهة عربية فصحى، متجاوبة، ومطابقة لمعايير الوصول."],
    ["النظام الإداري", "تُستخدم الهوية دون التأثير على سرعة إنجاز المهام. الأزرق للتنقل والبنية، والأحمر للإجراءات المهمة، وألوان مستقلة للحالات التشغيلية."],
    ["تطبيق الجوال", "يحافظ التطبيق على الأيقونة والشعار والألوان ونظام الخط نفسه، مع مراعاة أحجام اللمس والتباين والوضعين الفاتح والداكن."],
    ["منصات التواصل", "تستخدم قوالب ثابتة بهامش آمن للشعار وعنوان واضح ومساحة بيضاء كافية. لا تُحشر المعلومات ولا تستخدم صورًا مخالفة لسياسة المحتوى."],
    ["ملفات PDF", "تتضمن الملفات ترويسة موحدة ورقمًا مرجعيًا وتاريخ إصدار وتذييلًا ثابتًا، مع تضمين الخط العربي للحفاظ على سلامة العرض والطباعة."],
  ],
  "stationery-applications": [
    ["الورق الرسمي", "مقاس A4، الشعار في موضع ثابت، بيانات الاتصال في التذييل، وهوامش آمنة للطباعة والحفظ الإلكتروني."],
    ["بطاقة العمل", "مقاس 90 × 50 مم، وجه واضح للمعلومات الأساسية، وتسلسل بصري يقدّم الاسم والمسمى ووسائل الاتصال دون ازدحام."],
    ["المظاريف", "تحدد مواضع الشعار والعنوان ومنطقة بيانات المرسل إليه حسب المقاس، مع المحافظة على المساحة الآمنة."],
    ["العروض والعقود", "غلاف مؤسسي وترويسة وصفحات داخلية وجداول موحدة. لا تُستخدم الزخارف على حساب القراءة أو الدقة النظامية."],
    ["المركبات والملابس", "يستخدم الشعار بأعلى تباين، ويثبت موضعه ونسبه، وتراجع العينة بالحجم الحقيقي قبل الإنتاج."],
  ],
};

export async function generateBrandIdentityPdf(id: BrandIdentityAssetId) {
  const asset = brandIdentityAssets.find((item) => item.id === id)!;
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const [regular, bold] = await Promise.all([
    pdf.embedFont(dataBytes(tajawalRegularDataUrl), { subset: true }),
    pdf.embedFont(dataBytes(tajawalBoldDataUrl), { subset: true }),
  ]);
  const logoResponse = await getRuntimeEnv().ASSETS.fetch(new Request("https://assets.local/dally-logo.jpg"));
  const logo = logoResponse.ok ? await pdf.embedJpg(new Uint8Array(await logoResponse.arrayBuffer())) : null;
  let page = pdf.addPage([PAGE.width, PAGE.height]);
  let pageNumber = 1;
  let y = PAGE.height - 150;
  const header = () => {
    page.drawRectangle({ x: 0, y: PAGE.height - 11, width: PAGE.width, height: 11, color: C.navy });
    page.drawRectangle({ x: PAGE.width - 46, y: PAGE.height - 11, width: 46, height: 11, color: C.red });
    if (logo) { const h = 47; const w = h * logo.width / logo.height; page.drawImage(logo, { x: PAGE.width - PAGE.margin - w, y: PAGE.height - 82, width: w, height: h }); }
    right(page, `الهوية البصرية · الإصدار 1.0 · صفحة ${pageNumber}`, PAGE.height - 104, regular, 8, C.muted);
  };
  const newPage = () => { page = pdf.addPage([PAGE.width, PAGE.height]); pageNumber += 1; y = PAGE.height - 145; header(); };
  header();
  right(page, asset.title, y, bold, 22, C.navy); y -= 30;
  right(page, asset.description, y, regular, 10, C.muted); y -= 40;
  for (const [title, body] of sections[id]) {
    const lines = wrap(regular, body, 10, PAGE.width - PAGE.margin * 2 - 24);
    const boxHeight = 42 + lines.length * 16;
    if (y - boxHeight < 62) newPage();
    page.drawRectangle({ x: PAGE.margin, y: y - boxHeight + 12, width: PAGE.width - PAGE.margin * 2, height: boxHeight, color: C.pale });
    page.drawRectangle({ x: PAGE.width - PAGE.margin - 5, y: y - boxHeight + 12, width: 5, height: boxHeight, color: C.red });
    right(page, title, y - 7, bold, 12, C.navy, PAGE.width - PAGE.margin - 17);
    let lineY = y - 31;
    for (const line of lines) { right(page, line, lineY, regular, 10, C.text, PAGE.width - PAGE.margin - 17); lineY -= 16; }
    y -= boxHeight + 12;
  }
  for (const item of pdf.getPages()) right(item, "شركة دالي للتشغيل والصيانة · وثيقة هوية معتمدة من النظام الإداري", 28, regular, 7, C.muted);
  pdf.setTitle(`${asset.title} - شركة دالي للتشغيل والصيانة`);
  pdf.setAuthor("شركة دالي للتشغيل والصيانة");
  pdf.setCreator("النظام الإداري لشركة دالي للتشغيل والصيانة");
  pdf.setCreationDate(new Date());
  return pdf.save();
}

