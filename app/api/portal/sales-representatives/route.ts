import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { clients, representativeRequests, salesRepresentatives, workforceContracts } from "@/db/schema";
import { auditPortalAction } from "@/lib/audit";
import { cleanText, makeReference } from "@/lib/company-documents";
import { canAccessPortalDepartment, requirePortalApiRole } from "@/lib/portal-access";
import { emitPortalNotification } from "@/lib/portal-notifications";
import { jsonNoStore, readLimitedJson, rejectCrossSiteRequest } from "@/lib/security";

async function requireSales(write = false) {
  const access = await requirePortalApiRole(["admin", "manager", "employee"]);
  return access && canAccessPortalDepartment(access, "workforce", write) ? access : null;
}

export async function GET() {
  const access = await requireSales();
  if (!access) return jsonNoStore({ error: "غير مصرح" }, { status: 403 });
  const db = getDb();
  const [representatives, clientRows, contractRows, requestRows] = await Promise.all([
    db.select().from(salesRepresentatives).orderBy(desc(salesRepresentatives.createdAt)).limit(500),
    db.select({ id: clients.id, salesRepresentativeId: clients.salesRepresentativeId }).from(clients),
    db.select({ id: workforceContracts.id, salesRepresentativeId: workforceContracts.salesRepresentativeId, amountHalalas: workforceContracts.amountHalalas, status: workforceContracts.status }).from(workforceContracts),
    db.select().from(representativeRequests).orderBy(desc(representativeRequests.createdAt)).limit(1000),
  ]);
  const isOwner=access.role==="admin"||access.functionalRoles.some(role=>role==="system_owner"||role==="system_admin");const ownRepresentativeIds=representatives.filter(item=>item.email?.toLowerCase()===access.user.email.toLowerCase()).map(item=>item.id);
  return jsonNoStore({ representatives: representatives.map((item) => ({ ...item, clientCount: clientRows.filter((row) => row.salesRepresentativeId === item.id).length, contractCount: contractRows.filter((row) => row.salesRepresentativeId === item.id).length, contractValueHalalas: contractRows.filter((row) => row.salesRepresentativeId === item.id && !["cancelled", "terminated"].includes(row.status)).reduce((sum, row) => sum + row.amountHalalas, 0) })),requests:isOwner?requestRows:requestRows.filter(item=>ownRepresentativeIds.includes(item.representativeId)),isOwner });
}

export async function POST(request: Request) {
  if (rejectCrossSiteRequest(request)) return jsonNoStore({ error: "مصدر الطلب غير مسموح" }, { status: 403 });
  const access = await requireSales(true);
  if (!access) return jsonNoStore({ error: "غير مصرح بإضافة مندوب" }, { status: 403 });
  try {
    const parsed = await readLimitedJson(request, 8_000); if (!parsed.ok) return parsed.response;
    const body = parsed.value as Record<string, unknown>;
    const fullName = cleanText(body.fullName, 160), mobile = cleanText(body.mobile, 20), email = cleanText(body.email, 254).toLowerCase();
    const nationalId = cleanText(body.nationalId, 10), region = cleanText(body.region, 120) || "مكة المكرمة";
    const commissionBps = Math.round(Number(body.commissionPercent || 0) * 100);
    const representativeType=cleanText(body.representativeType,20)||"sales";
    if (fullName.length < 3 || !/^\+?[0-9\s()-]{8,20}$/.test(mobile) || (nationalId && !/^\d{10}$/.test(nationalId)) || !["sales","purchasing"].includes(representativeType) || !Number.isInteger(commissionBps) || commissionBps < 0 || commissionBps > 10000) return jsonNoStore({ error: "بيانات المندوب غير صحيحة" }, { status: 400 });
    const [saved] = await getDb().insert(salesRepresentatives).values({ representativeCode: makeReference(representativeType==="sales"?"SREP":"PREP"), fullName, mobile, email: email || null, nationalId: nationalId || null, region, commissionBps,representativeType, createdBy: access.user.email }).returning();
    await auditPortalAction({ actorEmail: access.user.email, action: "sales-representative-created", entityType: "sales-representative", entityId: saved.id, after: saved });
    await emitPortalNotification({ eventType: "sales-representative-created", title: "أُضيف مندوب جديد", message: `${saved.fullName} — ${saved.region}.`, severity: "success", module: "sales", entityType: "sales-representative", entityId: saved.id, actionView: "operations", targetDepartment: "workforce" }).catch(() => undefined);
    return jsonNoStore({ representative: { ...saved, clientCount: 0, contractCount: 0, contractValueHalalas: 0 } }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    return jsonNoStore({ error: message.includes("unique") ? "رقم الهوية مسجل لمندوب آخر" : "تعذّر إضافة المندوب" }, { status: message.includes("unique") ? 409 : 500 });
  }
}

export async function PATCH(request: Request) {
  if (rejectCrossSiteRequest(request)) return jsonNoStore({ error: "مصدر الطلب غير مسموح" }, { status: 403 });
  const access = await requireSales(true); if (!access) return jsonNoStore({ error: "غير مصرح" }, { status: 403 });
  const parsed = await readLimitedJson(request, 4_000); if (!parsed.ok) return parsed.response;
  const body = parsed.value as Record<string, unknown>; const id = Number(body.id); const status = cleanText(body.status, 20);
  if (!Number.isInteger(id) || !["active", "inactive", "suspended"].includes(status)) return jsonNoStore({ error: "بيانات الحالة غير صحيحة" }, { status: 400 });
  const [saved] = await getDb().update(salesRepresentatives).set({ status, updatedAt: new Date().toISOString() }).where(eq(salesRepresentatives.id, id)).returning();
  if (!saved) return jsonNoStore({ error: "المندوب غير موجود" }, { status: 404 });
  await auditPortalAction({ actorEmail: access.user.email, action: "sales-representative-status-updated", entityType: "sales-representative", entityId: id, after: saved });
  return jsonNoStore({ representative: saved });
}
