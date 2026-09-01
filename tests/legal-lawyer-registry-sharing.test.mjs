import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(path, "utf8");

test("lawyer registry migration is additive and preserves legacy assignments", async () => {
  const migration = await read(
    "drizzle-pg/0064_legal_lawyer_registry_and_external_shares.sql",
  );
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.legal_lawyers/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS assigned_lawyer_id/);
  assert.match(migration, /Preserve every previous email-based assignment/);
  assert.match(migration, /UPDATE public\.legal_records record[\s\S]*assigned_lawyer_id = lawyer\.id/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.legal_external_shares/);
  assert.match(migration, /REVOKE ALL ON public\.legal_lawyers, public\.legal_external_shares FROM PUBLIC/);
  assert.doesNotMatch(migration, /\b(?:DELETE FROM|TRUNCATE|DROP TABLE|DROP COLUMN)\b/i);
});

test("adding a lawyer does not require a portal user and linked users are validated", async () => {
  const route = await read("app/api/portal/legal-lawyers/route.ts");
  assert.match(route, /portalUserEmail:\s*[\s\S]*\|\| null/);
  assert.match(
    route,
    /details\.portalUserEmail\s*&&\s*!\(await validLinkedUser\(details\.portalUserEmail\)\)/,
  );
  assert.match(route, /"lawyer",\s*"legal_supervisor"/);
  assert.match(route, /legal-lawyer-created/);
  assert.match(route, /emitPortalNotification/);
  assert.match(route, /أعد إسناد القضايا المفتوحة قبل تعطيل المحامي/);
});

test("lawyer details are editable and only unused lawyer records can be deleted", async () => {
  const route = await read("app/api/portal/legal-lawyers/route.ts");
  assert.match(route, /action === "update-details"/);
  assert.match(
    route,
    /assignedLawyerEmail: details\.portalUserEmail[\s\S]*assignedLawyerId, lawyerId/,
  );
  assert.match(route, /legal-lawyer-details-updated/);
  assert.match(route, /export async function DELETE/);
  assert.match(route, /tx\.query\.legalRecords\.findFirst/);
  assert.match(route, /tx\.query\.legalExternalShares\.findFirst/);
  assert.match(route, /LAWYER_IN_USE/);
  assert.match(route, /legal-lawyer-deleted/);
});

test("case assignment and bulk transfer preserve named attribution and new assignment time", async () => {
  const [lawyersRoute, casesRoute] = await Promise.all([
    read("app/api/portal/legal-lawyers/route.ts"),
    read("app/api/portal/legal-cases/route.ts"),
  ]);
  assert.match(lawyersRoute, /action === "transfer-cases"/);
  assert.match(lawyersRoute, /targetLawyerId/);
  assert.match(lawyersRoute, /assignedLawyerId: target\.id/);
  assert.match(lawyersRoute, /assignedAt: now/);
  assert.match(lawyersRoute, /tx\.insert\(legalCaseActionLog\)/);
  assert.match(lawyersRoute, /legal-lawyer-cases-transferred/);
  assert.match(
    casesRoute,
    /beforeCase\.assignedLawyerId === targetLawyer\.id/,
  );
  assert.match(casesRoute, /القضية مسندة بالفعل إلى المحامي المحدد/);
});

