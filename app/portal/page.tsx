import { Suspense } from "react";
import { desc, eq } from "drizzle-orm";
import Image from "next/image";
import { redirect } from "next/navigation";
import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { getDb } from "@/db";
import { companyAssets, companyDocuments, contractProfessions, contractWorkerAssignments, employees, financialRecords, legalRecords, portalActivity, portalUsers, visitorConversations, visitorMessages, workerAttachments, workers, workforceContracts, workforceRequestReplies, workforceRequests } from "@/db/schema";
import { getBusinessHoursState } from "@/lib/business-hours";
import { getChatAutomationConfig } from "@/lib/chat-automation";
import { emailDeliveryConfigured } from "@/lib/email-delivery";
import { listPortalNotifications } from "@/lib/portal-notifications";
import { canAccessPortalDepartment, canAccessPortalDocuments, canManageCompanyAssets, canManagePortalConversations, canManagePortalDocuments, hasPortalPermission, resolvePortalAccess } from "@/lib/portal-access";
import { getWebsiteContent } from "@/lib/website-content";
import { portalSessionEndPath, portalSessionStartPath, verifyPortalSession } from "@/lib/portal-session";
import PortalDashboard from "./PortalDashboard";
import PortalAccessRequestForm from "./PortalAccessRequestForm";

export const dynamic = "force-dynamic";

function PortalLoading() {
  return (
    <main className="portal-gate">
      <div className="gate-card loading-card" aria-live="polite">
        <span className="gate-loader" />
        <p>جارٍ التحقق من صلاحية الحساب...</p>
      </div>
    </main>
  );
}

