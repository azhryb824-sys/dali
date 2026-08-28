import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("employee headcount includes current non-archived employment statuses", async () => {
  const [hr, dashboard, route] = await Promise.all([
    read("app/portal/HrWorkspace.tsx"),
    read("app/portal/PortalDashboard.tsx"),
    read("app/api/portal/hr/route.ts"),
  ]);
  assert.match(hr, /isCurrentEmployee/);
  assert.match(hr, /ended.*suspended/);
  assert.match(hr, /useDesktopLiveRefresh\(load\)/);
  assert.match(dashboard, /employees\.filter\(isCurrentEmployee\)\.length/);
  assert.match(route, /isNull\(employees\.archivedAt\)/);
});
