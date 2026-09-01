// Prepares the offline translation work file and emits reviewed generated catalogs.
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const WORK_FILE = "/tmp/dali-ui-translation-work.json";
const CACHE_FILE = "/tmp/dali-ui-translations-cache.json";
const TARGETS = ["en", "bn"];

function normalize(value) { return value.replace(/\s+/g, " ").trim(); }
function valid(value, target, placeholders = []) {
  return Boolean(value)
    && !/[ء-ي]/.test(value)
    && !/[♪♫]|\. \. \.|_{4,}|DALI[\s_-]*VAR|&(?:apos|quot|amp|lt|gt|#\d+);/i.test(value)
    && (target === "en" ? /[A-Za-z]/.test(value) : /[\u0980-\u09ff]/.test(value))
    && placeholders.every((placeholder) => value.includes(placeholder));
}

const appFiles = [];
const excludedLibraryFiles = new Set([
  "lib/arabic-money.ts",
  "lib/brand-identity-pdf.ts",
  "lib/email-delivery.ts",
  "lib/pdf-generator.ts",
  "lib/workforce-contract-clauses.ts",
]);
function walk(directory, extension) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(target, extension);
    else if (entry.name.endsWith(extension) && !excludedLibraryFiles.has(target) && !entry.name.startsWith("i18n")) appFiles.push(target);
  }
}
walk("app", ".tsx");
walk("lib", ".ts");

const staticSources = new Set();
const templateSources = new Set();
for (const file of appFiles) {
  const source = fs.readFileSync(file, "utf8");
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const add = (target, raw) => {
    const value = normalize(raw);
    if (/[ء-ي]/.test(value) && value.length >= 2 && value.length <= 6000) target.add(value);
  };
  const visit = (node) => {
    if (ts.isJsxText(node) || ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) add(staticSources, node.text);
    else if (ts.isTemplateExpression(node)) {
      let value = node.head.text;
      node.templateSpans.forEach((span, index) => { value += `{{${index}}}${span.literal.text}`; });
      add(templateSources, value);
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
}

const existing = new Map();
for (const file of ["lib/i18n.ts", "lib/i18n-public-catalog.ts", "lib/i18n-admin-catalog.ts"]) {
  const source = fs.readFileSync(file, "utf8");
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const visit = (node) => {
    if (ts.isPropertyAssignment(node) && ts.isStringLiteral(node.name) && /[ء-ي]/.test(node.name.text) && ts.isObjectLiteralExpression(node.initializer)) {
      const entry = existing.get(node.name.text) || {};
      for (const property of node.initializer.properties) {
        if (!ts.isPropertyAssignment(property)) continue;
        const name = ts.isIdentifier(property.name) || ts.isStringLiteral(property.name) ? property.name.text : "";
        if (TARGETS.includes(name) && (ts.isStringLiteral(property.initializer) || ts.isNoSubstitutionTemplateLiteral(property.initializer))) entry[name] = property.initializer.text.trim();
      }
      existing.set(node.name.text, entry);
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
}

const work = {
  staticSources: [...staticSources].sort((a, b) => a.localeCompare(b, "ar")),
  templateSources: [...templateSources].sort((a, b) => a.localeCompare(b, "ar")),
  existing: Object.fromEntries(existing),
};
fs.writeFileSync(WORK_FILE, JSON.stringify(work));
console.log(`Prepared ${work.staticSources.length} static and ${work.templateSources.length} dynamic source strings for local translation.`);

if (process.argv.includes("--build")) {
  if (!fs.existsSync(CACHE_FILE)) throw new Error("Local translation cache is missing. Run scripts/translate-ui-locally.py first.");
  const cache = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
  const generated = {};
  for (const source of work.staticSources) {
    const entry = {};
    for (const target of TARGETS) {
      if (!valid(existing.get(source)?.[target], target)) entry[target] = cache.static?.[target]?.[source];
      if (!valid(existing.get(source)?.[target] || entry[target], target)) throw new Error(`Missing generated ${target}: ${source}`);
    }
    if (Object.keys(entry).length) generated[source] = entry;
  }
  const templates = work.templateSources.map((source) => {
    const placeholders = [...source.matchAll(/\{\{\d+\}\}/g)].map((match) => match[0]);
    const entry = { source, en: cache.templates?.en?.[source], bn: cache.templates?.bn?.[source] };
    if (!valid(entry.en, "en", placeholders) || !valid(entry.bn, "bn", placeholders)) throw new Error(`Missing generated template: ${source}`);
    return entry;
  });
  fs.writeFileSync("lib/i18n-generated-catalog.ts", `// Generated translation coverage for authored interface text.\nexport const generatedUiTranslations: Record<string,{en?:string;bn?:string}> = ${JSON.stringify(generated, null, 2)};\n`);
  fs.writeFileSync("lib/i18n-generated-templates.ts", `// Generated translations for interface text containing runtime values.\nexport const generatedUiTemplates: Array<{source:string;en:string;bn:string}> = ${JSON.stringify(templates, null, 2)};\n`);
  console.log(`Wrote ${Object.keys(generated).length} static and ${templates.length} dynamic translations.`);
}