test("lawsuits filed against the company have professional intake, deadlines, hearings and audit", async () => {
  const [route, ui, css] = await Promise.all([
    read("app/api/portal/legal-cases/route.ts"),
    read("app/portal/LegalCaseWorkspace.tsx"),
    read("app/portal/portal.css"),
  ]);
  assert.match(route, /requestAction === "create-company-defense-case"/);
  assert.match(route, /makeReference\("LGL-DEF"\)/);
  assert.match(route, /companyCapacity: "مدعى عليها"/);
  assert.match(route, /eq\(legalRecords\.courtCaseNumber, courtCaseNumber\)/);
  assert.match(route, /title: "انتهاء مهلة الرد على الدعوى"/);
  assert.match(route, /tx\.insert\(legalHearings\)/);
  assert.match(route, /company-defense-case-created/);
  assert.match(route, /assignedAt: assignedLawyer \? now : null/);
  assert.match(ui, /\+ تسجيل قضية على الشركة/);
  assert.match(ui, /name="noticeReceivedAt"/);
  assert.match(ui, /name="responseDeadlineAt"/);
  assert.match(ui, /name="riskLevel"/);
  assert.match(ui, /قضية مرفوعة على الشركة/);
  assert.match(ui, /مهل رد خلال 7 أيام أو متأخرة/);
  assert.match(css, /\.legal-defense-kpis\{display:grid/);
  assert.match(css, /\.legal-company-case-modal\{width:min\(760px,100%\)/);
});

test("external legal files use hashed expiring links and audited WhatsApp delivery", async () => {
  const [shareRoute, publicRoute, schema] = await Promise.all([
    read("app/api/portal/legal-cases/shares/route.ts"),
    read("app/api/legal-shares/[token]/route.ts"),
    read("db/schema.ts"),
  ]);
  assert.match(shareRoute, /hashShareToken\(token\)/);
  assert.match(shareRoute, /externalRequestUrl/);
  assert.match(shareRoute, /https:\/\/wa\.me\//);
  assert.match(shareRoute, /legal-file-whatsapp-shared/);
  assert.match(shareRoute, /sharedAt/);
  assert.match(shareRoute, /mobile: "\[محجوب\]"/);
  assert.match(shareRoute, /isNull\(legalLawyers\.portalUserEmail\)/);
  assert.doesNotMatch(shareRoute, /after:[\s\S]{0,500}token/);
  assert.match(publicRoute, /legalExternalShares\.tokenHash/);
  assert.match(publicRoute, /downloadCount: sql/);
  assert.match(publicRoute, /attachment\.sha256/);
  assert.match(publicRoute, /private, no-store/);
  assert.match(schema, /export const legalExternalShares/);
  assert.match(schema, /sharedAt: text\("shared_at"\)/);
});

test("legal UI exposes named assignment time and WhatsApp share history", async () => {
  const [ui, css] = await Promise.all([
    read("app/portal/LegalCaseWorkspace.tsx"),
    read("app/portal/portal.css"),
  ]);
  assert.match(ui, /\+ إضافة محامي/);
  assert.match(ui, /modal-layer legal-lawyer-modal-layer/);
  assert.match(ui, />\s*تعديل\s*</);
  assert.match(ui, />\s*حذف\s*</);
  assert.match(ui, />\s*تحويل القضايا\s*</);
  assert.match(ui, /className="legal-assignment-control"/);
  assert.match(ui, /assignmentBusy/);
  assert.match(ui, /name="targetLawyerId"/);
  assert.match(ui, /القضايا المفتوحة فقط/);
  assert.match(ui, /جميع القضايا بما فيها المغلقة/);
  assert.match(ui, /name="assignedLawyerId"/);
  assert.match(ui, /تاريخ ووقت الإسناد/);
  assert.match(ui, /مشاركة عبر واتساب/);
  assert.match(ui, /سجل مشاركة الملفات مع المحامين الخارجيين/);
  assert.match(ui, /share\.sharedAt/);
  assert.match(ui, /إبطال الرابط/);
  assert.match(css, /\.legal-lawyer-modal-layer\{display:grid;place-items:center/);
  assert.match(
    css,
    /\.legal-lawyer-modal-layer \.drawer-backdrop\{background:rgba\(0,20,31,\.22\)/,
  );
  assert.match(
    css,
    /\.legal-lawyer-modal-layer \.legal-lawyer-modal\{position:relative;inset:auto;transform:none/,
  );
  assert.match(css, /\.legal-lawyer-actions\{display:flex/);
  assert.match(css, /\.legal-assignment-control\{display:grid/);
});

test("lawyer license expiry is integrated into operational notifications", async () => {
  const notifications = await read("lib/portal-notifications.ts");
  assert.match(notifications, /legalLawyers/);
  assert.match(notifications, /legal-lawyer-license:/);
  assert.match(notifications, /source: "system-check"/);
  assert.match(notifications, /targetDepartment: "legal"/);
});
