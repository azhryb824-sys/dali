import { desc, like, or } from "drizzle-orm";
import { getDb } from "@/db";
import { clients, companyDocuments, employees, financialRecords, legalRecords, quoteVersions, salesOpportunities, timesheets, visitorConversations, workers, workforceContracts, workforceRequests, workOrders, capacityPlans, dataSubjectRequests, portalUsers } from "@/db/schema";
import { canAccessPortalDepartment, canAccessPortalDocuments, hasPortalPermission, requirePortalApiRole } from "@/lib/portal-access";
import { jsonNoStore } from "@/lib/security";
import { getWebsiteContent } from "@/lib/website-content";

type Result = { key: string; kind: string; id: number; stringId?: string; view: string; title: string; meta: string; searchValue: string };

export async function GET(request: Request) {
  const access = await requirePortalApiRole(["admin", "manager", "employee"]);
  if (!access) return jsonNoStore({ error: "غير مصرح" }, { status: 403 });
  const query = (new URL(request.url).searchParams.get("q") || "").trim().replace(/[%_]/g, "").slice(0, 80);
  if (query.length < 2) return jsonNoStore({ results: [] });
  const pattern = `%${query}%`;
  const db = getDb();
  try {
    const [requestRows, workerRows, contractRows, conversationRows, employeeRows, financeRows, legalRows, documentRows, clientRows, opportunityRows, quoteRows, orderRows, sheetRows, planRows, privacyRows, userRows] = await Promise.all([
      canAccessPortalDepartment(access, "workforce") ? db.select().from(workforceRequests).where(or(like(workforceRequests.trackingCode, pattern), like(workforceRequests.fullName, pattern), like(workforceRequests.companyName, pattern), like(workforceRequests.mobile, pattern))).orderBy(desc(workforceRequests.updatedAt)).limit(6) : Promise.resolve([]),
      canAccessPortalDepartment(access, "workforce") ? db.select().from(workers).where(or(like(workers.fullName, pattern), like(workers.workerNumber, pattern), like(workers.iqamaNumber, pattern), like(workers.profession, pattern), like(workers.nationality, pattern))).orderBy(desc(workers.updatedAt)).limit(6) : Promise.resolve([]),
      canAccessPortalDepartment(access, "workforce") || canAccessPortalDepartment(access, "finance") ? db.select().from(workforceContracts).where(or(like(workforceContracts.referenceCode, pattern), like(workforceContracts.clientName, pattern), like(workforceContracts.title, pattern), like(workforceContracts.workSite, pattern))).orderBy(desc(workforceContracts.updatedAt)).limit(6) : Promise.resolve([]),
      canAccessPortalDepartment(access, "workforce") ? db.select().from(visitorConversations).where(or(like(visitorConversations.trackingCode, pattern), like(visitorConversations.visitorName, pattern), like(visitorConversations.visitorMobile, pattern), like(visitorConversations.subject, pattern))).orderBy(desc(visitorConversations.updatedAt)).limit(6) : Promise.resolve([]),
      canAccessPortalDepartment(access, "employees") ? db.select().from(employees).where(or(like(employees.fullName, pattern), like(employees.employeeNumber, pattern), like(employees.jobTitle, pattern))).orderBy(desc(employees.updatedAt)).limit(6) : Promise.resolve([]),
      canAccessPortalDepartment(access, "finance") ? db.select().from(financialRecords).where(or(like(financialRecords.referenceCode, pattern), like(financialRecords.description, pattern))).orderBy(desc(financialRecords.updatedAt)).limit(6) : Promise.resolve([]),
      canAccessPortalDepartment(access, "legal") ? db.select().from(legalRecords).where(or(like(legalRecords.referenceCode, pattern), like(legalRecords.title, pattern), like(legalRecords.counterparty, pattern))).orderBy(desc(legalRecords.updatedAt)).limit(6) : Promise.resolve([]),
      canAccessPortalDocuments(access) ? db.select().from(companyDocuments).where(or(like(companyDocuments.referenceCode, pattern), like(companyDocuments.title, pattern), like(companyDocuments.counterparty, pattern))).orderBy(desc(companyDocuments.updatedAt)).limit(6) : Promise.resolve([]),
      canAccessPortalDepartment(access, "workforce") ? db.select().from(clients).where(or(like(clients.clientCode, pattern), like(clients.legalName, pattern), like(clients.commercialRegistration, pattern))).orderBy(desc(clients.updatedAt)).limit(6) : Promise.resolve([]),
      canAccessPortalDepartment(access, "workforce") ? db.select().from(salesOpportunities).where(or(like(salesOpportunities.opportunityCode, pattern), like(salesOpportunities.title, pattern))).orderBy(desc(salesOpportunities.updatedAt)).limit(6) : Promise.resolve([]),
      canAccessPortalDepartment(access, "workforce") ? db.select().from(quoteVersions).where(like(quoteVersions.quoteCode, pattern)).orderBy(desc(quoteVersions.updatedAt)).limit(6) : Promise.resolve([]),
      canAccessPortalDepartment(access, "workforce") ? db.select().from(workOrders).where(or(like(workOrders.workOrderCode, pattern), like(workOrders.title, pattern), like(workOrders.workSite, pattern))).orderBy(desc(workOrders.updatedAt)).limit(6) : Promise.resolve([]),
      canAccessPortalDepartment(access, "workforce") ? db.select().from(timesheets).where(like(timesheets.timesheetCode, pattern)).orderBy(desc(timesheets.updatedAt)).limit(6) : Promise.resolve([]),
      canAccessPortalDepartment(access, "workforce") ? db.select().from(capacityPlans).where(or(like(capacityPlans.planCode, pattern), like(capacityPlans.seasonName, pattern), like(capacityPlans.profession, pattern), like(capacityPlans.location, pattern))).orderBy(desc(capacityPlans.updatedAt)).limit(6) : Promise.resolve([]),
      access.role !== "employee" || access.department === "legal" ? db.select().from(dataSubjectRequests).where(or(like(dataSubjectRequests.trackingCode, pattern), like(dataSubjectRequests.fullName, pattern), like(dataSubjectRequests.email, pattern))).orderBy(desc(dataSubjectRequests.updatedAt)).limit(6) : Promise.resolve([]),
      access.role === "admin" ? db.select().from(portalUsers).where(or(like(portalUsers.displayName, pattern), like(portalUsers.email, pattern), like(portalUsers.requestedJobTitle, pattern), like(portalUsers.requestReason, pattern))).orderBy(desc(portalUsers.updatedAt)).limit(6) : Promise.resolve([]),
    ]);
    const websiteResults: Result[] = [];
    if (await hasPortalPermission(access, "website", "read")) {
      const content = await getWebsiteContent();
      const needle = query.toLowerCase();
      const items = Object.entries(content.collections).flatMap(([collection, entries]) => entries.map((item) => ({ collection, item })));
      for (const { collection, item } of items) {
        if (!`${item.title} ${item.shortTitle} ${item.summary} ${item.focusKeywords} ${item.tags.join(" ")}`.toLowerCase().includes(needle)) continue;
        websiteResults.push({ key: `website-${collection}-${item.id}`, kind: "website-content", id: 0, stringId: item.id, view: "website", title: item.shortTitle || item.title, meta: `محتوى موقع · ${collection} · ${item.status === "published" ? "منشور" : "مسودة"}`, searchValue: item.title });
        if (websiteResults.length >= 8) break;
      }
    }
    const results: Result[] = [
      ...(["هوية", "الهوية", "شعار", "الشعار", "ألوان", "الخطوط", "brand"].some((term) => term.includes(query.toLowerCase()) || query.toLowerCase().includes(term)) ? [{ key: "brand-identity", kind: "brand-identity", id: 0, view: "brand", title: "الهوية البصرية", meta: "الشعار والألوان والخطوط وجميع ملفات PDF", searchValue: "الهوية البصرية" }] : []),
      ...websiteResults,
      ...requestRows.map((item) => ({ key: `request-${item.id}`, kind: "request", id: item.id, view: "workforce", title: `${item.trackingCode} · ${item.fullName}`, meta: `طلب زائر · ${item.specialization}`, searchValue: item.trackingCode })),
      ...workerRows.map((item) => ({ key: `worker-${item.id}`, kind: "worker", id: item.id, view: "workforce", title: item.fullName, meta: `عامل · ${item.profession} · ${item.iqamaNumber || item.workerNumber}`, searchValue: item.fullName })),
      ...contractRows.map((item) => ({ key: `contract-${item.id}`, kind: "contract", id: item.id, view: "workforce", title: `${item.referenceCode} · ${item.clientName}`, meta: `عقد · ${item.workSite}`, searchValue: item.referenceCode })),
      ...conversationRows.map((item) => ({ key: `conversation-${item.id}`, kind: "conversation", id: 0, stringId: item.id, view: "conversations", title: `${item.trackingCode} · ${item.visitorName}`, meta: `محادثة · ${item.subject}`, searchValue: item.trackingCode })),
      ...employeeRows.map((item) => ({ key: `employee-${item.id}`, kind: "employee", id: item.id, view: "employees", title: item.fullName, meta: `موظف · ${item.jobTitle}`, searchValue: item.fullName })),
      ...financeRows.map((item) => ({ key: `finance-${item.id}`, kind: "finance", id: item.id, view: "finance", title: item.referenceCode, meta: `مالي · ${item.description}`, searchValue: item.referenceCode })),
      ...legalRows.map((item) => ({ key: `legal-${item.id}`, kind: "legal", id: item.id, view: "legal", title: item.title, meta: `قانوني · ${item.referenceCode}`, searchValue: item.referenceCode })),
      ...documentRows.map((item) => ({ key: `document-${item.id}`, kind: "document", id: item.id, view: "documents", title: item.title, meta: `مستند · ${item.referenceCode}`, searchValue: item.referenceCode })),
      ...clientRows.map((item) => ({ key: `client-${item.id}`, kind: "client", id: item.id, view: "operations", title: item.legalName, meta: `عميل · ${item.clientCode}`, searchValue: item.legalName })),
      ...opportunityRows.map((item) => ({ key: `opportunity-${item.id}`, kind: "opportunity", id: item.id, view: "operations", title: item.title, meta: `فرصة · ${item.opportunityCode}`, searchValue: item.opportunityCode })),
      ...quoteRows.map((item) => ({ key: `quote-${item.id}`, kind: "quote", id: item.id, view: "operations", title: item.quoteCode, meta: `عرض سعر · ${item.status}`, searchValue: item.quoteCode })),
      ...orderRows.map((item) => ({ key: `order-${item.id}`, kind: "work-order", id: item.id, view: "operations", title: item.title, meta: `أمر تشغيل · ${item.workOrderCode}`, searchValue: item.workOrderCode })),
      ...sheetRows.map((item) => ({ key: `sheet-${item.id}`, kind: "timesheet", id: item.id, view: "operations", title: item.timesheetCode, meta: `كشف دوام · ${item.status}`, searchValue: item.timesheetCode })),
      ...planRows.map((item) => ({ key: `plan-${item.id}`, kind: "capacity-plan", id: item.id, view: "operations", title: item.seasonName, meta: `خطة سعة · ${item.planCode} · ${item.profession}`, searchValue: item.planCode })),
      ...privacyRows.map((item) => ({ key: `privacy-${item.id}`, kind: "privacy-request", id: item.id, view: "operations", title: item.trackingCode, meta: `طلب خصوصية · ${item.fullName}`, searchValue: item.trackingCode })),
      ...userRows.map((item, index) => ({ key: `user-${item.email}`, kind: "user", id: index + 1, view: "users", title: item.displayName, meta: `مستخدم · ${item.requestedJobTitle || item.role} · ${item.email}`, searchValue: item.email })),
    ];
    return jsonNoStore({ results: results.slice(0, 24) });
  } catch (error) {
    console.error("portal-search-failed", error);
    return jsonNoStore({ error: "تعذّر البحث حالياً" }, { status: 500 });
  }
}
