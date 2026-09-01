import { and, desc, eq, like, or } from "drizzle-orm";
import { getDb } from "@/db";
import { clients, companyDocuments, constructionOpportunities, constructionProjects, constructionRecords, contractPaymentSchedules, employees, financialRecords, governmentPaymentRequests, governmentSites, legalLawyers, legalRecords, officialLetters, portalTasks, quoteVersions, salesOpportunities, timesheets, visitorConversations, videoInterviews, workers, workforceContracts, workforceRequests, workOrders, capacityPlans, dataSubjectRequests, portalUsers } from "@/db/schema";
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
  const legalCaseManager = access.role === "admin" || access.functionalRoles.some((role) => ["system_owner", "system_admin", "legal_supervisor", "lawyer"].includes(role));
  try {
    const [requestRows, workerRows, contractRows, paymentRows, conversationRows, interviewRows, employeeRows, financeRows, legalRows, lawyerRows, documentRows, clientRows, opportunityRows, quoteRows, orderRows, sheetRows, planRows, privacyRows, userRows, constructionOpportunityRows, constructionProjectRows, constructionRecordRows, governmentSiteRows, governmentPaymentRows, taskRows, letterRows] = await Promise.all([
      canAccessPortalDepartment(access, "workforce") ? db.select().from(workforceRequests).where(or(like(workforceRequests.trackingCode, pattern), like(workforceRequests.fullName, pattern), like(workforceRequests.companyName, pattern), like(workforceRequests.mobile, pattern))).orderBy(desc(workforceRequests.updatedAt)).limit(6) : Promise.resolve([]),
      canAccessPortalDepartment(access, "workforce") ? db.select().from(workers).where(or(like(workers.fullName, pattern), like(workers.workerNumber, pattern), like(workers.iqamaNumber, pattern), like(workers.profession, pattern), like(workers.nationality, pattern))).orderBy(desc(workers.updatedAt)).limit(6) : Promise.resolve([]),
      canAccessPortalDepartment(access, "workforce") || canAccessPortalDepartment(access, "finance") ? db.select().from(workforceContracts).where(or(like(workforceContracts.referenceCode, pattern), like(workforceContracts.clientName, pattern), like(workforceContracts.title, pattern), like(workforceContracts.workSite, pattern))).orderBy(desc(workforceContracts.updatedAt)).limit(6) : Promise.resolve([]),
      canAccessPortalDepartment(access, "workforce") || canAccessPortalDepartment(access, "finance") ? db.select().from(contractPaymentSchedules).where(like(contractPaymentSchedules.title, pattern)).orderBy(desc(contractPaymentSchedules.updatedAt)).limit(6) : Promise.resolve([]),
      canAccessPortalDepartment(access, "workforce") ? db.select().from(visitorConversations).where(or(like(visitorConversations.trackingCode, pattern), like(visitorConversations.visitorName, pattern), like(visitorConversations.visitorMobile, pattern), like(visitorConversations.subject, pattern))).orderBy(desc(visitorConversations.updatedAt)).limit(6) : Promise.resolve([]),
      hasPortalPermission(access, "video", "read").then((allowed) => allowed ? db.select().from(videoInterviews).where(or(like(videoInterviews.referenceCode, pattern), like(videoInterviews.assignedTo, pattern), like(videoInterviews.status, pattern))).orderBy(desc(videoInterviews.updatedAt)).limit(6) : []),
      canAccessPortalDepartment(access, "employees") ? db.select().from(employees).where(or(like(employees.fullName, pattern), like(employees.employeeNumber, pattern), like(employees.jobTitle, pattern))).orderBy(desc(employees.updatedAt)).limit(6) : Promise.resolve([]),
      canAccessPortalDepartment(access, "finance") ? db.select().from(financialRecords).where(or(like(financialRecords.referenceCode, pattern), like(financialRecords.description, pattern))).orderBy(desc(financialRecords.updatedAt)).limit(6) : Promise.resolve([]),
      canAccessPortalDepartment(access, "legal") ? db.select().from(legalRecords).where(and(or(like(legalRecords.referenceCode, pattern), like(legalRecords.title, pattern), like(legalRecords.counterparty, pattern)),legalCaseManager ? undefined : eq(legalRecords.assignedLawyerEmail,access.user.email.toLowerCase()))).orderBy(desc(legalRecords.updatedAt)).limit(6) : Promise.resolve([]),
      canAccessPortalDepartment(access, "legal") ? db.select().from(legalLawyers).where(or(like(legalLawyers.fullName, pattern), like(legalLawyers.licenseNumber, pattern), like(legalLawyers.email, pattern), like(legalLawyers.mobile, pattern))).orderBy(desc(legalLawyers.updatedAt)).limit(6) : Promise.resolve([]),
      canAccessPortalDocuments(access) ? db.select().from(companyDocuments).where(or(like(companyDocuments.referenceCode, pattern), like(companyDocuments.title, pattern), like(companyDocuments.counterparty, pattern))).orderBy(desc(companyDocuments.updatedAt)).limit(6) : Promise.resolve([]),
      canAccessPortalDepartment(access, "workforce") ? db.select().from(clients).where(or(like(clients.clientCode, pattern), like(clients.legalName, pattern), like(clients.commercialRegistration, pattern))).orderBy(desc(clients.updatedAt)).limit(6) : Promise.resolve([]),
      canAccessPortalDepartment(access, "workforce") ? db.select().from(salesOpportunities).where(or(like(salesOpportunities.opportunityCode, pattern), like(salesOpportunities.title, pattern))).orderBy(desc(salesOpportunities.updatedAt)).limit(6) : Promise.resolve([]),
      canAccessPortalDepartment(access, "workforce") ? db.select().from(quoteVersions).where(like(quoteVersions.quoteCode, pattern)).orderBy(desc(quoteVersions.updatedAt)).limit(6) : Promise.resolve([]),
      canAccessPortalDepartment(access, "workforce") ? db.select().from(workOrders).where(or(like(workOrders.workOrderCode, pattern), like(workOrders.title, pattern), like(workOrders.workSite, pattern))).orderBy(desc(workOrders.updatedAt)).limit(6) : Promise.resolve([]),
      canAccessPortalDepartment(access, "workforce") ? db.select().from(timesheets).where(like(timesheets.timesheetCode, pattern)).orderBy(desc(timesheets.updatedAt)).limit(6) : Promise.resolve([]),
      canAccessPortalDepartment(access, "workforce") ? db.select().from(capacityPlans).where(or(like(capacityPlans.planCode, pattern), like(capacityPlans.seasonName, pattern), like(capacityPlans.profession, pattern), like(capacityPlans.location, pattern))).orderBy(desc(capacityPlans.updatedAt)).limit(6) : Promise.resolve([]),
      access.role !== "employee" || access.department === "legal" ? db.select().from(dataSubjectRequests).where(or(like(dataSubjectRequests.trackingCode, pattern), like(dataSubjectRequests.fullName, pattern), like(dataSubjectRequests.email, pattern))).orderBy(desc(dataSubjectRequests.updatedAt)).limit(6) : Promise.resolve([]),
      access.role === "admin" ? db.select().from(portalUsers).where(or(like(portalUsers.displayName, pattern), like(portalUsers.email, pattern), like(portalUsers.requestedJobTitle, pattern), like(portalUsers.requestReason, pattern))).orderBy(desc(portalUsers.updatedAt)).limit(6) : Promise.resolve([]),
      hasPortalPermission(access, "construction", "read").then((allowed) => allowed ? db.select().from(constructionOpportunities).where(or(like(constructionOpportunities.opportunityCode, pattern), like(constructionOpportunities.title, pattern), like(constructionOpportunities.clientName, pattern), like(constructionOpportunities.projectType, pattern))).orderBy(desc(constructionOpportunities.updatedAt)).limit(6) : []),
      hasPortalPermission(access, "construction", "read").then((allowed) => allowed ? db.select().from(constructionProjects).where(or(like(constructionProjects.projectCode, pattern), like(constructionProjects.title, pattern), like(constructionProjects.clientName, pattern), like(constructionProjects.projectType, pattern), like(constructionProjects.costCenterCode, pattern))).orderBy(desc(constructionProjects.updatedAt)).limit(6) : []),
      hasPortalPermission(access, "construction", "read").then((allowed) => allowed ? db.select().from(constructionRecords).where(or(like(constructionRecords.recordCode, pattern), like(constructionRecords.title, pattern), like(constructionRecords.description, pattern), like(constructionRecords.responsibleEmail, pattern))).orderBy(desc(constructionRecords.updatedAt)).limit(8) : []),
      canAccessPortalDepartment(access, "legal") ? db.select().from(governmentSites).where(or(like(governmentSites.name, pattern), like(governmentSites.accountReference, pattern))).orderBy(desc(governmentSites.updatedAt)).limit(6) : Promise.resolve([]),
      canAccessPortalDepartment(access, "legal") ? db.select().from(governmentPaymentRequests).where(or(like(governmentPaymentRequests.referenceCode, pattern), like(governmentPaymentRequests.serviceName, pattern), like(governmentPaymentRequests.sadadNumber, pattern), like(governmentPaymentRequests.billerNumber, pattern))).orderBy(desc(governmentPaymentRequests.updatedAt)).limit(6) : Promise.resolve([]),
      db.select().from(portalTasks).where(or(like(portalTasks.title, pattern), like(portalTasks.description, pattern))).orderBy(desc(portalTasks.updatedAt)).limit(8),
      canAccessPortalDocuments(access) ? db.select().from(officialLetters).where(or(like(officialLetters.referenceCode, pattern), like(officialLetters.subject, pattern), like(officialLetters.recipient, pattern))).orderBy(desc(officialLetters.updatedAt)).limit(6) : Promise.resolve([]),
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
      ...paymentRows.map((item) => ({ key: `contract-payment-${item.id}`, kind: "contract-payment", id: item.id, view: "operations", title: item.title, meta: `دفعة عقد · ${item.status} · ${item.dueDate}`, searchValue: item.title })),
      ...conversationRows.map((item) => ({ key: `conversation-${item.id}`, kind: "conversation", id: 0, stringId: item.id, view: "conversations", title: `${item.trackingCode} · ${item.visitorName}`, meta: `محادثة · ${item.subject}`, searchValue: item.trackingCode })),
      ...interviewRows.map((item) => ({ key: `video-interview-${item.id}`, kind: "video-interview", id: 0, stringId: item.id, view: "conversations", title: item.referenceCode, meta: `مقابلة مرئية · ${item.status} · ${item.assignedTo || "بانتظار التعيين"}`, searchValue: item.referenceCode })),
      ...employeeRows.map((item) => ({ key: `employee-${item.id}`, kind: "employee", id: item.id, view: "employees", title: item.fullName, meta: `موظف · ${item.jobTitle}`, searchValue: item.fullName })),
      ...financeRows.map((item) => ({ key: `finance-${item.id}`, kind: "finance", id: item.id, view: "finance", title: item.referenceCode, meta: `مالي · ${item.description}`, searchValue: item.referenceCode })),
      ...legalRows.map((item) => ({ key: `legal-${item.id}`, kind: "legal", id: item.id, view: "legal", title: item.title, meta: `قانوني · ${item.referenceCode}`, searchValue: item.referenceCode })),
      ...lawyerRows.map((item) => ({ key: `legal-lawyer-${item.id}`, kind: "legal-lawyer", id: item.id, view: "legal", title: item.fullName, meta: `محامي · ${item.licenseNumber || (item.portalUserEmail ? "مستخدم داخلي" : "خارجي")}`, searchValue: item.fullName })),
      ...documentRows.map((item) => ({ key: `document-${item.id}`, kind: "document", id: item.id, view: ["quotation","workforce_contract","contract","letter"].includes(item.documentType||"") ? "contractual-documents" : "documents", title: item.title, meta: `مستند · ${item.referenceCode}`, searchValue: item.referenceCode })),
      ...clientRows.map((item) => ({ key: `client-${item.id}`, kind: "client", id: item.id, view: "operations", title: item.legalName, meta: `عميل · ${item.clientCode}`, searchValue: item.legalName })),
      ...opportunityRows.map((item) => ({ key: `opportunity-${item.id}`, kind: "opportunity", id: item.id, view: "operations", title: item.title, meta: `فرصة · ${item.opportunityCode}`, searchValue: item.opportunityCode })),
      ...quoteRows.map((item) => ({ key: `quote-${item.id}`, kind: "quote", id: item.id, view: "operations", title: item.quoteCode, meta: `عرض سعر · ${item.status}`, searchValue: item.quoteCode })),
      ...orderRows.map((item) => ({ key: `order-${item.id}`, kind: "work-order", id: item.id, view: "operations", title: item.title, meta: `أمر تشغيل · ${item.workOrderCode}`, searchValue: item.workOrderCode })),
      ...sheetRows.map((item) => ({ key: `sheet-${item.id}`, kind: "timesheet", id: item.id, view: "operations", title: item.timesheetCode, meta: `كشف دوام · ${item.status}`, searchValue: item.timesheetCode })),
      ...planRows.map((item) => ({ key: `plan-${item.id}`, kind: "capacity-plan", id: item.id, view: "operations", title: item.seasonName, meta: `خطة سعة · ${item.planCode} · ${item.profession}`, searchValue: item.planCode })),
      ...privacyRows.map((item) => ({ key: `privacy-${item.id}`, kind: "privacy-request", id: item.id, view: "operations", title: item.trackingCode, meta: `طلب خصوصية · ${item.fullName}`, searchValue: item.trackingCode })),
      ...userRows.map((item, index) => ({ key: `user-${item.email}`, kind: "user", id: index + 1, view: "users", title: item.displayName, meta: `مستخدم · ${item.requestedJobTitle || item.role} · ${item.email}`, searchValue: item.email })),
      ...constructionOpportunityRows.map((item) => ({ key: `construction-opportunity-${item.id}`, kind: "construction-opportunity", id: item.id, view: "construction", title: item.title, meta: `فرصة مقاولات · ${item.opportunityCode} · ${item.clientName}`, searchValue: item.opportunityCode })),
      ...constructionProjectRows.map((item) => ({ key: `construction-project-${item.id}`, kind: "construction-project", id: item.id, view: "construction", title: item.title, meta: `مشروع مقاولات · ${item.projectCode} · ${item.costCenterCode}`, searchValue: item.projectCode })),
      ...constructionRecordRows.map((item) => ({ key: `construction-record-${item.id}`, kind: `construction-${item.recordType}`, id: item.id, view: "construction", title: item.title, meta: `سجل مقاولات · ${item.recordCode} · ${item.status}`, searchValue: item.recordCode })),
      ...governmentSiteRows.map((item) => ({ key: `government-site-${item.id}`, kind: "government-site", id: item.id, view: "government", title: item.name, meta: `منصة حكومية · ${item.accountReference||"دون مرجع"}`, searchValue: item.name })),
      ...governmentPaymentRows.map((item) => ({ key: `government-payment-${item.id}`, kind: "government-payment", id: item.id, view: "government", title: item.serviceName, meta: `سداد حكومي · ${item.referenceCode} · ${item.status}`, searchValue: item.referenceCode })),
      ...taskRows.filter((item) => item.createdBy === access.user.email).map((item) => ({ key: `task-${item.id}`, kind: "task", id: item.id, view: "tasks", title: item.title, meta: `مهمة · ${item.status}`, searchValue: item.title })),
      ...letterRows.map((item) => ({ key: `letter-${item.id}`, kind: "official-letter", id: item.id, view: "contractual-documents", title: item.subject, meta: `خطاب · ${item.referenceCode} · ${item.status}`, searchValue: item.referenceCode })),
    ];
    return jsonNoStore({ results: results.slice(0, 24) });
  } catch (error) {
    console.error("portal-search-failed", error);
    return jsonNoStore({ error: "تعذّر البحث حالياً" }, { status: 500 });
  }
}