async function ProtectedPortal() {
  const user = await requireChatGPTUser("/portal");
  const session = await verifyPortalSession(user.email);
  if (session.status === "missing") redirect(portalSessionStartPath("/portal"));
  if (session.status !== "valid") redirect(portalSessionEndPath("/portal", "session-expired"));
  const access = await resolvePortalAccess(user);

  if (!access.authorized) {
    const suspended = access.status === "suspended";
    const profile = await getDb().query.portalUsers.findFirst({ where: eq(portalUsers.email, access.user.email) });
    return (
      <main className="portal-gate">
        <section className="gate-card secure-gate-card">
          <Image src="/dally-logo.jpg" alt="شعار شركة دالي" className="gate-logo" width={545} height={280} sizes="180px" />
          <div className={`gate-status ${suspended ? "suspended" : "pending"}`} aria-hidden="true">
            {suspended ? "!" : "⌛"}
          </div>
          <p className="gate-kicker">النظام الإداري الداخلي</p>
          <h1>{suspended ? "الحساب موقوف" : "طلب الدخول قيد المراجعة"}</h1>
          <p className="gate-copy">
            {suspended
              ? "هذا الحساب غير مخوّل حالياً بالدخول إلى النظام. يرجى التواصل مع إدارة الشركة."
              : "تم التحقق من هويتك عبر مزوّد الهوية الآمن. أكمل بيانات طلب الانضمام، ولن تظهر أي وحدة إدارية قبل اعتماد الحساب وتحديد أقل صلاحية لازمة للعمل."}
          </p>
          <div className="gate-account">
            <span>الحساب المسجّل</span>
            <strong>{access.user.email}</strong>
          </div>
          {!suspended && (
            <PortalAccessRequestForm initialRequest={{
              requestedDepartment: profile?.requestedDepartment || null,
              requestedJobTitle: profile?.requestedJobTitle || null,
              requestReason: profile?.requestReason || null,
              requestSubmittedAt: profile?.requestSubmittedAt || null,
            }}/>
          )}
          <div className="gate-security-summary"><span>جلسة مشفّرة ومحدودة</span><span>إيقاف بعد 30 دقيقة خمول</span><span>اعتماد إداري موثّق</span></div>
          <a className="gate-signout" href={portalSessionEndPath("/portal")}>تسجيل الخروج الآمن</a>
        </section>
      </main>
    );
  }

  const db = getDb();
  const canManageRequests = access.role === "admin" || access.role === "manager";
  const canSeeDocuments = canAccessPortalDocuments(access);
  const canSeeContracts = canAccessPortalDepartment(access, "workforce") || canAccessPortalDepartment(access, "finance");
  const canSeeConversations = canManagePortalConversations(access);
  const [canReadWebsite, canManageWebsite, canAccessConstruction] = await Promise.all([
    hasPortalPermission(access, "website", "read"),
    hasPortalPermission(access, "website", "write"),
    hasPortalPermission(access, "construction", "read"),
  ]);
  const [requests, replies, notifications, users, activity, employeeRecords, financeRecords, legalItems, workerRecords, workerFiles, documents, assets, contracts, professionItems, assignmentItems, conversations, conversationMessages, businessHours, chatAutomation, websiteContent] = await Promise.all([
    canAccessPortalDepartment(access, "workforce")
      ? db.select().from(workforceRequests).orderBy(desc(workforceRequests.createdAt)).limit(250)
      : Promise.resolve([]),
    canAccessPortalDepartment(access, "workforce")
      ? db.select().from(workforceRequestReplies).orderBy(desc(workforceRequestReplies.createdAt)).limit(1500)
      : Promise.resolve([]),
    listPortalNotifications(access),
    access.role === "admin"
      ? db.select().from(portalUsers).orderBy(desc(portalUsers.createdAt)).limit(150)
      : Promise.resolve([]),
    canManageRequests
      ? db.select().from(portalActivity).orderBy(desc(portalActivity.createdAt)).limit(12)
      : Promise.resolve([]),
    canAccessPortalDepartment(access, "employees")
      ? db.select().from(employees).orderBy(desc(employees.createdAt)).limit(500)
      : Promise.resolve([]),
    canAccessPortalDepartment(access, "finance")
      ? db.select().from(financialRecords).orderBy(desc(financialRecords.createdAt)).limit(500)
      : Promise.resolve([]),
    canAccessPortalDepartment(access, "legal")
      ? db.select().from(legalRecords).orderBy(desc(legalRecords.createdAt)).limit(500)
      : Promise.resolve([]),
    canAccessPortalDepartment(access, "workforce")
      ? db.select().from(workers).orderBy(desc(workers.createdAt)).limit(500)
      : Promise.resolve([]),
    canAccessPortalDepartment(access, "workforce")
      ? db.select({
          id: workerAttachments.id,
          workerId: workerAttachments.workerId,
          documentType: workerAttachments.documentType,
          requirementCode: workerAttachments.requirementCode,
          title: workerAttachments.title,
          fileName: workerAttachments.fileName,
          contentType: workerAttachments.contentType,
          sizeBytes: workerAttachments.sizeBytes,
          createdBy: workerAttachments.createdBy,
          createdAt: workerAttachments.createdAt,
        }).from(workerAttachments).orderBy(desc(workerAttachments.createdAt)).limit(1000)
      : Promise.resolve([]),
    canSeeDocuments
      ? db.select({
          id: companyDocuments.id,
          referenceCode: companyDocuments.referenceCode,
          title: companyDocuments.title,
          category: companyDocuments.category,
          documentType: companyDocuments.documentType,
          counterparty: companyDocuments.counterparty,
          fileName: companyDocuments.fileName,
          contentType: companyDocuments.contentType,
          sizeBytes: companyDocuments.sizeBytes,
          expiryDate: companyDocuments.expiryDate,
          retentionUntil: companyDocuments.retentionUntil,
          lockedUntil: companyDocuments.lockedUntil,
          source: companyDocuments.source,
          status: companyDocuments.status,
          createdBy: companyDocuments.createdBy,
          createdAt: companyDocuments.createdAt,
          updatedAt: companyDocuments.updatedAt,
        }).from(companyDocuments).orderBy(desc(companyDocuments.createdAt)).limit(750)
      : Promise.resolve([]),
    canSeeDocuments
      ? db.select({
          slot: companyAssets.slot,
          fileName: companyAssets.fileName,
          contentType: companyAssets.contentType,
          sizeBytes: companyAssets.sizeBytes,
          uploadedBy: companyAssets.uploadedBy,
          updatedAt: companyAssets.updatedAt,
        }).from(companyAssets)
      : Promise.resolve([]),
    canSeeContracts
      ? db.select().from(workforceContracts).orderBy(desc(workforceContracts.createdAt)).limit(500)
      : Promise.resolve([]),
    canSeeContracts
      ? db.select().from(contractProfessions).orderBy(desc(contractProfessions.createdAt)).limit(1000)
      : Promise.resolve([]),
    canSeeContracts
      ? db.select().from(contractWorkerAssignments).orderBy(desc(contractWorkerAssignments.assignedAt)).limit(2000)
      : Promise.resolve([]),
    canSeeConversations
      ? db.select({
          id: visitorConversations.id,
          trackingCode: visitorConversations.trackingCode,
          visitorName: visitorConversations.visitorName,
          visitorEmail: visitorConversations.visitorEmail,
          visitorMobile: visitorConversations.visitorMobile,
          subject: visitorConversations.subject,
          status: visitorConversations.status,
          assignedTo: visitorConversations.assignedTo,
          relatedRequestId: visitorConversations.relatedRequestId,
          lastVisitorMessageAt: visitorConversations.lastVisitorMessageAt,
          lastStaffMessageAt: visitorConversations.lastStaffMessageAt,
          createdAt: visitorConversations.createdAt,
          updatedAt: visitorConversations.updatedAt,
        }).from(visitorConversations).orderBy(desc(visitorConversations.updatedAt)).limit(100)
      : Promise.resolve([]),
    canSeeConversations
      ? db.select({
          id: visitorMessages.id,
          conversationId: visitorMessages.conversationId,
          senderType: visitorMessages.senderType,
          senderName: visitorMessages.senderName,
          senderEmail: visitorMessages.senderEmail,
          body: visitorMessages.body,
          readByVisitorAt: visitorMessages.readByVisitorAt,
          readByStaffAt: visitorMessages.readByStaffAt,
          createdAt: visitorMessages.createdAt,
        }).from(visitorMessages).orderBy(desc(visitorMessages.id)).limit(1200)
      : Promise.resolve([]),
    getBusinessHoursState(),
    getChatAutomationConfig(),
    getWebsiteContent(),
  ]);

  return (
    <PortalDashboard
      currentUser={{
        email: access.user.email,
        displayName: access.user.displayName,
        role: access.role,
        department: access.department,
      }}
      initialRequests={requests}
      initialRequestReplies={replies}
      initialNotifications={notifications}
      initialUsers={users}
      initialActivity={activity}
      initialEmployees={employeeRecords}
      initialFinance={financeRecords}
      initialLegal={legalItems}
      initialWorkers={workerRecords}
      initialWorkerAttachments={workerFiles}
      initialDocuments={documents}
      initialAssets={assets}
      initialContracts={contracts}
      initialContractProfessions={professionItems}
      initialContractAssignments={assignmentItems}
      initialConversations={conversations}
      initialConversationMessages={[...conversationMessages].reverse()}
      initialBusinessHours={businessHours}
      initialChatAutomation={chatAutomation}
      canManageChatSettings={access.role === "admin"}
      canManageDocuments={canManagePortalDocuments(access)}
      canManageAssets={canManageCompanyAssets(access)}
      emailConfigured={emailDeliveryConfigured()}
      initialWebsiteContent={websiteContent}
      canAccessWebsite={canReadWebsite}
      canManageWebsite={canManageWebsite}
      canAccessConstruction={canAccessConstruction}
      signOutPath={portalSessionEndPath("/portal")}
    />
  );
}

export default function PortalPage() {
  return (
    <Suspense fallback={<PortalLoading />}>
      <ProtectedPortal />
    </Suspense>
  );
}
