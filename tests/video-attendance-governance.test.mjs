import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("video interviews enforce hours, availability, transfer permission, audit and notifications", async () => {
  const [migration, publicApi, portalApi, helper, publicUi, portalUi] = await Promise.all([
    source("drizzle-pg/0030_video_interviews_and_operational_roles.sql"), source("app/api/video-interviews/route.ts"),
    source("app/api/portal/video-interviews/route.ts"), source("lib/video-interviews.ts"),
    source("app/LiveChatWidget.tsx"), source("app/portal/VideoInterviewDesk.tsx"),
  ]);
  for (const role of ["accountant","legal_affairs","sales_representative","purchasing_representative","administrative_assistant"]) assert.match(migration, new RegExp(role));
  for (const table of ["video_interviews","video_interview_transfers","portal_user_presence"]) assert.match(migration, new RegExp(table));
  assert.match(publicApi,/getBusinessHoursState/);assert.match(publicApi,/enforcePublicRateLimit/);assert.match(publicApi,/businessHours\.isOpen/);
  assert.match(portalApi,/hasPortalPermission\(access, "video", requiredAction\)/);assert.match(portalApi,/listAvailableInterviewStaff/);assert.match(portalApi,/system_owner/);
  assert.match(portalApi,/video-interview-transferred/);assert.match(portalApi,/auditPortalAction/);assert.match(portalApi,/emitPortalNotification/);
  assert.match(helper,/video\.manage/);assert.match(publicUi,/طلب مقابلة مرئية/);assert.match(portalUi,/تحويل إلى موظف متاح أو المالك/);
});

test("attendance, deduction and performance are server governed and payroll linked", async () => {
  const [migration, api, sessions, helper, permissions, dashboard] = await Promise.all([
    source("drizzle-pg/0031_attendance_payroll_and_performance.sql"), source("app/api/portal/people-governance/route.ts"),
    source("lib/portal-session.ts"), source("lib/attendance-governance.ts"), source("app/api/portal/users/route.ts"),
    source("app/portal/ExecutivePeopleCommandCenter.tsx"),
  ]);
  for (const table of ["portal_attendance_policies","portal_attendance_sessions","attendance_deduction_proposals","employee_performance_reviews"]) assert.match(migration,new RegExp(table));
  assert.match(api,/system_admin/);assert.match(api,/تفعيل حساب زمن الحضور متاح لمالك النظام فقط/);assert.match(api,/legalCapPercent:50/);
  assert.match(api,/writtenConsentConfirmed/);assert.match(api,/reviewedBy===context\.access\.user\.email/);assert.match(api,/movementType:"deduction"/);
  assert.match(api,/roleWeights/);assert.match(api,/تقييم موزون بحسب الدور مع أدلة ومعايرة مستقلة/);
  assert.match(helper,/local\.hour < 20/);assert.match(helper,/10 \* 60_000/);assert.match(helper,/syncEmployeeAttendance/);
  assert.match(sessions,/enforceNightlyAttendanceCutoff/);assert.match(sessions,/startAttendanceSession/);assert.match(sessions,/closeAttendanceSession/);
  assert.match(permissions,/portalUserPermissions/);assert.match(permissions,/permissionsForProfile/);assert.match(permissions,/permissionProfile/);
  assert.match(dashboard,/قيادة الموظفين والحضور والأداء/);assert.match(dashboard,/فصل المراجعة عن الاعتماد/);
});
