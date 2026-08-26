"use client";

import { Fragment, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { requirementsForProfession, workforceNationalities, workforceProfessions } from "@/lib/workforce-requirements";
import { bankNameFromSaudiIban, formatSaudiIban, saudiBanks } from "@/lib/saudi-banks";
import OperationsWorkspace, { QuotationIssueModal, type OperationsTab } from "./OperationsWorkspace";
import DocumentShareManager from "./DocumentShareManager";
import WebsiteManager from "./WebsiteManager";
import BrandIdentityManager from "./BrandIdentityManager";
import type { WebsiteContent } from "@/lib/website-content";
import type { ChatAutomationConfig } from "@/lib/chat-automation";
import AccountingWorkspace from "./AccountingWorkspace";
import HrWorkspace from "./HrWorkspace";
import ComplianceWorkspace from "./ComplianceWorkspace";
import FinancialPostingWorkspace from "./FinancialPostingWorkspace";
import PurchasingWorkspace from "./PurchasingWorkspace";
import ReportsWorkspace from "./ReportsWorkspace";
import ReportPdfDownload from "./ReportPdfDownload";
import BankReconciliationWorkspace from "./BankReconciliationWorkspace";
import ConstructionWorkspace from "./ConstructionWorkspace";
import AccessScopeManager from "./AccessScopeManager";
import RoleDefinitionManager from "./RoleDefinitionManager";
import SalesRepresentativesWorkspace from "./SalesRepresentativesWorkspace";
import LegalCaseWorkspace from "./LegalCaseWorkspace";
import PaymentManagementDashboard from "./PaymentManagementDashboard";
import VideoInterviewDesk from "./VideoInterviewDesk";
import ServiceRatingsPanel from "./ServiceRatingsPanel";
import ExecutivePeopleCommandCenter from "./ExecutivePeopleCommandCenter";
import LocaleRuntime from "@/app/components/LocaleRuntime";
import GovernmentAffairsWorkspace from "./GovernmentAffairsWorkspace";
import TaskCenter, { GlobalTaskReminder } from "./TaskCenter";
import ContractualDocumentsWorkspace from "./ContractualDocumentsWorkspace";
import LetterPdfLibrary from "./LetterPdfLibrary";
import { defaultWorkforceContractClauses, type WorkforceContractClause, type WorkforceContractDirection } from "@/lib/workforce-contract-clauses";
import { ANNUAL_CONTRACT_MONTHS, annualContractSchedule, annualInstallmentPercentages } from "@/lib/payment-schedules";
import { readApiJson } from "@/lib/client-api";

type PortalRole = "admin" | "manager" | "employee";
type PortalDepartment = "employees" | "finance" | "legal" | "workforce" | "construction" | "general";
type RequestStatus = "new" | "reviewing" | "contacted" | "closed";
type View = "overview" | "notifications" | "tasks" | "employees" | "finance" | "legal" | "government" | "workforce" | "operations" | "representatives" | "construction" | "conversations" | "contractual-documents" | "documents" | "brand" | "website" | "users";
type RecordEntity = "employees" | "finance" | "legal" | "workforce";

type WorkforceRequest = {
  id: number; trackingCode: string; fullName: string; mobile: string; email: string;
  requestType: string; companyName: string | null; workSite: string | null; requiredStartDate: string | null;
  duration: string | null; requestedCount: number | null; preferredContact: string | null;
  activityType: string | null; quantityMode: string | null; clientCr: string | null; clientVat: string | null;
  clientAddress: string | null; representativeTitle: string | null; quotationItemsJson: string | null; quotationTermsJson: string | null;
  specialization: string; details: string; status: string; source: string;
  assignedTo: string | null; createdAt: string; updatedAt: string;
  version: number;
};
type WorkforceRequestReply = {
  id: number; requestId: number; senderEmail: string; senderName: string; recipientEmail: string;
  subject: string; body: string; deliveryStatus: string; providerMessageId: string | null;
  failureReason: string | null; sentAt: string | null; createdAt: string; updatedAt: string;
};
type PortalNotification = {
  id: number; eventType: string; title: string; message: string; severity: string; module: string;
  entityType: string | null; entityId: string | null; actionView: string | null; source: string;
  createdAt: string; updatedAt: string; readAt: string | null;
};
type PortalUser = {
  email: string; displayName: string; role: string; department: string; status: string;
  requestedDepartment: string | null; requestedJobTitle: string | null; requestReason: string | null;
  requestSubmittedAt: string | null; termsAcceptedAt: string | null; approvedBy: string | null;
  approvedAt: string | null; suspendedAt: string | null;
  createdAt: string; updatedAt: string; lastLoginAt: string | null;
};
type Activity = { id: number; actorEmail: string; action: string; entityType: string; entityId: string; createdAt: string };
type EmployeeRecord = {
  id: number; employeeNumber: string; fullName: string; jobTitle: string; department: string;
  mobile: string; email: string | null; nationalId: string | null; nationality: string | null; bankName: string | null; iban: string | null;
  sponsorshipType: string; sponsorName: string | null; iqamaExpiry: string | null; workPermitExpiry: string | null; contractEndDate: string | null;
  baseSalaryHalalas: number; housingAllowanceHalalas: number; transportAllowanceHalalas: number; otherAllowanceHalalas: number;
  annualLeaveDays: number; leaveBalanceDays: number; hireDate: string; status: string; createdAt: string; updatedAt: string;
};
type FinanceRecord = {
  id: number; referenceCode: string; category: string; description: string; amountHalalas: number;
  dueDate: string; workerId: number | null; contractId: number | null; documentId: number | null;
  periodMonth: string | null; subCategory: string | null; paymentMethod: string | null; bankAccountId: number | null; notes: string | null;
  status: string; createdAt: string; updatedAt: string;
};
type LegalRecord = {
  id: number; referenceCode: string; category: string; title: string; counterparty: string;
  clientId: number | null; contractId: number | null; referralReason: string | null; referredBy: string | null; referredAt: string | null; fileSnapshotJson: string | null;
  expiryDate: string | null; status: string; createdAt: string; updatedAt: string;
};
type WorkerRecord = {
  id: number; workerNumber: string; iqamaNumber: string | null; fullName: string; nationality: string; profession: string;
  mobile: string | null; iban: string | null; bankName: string | null; monthlySalaryHalalas: number; isCompanySponsored: boolean; sponsorshipType: string; sponsorName: string | null; ajirContractStatus: string; archivedAt: string | null; beneficiaryName: string | null; clientSite: string; assignmentStartDate: string | null;
  iqamaExpiry: string | null; medicalInsuranceExpiry: string | null; status: string; createdAt: string; updatedAt: string;
};
type WorkerAttachment = {
  id: number; workerId: number; documentType: string; requirementCode: string | null; title: string;
  expiryDate: string | null; fileName: string; contentType: string; sizeBytes: number; createdBy: string; createdAt: string;
};
type CompanyDocument = {
  id: number; referenceCode: string; title: string; category: string; documentType: string | null;
  counterparty: string | null; fileName: string; contentType: string; sizeBytes: number;
  expiryDate: string | null; retentionUntil: string | null; lockedUntil: string | null;
  source: string; status: string; createdBy: string; createdAt: string; updatedAt: string;
};
type CompanyAsset = {
  slot: string; fileName: string; contentType: string; sizeBytes: number; uploadedBy: string; updatedAt: string;
};
type WorkforceContract = {
  id: number; referenceCode: string; documentId: number; clientName: string; clientCr: string | null; clientVat: string | null;
  title: string; workSite: string; issueDate: string; startDate: string; endDate: string; amountHalalas: number;
  details: string; status: string; seasonType: string; versionNumber: number; parentContractId: number | null; approvedBy: string | null; approvedAt: string | null;
  signedAt: string | null; effectiveAt: string | null; suspendedAt: string | null; terminatedAt: string | null; cancellationReason: string | null;
  createdBy: string; createdAt: string; updatedAt: string;
};
type ContractProfession = { id: number; contractId: number; profession: string; requiredCount: number; sponsorshipType: string | null; sponsorName: string | null; ajirContractStatus: string | null; createdAt: string };
type ContractAssignment = {
  id: number; contractId: number; contractProfessionId: number; workerId: number; status: string;
  assignedBy: string; assignedAt: string; releasedAt: string | null;
};
type VisitorConversation = {
  id: string; trackingCode: string; visitorName: string; visitorEmail: string | null; visitorMobile: string;
  subject: string; status: string; assignedTo: string | null; relatedRequestId: number | null;
  lastVisitorMessageAt: string; lastStaffMessageAt: string | null; createdAt: string; updatedAt: string;
};
type VisitorMessage = {
  id: number; conversationId: string; senderType: string; senderName: string; senderEmail: string | null;
  body: string; readByVisitorAt: string | null; readByStaffAt: string | null; createdAt: string;
};
type BusinessHours = {
  isOpen: boolean; timezone: string; workingDays: number[]; opensAt: string; closesAt: string; autoReply: string;
  closedDates: string[]; specialOpenDates: string[]; exception?: "open" | "closed" | null; replyKey?: string; nextOpenLabel: string;
};

const requestStatuses: Record<RequestStatus, { label: string; className: string }> = {
  new: { label: "جديد", className: "status-new" }, reviewing: { label: "قيد المراجعة", className: "status-reviewing" },
  contacted: { label: "تم التواصل", className: "status-contacted" }, closed: { label: "مغلق", className: "status-closed" },
};
const recordStatus: Record<RecordEntity, Record<string, string>> = {
  employees: { active: "على رأس العمل", leave: "في إجازة", suspended: "موقوف", ended: "منتهية خدمته" },
  finance: { pending: "قيد المراجعة", approved: "معتمد", paid: "مدفوع", overdue: "متأخر" },
  legal: { active: "ساري", reviewing: "قيد المراجعة", renewal: "يحتاج إلى تجديد", closed: "مغلق" },
  workforce: { available: "متاح", assigned: "على رأس مشروع", leave: "في إجازة", suspended: "موقوف" },
};
const roleLabels: Record<PortalRole, string> = { admin: "مدير النظام", manager: "الإدارة", employee: "موظف" };
const functionalRoleLabels: Record<string, string> = {
  system_owner: "مالك النظام", system_admin: "مسؤول النظام", executive: "الإدارة التنفيذية",
  construction_director: "مدير قطاع المقاولات", workforce_operations_manager: "مدير تشغيل العمالة", finance_director: "المدير المالي",
  project_manager: "مدير مشروع", site_engineer: "مهندس موقع", planning_engineer: "مهندس تخطيط", cost_engineer: "مهندس تكاليف",
  contracts_manager: "مدير العقود", procurement_officer: "مسؤول المشتريات", project_accountant: "محاسب مشروع", document_controller: "مراقب وثائق",
  quality_officer: "مسؤول الجودة", safety_officer: "مسؤول السلامة", hr_officer: "مسؤول الموارد البشرية", government_relations_officer: "مسؤول العلاقات الحكومية والامتثال", regional_manager: "مدير منطقة",
  client_consultant: "ممثل العميل أو الاستشاري", subcontractor: "مقاول باطن",
  accountant: "المحاسب", lawyer: "محامي", legal_affairs: "شؤون قانونية", sales_representative: "مندوب مبيعات",
  purchasing_representative: "مندوب مشتريات", administrative_assistant: "مساعد إداري",
};
const departmentLabels: Record<PortalDepartment, string> = {
  employees: "إدارة الموظفين", finance: "الإدارة المالية", legal: "الشؤون القانونية",
  workforce: "شؤون العمالة", construction: "المقاولات والمشروعات", general: "صلاحية عامة",
};
const financeLabels: Record<string, string> = {
  worker_salary: "راتب عامل", worker_advance: "سلفة عامل", worker_deduction: "خصم عامل", worker_expense: "مصروف عمالة",
  workforce_invoice: "فاتورة عمالة", receipt_voucher: "سند قبض", payment_voucher: "سند صرف", progress_claim: "مستخلص عمالة",
  invoice: "فاتورة عميل", expense: "مصروف", payroll: "مسير رواتب", advance: "عُهدة أو سلفة",
};
const workforceExpenseLabels: Record<string, string> = {
  accommodation: "السكن", transportation: "النقل", iqama_visa: "الإقامة والتأشيرات", medical_insurance: "التأمين الطبي",
  tickets: "التذاكر", uniforms_safety: "الزي ومعدات السلامة", training_certificates: "التدريب والشهادات",
  treatment: "العلاج", meals: "الإعاشة والوجبات", other: "مصروف آخر",
};
const paymentMethodLabels: Record<string, string> = { bank_transfer: "تحويل بنكي", cash: "نقدي", cheque: "شيك", payroll_file: "ملف حماية الأجور", other: "أخرى" };
const legalLabels: Record<string, string> = { contract: "عقد", case: "قضية", license: "ترخيص", compliance: "امتثال" };
function legalFileSummary(value:string|null){if(!value)return null;try{const file=JSON.parse(value)as{documents?:unknown[];payments?:unknown[];finances?:unknown[];workers?:unknown[];contract?:{referenceCode?:string}};return{documents:file.documents?.length||0,payments:file.payments?.length||0,finances:file.finances?.length||0,workers:file.workers?.length||0,referenceCode:file.contract?.referenceCode||""}}catch{return null}}
const documentCategoryLabels: Record<string, string> = { license: "ترخيص", contract: "عقد", certificate: "شهادة", finance: "مالي", legal: "قانوني", hr: "موارد بشرية", other: "أخرى" };
const issuedTypeLabels: Record<string, string> = { workforce_contract: "عقد توفير عمالة", quotation: "عرض سعر", progress_claim: "مستخلص أعمال", invoice: "فاتورة", receipt: "سند قبض", payment_voucher: "سند صرف" };

function safeRequestStatus(value: string): RequestStatus { return value in requestStatuses ? value as RequestStatus : "new"; }
function formatDate(value: string | null, includeTime = false) {
  if (!value) return "غير محدد";
  const normalized = value.includes("T") ? value : `${value}T00:00:00`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ar-SA", { day: "numeric", month: "short", year: "numeric", ...(includeTime ? { hour: "numeric", minute: "2-digit" } : {}) }).format(date);
}
function formatMoney(halalas: number) {
  return new Intl.NumberFormat("ar-SA", { style: "currency", currency: "SAR", maximumFractionDigits: 2 }).format(halalas / 100);
}
function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} بايت`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} كيلوبايت`;
  return `${(bytes / 1024 / 1024).toFixed(1)} ميجابايت`;
}
function initials(name: string) { return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("") || "د"; }
function daysUntil(value: string | null) {
  if (!value) return Number.POSITIVE_INFINITY;
  const target = new Date(`${value}T00:00:00`).getTime();
  return Math.ceil((target - Date.now()) / 86400000);
}
function statusClass(status: string) {
  if (["active", "approved", "paid", "available", "assigned"].includes(status)) return "status-contacted";
  if (["overdue", "suspended", "ended"].includes(status)) return "status-new";
  if (["leave", "pending", "reviewing", "renewal"].includes(status)) return "status-reviewing";
  return "status-closed";
}
function workerRequirementStatus(worker: WorkerRecord, attachments: WorkerAttachment[]) {
  const workerFiles = attachments.filter((item) => item.workerId === worker.id);
  const requirements = requirementsForProfession(worker.profession);
  const missing: typeof requirements = [];
  const hasPhoto = workerFiles.some((item) => item.documentType === "photo");
  const hasIqamaCopy = workerFiles.some((item) => item.requirementCode === "iqama-copy");
  const hasIbanCertificate = workerFiles.some((item) => item.requirementCode === "iban-certificate");
  const hasWorkContract = workerFiles.some((item) => item.requirementCode === "work-contract");
  const total = 7 + (worker.isCompanySponsored ? 1 : 0);
  const complete = (hasPhoto ? 1 : 0) + (hasIqamaCopy ? 1 : 0) + (hasIbanCertificate ? 1 : 0) + (worker.iqamaNumber ? 1 : 0) + (worker.iban ? 1 : 0) + (worker.iqamaExpiry ? 1 : 0) + (worker.medicalInsuranceExpiry ? 1 : 0) + (worker.isCompanySponsored && hasWorkContract ? 1 : 0);
  return { requirements, missing, hasPhoto, complete, total, percent: Math.round((complete / total) * 100), files: workerFiles };
}
function sponsorshipMatches(worker: WorkerRecord, requirement: Pick<ContractProfession, "sponsorshipType" | "sponsorName" | "ajirContractStatus">) {
  if (!requirement.sponsorshipType) return true;
  if (worker.sponsorshipType !== requirement.sponsorshipType) return false;
  return requirement.sponsorshipType !== "other"
    || (worker.sponsorName === requirement.sponsorName && worker.ajirContractStatus === requirement.ajirContractStatus);
}
function sponsorshipLabel(value: Pick<WorkerRecord, "sponsorshipType" | "sponsorName" | "ajirContractStatus">) {
  if (value.sponsorshipType === "dali") return "على كفالة شركة دالي";
  return `على كفالة ${value.sponsorName || "جهة أخرى"} — ${value.ajirContractStatus === "with_ajir" ? "بعقد أجير" : "بدون عقد أجير"}`;
}

type IconName = "home" | "employees" | "finance" | "legal" | "workforce" | "conversations" | "documents" | "brand" | "website" | "users" | "search" | "bell" | "menu" | "close" | "plus" | "download" | "share" | "upload" | "stamp" | "mail" | "check";
function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, React.ReactNode> = {
    home: <><path d="M3 10.8 12 3l9 7.8"/><path d="M5.5 9.5V21h13V9.5M9 21v-6h6v6"/></>,
    employees: <><circle cx="9" cy="8" r="4"/><path d="M2.5 21c.7-4 2.8-6 6.5-6s5.8 2 6.5 6M16 4.5a4 4 0 0 1 0 7.5M17 15c2.5.5 3.9 2.4 4.5 6"/></>,
    finance: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18M7 15h3M15 13v4M13 15h4"/></>,
    legal: <><path d="M12 3v18M6 6h12M7 6l-4 7h8L7 6ZM17 6l-4 7h8l-4-7ZM7 21h10"/></>,
    workforce: <><path d="M4 20V7l8-4 8 4v13M8 20v-5h8v5M8 9h.01M12 9h.01M16 9h.01"/></>,
    conversations: <><path d="M4 5h16v11H9l-5 4V5Z"/><path d="M8 9h8M8 12h5"/></>,
    documents: <><path d="M6 3h9l4 4v14H6z"/><path d="M15 3v5h5M9 12h7M9 16h7"/></>,
    brand: <><path d="M12 3 4 7v10l8 4 8-4V7l-8-4Z"/><path d="m4 7 8 4 8-4M12 11v10"/><circle cx="12" cy="7" r="1.6"/></>,
    website: <><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.5 3.8 5.5 3.8 9S14.5 18.5 12 21M12 3C9.5 5.5 8.2 8.5 8.2 12S9.5 18.5 12 21"/></>,
    users: <><circle cx="8" cy="8" r="3.5"/><circle cx="17" cy="8" r="3.5"/><path d="M1.5 21c.5-4 2.5-6 6.5-6s6 2 6.5 6M14 15c4.8-.2 7.4 1.8 8.5 6"/></>,
    search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></>,
    menu: <><path d="M4 7h16M4 12h16M4 17h16"/></>, close: <><path d="m5 5 14 14M19 5 5 19"/></>,
    plus: <><path d="M12 5v14M5 12h14"/></>,
    download: <><path d="M12 3v12M7 10l5 5 5-5M4 21h16"/></>,
    share: <><circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.5-4.4M8.2 13.2l7.5 4.4"/></>,
    upload: <><path d="M12 16V4M7 9l5-5 5 5M4 20h16"/></>,
    stamp: <><path d="M8 13h8M9 13c0-3 1-4 1-7a2 2 0 0 1 4 0c0 3 1 4 1 7M5 13h14v4H5zM7 21h10"/></>,
    mail: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/></>,
    check: <><path d="m5 12 4 4L19 6"/></>,
  };
  return <svg className="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

export default function PortalDashboard({ currentUser, initialRequests, initialRequestReplies, initialNotifications, initialUsers, initialActivity, initialEmployees, initialFinance, initialLegal, initialWorkers, initialWorkerAttachments, initialDocuments, initialAssets, initialContracts, initialContractProfessions, initialContractAssignments, initialConversations, initialConversationMessages, initialBusinessHours, initialChatAutomation, initialWebsiteContent, canAccessWebsite, canManageWebsite, canAccessConstruction, canManageChatSettings, canManageDocuments, canManageAssets, emailConfigured, signOutPath }: {
  currentUser: { email: string; displayName: string; role: PortalRole; department: PortalDepartment; functionalRoles: string[]; functionalPermissions: string[]; preferredLanguage: "ar" | "en" | "bn" };
  initialRequests: WorkforceRequest[]; initialRequestReplies: WorkforceRequestReply[]; initialNotifications: PortalNotification[]; initialUsers: PortalUser[]; initialActivity: Activity[];
  initialEmployees: EmployeeRecord[]; initialFinance: FinanceRecord[]; initialLegal: LegalRecord[]; initialWorkers: WorkerRecord[]; initialWorkerAttachments: WorkerAttachment[];
  initialDocuments: CompanyDocument[]; initialAssets: CompanyAsset[]; canManageDocuments: boolean; canManageAssets: boolean;
  initialContracts: WorkforceContract[]; initialContractProfessions: ContractProfession[]; initialContractAssignments: ContractAssignment[];
  initialConversations: VisitorConversation[]; initialConversationMessages: VisitorMessage[]; initialBusinessHours: BusinessHours; canManageChatSettings: boolean;
  initialChatAutomation: ChatAutomationConfig;
  emailConfigured: boolean;
  initialWebsiteContent: WebsiteContent; canAccessWebsite: boolean; canManageWebsite: boolean; canAccessConstruction: boolean;
  signOutPath: string;
}) {
  const router = useRouter();
  const [view, setView] = useState<View>("overview");
  const [requests, setRequests] = useState(initialRequests);
  const [requestReplies, setRequestReplies] = useState(initialRequestReplies);
  const [notifications, setNotifications] = useState(initialNotifications);
  const [users, setUsers] = useState(initialUsers);
  const [employees, setEmployees] = useState(initialEmployees);
  const [finance, setFinance] = useState(initialFinance);
  const [legal, setLegal] = useState(initialLegal);
  const [workers, setWorkers] = useState(initialWorkers);
  const [workerAttachments, setWorkerAttachments] = useState(initialWorkerAttachments);
  const [documents, setDocuments] = useState(initialDocuments);
  const [assets, setAssets] = useState(initialAssets);
  const [contracts, setContracts] = useState(initialContracts);
  const [contractProfessions, setContractProfessions] = useState(initialContractProfessions);
  const [contractAssignments, setContractAssignments] = useState(initialContractAssignments);
  const [conversations, setConversations] = useState(initialConversations);
  const [conversationMessages, setConversationMessages] = useState(initialConversationMessages);
  const [businessHours, setBusinessHours] = useState(initialBusinessHours);
  const [chatAutomation, setChatAutomation] = useState(initialChatAutomation);
  const latestConversationMessageId = useRef(initialConversationMessages.reduce((max, item) => Math.max(max, item.id), 0));
  const latestConversationUpdatedAt = useRef(initialConversations.reduce((latest, item) => item.updatedAt > latest ? item.updatedAt : latest, ""));
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [selectedWorkerId, setSelectedWorkerId] = useState<number | null>(null);
  const [selectedContractId, setSelectedContractId] = useState<number | null>(null);
  const [requestFilter, setRequestFilter] = useState<"all" | RequestStatus>("all");
  const [query, setQuery] = useState("");
  const [globalQuery, setGlobalQuery] = useState("");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const notificationShellRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [modal, setModal] = useState<RecordEntity | null>(null);
  const [documentModal, setDocumentModal] = useState<"upload" | "issue" | null>(null);
  const [userModal, setUserModal] = useState(false);
  const [chatSettingsOpen, setChatSettingsOpen] = useState(false);
  const [operationsTab, setOperationsTab] = useState<OperationsTab>("crm");
  const [operationsQuery, setOperationsQuery] = useState("");
  const [issuePreset, setIssuePreset] = useState("workforce_contract");
  const [issueQuoteId,setIssueQuoteId]=useState<number|null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const functionalAdmin = currentUser.functionalRoles.some((role) => role === "system_owner" || role === "system_admin");
  const isSystemOwner = currentUser.functionalRoles.includes("system_owner");
  const isSystemAdmin = currentUser.functionalRoles.includes("system_admin");
  const hasPermission = (permission: string) => currentUser.role === "admin" || currentUser.functionalPermissions.includes("*") || currentUser.functionalPermissions.includes(permission);
  const canAccess = (department: RecordEntity) => hasPermission(`${department}.read`);
  const canWriteDepartment = (department: RecordEntity) => hasPermission(`${department}.write`);
  const viewDepartment: Partial<Record<View, RecordEntity>> = { employees:"employees", finance:"finance", legal:"legal", workforce:"workforce", conversations:"workforce" };
  const canWrite = viewDepartment[view] ? canWriteDepartment(viewDepartment[view]!) : currentUser.role === "admin" || functionalAdmin;
  const canAccessDocuments = hasPermission("documents.read");
  const canAccessGovernment = hasPermission("government.read");
  const canAccessOperations = hasPermission("operations.read");
  const canAccessContracts = hasPermission("contracts.read");
  const activeRoleLabel = currentUser.functionalRoles.map((role) => functionalRoleLabels[role] || role).join("، ") || roleLabels[currentUser.role];

  useEffect(() => {
    if (!notificationsOpen) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && !notificationShellRef.current?.contains(target)) setNotificationsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setNotificationsOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [notificationsOpen]);

  useEffect(() => {
    let idleTimer = 0;
    let lastTouch = 0;
    let lastInteractionAt = Date.now();
    const endForIdle = () => { router.replace("/api/portal/session/end?returnTo=%2Fportal&reason=idle-timeout"); };
    const endForNightCutoff = () => { router.replace("/api/portal/session/end?returnTo=%2Fportal&reason=attendance-20h-idle-cutoff"); };
    const registerActivity = () => {
      lastInteractionAt = Date.now();
      window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(endForIdle, 30 * 60_000);
      if (Date.now() - lastTouch < 60_000) return;
      lastTouch = Date.now();
      void fetch("/api/portal/session/touch", { method: "POST", cache: "no-store" }).then((response) => {
        if (response.status === 401 || response.status === 403) endForIdle();
      }).catch(() => undefined);
    };
    const visibleActivity = () => { if (document.visibilityState === "visible") registerActivity(); };
    const events: Array<keyof WindowEventMap> = ["pointerdown", "keydown", "scroll", "touchstart"];
    events.forEach((eventName) => window.addEventListener(eventName, registerActivity, { passive: true }));
    document.addEventListener("visibilitychange", visibleActivity);
    const nightTimer = window.setInterval(() => {
      if (isSystemAdmin) return;
      const riyadhHour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Riyadh", hour: "2-digit", hourCycle: "h23" }).format(new Date()));
      if (riyadhHour >= 20 && Date.now() - lastInteractionAt >= 10 * 60_000) endForNightCutoff();
    }, 30_000);
    registerActivity();
    return () => {
      window.clearTimeout(idleTimer);
      window.clearInterval(nightTimer);
      events.forEach((eventName) => window.removeEventListener(eventName, registerActivity));
      document.removeEventListener("visibilitychange", visibleActivity);
    };
  }, [router, isSystemAdmin]);

  useEffect(() => {
    const dialog = document.querySelector<HTMLElement>("[role='dialog'][aria-modal='true']");
    if (!dialog) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusableSelector = "button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";
    const focusables = Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector));
    focusables[0]?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        dialog.parentElement?.querySelector<HTMLButtonElement>(".drawer-backdrop")?.click();
        return;
      }
      if (event.key !== "Tab" || !focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    dialog.addEventListener("keydown", handleKeyDown);
    return () => {
      dialog.removeEventListener("keydown", handleKeyDown);
      previousFocus?.focus();
    };
  }, [selectedId, selectedConversationId, selectedWorkerId, selectedContractId, modal, documentModal, userModal, chatSettingsOpen]);

  const requestCounts = useMemo(() => ({
    total: requests.length, new: requests.filter((item) => safeRequestStatus(item.status) === "new").length,
    reviewing: requests.filter((item) => safeRequestStatus(item.status) === "reviewing").length,
    contacted: requests.filter((item) => safeRequestStatus(item.status) === "contacted").length,
  }), [requests]);
  const selected = requests.find((item) => item.id === selectedId) ?? null;
  const selectedConversation = conversations.find((item) => item.id === selectedConversationId) ?? null;
  const selectedWorker = workers.find((item) => item.id === selectedWorkerId) ?? null;
  const selectedContract = contracts.find((item) => item.id === selectedContractId) ?? null;
  const financialTotal = finance.reduce((total, item) => total + item.amountHalalas, 0);
  const payrollTotal = finance.filter((item) => item.category === "worker_salary").reduce((total, item) => total + item.amountHalalas, 0);
  const advancesTotal = finance.filter((item) => item.category === "worker_advance").reduce((total, item) => total + item.amountHalalas, 0);
  const deductionsTotal = finance.filter((item) => item.category === "worker_deduction").reduce((total, item) => total + item.amountHalalas, 0);
  const workforceExpensesTotal = finance.filter((item) => item.category === "worker_expense").reduce((total, item) => total + item.amountHalalas, 0);
  const workforceInvoicesTotal = finance.filter((item) => ["workforce_invoice", "progress_claim"].includes(item.category)).reduce((total, item) => total + item.amountHalalas, 0);
  const legalAlerts = legal.filter((item) => item.status !== "closed" && daysUntil(item.expiryDate) <= 45).length;
  const workerAlerts = workers.filter((item) => daysUntil(item.iqamaExpiry) <= 45).length;
  const employeeComplianceAlerts = employees.reduce((total,item)=>total+(daysUntil(item.iqamaExpiry)<29?1:0)+(item.sponsorshipType==="dali"&&daysUntil(item.contractEndDate)<29?1:0)+(item.sponsorshipType==="dali"&&daysUntil(item.workPermitExpiry)<29?1:0),0);
  const incompleteWorkerFiles = workers.filter((worker) => workerRequirementStatus(worker, workerAttachments).missing.length > 0 || !workerRequirementStatus(worker, workerAttachments).hasPhoto || !worker.iqamaNumber).length;
  const activeBeneficiaries = new Set(workers.filter((item) => item.status === "assigned" && item.beneficiaryName).map((item) => item.beneficiaryName)).size;
  const expiringDocuments = documents.filter((item) => item.status === "active" && daysUntil(item.expiryDate) >= 0 && daysUntil(item.expiryDate) <= 30);
  const expiredDocuments = documents.filter((item) => item.status === "active" && daysUntil(item.expiryDate) < 0);
  const documentAlerts = expiringDocuments.length + expiredDocuments.length;
  const unreadNotifications = notifications.filter((item) => !item.readAt).length;
  const unreadConversationMessages = conversationMessages.filter((item) => item.senderType === "visitor" && !item.readByStaffAt).length;
  const waitingConversations = conversations.filter((item) => item.status === "waiting").length;

  function canOpenView(next: View) {
    if (["overview", "notifications", "tasks"].includes(next)) return true;
    if (next === "employees" || next === "finance" || next === "legal" || next === "workforce") return canAccess(next);
    if (next === "government") return canAccessGovernment;
    if (next === "operations" || next === "representatives") return canAccessOperations;
    if (next === "contractual-documents") return canAccessContracts;
    if (next === "documents" || next === "brand") return canAccessDocuments;
    if (next === "construction") return canAccessConstruction;
    if (next === "conversations") return hasPermission("conversations.read") || hasPermission("conversations.write");
    if (next === "website") return canAccessWebsite;
    if (next === "users") return functionalAdmin || currentUser.role === "admin";
    return false;
  }
  function changeView(next: View) { if (!canOpenView(next)) { setView("overview"); setMenuOpen(false); return; } setView(next); setQuery(""); setMenuOpen(false); }
  function notify(message: string) { setNotice(message); window.setTimeout(() => setNotice(""), 5000); }

  const refreshNotifications = useCallback(async (silent = false) => {
    try {
      const response = await fetch("/api/portal/notifications", { cache: "no-store" });
      const result = await readApiJson(response) as { notifications?: PortalNotification[]; error?: string };
      if (!response.ok || !result.notifications) throw new Error(result.error || "تعذّر تحديث الإشعارات");
      setNotifications(result.notifications);
    } catch (error) {
      if (!silent) {
        setNotice(error instanceof Error ? error.message : "تعذّر تحديث الإشعارات.");
        window.setTimeout(() => setNotice(""), 5000);
      }
    }
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refreshNotifications(true);
    }, 45000);
    return () => window.clearInterval(timer);
  }, [refreshNotifications]);

  const refreshConversations = useCallback(async (silent = false, full = false) => {
    try {
      const params = full ? "" : `?afterMessageId=${latestConversationMessageId.current}&updatedAfter=${encodeURIComponent(latestConversationUpdatedAt.current)}`;
      const response = await fetch(`/api/portal/conversations${params}`, { cache: "no-store" });
      const result = await readApiJson(response) as { conversations?: VisitorConversation[]; messages?: VisitorMessage[]; businessHours?: BusinessHours; chatAutomation?: ChatAutomationConfig; delta?: boolean; error?: string };
      if (!response.ok || !result.conversations || !result.messages || !result.businessHours) throw new Error(result.error || "تعذّر تحديث المحادثات");
      setConversations((current) => result.delta ? [...result.conversations!, ...current.filter((item) => !result.conversations!.some((changed) => changed.id === item.id))].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 100) : result.conversations!);
      setConversationMessages((current) => result.delta ? [...current, ...result.messages!.filter((item) => !current.some((existing) => existing.id === item.id))].slice(-1600) : result.messages!);
      if (result.messages.length) latestConversationMessageId.current = Math.max(latestConversationMessageId.current, ...result.messages.map((item) => item.id));
      if (result.conversations.length) latestConversationUpdatedAt.current = result.conversations.reduce((latest, item) => item.updatedAt > latest ? item.updatedAt : latest, latestConversationUpdatedAt.current);
      setBusinessHours(result.businessHours);
      if (result.chatAutomation) setChatAutomation(result.chatAutomation);
    } catch (error) {
      if (!silent) notify(error instanceof Error ? error.message : "تعذّر تحديث المحادثات.");
    }
  }, []);

  useEffect(() => {
    if (currentUser.role === "employee" && currentUser.department !== "workforce") return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refreshConversations(true);
    }, 12000);
    return () => window.clearInterval(timer);
  }, [refreshConversations, currentUser.role, currentUser.department]);

  async function openConversation(id: string) {
    setSelectedConversationId(id);
    try {
      const response = await fetch(`/api/portal/conversations?conversationId=${encodeURIComponent(id)}`, { cache: "no-store" });
      const result = await readApiJson(response) as { messages?: VisitorMessage[] };
      if (response.ok && result.messages) {
        setConversationMessages((items) => [...items.filter((item) => item.conversationId !== id), ...result.messages!]);
        if (result.messages.length) latestConversationMessageId.current = Math.max(latestConversationMessageId.current, ...result.messages.map((item) => item.id));
      }
    } catch { /* يحتفظ النظام بالبيانات المحملة مسبقاً عند تعذر الجلب التفصيلي */ }
    const now = new Date().toISOString();
    setConversationMessages((items) => items.map((item) => item.conversationId === id && item.senderType === "visitor" ? { ...item, readByStaffAt: item.readByStaffAt || now } : item));
    try {
      await fetch("/api/portal/conversations", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "mark-read", conversationId: id }),
      });
    } catch { /* polling will reconcile read state */ }
  }

  async function sendConversationReply(conversationId: string, form: HTMLFormElement) {
    setBusy(`chat-reply-${conversationId}`);
    try {
      const body = String(new FormData(form).get("body") || "").trim();
      const response = await fetch("/api/portal/conversations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ conversationId, body }),
      });
      const result = await readApiJson(response) as { conversation?: VisitorConversation; message?: VisitorMessage; error?: string };
      if (!response.ok || !result.conversation || !result.message) throw new Error(result.error || "تعذّر إرسال الرد");
      setConversations((items) => items.map((item) => item.id === conversationId ? { ...item, ...result.conversation } : item));
      setConversationMessages((items) => [...items, result.message as VisitorMessage]);
      form.reset();
      notify("تم إرسال الرد للزائر داخل المحادثة مباشرة.");
      void refreshNotifications(true);
    } catch (error) { notify(error instanceof Error ? error.message : "تعذّر إرسال الرد."); }
    finally { setBusy(null); }
  }

  async function updateConversationStatus(conversationId: string, status: "waiting" | "open" | "closed") {
    setBusy(`chat-status-${conversationId}`);
    try {
      const response = await fetch("/api/portal/conversations", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "status", conversationId, status }),
      });
      const result = await readApiJson(response) as { conversation?: VisitorConversation; error?: string };
      if (!response.ok || !result.conversation) throw new Error(result.error || "تعذّر تحديث المحادثة");
      setConversations((items) => items.map((item) => item.id === conversationId ? { ...item, ...result.conversation } : item));
      notify(status === "closed" ? "تم إغلاق المحادثة." : "تم تحديث حالة المحادثة.");
    } catch (error) { notify(error instanceof Error ? error.message : "تعذّر تحديث المحادثة."); }
    finally { setBusy(null); }
  }

  async function saveBusinessHours(form: HTMLFormElement) {
    setBusy("chat-settings");
    const data = new FormData(form);
    const config = {
      workingDays: data.getAll("workingDays").map(Number),
      opensAt: String(data.get("opensAt") || ""),
      closesAt: String(data.get("closesAt") || ""),
      autoReply: String(data.get("autoReply") || ""),
      closedDates: String(data.get("closedDates") || "").split(/[\s,،]+/).filter(Boolean),
      specialOpenDates: String(data.get("specialOpenDates") || "").split(/[\s,،]+/).filter(Boolean),
    };
    const automation = {
      enabled: data.get("automationEnabled") === "on",
      welcomeEnabled: data.get("welcomeEnabled") === "on",
      afterHoursEnabled: data.get("afterHoursEnabled") === "on",
      intentRepliesEnabled: data.get("intentRepliesEnabled") === "on",
      welcomeReply: String(data.get("welcomeReply") || ""),
      rules: chatAutomation.rules.map((rule) => ({
        ...rule,
        enabled: data.get(`ruleEnabled:${rule.id}`) === "on",
        keywords: String(data.get(`ruleKeywords:${rule.id}`) || "").split(/[\n,،]+/).map((item) => item.trim()).filter(Boolean),
        response: String(data.get(`ruleResponse:${rule.id}`) || ""),
      })),
    };
    try {
      const response = await fetch("/api/portal/conversations", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "settings", config, automation }),
      });
      const result = await readApiJson(response) as { businessHours?: BusinessHours; chatAutomation?: ChatAutomationConfig; error?: string };
      if (!response.ok || !result.businessHours || !result.chatAutomation) throw new Error(result.error || "تعذّر حفظ إعدادات المحادثة");
      setBusinessHours(result.businessHours);
      setChatAutomation(result.chatAutomation);
      setChatSettingsOpen(false);
      notify("تم تحديث ساعات الدوام ونظام الرد الآلي المتكامل.");
      void refreshNotifications(true);
    } catch (error) { notify(error instanceof Error ? error.message : "تعذّر حفظ الإعدادات."); }
    finally { setBusy(null); }
  }

  async function updateNotificationState(action: "read" | "read-all" | "dismiss", ids: number[] = []) {
    try {
      const response = await fetch("/api/portal/notifications", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, ids }),
      });
      const result = await readApiJson(response) as { notifications?: PortalNotification[]; error?: string };
      if (!response.ok || !result.notifications) throw new Error(result.error || "تعذّر تحديث الإشعارات");
      setNotifications(result.notifications);
    } catch (error) { notify(error instanceof Error ? error.message : "تعذّر تحديث الإشعارات."); }
  }

  function openNotification(item: PortalNotification) {
    if (!item.readAt) void updateNotificationState("read", [item.id]);
    setNotificationsOpen(false);
    setOperationsQuery("");
    const actionView = item.actionView as View | null;
    if (actionView && ["overview", "notifications", "tasks", "employees", "finance", "legal", "government", "workforce", "operations", "construction", "conversations", "contractual-documents", "documents", "website", "users"].includes(actionView)) changeView(actionView);
    if (item.entityType === "workforce-request" && item.entityId) setSelectedId(Number(item.entityId));
    if (item.entityType === "worker" && item.entityId) setSelectedWorkerId(Number(item.entityId));
    if (item.entityType === "workforce-contract" && item.entityId) setSelectedContractId(Number(item.entityId));
    if (item.entityType === "visitor-conversation" && item.entityId) void openConversation(item.entityId);
    if (item.entityType === "data-subject-request") setOperationsTab("privacy");
    if (item.entityType === "quote-version") setOperationsTab("quotes");
    if (item.entityType === "work-order") setOperationsTab("orders");
    if (item.entityType === "timesheet") setOperationsTab("timesheets");
    if (item.entityType?.startsWith("integration-")) setOperationsTab("integrations");
  }

  async function sendRequestReply(requestId: number, form: HTMLFormElement) {
    setBusy(`reply-${requestId}`);
    try {
      const formData = new FormData(form);
      const payload = { ...Object.fromEntries(formData.entries()), functionalRoles: formData.getAll("functionalRoles") };
      const response = await fetch(`/api/portal/requests/${requestId}/reply`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await readApiJson(response) as { reply?: WorkforceRequestReply | null; request?: WorkforceRequest; error?: string };
      if (result.reply) setRequestReplies((items) => [result.reply as WorkforceRequestReply, ...items.filter((item) => item.id !== result.reply!.id)]);
      if (!response.ok || !result.reply || !result.request) throw new Error(result.error || "تعذّر إرسال الرد");
      setRequests((items) => items.map((item) => item.id === requestId ? result.request as WorkforceRequest : item));
      form.reset();
      notify("تم إرسال الرد إلى بريد الزائر وحفظه في سجل الطلب.");
      void refreshNotifications(true);
    } catch (error) { notify(error instanceof Error ? error.message : "تعذّر إرسال الرد."); }
    finally { setBusy(null); }
  }

  async function createRecord(entity: RecordEntity, form: HTMLFormElement) {
    setBusy(`create-${entity}`);
    const data = Object.fromEntries(new FormData(form).entries());
    try {
      const response = await fetch("/api/portal/records", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ entity, data }) });
      const result = await readApiJson(response) as { record?: EmployeeRecord | FinanceRecord | LegalRecord | WorkerRecord; error?: string };
      if (!response.ok || !result.record) throw new Error(result.error || "تعذّر حفظ السجل");
      if (entity === "employees") setEmployees((items) => [result.record as EmployeeRecord, ...items]);
      if (entity === "finance") setFinance((items) => [result.record as FinanceRecord, ...items]);
      if (entity === "legal") setLegal((items) => [result.record as LegalRecord, ...items]);
      if (entity === "workforce") setWorkers((items) => [result.record as WorkerRecord, ...items]);
      setModal(null); notify("تم حفظ السجل بنجاح.");
    } catch (error) { notify(error instanceof Error ? error.message : "تعذّر حفظ السجل."); }
    finally { setBusy(null); }
  }

  async function createEmployee(form: HTMLFormElement) {
    setBusy("create-employees");
    try {
      const response = await fetch("/api/portal/employees", { method: "POST", body: new FormData(form) });
      const result = await readApiJson(response) as { employee?: EmployeeRecord; error?: string };
      if (!response.ok || !result.employee) throw new Error(result.error || "تعذّر إنشاء ملف الموظف");
      setEmployees(items => [result.employee!, ...items]);
      setModal(null); notify("تم إنشاء ملف الموظف وربطه بالمستخدم والموارد البشرية والرواتب.");
      void refreshNotifications(true);
    } catch (error) { notify(error instanceof Error ? error.message : "تعذّر إنشاء ملف الموظف"); }
    finally { setBusy(null); }
  }

  async function updateEmployeeCompliance(id: number, data: Record<string, string>) {
    setBusy(`employee-update-${id}`);
    try {
      const response = await fetch("/api/portal/employees", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, ...data }) });
      const result = await readApiJson(response) as { employee?: EmployeeRecord; error?: string };
      if (!response.ok || !result.employee) throw new Error(result.error || "تعذر تحديث الموظف");
      setEmployees(items => items.map(item => item.id === id ? result.employee! : item));
      notify("تم تحديث الكفالة والاستحقاقات النظامية للموظف.");
      void refreshNotifications(true);
    } catch (error) { notify(error instanceof Error ? error.message : "تعذر تحديث الموظف"); }
    finally { setBusy(null); }
  }

  async function deleteEmployee(id: number) {
    if (!window.confirm("سيُحذف الموظف من السجل النشط مع الاحتفاظ بتاريخه المالي والوظيفي. هل تريد المتابعة؟")) return;
    setBusy(`employee-delete-${id}`);
    try {
      const response = await fetch(`/api/portal/employees?id=${id}`, { method: "DELETE" });
      const result = await readApiJson(response) as { success?: boolean; error?: string };
      if (!response.ok || !result.success) throw new Error(result.error || "تعذر حذف الموظف");
      setEmployees(items => items.filter(item => item.id !== id));
      notify("حُذف الموظف من السجل النشط مع حفظ تاريخه المالي والوظيفي.");
      void refreshNotifications(true);
    } catch (error) { notify(error instanceof Error ? error.message : "تعذر حذف الموظف"); }
    finally { setBusy(null); }
  }

  async function createWorker(form: HTMLFormElement) {
    setBusy("create-workforce");
    const createdWorkers: WorkerRecord[]=[]; const createdAttachments: WorkerAttachment[]=[];
    try {
      const source = new FormData(form); const count = Math.max(1, Number(source.get("workerCount") || 1));
      for(let index=0;index<count;index++){
        const payload=new FormData();
        for(const name of ["workerNumber","iqamaNumber","fullName","mobile","iban","bankName","monthlySalary","sponsorshipType","sponsorName","ajirContractStatus","iqamaExpiry","medicalInsuranceExpiry","photo","iqamaDocument","ibanCertificate"])payload.set(name,source.get(`${name}:${index}`) as FormDataEntryValue);
        const workContract=source.get(`workContract:${index}`);if(workContract instanceof File&&workContract.size)payload.set("workContract",workContract);
        payload.set("nationality",source.get("nationality") as FormDataEntryValue);payload.set("profession",source.get("profession") as FormDataEntryValue);
        for(const requirement of requirementsForProfession(String(source.get("profession")||"")))payload.set(`requirement:${requirement.code}`,source.get(`requirement:${requirement.code}:${index}`) as FormDataEntryValue);
        for(const file of source.getAll(`extraCertificates:${index}`))payload.append("extraCertificates",file);
        const response = await fetch("/api/portal/workers", { method: "POST", body: payload });
        const result = await readApiJson(response) as { worker?: WorkerRecord; attachments?: WorkerAttachment[]; error?: string };
        if (!response.ok || !result.worker || !result.attachments) throw new Error(`العامل ${index+1}: ${result.error || "تعذّر إنشاء الملف"}`);
        createdWorkers.push(result.worker);createdAttachments.push(...result.attachments);
        setWorkers((items)=>[result.worker as WorkerRecord,...items]);setWorkerAttachments((items)=>[...(result.attachments as WorkerAttachment[]),...items]);
      }
      setModal(null); notify(`تم إنشاء ${createdWorkers.length} ملف عامل وإرفاق صور الإقامة والمتطلبات.`);
    } catch (error) { notify(`${createdWorkers.length?`تم حفظ ${createdWorkers.length} عامل بنجاح. `:""}${error instanceof Error ? error.message : "تعذّر إنشاء ملف العامل."}`); }
    finally { setBusy(null); }
  }

  async function uploadWorkerAttachment(workerId: number, form: HTMLFormElement) {
    setBusy(`worker-attachment-${workerId}`);
    const data = new FormData(form); data.set("workerId", String(workerId));
    try {
      const response = await fetch("/api/portal/workers/attachments", { method: "POST", body: data });
      const result = await readApiJson(response) as { attachment?: WorkerAttachment; error?: string };
      if (!response.ok || !result.attachment) throw new Error(result.error || "تعذّر رفع الشهادة");
      setWorkerAttachments((items) => [result.attachment as WorkerAttachment, ...items]);
      form.reset(); notify("تمت إضافة الشهادة إلى ملف العامل.");
    } catch (error) { notify(error instanceof Error ? error.message : "تعذّر رفع الشهادة."); }
    finally { setBusy(null); }
  }

  async function updateRecordStatus(entity: RecordEntity, id: number, status: string) {
    setBusy(`${entity}-${id}`);
    try {
      const response = await fetch("/api/portal/records", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ entity, id, status }) });
      const result = await readApiJson(response) as { record?: EmployeeRecord | FinanceRecord | LegalRecord | WorkerRecord; error?: string };
      if (!response.ok || !result.record) throw new Error(result.error || "تعذّر تحديث السجل");
      if (entity === "employees") setEmployees((items) => items.map((item) => item.id === id ? result.record as EmployeeRecord : item));
      if (entity === "finance") setFinance((items) => items.map((item) => item.id === id ? result.record as FinanceRecord : item));
      if (entity === "legal") setLegal((items) => items.map((item) => item.id === id ? result.record as LegalRecord : item));
      if (entity === "workforce") setWorkers((items) => items.map((item) => item.id === id ? result.record as WorkerRecord : item));
      notify("تم تحديث حالة السجل.");
    } catch (error) { notify(error instanceof Error ? error.message : "تعذّر تحديث السجل."); }
    finally { setBusy(null); }
  }

  async function updateRequestStatus(id: number, status: RequestStatus) {
    setBusy(`request-${id}`);
    try {
      const current = requests.find((item) => item.id === id);
      const response = await fetch("/api/portal/requests", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, status, version: current?.version }) });
      const data = await readApiJson(response) as { request?: WorkforceRequest };
      if (!response.ok || !data.request) throw new Error();
      setRequests((items) => items.map((item) => item.id === id ? data.request as WorkforceRequest : item));
      notify("تم تحديث حالة الطلب.");
    } catch { notify("تعذّر تحديث حالة الطلب."); } finally { setBusy(null); }
  }

  async function updateUser(email: string, role: PortalRole, department: PortalDepartment, status: "active" | "pending" | "suspended", reason: string) {
    setBusy(`user-${email}`);
    try {
      const response = await fetch("/api/portal/users", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, role, department, status, reason }) });
      const data = await readApiJson(response) as { user?: PortalUser; error?: string };
      if (!response.ok || !data.user) throw new Error(data.error || "تعذّر تحديث صلاحية المستخدم.");
      setUsers((items) => items.map((item) => item.email === email ? data.user as PortalUser : item));
      notify("تم تحديث الصلاحية وإبطال الجلسات السابقة للمستخدم.");
    } catch (error) { notify(error instanceof Error ? error.message : "تعذّر تحديث صلاحيات المستخدم."); } finally { setBusy(null); }
  }

  async function createUser(form: HTMLFormElement) {
    setBusy("create-user");
    try {
      const payload = Object.fromEntries(new FormData(form).entries());
      const response = await fetch("/api/portal/users", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const data = await readApiJson(response) as { user?: PortalUser; error?: string };
      if (!response.ok || !data.user) throw new Error(data.error || "تعذّرت إضافة المستخدم.");
      setUsers((items) => [data.user as PortalUser, ...items]);
      setUserModal(false);
      notify("تم إنشاء المستخدم وتفعيل حسابه وفق الصلاحية المحددة.");
    } catch (error) { notify(error instanceof Error ? error.message : "تعذّرت إضافة المستخدم."); }
    finally { setBusy(null); }
  }

  async function uploadDocument(form: HTMLFormElement) {
    setBusy("upload-document");
    try {
      const response = await fetch("/api/portal/documents", { method: "POST", body: new FormData(form) });
      const result = await readApiJson(response) as { document?: CompanyDocument; error?: string };
      if (!response.ok || !result.document) throw new Error(result.error || "تعذّر رفع المستند");
      setDocuments((items) => [result.document as CompanyDocument, ...items]);
      setDocumentModal(null); notify("تم رفع المستند وحفظه في مركز المستندات.");
    } catch (error) { notify(error instanceof Error ? error.message : "تعذّر رفع المستند."); }
    finally { setBusy(null); }
  }

  async function issueDocument(form: HTMLFormElement) {
    setBusy("issue-document");
    const data = new FormData(form);
    if (data.get("documentType") === "workforce_contract" && data.get("endDate")) data.set("expiryDate", String(data.get("endDate")));
    try {
      const response = await fetch("/api/portal/documents/generate", { method: "POST", body: data });
      const result = await readApiJson(response) as {
        document?: CompanyDocument; contract?: WorkforceContract | null; professions?: ContractProfession[]; assignments?: ContractAssignment[];
        workers?: WorkerRecord[]; financialRecord?: FinanceRecord | null;
        capacity?: Array<{ profession: string; requiredCount: number; selectedCount: number; registeredCount: number; availableCount: number; registeredShortage: number; availableShortage: number; unassignedCount: number }> | null;
        error?: string;
      };
      if (!response.ok || !result.document) throw new Error(result.error || "تعذّر إصدار المستند");
      setDocuments((items) => [result.document as CompanyDocument, ...items]);
      if (result.contract) setContracts((items) => [result.contract as WorkforceContract, ...items]);
      if (result.professions?.length) setContractProfessions((items) => [...result.professions as ContractProfession[], ...items]);
      if (result.assignments?.length) setContractAssignments((items) => [...result.assignments as ContractAssignment[], ...items]);
      if (result.financialRecord) setFinance((items) => [result.financialRecord as FinanceRecord, ...items]);
      if (result.workers?.length) setWorkers((items) => items.map((worker) => result.workers!.find((updated) => updated.id === worker.id) || worker));
      setDocumentModal(null);
      const unassigned = result.capacity?.reduce((total, item) => total + item.unassignedCount, 0) || 0;
      const registeredShortage = result.capacity?.reduce((total, item) => total + item.registeredShortage, 0) || 0;
      const availableShortage = result.capacity?.reduce((total, item) => total + item.availableShortage, 0) || 0;
      if (registeredShortage) notify(`تم إصدار العقد. إجمالي العجز عن العمالة المسجلة ${registeredShortage} عامل، ويمكن استكمال الإسناد لاحقاً.`);
      else if (availableShortage) notify(`تم إصدار العقد رغم وجود عجز تشغيلي مقداره ${availableShortage} عامل، ويمكن استكمال الإسناد لاحقاً.`);
      else if (unassigned) notify(`تم إصدار العقد مع ترك ${unassigned} خانة عمالية دون إسناد لاستكمالها لاحقاً.`);
      else notify("تم إصدار ملف PDF بالختم والتوقيع المعتمدين.");
    } catch (error) { notify(error instanceof Error ? error.message : "تعذّر إصدار المستند."); throw error; }
    finally { setBusy(null); }
  }

  function openIssueDocument(type: string,quoteId?:number) {
    setIssuePreset(type);
    setIssueQuoteId(quoteId||null);
    setDocumentModal("issue");
  }

  async function assignWorkerToContract(contractId: number, contractProfessionId: number, workerId: number) {
    setBusy(`contract-assign-${contractProfessionId}`);
    try {
      const response = await fetch(`/api/portal/contracts/${contractId}/workers`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ contractProfessionId, workerId }),
      });
      const result = await readApiJson(response) as { assignment?: ContractAssignment; worker?: WorkerRecord; error?: string };
      if (!response.ok || !result.assignment || !result.worker) throw new Error(result.error || "تعذّر إسناد العامل");
      setContractAssignments((items) => [result.assignment as ContractAssignment, ...items]);
      setWorkers((items) => items.map((item) => item.id === result.worker!.id ? result.worker as WorkerRecord : item));
      notify("تم إسناد العامل إلى العقد وتحديث الجهة المستفيدة في ملفه.");
    } catch (error) { notify(error instanceof Error ? error.message : "تعذّر إسناد العامل."); }
    finally { setBusy(null); }
  }

  async function releaseWorkerFromContract(contractId: number, assignmentId: number) {
    setBusy(`contract-release-${assignmentId}`);
    try {
      const response = await fetch(`/api/portal/contracts/${contractId}/workers`, {
        method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ assignmentId }),
      });
      const result = await readApiJson(response) as { assignment?: ContractAssignment; worker?: WorkerRecord; error?: string };
      if (!response.ok || !result.assignment || !result.worker) throw new Error(result.error || "تعذّر إنهاء الإسناد");
      setContractAssignments((items) => items.map((item) => item.id === result.assignment!.id ? result.assignment as ContractAssignment : item));
      setWorkers((items) => items.map((item) => item.id === result.worker!.id ? result.worker as WorkerRecord : item));
      notify("تم إنهاء الإسناد وأصبح العامل متاحاً للعقود الأخرى.");
    } catch (error) { notify(error instanceof Error ? error.message : "تعذّر إنهاء الإسناد."); }
    finally { setBusy(null); }
  }

  async function updateContractStatus(contractId: number, status: string, reason: string) {
    setBusy(`contract-status-${contractId}`);
    try {
      const response = await fetch(`/api/portal/contracts/${contractId}/status`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status, reason }) });
      const result = await readApiJson(response) as { contract?: WorkforceContract; error?: string };
      if (!response.ok || !result.contract) throw new Error(result.error || "تعذّر تحديث حالة العقد");
      setContracts((items) => items.map((item) => item.id === contractId ? result.contract as WorkforceContract : item));
      router.refresh();
      notify("تم تحديث حالة العقد وتسجيل القرار في سجل التدقيق.");
    } catch (error) { notify(error instanceof Error ? error.message : "تعذّر تحديث حالة العقد."); }
    finally { setBusy(null); }
  }

  async function editContract(contract: WorkforceContract) {
    const clientName = window.prompt("اسم العميل أو الجهة", contract.clientName); if (clientName === null) return;
    const title = window.prompt("عنوان العقد", contract.title); if (title === null) return;
    const workSite = window.prompt("موقع العمل", contract.workSite); if (workSite === null) return;
    const startDate = window.prompt("تاريخ بداية العقد (YYYY-MM-DD)", contract.startDate); if (startDate === null) return;
    const endDate = contract.seasonType === "regular" ? null : window.prompt("تاريخ نهاية العقد (YYYY-MM-DD)", contract.endDate); if (contract.seasonType !== "regular" && endDate === null) return;
    setBusy(`contract-edit-${contract.id}`);
    try {
      const response = await fetch(`/api/portal/contracts/${contract.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ clientName, title, workSite, startDate, ...(endDate ? { endDate } : {}) }) });
      const result = await readApiJson(response) as { contract?: WorkforceContract; error?: string };
      if (!response.ok || !result.contract) throw new Error(result.error || "تعذّر تعديل العقد");
      setContracts(items => items.map(item => item.id === contract.id ? result.contract as WorkforceContract : item));
      notify("تم تعديل العقد وإعادته للمسودة؛ يلزم اعتماد المالك مجددًا.");
    } catch (error) { notify(error instanceof Error ? error.message : "تعذّر تعديل العقد."); }
    finally { setBusy(null); }
  }

  async function deleteContract(contract: WorkforceContract) {
    if (!window.confirm(`حذف مسودة العقد ${contract.referenceCode} وجميع بياناتها غير المحاسبية؟`)) return;
    setBusy(`contract-delete-${contract.id}`);
    try {
      const response = await fetch(`/api/portal/contracts/${contract.id}`, { method: "DELETE" });
      const result = await readApiJson(response) as { deleted?: boolean; error?: string };
      if (!response.ok || !result.deleted) throw new Error(result.error || "تعذّر حذف العقد");
      setContracts(items => items.filter(item => item.id !== contract.id));
      setContractProfessions(items => items.filter(item => item.contractId !== contract.id));
      setContractAssignments(items => items.filter(item => item.contractId !== contract.id));
      setDocuments(items => items.filter(item => item.id !== contract.documentId));
      setSelectedContractId(null);
      notify("تم حذف مسودة العقد وتحديث مركز المستندات وسجل العمليات.");
    } catch (error) { notify(error instanceof Error ? error.message : "تعذّر حذف العقد."); }
    finally { setBusy(null); }
  }

  async function uploadAsset(slot: "stamp" | "signature", form: HTMLFormElement) {
    const input = form.elements.namedItem("file");
    const file = input instanceof HTMLInputElement ? input.files?.[0] : undefined;
    if (!file) { notify("اختر صورة الختم أو التوقيع أولاً."); return; }
    if (!(["image/png", "image/jpeg"].includes(file.type)) || file.size > 5 * 1024 * 1024) { notify("استخدم صورة PNG أو JPG لا تتجاوز 5 ميجابايت."); return; }
    setBusy(`asset-${slot}`);
    const data = new FormData(form); data.set("slot", slot);
    try {
      const response = await fetch("/api/portal/company-assets", { method: "POST", body: data });
      const result = await readApiJson(response) as { asset?: CompanyAsset; error?: string };
      if (!response.ok || !result.asset) throw new Error(result.error || "تعذّر حفظ الملف");
      setAssets((items) => [result.asset as CompanyAsset, ...items.filter((item) => item.slot !== slot)]);
      form.reset(); notify(slot === "stamp" ? "تم اعتماد ختم الشركة." : "تم اعتماد توقيع الشركة.");
    } catch (error) { notify(error instanceof Error ? error.message : "تعذّر حفظ الملف."); }
    finally { setBusy(null); }
  }

  async function shareDocument(id: number) {
    setBusy(`share-${id}`);
    try {
      const response = await fetch("/api/portal/documents/share", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ documentId: id }) });
      const result = await readApiJson(response) as { shareUrl?: string; error?: string };
      if (!response.ok || !result.shareUrl) throw new Error(result.error || "تعذّر إنشاء الرابط");
      try { await navigator.clipboard.writeText(result.shareUrl); notify("تم نسخ رابط مشاركة صالح لمدة 7 أيام."); }
      catch { window.prompt("انسخ رابط المشاركة — صالح لمدة 7 أيام", result.shareUrl); }
    } catch (error) { notify(error instanceof Error ? error.message : "تعذّر إنشاء رابط المشاركة."); }
    finally { setBusy(null); }
  }

  const viewTitle: Record<View, string> = { overview: "لوحة المتابعة", notifications: "مركز الإشعارات", tasks: "المهام والتذكيرات", employees: "إدارة الموظفين", finance: "الإدارة المالية", legal: "الشؤون القانونية", government: "العلاقات الحكومية والامتثال", workforce: "شؤون العمالة", operations: "المبيعات والتشغيل", representatives: "إدارة المناديب", construction: "المقاولات والمشروعات", conversations: "المحادثات المباشرة", "contractual-documents": "العقود والعروض والخطابات", documents: "مستندات الشركة", brand: "الهوية البصرية", website: "إدارة الموقع الإلكتروني", users: "المستخدمون والصلاحيات" };
  const visibleRequests = requests.filter((item) => {
    const matchesStatus = requestFilter === "all" || safeRequestStatus(item.status) === requestFilter;
    const haystack = `${item.fullName} ${item.mobile} ${item.email} ${item.trackingCode} ${item.specialization}`.toLowerCase();
    return matchesStatus && (!query.trim() || haystack.includes(query.trim().toLowerCase()));
  });

  return <main className="admin-shell">
    <LocaleRuntime initialLocale={currentUser.preferredLanguage} portal websiteTranslations={currentUser.preferredLanguage === "ar" ? {} : initialWebsiteContent.translations[currentUser.preferredLanguage]}/>
    <aside className={`admin-sidebar ${menuOpen ? "sidebar-open" : ""}`}>
      <div className="sidebar-brand"><Image src="/dally-logo.jpg" alt="شعار شركة دالي" width={545} height={280} sizes="160px"/><span>النظام الإداري</span></div>
      <nav aria-label="أقسام النظام">
        <button className={view === "overview" ? "active" : ""} onClick={() => changeView("overview")}><Icon name="home" /><span>نظرة عامة</span></button>
        <button className={view === "notifications" ? "active" : ""} onClick={() => changeView("notifications")}><Icon name="bell" /><span>مركز الإشعارات</span>{unreadNotifications > 0 && <b>{unreadNotifications > 99 ? "99+" : unreadNotifications}</b>}</button>
        <button className={view === "tasks" ? "active" : ""} onClick={() => changeView("tasks")}><Icon name="check" /><span>المهام والتذكيرات</span></button>
        {canAccess("workforce") && <button className={view === "conversations" ? "active" : ""} onClick={() => changeView("conversations")}><Icon name="conversations"/><span>المحادثات المباشرة</span>{(unreadConversationMessages > 0 || waitingConversations > 0) && <b>{Math.min(99, unreadConversationMessages || waitingConversations)}</b>}</button>}
        {canAccess("employees") && <button className={view === "employees" ? "active" : ""} onClick={() => changeView("employees")}><Icon name="employees" /><span>إدارة الموظفين</span><small>{employees.length}</small></button>}
        {canAccess("finance") && <button className={view === "finance" ? "active" : ""} onClick={() => changeView("finance")}><Icon name="finance" /><span>الإدارة المالية</span></button>}
        {canAccess("legal") && <button className={view === "legal" ? "active" : ""} onClick={() => changeView("legal")}><Icon name="legal" /><span>الشؤون القانونية</span>{legalAlerts > 0 && <b>{legalAlerts}</b>}</button>}
        {canAccessGovernment && <button className={view === "government" ? "active" : ""} onClick={() => changeView("government")}><Icon name="website" /><span>العلاقات الحكومية</span></button>}
        {canAccess("workforce") && <button className={view === "workforce" ? "active" : ""} onClick={() => changeView("workforce")}><Icon name="workforce" /><span>شؤون العمالة</span>{(requestCounts.new + workerAlerts + incompleteWorkerFiles) > 0 && <b>{requestCounts.new + workerAlerts + incompleteWorkerFiles}</b>}</button>}
        {canAccessOperations && <button className={view === "operations" ? "active" : ""} onClick={() => changeView("operations")}><Icon name="finance" /><span>المبيعات والتشغيل</span></button>}
        {canAccessOperations && <button className={view === "representatives" ? "active" : ""} onClick={() => changeView("representatives")}><Icon name="users"/><span>إدارة المناديب</span></button>}
        {canAccessConstruction && <button className={view === "construction" ? "active" : ""} onClick={() => changeView("construction")}><Icon name="legal" /><span>المقاولات والمشروعات</span></button>}
        {canAccessContracts && <button className={view === "contractual-documents" ? "active" : ""} onClick={() => changeView("contractual-documents")}><Icon name="documents" /><span>العقود والعروض والخطابات</span></button>}
        {canAccessDocuments && <button className={view === "documents" ? "active" : ""} onClick={() => changeView("documents")}><Icon name="documents" /><span>مستندات الشركة</span>{documentAlerts > 0 && <b>{documentAlerts}</b>}</button>}
        {canAccessDocuments && <button className={view === "brand" ? "active" : ""} onClick={() => changeView("brand")}><Icon name="brand" /><span>الهوية البصرية</span></button>}
        {canAccessWebsite && <button className={view === "website" ? "active" : ""} onClick={() => changeView("website")}><Icon name="website"/><span>إدارة الموقع</span></button>}
        {(currentUser.role === "admin" || functionalAdmin) && <button className={view === "users" ? "active" : ""} onClick={() => changeView("users")}><Icon name="users" /><span>المستخدمون والصلاحيات</span>{users.some((item) => item.status === "pending") && <i />}</button>}
      </nav>
      <div className="sidebar-foot"><div className="security-note"><span>✓</span><p><strong>اتصال محمي</strong>تُطبّق الصلاحيات من جهة الخادم.</p></div><a href={signOutPath}>تسجيل الخروج</a></div>
    </aside>
    {menuOpen && <button className="sidebar-backdrop" aria-label="إغلاق القائمة" onClick={() => setMenuOpen(false)} />}

    <section className="admin-workspace">
      <header className="admin-topbar">
        <button className="mobile-menu" aria-label="فتح القائمة" onClick={() => setMenuOpen(true)}><Icon name="menu" /></button>
        <div className="topbar-title"><span>شركة دالي للتشغيل والصيانة</span><strong>{viewTitle[view]}</strong></div>
        <GlobalPortalSearch
          value={globalQuery}
          setValue={setGlobalQuery}
          onSelect={(result) => {
            setGlobalQuery("");
            changeView(result.view);
            if (result.kind === "request") setSelectedId(result.id);
            if (result.kind === "worker") setSelectedWorkerId(result.id);
            if (result.kind === "contract") setSelectedContractId(result.id);
            if (result.kind === "conversation") void openConversation(result.stringId || "");
            const operationsKinds: Record<string, OperationsTab> = { client: "crm", opportunity: "crm", quote: "quotes", "work-order": "orders", timesheet: "timesheets", "capacity-plan": "capacity", "privacy-request": "privacy" };
            if (operationsKinds[result.kind]) { setOperationsTab(operationsKinds[result.kind]); setOperationsQuery(result.searchValue); }
            else if (!["request", "worker", "contract", "conversation"].includes(result.kind)) setQuery(result.searchValue);
          }}
        />
        <div className="topbar-actions">
          <div className="notification-shell" ref={notificationShellRef}>
            <button className="notification" aria-label="فتح مركز الإشعارات" aria-expanded={notificationsOpen} onClick={() => setNotificationsOpen((open) => !open)}><Icon name="bell" />{unreadNotifications > 0 && <b>{unreadNotifications > 99 ? "99+" : unreadNotifications}</b>}</button>
            {notificationsOpen && (
              <NotificationPopover notifications={notifications} onOpen={openNotification} onReadAll={() => void updateNotificationState("read-all")} onViewAll={() => { setNotificationsOpen(false); changeView("notifications"); }}/>
            )}
          </div>
          <div className="user-menu"><span>{initials(currentUser.displayName)}</span><p><strong>{currentUser.displayName}</strong><small>{activeRoleLabel} · {departmentLabels[currentUser.department]}</small></p></div>
        </div>
      </header>
      {notice && <div className="portal-notice" role="status">{notice}<button onClick={() => setNotice("")} aria-label="إغلاق"><Icon name="close" /></button></div>}
      <GlobalTaskReminder/>

      <div className="admin-content">
        {view === "overview" && <>
          <div className="content-heading"><div><p className="admin-eyebrow">مركز العمليات</p><h1>مرحباً، {currentUser.displayName.split(" ")[0]}</h1><span>{currentUser.functionalRoles.length ? `مساحة عمل مهيأة لصلاحيات: ${activeRoleLabel}.` : currentUser.role === "employee" ? `مساحة عملك في قسم ${departmentLabels[currentUser.department]}.` : "متابعة موحّدة لأعمال الشركة من لوحة واحدة."}</span></div><time>{new Intl.DateTimeFormat("ar-SA", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date())}</time></div>
          <section className="metric-grid module-metrics">
            {canAccess("employees") && <button onClick={() => changeView("employees")}><span className="metric-icon red"><Icon name="employees" /></span><p>الموظفون<strong>{employees.length}</strong></p><small>{employees.filter((item) => item.status === "active").length} على رأس العمل</small></button>}
            {canAccess("finance") && <button onClick={() => changeView("finance")}><span className="metric-icon navy"><Icon name="finance" /></span><p>السجلات المالية<strong>{finance.length}</strong></p><small>{formatMoney(financialTotal)} إجمالي مسجّل</small></button>}
            {canAccess("legal") && <button onClick={() => changeView("legal")}><span className="metric-icon sand"><Icon name="legal" /></span><p>الملفات القانونية<strong>{legal.length}</strong></p><small>{legalAlerts} تنبيه خلال 45 يوماً</small></button>}
            {canAccess("workforce") && <button onClick={() => changeView("workforce")}><span className="metric-icon green"><Icon name="workforce" /></span><p>العمالة<strong>{workers.length}</strong></p><small>{workers.filter((item) => item.status === "available").length} متاح · {activeBeneficiaries} جهة مستفيدة</small></button>}
            {canAccess("workforce") && <button onClick={() => changeView("conversations")}><span className="metric-icon red"><Icon name="conversations"/></span><p>المحادثات<strong>{conversations.length}</strong></p><small>{waitingConversations} تنتظر الرد · {unreadConversationMessages} رسالة غير مقروءة</small></button>}
            {canAccessDocuments && <button onClick={() => changeView("documents")}><span className="metric-icon navy"><Icon name="documents" /></span><p>مستندات الشركة<strong>{documents.length}</strong></p><small>{documentAlerts} تنبيه انتهاء خلال 30 يوماً أو مستند منتهٍ</small></button>}
            <button onClick={() => changeView("tasks")}><span className="metric-icon green"><Icon name="check" /></span><p>المهام<strong>✓</strong></p><small>مهامك وتذكيراتك في مكان واحد</small></button>
            {canAccess("legal") && <button className={employeeComplianceAlerts?"metric-attention":""} onClick={() => changeView("government")}><span className="metric-icon sand"><Icon name="website" /></span><p>العلاقات الحكومية<strong>{employeeComplianceAlerts}</strong></p><small>{employeeComplianceAlerts?"استحقاقات موظفين خلال أقل من 29 يومًا":"لا توجد استحقاقات موظفين عاجلة"}</small></button>}
          </section>
          {(currentUser.role === "admin" || functionalAdmin) && (
            <ExecutivePeopleCommandCenter isOwner={isSystemOwner || (currentUser.role === "admin" && !isSystemAdmin)} isSystemAdmin={isSystemAdmin}/>
          )}
          {currentUser.role === "employee" && currentUser.department === "general" && currentUser.functionalRoles.length === 0 ? <section className="employee-home"><p className="admin-eyebrow">الحساب مفعّل</p><h1>لم يُحدَّد قسمك بعد</h1><p>يرجى التواصل مع مدير النظام لإسناد حسابك إلى أحد الأقسام التشغيلية الأربعة.</p><div className="employee-account"><span>البريد الوظيفي</span><strong>{currentUser.email}</strong><span>الصلاحية الحالية</span><strong>{roleLabels[currentUser.role]}</strong></div></section> :
          <section className="overview-grid">
            <article className="panel operations-panel"><div className="panel-head"><div><h2>الأقسام التشغيلية</h2><p>الوحدات المتاحة وفقاً لصلاحية حسابك</p></div></div><div className="department-grid">
              {canAccess("employees") && <DepartmentCard icon="employees" title="إدارة الموظفين" text="ملفات الموظفين وحالتهم الوظيفية وبيانات التعيين." count={`${employees.length} موظف`} onClick={() => changeView("employees")} />}
              {canAccess("finance") && <DepartmentCard icon="finance" title="الإدارة المالية" text="الفواتير والمصروفات والرواتب والعُهد المالية." count={`${finance.length} سجل`} onClick={() => changeView("finance")} />}
              {canAccess("legal") && <DepartmentCard icon="legal" title="الشؤون القانونية" text="العقود والقضايا والتراخيص ومواعيد التجديد." count={`${legalAlerts} تنبيه`} onClick={() => changeView("legal")} />}
              {canAccess("workforce") && <DepartmentCard icon="workforce" title="شؤون العمالة" text="بيانات العمال والتوزيع على المواقع وطلبات العملاء." count={`${requestCounts.total} طلب`} onClick={() => changeView("workforce")} />}
              {canAccess("workforce") && <DepartmentCard icon="finance" title="المبيعات والتشغيل" text="العملاء والفرص والعروض وأوامر التشغيل والدوام والسعة." count="دورة مترابطة" onClick={() => changeView("operations")} />}
              {canAccessConstruction && <DepartmentCard icon="legal" title="المقاولات والمشروعات" text="الفرص والمناقصات والمشروعات ومراكز التكلفة والتغطية التشغيلية." count="قطاع أعمال مستقل" onClick={() => changeView("construction")} />}
              {canAccess("workforce") && <DepartmentCard icon="conversations" title="المحادثات المباشرة" text="الرد الفوري على زوار الموقع ومتابعة الرسائل غير المقروءة." count={`${waitingConversations} تنتظر الرد`} onClick={() => changeView("conversations")} />}
              {canAccessDocuments && <DepartmentCard icon="documents" title="مركز المستندات" text="المرفقات والعقود والإصدارات الرسمية والتنبيهات." count={`${documents.length} مستند`} onClick={() => changeView("documents")} />}
              {canAccessDocuments && <DepartmentCard icon="documents" title="العقود والعروض والخطابات" text="دورات التحرير والاعتماد والإلغاء للمحررات الرسمية." count="مركز مستقل" onClick={() => changeView("contractual-documents")} />}
              {canAccess("legal") && <DepartmentCard icon="website" title="العلاقات الحكومية والامتثال" text="الإقامات والتراخيص والمنصات الحكومية وطلبات سدادها." count="خزنة مشفّرة" onClick={() => changeView("government")} />}
              {canAccessWebsite && <DepartmentCard icon="website" title="إدارة الموقع الإلكتروني" text="الأقسام والمحتوى والنشر وإعدادات الظهور في محركات البحث." count={`الإصدار ${initialWebsiteContent.version}`} onClick={() => changeView("website")} />}
            </div></article>
            {currentUser.role !== "employee" && <article className="panel activity-panel"><div className="panel-head"><div><h2>سجل النشاط</h2><p>آخر التحديثات الإدارية</p></div></div><div className="activity-list">{initialActivity.length === 0 ? <div className="empty-small">لا يوجد نشاط مسجّل بعد.</div> : initialActivity.map((item) => <div key={item.id}><span>✓</span><p><strong>{activityLabel(item.action)}</strong><small>{item.actorEmail}</small></p><time>{formatDate(item.createdAt, true)}</time></div>)}</div></article>}
          </section>}
        </>}

        {view === "notifications" && <NotificationCenterView
          notifications={notifications}
          onOpen={openNotification}
          onRead={(id) => void updateNotificationState("read", [id])}
          onDismiss={(id) => void updateNotificationState("dismiss", [id])}
          onReadAll={() => void updateNotificationState("read-all")}
          onRefresh={() => void refreshNotifications()}
        />}

        {view === "tasks" && <TaskCenter/>}
        {view === "government" && canAccess("legal") && <GovernmentAffairsWorkspace/>}

        {view === "conversations" && canAccess("workforce") && <ConversationCenter
          conversations={conversations}
          messages={conversationMessages}
          businessHours={businessHours}
          automation={chatAutomation}
          query={query}
          setQuery={setQuery}
          canManageSettings={canManageChatSettings}
          onSelect={(id) => void openConversation(id)}
          onRefresh={() => void refreshConversations()}
          onOpenSettings={() => setChatSettingsOpen(true)}
        />}
        {view === "conversations" && canAccess("workforce") && <ServiceRatingsPanel/>}

        {view === "employees" && canAccess("employees") && <ModuleSection eyebrow="الموارد البشرية" title="إدارة الموظفين" description="ملفات الموظفين وحالتهم الوظيفية وبيانات الالتحاق." actionLabel="إضافة موظف" canWrite={canWrite} onAdd={() => setModal("employees")}>
          <section className="metric-grid compact-metrics"><Metric label="إجمالي الموظفين" value={employees.length} note="جميع الملفات المسجّلة"/><Metric label="على رأس العمل" value={employees.filter((item) => item.status === "active").length} note="حسابات نشطة"/><Metric label="في إجازة" value={employees.filter((item) => item.status === "leave").length} note="إجازات حالية"/><Metric label="ملفات موقوفة" value={employees.filter((item) => ["suspended", "ended"].includes(item.status)).length} note="تحتاج إلى متابعة"/></section>
          <ManagementPanel query={query} setQuery={setQuery} placeholder="ابحث باسم الموظف أو الرقم أو المسمى"><EmployeeTable records={employees} query={query} canWrite={canWrite} busy={busy} onStatus={(id, status) => updateRecordStatus("employees", id, status)} onUpdate={updateEmployeeCompliance} onDelete={deleteEmployee}/></ManagementPanel>
          <HrWorkspace canWrite={canWrite} isAdmin={currentUser.role === "admin" || functionalAdmin}/>
        </ModuleSection>}

        {view === "finance" && canAccess("finance") && <ModuleSection eyebrow="مالية القوى العاملة" title="الإدارة المالية" description="رواتب العمالة والسلف والخصميات والمصروفات والفواتير والسندات المرتبطة بالعامل والعقد." actionLabel="إضافة حركة مالية" canWrite={canWrite} onAdd={() => setModal("finance")}>
          <section className="metric-grid compact-metrics finance-metrics"><Metric label="رواتب العمالة" value={formatMoney(payrollTotal)} note="إجمالي الرواتب المسجّلة"/><Metric label="السلف" value={formatMoney(advancesTotal)} note="سلف العمالة"/><Metric label="الخصميات" value={formatMoney(deductionsTotal)} note="خصميات مسجّلة"/><Metric label="مصروفات العمالة" value={formatMoney(workforceExpensesTotal)} note="سكن ونقل وإقامات وغيرها"/><Metric label="فواتير ومستخلصات" value={formatMoney(workforceInvoicesTotal)} note="مرتبطة بعقود العمالة"/><Metric label="إجمالي الحركات" value={formatMoney(financialTotal)} note={`${finance.length} حركة مالية`}/></section>
          <PaymentManagementDashboard/>
          {canWrite && <FinanceDocumentActions onIssue={openIssueDocument}/>}
          <ManagementPanel query={query} setQuery={setQuery} placeholder="ابحث بالمرجع أو العامل أو العقد أو البيان"><FinanceTable records={finance} workers={workers} contracts={contracts} query={query} canWrite={canWrite} busy={busy} onStatus={(id, status) => updateRecordStatus("finance", id, status)} /></ManagementPanel>
          <AccountingWorkspace canWrite={canWrite} isAdmin={currentUser.role === "admin" || functionalAdmin}/>
          <FinancialPostingWorkspace canWrite={canWrite}/>
          <PurchasingWorkspace canWrite={canWrite}/>
          <ReportsWorkspace canWrite={canWrite} contracts={contracts}/>
          <ReportPdfDownload/>
          <BankReconciliationWorkspace canWrite={canWrite}/>
        </ModuleSection>}

        {view === "legal" && canAccess("legal") && <ModuleSection eyebrow="العقود والامتثال" title="الشؤون القانونية" description="متابعة العقود والقضايا والتراخيص والتنبيهات النظامية." actionLabel="إضافة ملف قانوني" canWrite={canWrite} onAdd={() => setModal("legal")}>
          <section className="metric-grid compact-metrics"><Metric label="إجمالي الملفات" value={legal.length} note="كل السجلات"/><Metric label="عقود سارية" value={legal.filter((item) => item.category === "contract" && item.status === "active").length} note="عقود فعّالة"/><Metric label="قيد المراجعة" value={legal.filter((item) => item.status === "reviewing").length} note="ملفات مفتوحة"/><Metric label="تنبيهات التجديد" value={legalAlerts} note="خلال 45 يوماً"/></section>
          <ManagementPanel query={query} setQuery={setQuery} placeholder="ابحث بالعنوان أو الطرف أو المرجع"><LegalTable records={legal} query={query} canWrite={canWrite} busy={busy} onStatus={(id, status) => updateRecordStatus("legal", id, status)} /></ManagementPanel>
          <LegalCaseWorkspace/>
          <ComplianceWorkspace canWrite={canWrite}/>
        </ModuleSection>}

        {view === "workforce" && canAccess("workforce") && <ModuleSection eyebrow="التشغيل الميداني" title="شؤون العمالة" description="إدارة ملفات العمال وتوزيعهم على المواقع ومتابعة طلبات العملاء." actionLabel="إضافة عامل" canWrite={canWrite} onAdd={() => setModal("workforce")}>
          <section className="metric-grid compact-metrics workforce-metrics"><Metric label="إجمالي العمالة" value={workers.length} note="كل الملفات المسجّلة"/><Metric label="مرتبطون بجهات" value={workers.filter((item) => item.status === "assigned").length} note={`${activeBeneficiaries} جهة مستفيدة حالياً`}/><Metric label="متاحون للعقود" value={workers.filter((item) => item.status === "available").length} note="جاهزون للإسناد"/><Metric label="ملفات تحتاج استكمالاً" value={incompleteWorkerFiles} note={`${workerAlerts} تنبيه إقامة`}/></section>
          <WorkforceOperations workers={workers} attachments={workerAttachments}/>
          <ContractOperations contracts={contracts} professions={contractProfessions} assignments={contractAssignments} onSelect={setSelectedContractId}/>
          <ManagementPanel query={query} setQuery={setQuery} placeholder="ابحث بالاسم أو رقم الإقامة أو المهنة أو الجهة"><WorkerTable records={workers} attachments={workerAttachments} query={query} onSelect={setSelectedWorkerId}/></ManagementPanel>
          <section className="panel request-panel workforce-requests"><div className="panel-head"><div><h2>طلبات القوى العاملة من الموقع</h2><p>الطلبات الواردة مباشرة من العملاء</p></div><span className="panel-count">{requestCounts.new} جديد</span></div><div className="table-tools"><label className="search-box"><Icon name="search"/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث بالاسم أو رقم الطلب" /></label><div className="filter-tabs" role="group" aria-label="تصفية الطلبات">{(["all", "new", "reviewing", "contacted", "closed"] as const).map((value) => <button key={value} className={requestFilter === value ? "active" : ""} onClick={() => setRequestFilter(value)}>{value === "all" ? "الكل" : requestStatuses[value].label}</button>)}</div></div><RequestTable requests={visibleRequests} onSelect={setSelectedId}/></section>
        </ModuleSection>}

        {view === "operations" && canAccess("workforce") && <OperationsWorkspace key={`${operationsTab}:${operationsQuery}`} initialTab={operationsTab} initialQuery={operationsQuery} allowedTabs={["crm","orders","timesheets","capacity","privacy",...((currentUser.role === "admin" || functionalAdmin) ? ["clients","integrations"] as OperationsTab[] : [])]} canWrite={canWrite} isAdmin={currentUser.role === "admin" || functionalAdmin} isOwner={currentUser.functionalRoles.some((role) => role === "system_owner" || role === "system_admin")} onCreateContract={(quoteId) => openIssueDocument("workforce_contract",quoteId)}/>}
        {view === "representatives" && canAccess("workforce") && <SalesRepresentativesWorkspace canWrite={canWrite}/>}
        {view === "construction" && canAccessConstruction && <ConstructionWorkspace/>}

        {view === "contractual-documents" && canAccessDocuments && <><ContractualDocumentsWorkspace documents={documents} contracts={contracts} canManage={canManageDocuments} canWrite={canWrite} isAdmin={currentUser.role === "admin" || functionalAdmin} isOwner={currentUser.functionalRoles.some((role) => role === "system_owner" || role === "system_admin")} onCreateContract={(quoteId) => openIssueDocument("workforce_contract",quoteId)}/><LetterPdfLibrary/></>}

        {view === "documents" && canAccessDocuments && <DocumentCenter
          documents={documents.filter((item) => !["quotation","workforce_contract","contract","letter"].includes(item.documentType || ""))}
          contracts={contracts}
          assets={assets}
          query={query}
          setQuery={setQuery}
          canManageDocuments={canManageDocuments}
          canManageAssets={canManageAssets}
          busy={busy}
          expiringDocuments={expiringDocuments}
          expiredDocuments={expiredDocuments}
          onUpload={() => setDocumentModal("upload")}
          onIssue={() => openIssueDocument("workforce_contract")}
          onIssueQuotation={() => openIssueDocument("quotation")}
          onOpenQuoteApprovals={() => { setOperationsTab("quotes"); changeView("operations"); }}
          canApprove={currentUser.functionalRoles.some((role) => role === "system_owner" || role === "system_admin")}
          onApproveContract={(contractId) => updateContractStatus(contractId, "approved", "اعتماد مباشر من مركز المستندات")}
          onShare={shareDocument}
          onUploadAsset={uploadAsset}
        />}

        {view === "brand" && canAccessDocuments && <BrandIdentityManager/>}
        {view === "website" && canAccessWebsite && <WebsiteManager initialContent={initialWebsiteContent} canManage={canManageWebsite}/>}

        {view === "users" && (currentUser.role === "admin" || functionalAdmin) && <ModuleSection eyebrow="التحكم في الوصول" title="المستخدمون والصلاحيات" description="اعتماد مسبب، وأقل صلاحية لازمة، وإبطال تلقائي للجلسات عند كل تغيير أمني." actionLabel="إضافة مستخدم" canWrite onAdd={() => setUserModal(true)}>
          <section className="panel users-panel"><div className="panel-head"><div><h2>حسابات النظام</h2><p>{users.filter((item) => item.status === "pending").length} حساب بانتظار الاعتماد · لا توجد كلمات مرور محفوظة في النظام</p></div></div><div className="user-list">{users.map((item) => <UserAccessCard key={`${item.email}:${item.updatedAt}`} user={item} self={item.email === currentUser.email} busy={busy === `user-${item.email}`} onSave={updateUser}/>)}</div></section>
          <RoleDefinitionManager/>
          <AccessScopeManager currentEmail={currentUser.email}/>
        </ModuleSection>}
      </div>
    </section>

    {modal && modal !== "workforce" && modal !== "finance" && <RecordModal entity={modal} users={initialUsers} busy={busy === `create-${modal}`} onClose={() => setModal(null)} onSubmit={modal === "employees" ? (_entity, form) => createEmployee(form) : createRecord}/>}
    {modal === "finance" && <FinanceRecordModal busy={busy === "create-finance"} workers={workers} contracts={contracts} onClose={() => setModal(null)} onSubmit={(form) => createRecord("finance", form)}/>}
    {modal === "workforce" && <WorkerModal busy={busy === "create-workforce"} onClose={() => setModal(null)} onSubmit={createWorker}/>}
    {documentModal === "upload" && <UploadDocumentModal busy={busy === "upload-document"} onClose={() => setDocumentModal(null)} onSubmit={uploadDocument}/>}
    {documentModal === "issue" && issuePreset === "quotation" && <QuotationIssueModal onClose={() => setDocumentModal(null)} onCreated={(message) => { notify(message); setOperationsTab("quotes"); changeView("operations"); }}/>}
    {documentModal === "issue" && issuePreset !== "quotation" && <IssueDocumentModal initialType={issuePreset} initialQuoteId={issueQuoteId} busy={busy === "issue-document"} assetsReady={assets.some((item) => item.slot === "stamp") && assets.some((item) => item.slot === "signature")} workers={workers} contracts={contracts} requests={requests} onClose={() => setDocumentModal(null)} onSubmit={issueDocument}/>}
    {userModal && <CreateUserModal busy={busy === "create-user"} onClose={() => setUserModal(false)} onSubmit={createUser}/>}
    {chatSettingsOpen && <ChatSettingsModal businessHours={businessHours} automation={chatAutomation} busy={busy === "chat-settings"} onClose={() => setChatSettingsOpen(false)} onSubmit={saveBusinessHours}/>}
    {selectedConversation && <ConversationDrawer conversation={selectedConversation} messages={conversationMessages.filter((item) => item.conversationId === selectedConversation.id)} businessHours={businessHours} busy={busy} onClose={() => setSelectedConversationId(null)} onReply={sendConversationReply} onStatus={updateConversationStatus}/>}
    {selected && <RequestDrawer request={selected} replies={requestReplies.filter((item) => item.requestId === selected.id)} emailConfigured={emailConfigured} canWrite={canWrite} statusBusy={busy === `request-${selected.id}`} replyBusy={busy === `reply-${selected.id}`} onClose={() => setSelectedId(null)} onStatus={updateRequestStatus} onReply={sendRequestReply}/>}
    {selectedWorker && <WorkerDrawer key={`${selectedWorker.id}-${selectedWorker.updatedAt}`} worker={selectedWorker} attachments={workerAttachments.filter((item) => item.workerId === selectedWorker.id)} contracts={contracts} contractAssignments={contractAssignments} canWrite={canWrite} busy={busy} onClose={() => setSelectedWorkerId(null)} onUploadAttachment={uploadWorkerAttachment}/>}
    {selectedContract && (
      <ContractDrawer contract={selectedContract} professions={contractProfessions.filter((item) => item.contractId === selectedContract.id)} assignments={contractAssignments.filter((item) => item.contractId === selectedContract.id)} workers={workers} canWrite={canWrite} isAdmin={currentUser.role === "admin" || functionalAdmin} isOwner={currentUser.functionalRoles.some((role) => role === "system_owner" || role === "system_admin")} busy={busy} onClose={() => setSelectedContractId(null)} onAssign={assignWorkerToContract} onRelease={releaseWorkerFromContract} onStatus={updateContractStatus} onEdit={editContract} onDelete={deleteContract}/>
    )}
    <VideoInterviewDesk/>
  </main>;
}

function UserAccessCard({ user, self, busy, onSave }: {
  user: PortalUser;
  self: boolean;
  busy: boolean;
  onSave: (email: string, role: PortalRole, department: PortalDepartment, status: "active" | "pending" | "suspended", reason: string) => Promise<void>;
}) {
  const [role, setRole] = useState<PortalRole>(user.role as PortalRole);
  const [department, setDepartment] = useState<PortalDepartment>(user.department as PortalDepartment);
  const [status, setStatus] = useState<"active" | "pending" | "suspended">(user.status as "active" | "pending" | "suspended");
  const [reason, setReason] = useState("");
  const requestComplete = Boolean(user.requestSubmittedAt && user.termsAcceptedAt);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void onSave(user.email, role, department, status, reason).then(() => setReason(""));
  }
  return <article className={`user-access-card ${user.status}`}>
    <form onSubmit={submit}>
      <div className="user-access-identity"><span className="user-avatar">{initials(user.displayName)}</span><div className="user-identity"><strong>{user.displayName}</strong><small>{user.email}</small><time>آخر دخول: {user.lastLoginAt ? formatDate(user.lastLoginAt, true) : "لم يسجّل الدخول"}</time></div><span className={`access-request-state ${requestComplete ? "complete" : "incomplete"}`}>{requestComplete ? "طلب مكتمل" : "بيانات ناقصة"}</span></div>
      {user.requestSubmittedAt && <div className="user-request-context"><div><span>المسمى</span><strong>{user.requestedJobTitle || "غير محدد"}</strong></div><div><span>القسم المطلوب</span><strong>{departmentLabels[(user.requestedDepartment || "general") as PortalDepartment] || user.requestedDepartment}</strong></div><p>{user.requestReason}</p><time>أُرسل {formatDate(user.requestSubmittedAt, true)}</time></div>}
      <div className="user-access-controls">
        <label>الدور<select value={role} disabled={self || busy} onChange={(event) => setRole(event.target.value as PortalRole)}><option value="admin">مدير النظام</option><option value="manager">الإدارة</option><option value="employee">موظف</option></select></label>
        <label>القسم<select value={department} disabled={self || busy} onChange={(event) => setDepartment(event.target.value as PortalDepartment)}><option value="general">صلاحية عامة</option><option value="employees">إدارة الموظفين</option><option value="finance">الإدارة المالية</option><option value="legal">الشؤون القانونية</option><option value="workforce">شؤون العمالة</option><option value="construction">المقاولات والمشروعات</option></select></label>
        <label>الحالة<select value={status} disabled={self || busy} onChange={(event) => setStatus(event.target.value as "active" | "pending" | "suspended")}><option value="active" disabled={!requestComplete && user.status !== "active"}>نشط</option><option value="pending">قيد الاعتماد</option><option value="suspended">موقوف</option></select></label>
      </div>
      {!self && <div className="user-access-decision"><label>سبب القرار أو التغيير<textarea value={reason} onChange={(event) => setReason(event.target.value)} required minLength={10} maxLength={1000} rows={2} placeholder="اكتب مبررًا واضحًا يظهر في سجل التدقيق."/></label><button className="admin-primary" disabled={busy}>{busy ? "جارٍ الحفظ..." : "حفظ القرار الأمني"}</button></div>}
      {self && <p className="self-access-note">لا يمكن تعديل صلاحية حسابك من جلستك الحالية؛ يمنع ذلك الرفع الذاتي للصلاحيات أو تعطيل حساب مدير النظام بالخطأ.</p>}
    </form>
  </article>;
}

function CreateUserModal({ busy, onClose, onSubmit }: { busy: boolean; onClose: () => void; onSubmit: (form: HTMLFormElement) => Promise<void> }) {
  const [roles,setRoles]=useState<Array<{roleKey:string;labelAr:string;description:string|null;active:boolean}>>([]);
  const [selectedRoles,setSelectedRoles]=useState<string[]>([]);
  const [loadError,setLoadError]=useState("");
  useEffect(()=>{let active=true;void fetch("/api/portal/role-definitions",{cache:"no-store"}).then(async response=>{const data=await readApiJson(response)as{roles?:Array<{roleKey:string;labelAr:string;description:string|null;active:boolean}>;error?:string};if(!response.ok)throw new Error(data.error||"تعذر تحميل الأدوار");if(active){const available=(data.roles||[]).filter(role=>role.active);setRoles(available);setSelectedRoles(current=>current.filter(key=>available.some(role=>role.roleKey===key)))}}).catch(error=>{if(active)setLoadError(error instanceof Error?error.message:"تعذر تحميل الأدوار")});return()=>{active=false}},[]);
  function toggleRole(roleKey:string){setSelectedRoles(current=>current.includes(roleKey)?current.filter(key=>key!==roleKey):[...current,roleKey]);}
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if(!selectedRoles.length){setLoadError("اختر دوراً وظيفياً واحداً على الأقل");return;} void onSubmit(event.currentTarget); }
  return <div className="modal-layer"><button className="drawer-backdrop" aria-label="إغلاق نافذة إضافة مستخدم" onClick={onClose}/><section className="record-modal create-user-modal" role="dialog" aria-modal="true" aria-label="إضافة مستخدم"><div className="drawer-head"><div><span>إدارة المستخدمين</span><h2>إضافة مستخدم جديد</h2></div><button onClick={onClose} aria-label="إغلاق"><Icon name="close"/></button></div><form onSubmit={submit}>
    <label>الاسم الكامل<input name="displayName" required minLength={3} maxLength={160} autoComplete="name"/></label>
    <label>رقم الهوية<input name="identifier" required inputMode="numeric" pattern="[0-9]{10}" maxLength={10} dir="ltr" placeholder="10 أرقام"/></label>
    <label>البريد الإلكتروني<input name="email" type="email" required maxLength={254} dir="ltr" autoComplete="email"/></label>
    <label>كلمة المرور المؤقتة<input name="password" type="password" required minLength={12} maxLength={128} dir="ltr" autoComplete="new-password"/></label>
    <fieldset className="quick-permission-profile span-two"><legend>الأدوار الوظيفية (يمكن اختيار أكثر من دور)</legend>{roles.map(role=><label key={role.roleKey}><input type="checkbox" name="functionalRoles" value={role.roleKey} checked={selectedRoles.includes(role.roleKey)} onChange={()=>toggleRole(role.roleKey)}/><span><b>{role.labelAr}</b><small>{role.description||"صلاحيات محددة حسب الدور"}</small></span></label>)}</fieldset>
    <input type="hidden" name="department" value="general"/>
    <fieldset className="quick-permission-profile span-two"><legend>حزمة الصلاحيات السريعة</legend><label><input type="radio" name="permissionProfile" value="role_default" defaultChecked/><span><b>صلاحيات الأدوار</b><small>اتحاد صلاحيات جميع الأدوار المختارة.</small></span></label><label><input type="radio" name="permissionProfile" value="operator"/><span><b>تنفيذ دون اعتماد</b><small>إنشاء وتعديل دون اعتماد أو دفع أو ترحيل.</small></span></label><label><input type="radio" name="permissionProfile" value="read_only"/><span><b>اطلاع فقط</b><small>عرض البيانات دون أي تعديل.</small></span></label></fieldset>
    {loadError&&<p className="form-error span-two">{loadError}</p>}
    <p className="form-hint span-two">اختيار دور واحد على الأقل إلزامي. تُجمع صلاحيات الأدوار المختارة، ولا يمنح أي منها اعتماداً إلا المالك أو مشرف النظام.</p>
    <div className="modal-actions span-two"><button type="button" onClick={onClose}>إلغاء</button><button className="admin-primary" type="submit" disabled={busy||!selectedRoles.length}>{busy ? "جارٍ الإنشاء..." : "إنشاء المستخدم"}</button></div>
  </form></section></div>;
}

function DepartmentCard({ icon, title, text, count, onClick }: { icon: IconName; title: string; text: string; count: string; onClick: () => void }) {
  return <button onClick={onClick}><span><Icon name={icon}/></span><div><strong>{title}</strong><p>{text}</p><small>{count}</small></div><b>←</b></button>;
}
function Metric({ label, value, note }: { label: string; value: string | number; note: string }) {
  return <article><p>{label}<strong>{value}</strong></p><small>{note}</small></article>;
}
function ModuleSection({ eyebrow, title, description, actionLabel, canWrite = false, onAdd, children }: { eyebrow: string; title: string; description: string; actionLabel?: string; canWrite?: boolean; onAdd?: () => void; children: React.ReactNode }) {
  return <><div className="content-heading module-heading"><div><p className="admin-eyebrow">{eyebrow}</p><h1>{title}</h1><span>{description}</span></div>{canWrite && actionLabel && onAdd && <button className="admin-primary" onClick={onAdd}><Icon name="plus"/>{actionLabel}</button>}</div>{children}</>;
}
function ManagementPanel({ query, setQuery, placeholder, children }: { query: string; setQuery: (value: string) => void; placeholder: string; children: React.ReactNode }) {
  return <section className="panel management-panel"><div className="table-tools"><label className="search-box"><Icon name="search"/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={placeholder}/></label></div>{children}</section>;
}

type GlobalSearchResult = { key: string; kind: string; id: number; stringId?: string; view: View; title: string; meta: string; searchValue: string };
function GlobalPortalSearch({ value, setValue, onSelect }: { value: string; setValue: (value: string) => void; onSelect: (result: GlobalSearchResult) => void }) {
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<GlobalSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        wrapRef.current?.querySelector<HTMLInputElement>("input")?.focus();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);
  useEffect(() => {
    const query = value.trim();
    if (query.length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/portal/search?q=${encodeURIComponent(query)}`, { cache: "no-store", signal: controller.signal });
        const result = await readApiJson(response) as { results?: GlobalSearchResult[] };
        if (response.ok) setResults(result.results || []);
      } catch (error) { if (!(error instanceof DOMException && error.name === "AbortError")) setResults([]); }
      finally { setLoading(false); }
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [value]);

  const visibleResults = value.trim().length < 2 ? [] : results;

  return <div className="global-search" ref={wrapRef}><label><Icon name="search"/><input value={value} role="combobox" aria-controls="global-search-results" aria-autocomplete="list" onFocus={() => setOpen(true)} onBlur={() => window.setTimeout(() => setOpen(false), 120)} onChange={(event) => { setValue(event.target.value); setOpen(true); }} onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); if (event.key === "Enter" && visibleResults[0]) { event.preventDefault(); onSelect(visibleResults[0]); setOpen(false); } }} placeholder="ابحث في جميع أقسام النظام..." aria-label="بحث شامل في النظام" aria-expanded={open && value.trim().length >= 2}/><kbd>⌘ K</kbd></label>{open && value.trim().length >= 2 && <div className="global-search-results" id="global-search-results" role="listbox">{loading ? <div className="global-search-empty">جارٍ البحث في السجلات المصرح بها...</div> : visibleResults.length ? visibleResults.map((result) => <button key={result.key} role="option" aria-selected="false" onMouseDown={(event) => event.preventDefault()} onClick={() => { onSelect(result); setOpen(false); }}><span><Icon name={result.view === "conversations" ? "conversations" : result.view === "workforce" || result.view === "operations" ? "workforce" : result.view === "employees" ? "employees" : result.view === "finance" ? "finance" : result.view === "legal" ? "legal" : result.view === "documents" ? "documents" : result.view === "website" ? "website" : "users"}/></span><p><strong>{result.title}</strong><small>{result.meta}</small></p><b>←</b></button>) : <div className="global-search-empty">لا توجد نتائج مطابقة في الأقسام المتاحة لحسابك.</div>}</div>}</div>;
}

function NotificationPopover({ notifications, onOpen, onReadAll, onViewAll }: { notifications: PortalNotification[]; onOpen: (item: PortalNotification) => void; onReadAll: () => void; onViewAll: () => void }) {
  const recent = notifications.slice(0, 7);
  const unread = notifications.filter((item) => !item.readAt).length;
  return <aside className="notification-popover" aria-label="الإشعارات الحديثة"><header><div><strong>الإشعارات</strong><span>{unread} غير مقروء</span></div>{unread > 0 && <button onClick={onReadAll}>تعليم الكل كمقروء</button>}</header><div>{recent.length ? recent.map((item) => <button key={item.id} className={`${item.severity} ${item.readAt ? "read" : "unread"}`} onClick={() => onOpen(item)}><span className="notification-dot"/><p><strong>{item.title}</strong><small>{item.message}</small><time>{formatDate(item.createdAt, true)}</time></p></button>) : <div className="notification-empty"><Icon name="bell"/><strong>لا توجد إشعارات حالياً</strong><span>ستظهر هنا الأحداث التي تحتاج إلى انتباهك.</span></div>}</div><footer><button onClick={onViewAll}>فتح مركز الإشعارات ←</button></footer></aside>;
}

function NotificationCenterView({ notifications, onOpen, onRead, onDismiss, onReadAll, onRefresh }: {
  notifications: PortalNotification[]; onOpen: (item: PortalNotification) => void; onRead: (id: number) => void; onDismiss: (id: number) => void; onReadAll: () => void; onRefresh: () => void;
}) {
  const [filter, setFilter] = useState<"all" | "unread" | "critical" | "warning">("all");
  const visible = notifications.filter((item) => filter === "all" || filter === "unread" ? (filter === "all" ? true : !item.readAt) : item.severity === filter);
  const critical = notifications.filter((item) => item.severity === "critical").length;
  const warning = notifications.filter((item) => item.severity === "warning").length;
  const unread = notifications.filter((item) => !item.readAt).length;
  return <><div className="content-heading module-heading notification-heading"><div><p className="admin-eyebrow">رصد تشغيلي موحّد</p><h1>مركز الإشعارات</h1><span>تنبيهات الطلبات والمراسلات والعقود والعمالة والمستندات والمالية والصلاحيات في مكان واحد.</span></div><div className="heading-actions"><button className="admin-secondary" onClick={onRefresh}>تحديث</button>{unread > 0 && <button className="admin-primary" onClick={onReadAll}><Icon name="check"/>تعليم الكل كمقروء</button>}</div></div><section className="metric-grid compact-metrics notification-metrics"><Metric label="غير مقروء" value={unread} note="تحتاج إلى مراجعة"/><Metric label="عاجل" value={critical} note="يتطلب إجراء سريعاً"/><Metric label="تحذيرات" value={warning} note="مواعيد أو نواقص"/><Metric label="إجمالي نشط" value={notifications.length} note="بعد استبعاد المحلول"/></section><section className="panel notification-center"><div className="notification-filter-tabs">{([['all','الكل'],['unread','غير المقروء'],['critical','العاجل'],['warning','التحذيرات']] as const).map(([value, label]) => <button key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{label}</button>)}</div><div className="notification-list">{visible.length ? visible.map((item) => <article key={item.id} className={`${item.severity} ${item.readAt ? "read" : "unread"}`}><button className="notification-main" onClick={() => onOpen(item)}><span className="notification-module"><Icon name={item.module === "conversations" ? "conversations" : item.module === "workforce" ? "workforce" : item.module === "finance" ? "finance" : item.module === "legal" ? "legal" : item.module === "documents" ? "documents" : item.module === "users" ? "users" : item.module === "employees" ? "employees" : "bell"}/></span><p><strong>{item.title}</strong><span>{item.message}</span><small>{formatDate(item.createdAt, true)} · {item.source === "system-check" ? "فحص تلقائي" : "حدث تشغيلي"}</small></p><b>فتح السجل ←</b></button><div className="notification-item-actions">{!item.readAt && <button onClick={() => onRead(item.id)}>مقروء</button>}<button onClick={() => onDismiss(item.id)}>إخفاء</button></div></article>) : <div className="notification-empty large"><Icon name="check"/><strong>لا توجد إشعارات ضمن هذا التصنيف</strong><span>النظام يحدّث التنبيهات تلقائياً عند دخول البوابة وكل 45 ثانية أثناء العمل.</span></div>}</div></section></>;
}

const conversationStatusLabels: Record<string, string> = { waiting: "تنتظر الرد", open: "جارية", closed: "مغلقة" };
const workingDayLabels = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

function ConversationCenter({ conversations, messages, businessHours, automation, query, setQuery, canManageSettings, onSelect, onRefresh, onOpenSettings }: {
  conversations: VisitorConversation[]; messages: VisitorMessage[]; businessHours: BusinessHours; automation: ChatAutomationConfig; query: string; setQuery: (value: string) => void;
  canManageSettings: boolean; onSelect: (id: string) => void; onRefresh: () => void; onOpenSettings: () => void;
}) {
  const needle = query.trim().toLowerCase();
  const rows = conversations.filter((item) => !needle || JSON.stringify(item).toLowerCase().includes(needle));
  const unread = messages.filter((item) => item.senderType === "visitor" && !item.readByStaffAt).length;
  const lastMessage = (id: string) => messages.filter((item) => item.conversationId === id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const unreadFor = (id: string) => messages.filter((item) => item.conversationId === id && item.senderType === "visitor" && !item.readByStaffAt).length;
  return <>
    <div className="content-heading module-heading chat-heading"><div><p className="admin-eyebrow">تواصل لحظي مع زوار الموقع</p><h1>المحادثات المباشرة</h1><span>استقبال فوري، وتصنيف تلقائي للاحتياج، وتحويل واضح إلى الموظف المخوّل.</span></div><div className="heading-actions"><button className="admin-secondary" onClick={onRefresh}>تحديث الآن</button>{canManageSettings && <button className="admin-primary" onClick={onOpenSettings}>إعدادات الرد الآلي</button>}</div></div>
    <section className="metric-grid compact-metrics chat-metrics"><Metric label="تنتظر الرد" value={conversations.filter((item) => item.status === "waiting").length} note="أولوية فريق الخدمة"/><Metric label="رسائل غير مقروءة" value={unread} note="من زوار الموقع"/><Metric label="محادثات جارية" value={conversations.filter((item) => item.status === "open").length} note="تم الرد عليها"/><Metric label="إجمالي المحادثات" value={conversations.length} note="سجل محفوظ وقابل للبحث"/></section>
    <section className={`business-hours-panel ${businessHours.isOpen ? "open" : "closed"}`}><span><Icon name="conversations"/></span><div><strong>{businessHours.isOpen ? "الفريق متاح الآن للمحادثة" : "الموقع حالياً خارج ساعات الدوام"}</strong><p>الدوام من {businessHours.opensAt} إلى {businessHours.closesAt} بتوقيت مكة · {businessHours.isOpen ? "الرد البشري متاح" : `العودة ${businessHours.nextOpenLabel}`}</p></div><b>{automation.enabled ? `${automation.rules.filter((rule) => rule.enabled).length} مسارات آلية` : "الرد الآلي متوقف"}</b></section>
    <section className="panel live-conversation-panel"><div className="panel-head"><div><h2>صندوق المحادثات</h2><p>تحديث تفاضلي تلقائي كل 12 ثانية أثناء العمل</p></div><span className="panel-count">{rows.length} محادثة</span></div><div className="table-tools"><label className="search-box"><Icon name="search"/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث برقم المحادثة أو اسم الزائر أو الجوال"/></label><div className="conversation-legend"><span><i className="waiting"/>تنتظر الرد</span><span><i className="open"/>جارية</span><span><i className="closed"/>مغلقة</span></div></div>{rows.length ? <div className="conversation-table-wrap"><table className="management-table conversation-table"><thead><tr><th>المحادثة</th><th>الزائر</th><th>الموضوع</th><th>آخر رسالة</th><th>المسؤول</th><th>الحالة</th><th></th></tr></thead><tbody>{rows.map((item) => { const latest = lastMessage(item.id); const unreadCount = unreadFor(item.id); return <tr key={item.id} onClick={() => onSelect(item.id)} className={unreadCount ? "unread" : ""}><td><strong dir="ltr">{item.trackingCode}</strong><small>{formatDate(item.createdAt, true)}</small></td><td><strong>{item.visitorName}</strong><small dir="ltr">{item.visitorMobile}</small></td><td>{item.subject}</td><td><strong>{latest?.senderType === "visitor" ? item.visitorName : latest?.senderType === "system" ? "الرد الآلي" : latest?.senderName || "—"}</strong><small>{latest?.body.slice(0, 70) || "لا توجد رسائل"}</small></td><td>{item.assignedTo ? <span dir="ltr">{item.assignedTo}</span> : "غير مسندة"}</td><td><span className={`conversation-status ${item.status}`}>{conversationStatusLabels[item.status] || item.status}</span></td><td>{unreadCount > 0 ? <b className="conversation-unread">{unreadCount}</b> : <button aria-label={`فتح ${item.trackingCode}`}>←</button>}</td></tr>; })}</tbody></table></div> : <EmptyRows label="ستظهر هنا أول محادثة يبدأها زائر الموقع."/>}</section>
  </>;
}

function ConversationDrawer({ conversation, messages, businessHours, busy, onClose, onReply, onStatus }: {
  conversation: VisitorConversation; messages: VisitorMessage[]; businessHours: BusinessHours; busy: string | null; onClose: () => void;
  onReply: (conversationId: string, form: HTMLFormElement) => Promise<void>; onStatus: (conversationId: string, status: "waiting" | "open" | "closed") => Promise<void>;
}) {
  const messageBox = useRef<HTMLDivElement>(null);
  useEffect(() => { messageBox.current?.scrollTo({ top: messageBox.current.scrollHeight }); }, [messages]);
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void onReply(conversation.id, event.currentTarget); }
  return <div className="drawer-layer"><button className="drawer-backdrop" aria-label="إغلاق المحادثة" onClick={onClose}/><aside className="request-drawer portal-chat-drawer" role="dialog" aria-modal="true" aria-label={`محادثة ${conversation.trackingCode}`}><div className="drawer-head"><div><span>{conversation.trackingCode}</span><h2>{conversation.visitorName}</h2></div><button onClick={onClose} aria-label="إغلاق"><Icon name="close"/></button></div><div className="portal-chat-contact"><div><span>{initials(conversation.visitorName)}</span><p><strong>{conversation.subject}</strong><small dir="ltr">{conversation.visitorMobile} · {conversation.visitorEmail || "دون بريد"}</small></p></div><select value={conversation.status} disabled={busy === `chat-status-${conversation.id}`} onChange={(event) => void onStatus(conversation.id, event.target.value as "waiting" | "open" | "closed")}><option value="waiting">تنتظر الرد</option><option value="open">جارية</option><option value="closed">مغلقة</option></select></div><div className={`portal-chat-hours ${businessHours.isOpen ? "open" : "closed"}`}><strong>{businessHours.isOpen ? "ضمن ساعات الدوام" : "خارج ساعات الدوام"}</strong><span>{businessHours.isOpen ? "يمكن الرد المباشر الآن." : "استلم الزائر الرد الآلي عند أول رسالة خارج الدوام."}</span></div><div className="portal-chat-messages" ref={messageBox}>{messages.length ? messages.map((message) => <article key={message.id} className={message.senderType}><header><strong>{message.senderType === "visitor" ? conversation.visitorName : message.senderType === "system" ? "الرد الآلي" : message.senderName}</strong><time>{formatDate(message.createdAt, true)}</time></header><p>{message.body}</p>{message.senderType === "staff" && <small>{message.readByVisitorAt ? "قرأها الزائر" : "أُرسلت للزائر"}</small>}</article>) : <div className="empty-operational">لا توجد رسائل في هذه المحادثة.</div>}</div><form className="portal-chat-composer" onSubmit={submit}><label><span>الرد المباشر</span><textarea name="body" required minLength={2} maxLength={4000} rows={4} placeholder="اكتب الرد الذي سيظهر للزائر فوراً..."/></label><div><small>سيُنسب الرد إلى حسابك ويُحفظ في سجل النشاط.</small><button className="admin-primary" disabled={busy === `chat-reply-${conversation.id}`}>{busy === `chat-reply-${conversation.id}` ? "جارٍ الإرسال..." : conversation.status === "closed" ? "إعادة الفتح والرد" : "إرسال الرد"}</button></div></form></aside></div>;
}

function ChatSettingsModal({ businessHours, automation, busy, onClose, onSubmit }: { businessHours: BusinessHours; automation: ChatAutomationConfig; busy: boolean; onClose: () => void; onSubmit: (form: HTMLFormElement) => Promise<void> }) {
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void onSubmit(event.currentTarget); }
  return <div className="modal-layer"><button className="drawer-backdrop" aria-label="إغلاق إعدادات الرد الآلي" onClick={onClose}/><section className="record-modal chat-settings-modal" role="dialog" aria-modal="true" aria-label="إعدادات نظام الرد الآلي"><div className="drawer-head"><div><span>المحادثة المباشرة</span><h2>نظام الرد الآلي وساعات الخدمة</h2></div><button onClick={onClose} aria-label="إغلاق"><Icon name="close"/></button></div><form onSubmit={submit}>
    <fieldset className="span-two automation-switches"><legend>حالة النظام</legend><label><input type="checkbox" name="automationEnabled" defaultChecked={automation.enabled}/><span><strong>تشغيل المساعد الآلي</strong><small>يعطّل هذا الخيار جميع الردود الآلية دفعة واحدة.</small></span></label><label><input type="checkbox" name="welcomeEnabled" defaultChecked={automation.welcomeEnabled}/><span><strong>ترحيب خلال الدوام</strong><small>إشعار فوري باستلام المحادثة.</small></span></label><label><input type="checkbox" name="afterHoursEnabled" defaultChecked={automation.afterHoursEnabled}/><span><strong>رد خارج الدوام</strong><small>يتضمن موعد العودة القادم تلقائياً.</small></span></label><label><input type="checkbox" name="intentRepliesEnabled" defaultChecked={automation.intentRepliesEnabled}/><span><strong>توجيه بحسب نية الزائر</strong><small>يطابق الكلمات ويرسل الإرشاد المناسب مرة واحدة.</small></span></label></fieldset>
    <label className="span-two">رسالة الترحيب خلال الدوام<textarea name="welcomeReply" required minLength={10} maxLength={900} rows={4} defaultValue={automation.welcomeReply}/></label>
    <fieldset className="span-two"><legend>أيام العمل الرسمية</legend><div className="working-days">{workingDayLabels.map((label, day) => <label key={label}><input type="checkbox" name="workingDays" value={day} defaultChecked={businessHours.workingDays.includes(day)}/><span>{label}</span></label>)}</div></fieldset>
    <label>بداية الدوام<input name="opensAt" type="time" required defaultValue={businessHours.opensAt}/></label><label>نهاية الدوام<input name="closesAt" type="time" required defaultValue={businessHours.closesAt}/></label>
    <label>إغلاقات استثنائية<textarea name="closedDates" rows={3} placeholder="2026-09-23، 2027-02-22" defaultValue={businessHours.closedDates.join("، ")}/></label><label>أيام فتح استثنائية<textarea name="specialOpenDates" rows={3} placeholder="2026-08-15" defaultValue={businessHours.specialOpenDates.join("، ")}/></label>
    <label className="span-two">رسالة خارج الدوام<textarea name="autoReply" required minLength={10} maxLength={700} rows={5} defaultValue={businessHours.autoReply}/></label>
    <p className="form-hint span-two automation-placeholders">يمكن استخدام المتغيرات <code>{"{{name}}"}</code> و<code>{"{{trackingCode}}"}</code> و<code>{"{{nextOpen}}"}</code> و<code>{"{{subject}}"}</code>. يعتمد احتساب الموعد على توقيت مكة والإغلاقات الاستثنائية.</p>
    <section className="span-two automation-rules"><header><div><strong>مسارات التوجيه الذكي</strong><span>يرسل كل مسار مرة واحدة فقط في المحادثة، حتى عند تكرار الرسالة.</span></div><b>{automation.rules.filter((rule) => rule.enabled).length} مفعّل</b></header>{automation.rules.map((rule) => <article key={rule.id}><label className="automation-rule-toggle"><input type="checkbox" name={`ruleEnabled:${rule.id}`} defaultChecked={rule.enabled}/><span>{rule.label}</span></label><label>الكلمات الدالة<input name={`ruleKeywords:${rule.id}`} required maxLength={500} defaultValue={rule.keywords.join("، ")}/></label><label className="wide">الرد المخصص<textarea name={`ruleResponse:${rule.id}`} required minLength={10} maxLength={900} rows={3} defaultValue={rule.response}/></label></article>)}</section>
    <div className="modal-actions span-two"><button type="button" onClick={onClose}>إلغاء</button><button className="admin-primary" disabled={busy}>{busy ? "جارٍ الحفظ..." : "حفظ النظام وتشغيله"}</button></div>
  </form></section></div>;
}

function FinanceDocumentActions({ onIssue }: { onIssue: (type: string) => void }) {
  return <section className="panel finance-document-actions"><div><span><Icon name="documents"/></span><p><strong>الإصدارات المالية الرسمية</strong><small>تُحفظ تلقائياً في مركز المستندات وتُربط بالسجل المالي.</small></p></div><div><button onClick={() => onIssue("invoice")}>إصدار فاتورة</button><button onClick={() => onIssue("receipt")}>سند قبض</button><button onClick={() => onIssue("payment_voucher")}>سند صرف</button><button onClick={() => onIssue("progress_claim")}>مستخلص عمالة</button></div></section>;
}

function DocumentCenter({ documents, contracts, assets, query, setQuery, canManageDocuments, canManageAssets, canApprove, busy, expiringDocuments, expiredDocuments, onUpload, onIssue, onIssueQuotation, onOpenQuoteApprovals, onApproveContract, onShare, onUploadAsset }: {
  documents: CompanyDocument[]; contracts: WorkforceContract[]; assets: CompanyAsset[]; query: string; setQuery: (value: string) => void;
  canManageDocuments: boolean; canManageAssets: boolean; busy: string | null;
  canApprove: boolean; onOpenQuoteApprovals: () => void; onApproveContract: (contractId: number) => Promise<void>;
  expiringDocuments: CompanyDocument[]; expiredDocuments: CompanyDocument[];
  onUpload: () => void; onIssue: () => void; onIssueQuotation: () => void; onShare: (id: number) => Promise<void>;
  onUploadAsset: (slot: "stamp" | "signature", form: HTMLFormElement) => Promise<void>;
}) {
  const rows = filterRecords(documents, query);
  const generatedCount = documents.filter((item) => item.source === "generated").length;
  return <>
    <div className="content-heading module-heading documents-heading"><div><p className="admin-eyebrow">الحفظ والإصدار الرسمي</p><h1>مركز المستندات</h1><span>إدارة ملفات الشركة، ومشاركة النسخ، وإصدار العقود والمستندات الرسمية.</span></div>{canManageDocuments && <div className="heading-actions">{canApprove && <button className="admin-primary document-approval-entry" onClick={onOpenQuoteApprovals}><Icon name="check"/>اعتماد عروض الأسعار</button>}<button className="admin-secondary" onClick={onUpload}><Icon name="upload"/>رفع مستند</button><button className="admin-secondary" onClick={onIssueQuotation}><Icon name="documents"/>إنشاء عرض سعر</button><button className="admin-primary" onClick={onIssue}><Icon name="plus"/>إنشاء مستند آخر</button></div>}</div>

    {(expiringDocuments.length > 0 || expiredDocuments.length > 0) && <section className="expiry-alert" role="status"><span><Icon name="bell"/></span><div><strong>توجد مستندات تحتاج إلى متابعة</strong><p>{expiredDocuments.length > 0 ? `${expiredDocuments.length} مستند منتهٍ، ` : ""}{expiringDocuments.length} مستند تنتهي صلاحيته خلال أقل من 30 يوماً.</p></div><div className="alert-docs">{[...expiredDocuments, ...expiringDocuments].slice(0, 3).map((item) => <small key={item.id}>{item.title} · {expiryText(item.expiryDate)}</small>)}</div></section>}

    <section className="metric-grid compact-metrics document-metrics"><Metric label="إجمالي المستندات" value={documents.length} note="المرفوع والمُصدر"/><Metric label="تنتهي خلال 30 يوماً" value={expiringDocuments.length} note="تحتاج إلى تجديد"/><Metric label="مستندات منتهية" value={expiredDocuments.length} note="تحتاج إلى إجراء"/><Metric label="ملفات PDF صادرة" value={generatedCount} note="بالختم والتوقيع"/></section>

    <section className="documents-layout">
      <article className="panel document-library"><div className="panel-head"><div><h2>مكتبة مستندات الشركة</h2><p>تنزيل آمن وروابط مشاركة مؤقتة صالحة لمدة 7 أيام</p></div><span className="panel-count">{rows.length} مستند</span></div><div className="table-tools"><label className="search-box"><Icon name="search"/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث بالعنوان أو المرجع أو الجهة"/></label></div><DocumentTable documents={rows} contracts={contracts} canApprove={canApprove} canShare={canManageDocuments} busy={busy} onApproveContract={onApproveContract} onOpenQuoteApprovals={onOpenQuoteApprovals} onShare={onShare}/></article>
      <CompanyAssetsPanel assets={assets} canManage={canManageAssets} busy={busy} onUpload={onUploadAsset}/>
    </section>
    {canManageDocuments && <DocumentShareManager documents={documents.map(({ id, referenceCode, title }) => ({ id, referenceCode, title }))}/>}
  </>;
}

function expiryText(value: string | null) {
  const days = daysUntil(value);
  if (!Number.isFinite(days)) return "دون تاريخ انتهاء";
  if (days < 0) return `منتهٍ منذ ${Math.abs(days)} يوم`;
  if (days === 0) return "ينتهي اليوم";
  if (days <= 30) return `متبقٍ ${days} يوم`;
  return formatDate(value);
}

function DocumentTable({ documents, contracts, canApprove, canShare, busy, onApproveContract, onOpenQuoteApprovals, onShare }: { documents: CompanyDocument[]; contracts: WorkforceContract[]; canApprove: boolean; canShare: boolean; busy: string | null; onApproveContract: (id: number) => Promise<void>; onOpenQuoteApprovals: () => void; onShare: (id: number) => Promise<void> }) {
  if (!documents.length) return <EmptyRows label="ارفع أول مستند أو أنشئ ملف PDF ليظهر هنا."/>;
  return <div className="management-table-wrap"><table className="management-table documents-table"><thead><tr><th>المرجع</th><th>المستند</th><th>التصنيف</th><th>الجهة</th><th>الانتهاء</th><th>الحجم</th><th>الإجراءات</th></tr></thead><tbody>{documents.map((item) => { const days = daysUntil(item.expiryDate); const expiryClass = days < 0 ? "expired" : days <= 30 ? "expiring" : ""; const contract = contracts.find((entry) => entry.documentId === item.id); const contractNeedsApproval = contract && ["draft", "internal_review", "legal_review"].includes(contract.status); return <tr key={item.id}><td dir="ltr"><b>{item.referenceCode}</b></td><td><strong>{item.title}</strong><small>{item.source === "generated" ? issuedTypeLabels[item.documentType || ""] || "PDF صادر" : item.fileName}{item.lockedUntil ? ` · حجز نظامي حتى ${formatDate(item.lockedUntil)}` : item.retentionUntil ? ` · مراجعة الاحتفاظ ${formatDate(item.retentionUntil)}` : ""}</small></td><td><span className={`doc-kind ${item.source === "generated" ? "generated" : ""}`}>{item.source === "generated" ? "صادر من النظام" : documentCategoryLabels[item.category] || item.category}</span></td><td>{item.counterparty || "—"}</td><td><span className={`expiry-pill ${expiryClass}`}>{expiryText(item.expiryDate)}</span></td><td>{formatBytes(item.sizeBytes)}</td><td><div className="document-actions">{canApprove && contractNeedsApproval && <button className="document-direct-approve" disabled={busy === `contract-status-${contract.id}`} onClick={() => void onApproveContract(contract.id)}><Icon name="check"/><span>{busy === `contract-status-${contract.id}` ? "جارٍ الاعتماد" : "اعتماد العقد"}</span></button>}{canApprove && item.documentType === "quotation" && <button className="document-direct-approve" onClick={onOpenQuoteApprovals}><Icon name="check"/><span>اعتماد العرض</span></button>}<PdfDownloadButton href={`/api/portal/documents/${item.id}?inline=1`} title={item.title} inline icon="documents" label="معاينة"/><PdfDownloadButton href={`/api/portal/documents/${item.id}`} title={item.title} icon="download" label="تنزيل"/>{canShare && <button disabled={busy === `share-${item.id}`} onClick={() => void onShare(item.id)} aria-label={`مشاركة ${item.title}`}><Icon name="share"/><span>{busy === `share-${item.id}` ? "جارٍ الإنشاء" : "مشاركة"}</span></button>}</div></td></tr>; })}</tbody></table></div>;
}

function PdfDownloadButton({ href, title, label, icon, inline = false }: { href: string; title: string; label: string; icon: IconName; inline?: boolean }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  async function openPdf() {
    setLoading(true);
    try {
      const requestUrl = new URL(href, window.location.origin);
      if (/عقد|عرض سعر|فاتورة|contract|quotation|invoice/i.test(title)) {
        const choice = window.prompt("اختر لغة ملف PDF: اكتب 1 للعربية فقط، أو 2 لعربي/English", "1");
        if (choice === null) return;
        if (!['1', '2'].includes(choice.trim())) throw new Error("اختيار اللغة غير صحيح؛ استخدم 1 أو 2");
        requestUrl.searchParams.set("language", choice.trim() === "2" ? "bilingual" : "ar");
      }
      const response = await fetch(requestUrl, { credentials: "same-origin" });
      if (!response.ok) {
        const data = await readApiJson(response).catch(() => ({})) as { error?: string };
        throw new Error(data.error || "تعذّر تجهيز الملف حاليًا");
      }
      const url = URL.createObjectURL(await response.blob());
      if (inline) window.open(url, "_blank", "noopener,noreferrer");
      else {
        const anchor = document.createElement("a");
        anchor.href = url; anchor.download = `${title}.pdf`; document.body.appendChild(anchor); anchor.click(); anchor.remove();
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (problem) { setError(problem instanceof Error ? problem.message : "تعذّر تجهيز الملف"); }
    finally { setLoading(false); }
  }
  return <><button type="button" disabled={loading} onClick={() => void openPdf()} aria-label={`${label} ${title}`}><Icon name={icon}/><span>{loading ? "جارٍ التجهيز" : label}</span></button>{error && <div className="pdf-error-layer"><section className="pdf-error-dialog" role="alertdialog" aria-modal="true" aria-label="تعذّر تنزيل الملف"><span className="pdf-error-icon">!</span><h3>الملف غير متاح للتنزيل</h3><p>{error}</p><button type="button" autoFocus onClick={() => setError("")}>حسنًا</button></section></div>}</>;
}

function CompanyAssetsPanel({ assets, canManage, busy, onUpload }: { assets: CompanyAsset[]; canManage: boolean; busy: string | null; onUpload: (slot: "stamp" | "signature", form: HTMLFormElement) => Promise<void> }) {
  return <aside className="panel company-assets"><div className="panel-head"><div><h2>الختم والتوقيع</h2><p>أصول محمية تُدرج آلياً في كل PDF صادر</p></div><Icon name="stamp"/></div><div className="asset-list">{(["stamp", "signature"] as const).map((slot) => { const asset = assets.find((item) => item.slot === slot); const label = slot === "stamp" ? "ختم الشركة" : "التوقيع المفوض"; return <form key={slot} onSubmit={(event) => { event.preventDefault(); void onUpload(slot, event.currentTarget); }}><div className={`asset-status ${asset ? "ready" : "missing"}`}><span>{asset ? "✓" : "!"}</span><p><strong>{label}</strong><small>{asset ? `${asset.fileName} · ${formatDate(asset.updatedAt, true)}` : "لم يُرفع بعد"}</small></p>{asset&&<a className="asset-preview" href={`/api/portal/company-assets?slot=${slot}`} target="_blank" rel="noreferrer">معاينة</a>}</div>{canManage && <><label className="asset-file"><input type="file" name="file" accept=".png,.jpg,.jpeg,image/png,image/jpeg" required/><span><Icon name="upload"/>{asset ? "استبدال الملف" : "رفع الملف"}</span></label><button className="asset-submit" type="submit" disabled={busy === `asset-${slot}`}>{busy === `asset-${slot}` ? "جارٍ الحفظ..." : "اعتماد"}</button></>}</form>; })}</div><div className="asset-security"><strong>حماية الأصول الرسمية</strong><p>الصيغ المقبولة PNG وJPG حتى 5 ميجابايت. المعاينة متاحة للمستخدمين المخولين داخل النظام فقط ولا تدخل روابط المشاركة.</p></div></aside>;
}

function UploadDocumentModal({ busy, onClose, onSubmit }: { busy: boolean; onClose: () => void; onSubmit: (form: HTMLFormElement) => Promise<void> }) {
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void onSubmit(event.currentTarget); }
  return <div className="modal-layer"><button className="drawer-backdrop" aria-label="إغلاق نافذة رفع المستند" onClick={onClose}/><section className="record-modal document-modal" role="dialog" aria-modal="true" aria-label="رفع مستند شركة"><div className="drawer-head"><div><span>مركز المستندات</span><h2>رفع مستند شركة</h2></div><button onClick={onClose} aria-label="إغلاق"><Icon name="close"/></button></div><form onSubmit={submit}><label>التصنيف<select name="category" required defaultValue=""><option value="" disabled>اختر التصنيف</option><option value="license">ترخيص</option><option value="contract">عقد</option><option value="certificate">شهادة</option><option value="finance">مالي</option><option value="legal">قانوني</option><option value="hr">موارد بشرية</option><option value="other">أخرى</option></select></label><label>الجهة أو الطرف المرتبط<input name="counterparty" maxLength={160} placeholder="اختياري"/></label><label>تاريخ الانتهاء أو التجديد<input name="expiryDate" type="date"/></label><label>مراجعة الاحتفاظ حتى<input name="retentionUntil" type="date"/></label><label>حجز نظامي حتى<input name="lockedUntil" type="date"/></label><label>الملف<input name="file" type="file" required accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"/></label><p className="form-hint span-two">الحد الأقصى 20 ميجابايت. يُشتق اسم المستند تلقائياً من اسم الملف. يُستخدم تاريخ الاحتفاظ للمراجعة الدورية، ويمنع الحجز النظامي أي حذف آلي قبل انتهائه.</p><div className="modal-actions span-two"><button type="button" onClick={onClose}>إلغاء</button><button className="admin-primary" type="submit" disabled={busy}>{busy ? "جارٍ الرفع..." : "رفع وحفظ المستند"}</button></div></form></section></div>;
}

function FinanceRecordModal({ busy, workers, contracts, onClose, onSubmit }: { busy: boolean; workers: WorkerRecord[]; contracts: WorkforceContract[]; onClose: () => void; onSubmit: (form: HTMLFormElement) => Promise<void> }) {
  const [category, setCategory] = useState("worker_salary");
  const [paymentMethod, setPaymentMethod] = useState("bank_transfer");
  const [banks, setBanks] = useState<Array<{ id: number; bankName: string; accountName: string; accountCode: string }>>([]);
  useEffect(() => {
    let active = true;
    fetch("/api/portal/accounting", { cache: "no-store" }).then((response) => response.ok ? response.json() : Promise.reject())
      .then((payload: unknown) => { if (active) { const data = payload as { banks?: Array<{ id: number; bankName: string; accountName: string; accountCode: string; status?: string }> }; setBanks((data.banks || []).filter((bank) => bank.status === "active")); } })
      .catch(() => { if (active) setBanks([]); });
    return () => { active = false; };
  }, []);
  const workerRelated = ["worker_salary", "worker_advance", "worker_deduction", "worker_expense"].includes(category);
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void onSubmit(event.currentTarget); }
  return <div className="modal-layer"><button className="drawer-backdrop" aria-label="إغلاق نافذة الحركة المالية" onClick={onClose}/><section className="record-modal finance-modal" role="dialog" aria-modal="true" aria-label="إضافة حركة مالية للعمالة"><div className="drawer-head"><div><span>الإدارة المالية</span><h2>إضافة حركة مالية للعمالة</h2></div><button onClick={onClose} aria-label="إغلاق"><Icon name="close"/></button></div><form onSubmit={submit}>
    <label>نوع الحركة<select name="category" value={category} onChange={(event) => setCategory(event.target.value)}><option value="worker_salary">راتب عامل</option><option value="worker_advance">سلفة عامل</option><option value="worker_deduction">خصم عامل</option><option value="worker_expense">مصروف خاص بالعمالة</option><option value="workforce_invoice">فاتورة عمالة</option><option value="receipt_voucher">سند قبض</option><option value="payment_voucher">سند صرف</option><option value="progress_claim">مستخلص عمالة</option></select></label><label>المبلغ بالريال<input name="amount" required type="number" min="0.01" max="1000000000" step="0.01" dir="ltr"/></label>
    {workerRelated && <label className="span-two">العامل<select name="workerId" required defaultValue=""><option value="" disabled>اختر العامل</option>{workers.map((worker) => <option value={worker.id} key={worker.id}>{worker.fullName} — {worker.profession} — {worker.iqamaNumber}</option>)}</select></label>}
    <label>العقد المرتبط<select name="contractId" defaultValue=""><option value="">دون عقد محدد</option>{contracts.map((contract) => <option value={contract.id} key={contract.id}>{contract.referenceCode} — {contract.clientName}</option>)}</select></label>
    {category === "worker_salary" && <label>شهر الراتب<input name="periodMonth" required type="month"/></label>}
    {category === "worker_expense" && <label>نوع المصروف<select name="subCategory" required defaultValue=""><option value="" disabled>اختر نوع المصروف</option>{Object.entries(workforceExpenseLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>}
    <label>تاريخ الاستحقاق أو الصرف<input name="dueDate" required type="date" defaultValue={new Date().toISOString().slice(0, 10)}/></label><label>طريقة الدفع<select name="paymentMethod" value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}><option value="bank_transfer">تحويل بنكي</option><option value="cash">نقدي</option><option value="cheque">شيك</option><option value="payroll_file">ملف حماية الأجور</option><option value="other">أخرى</option></select></label>
    {paymentMethod === "bank_transfer" && <label className="span-two">الحساب البنكي<select name="bankAccountId" required defaultValue=""><option value="" disabled>{banks.length ? "اختر الحساب البنكي" : "لا توجد حسابات بنكية نشطة"}</option>{banks.map((bank) => <option value={bank.id} key={bank.id}>{bank.bankName} — {bank.accountName} — {bank.accountCode}</option>)}</select></label>}
    <label className="span-two">البيان<input name="description" required minLength={3} maxLength={240} placeholder="مثال: راتب شهر أغسطس للعامل أو مصروف تجديد إقامة"/></label><label className="span-two">ملاحظات<textarea name="notes" maxLength={1000} rows={4} placeholder="تفاصيل إضافية أو رقم مرجع خارجي..."/></label>
    <p className="form-hint span-two">يظهر السجل في كشف العامل والعقد، ويمكن إصدار الفواتير والسندات الرسمية من لوحة المالية.</p><div className="modal-actions span-two"><button type="button" onClick={onClose}>إلغاء</button><button className="admin-primary" type="submit" disabled={busy}>{busy ? "جارٍ الحفظ..." : "حفظ الحركة المالية"}</button></div>
  </form></section></div>;
}

function IssueDocumentModal({ initialType, initialQuoteId, busy, assetsReady, workers, contracts, requests, onClose, onSubmit }: { initialType: string; initialQuoteId:number|null; busy: boolean; assetsReady: boolean; workers: WorkerRecord[]; contracts: WorkforceContract[]; requests: WorkforceRequest[]; onClose: () => void; onSubmit: (form: HTMLFormElement) => Promise<void> }) {
  const [representatives,setRepresentatives]=useState<Array<{id:number;representativeCode:string;fullName:string;status:string;representativeType:"sales"|"purchasing"}>>([]);
  const [representativeRequests,setRepresentativeRequests]=useState<Array<{id:number;requestCode:string;representativeId:number;requestType:"sales"|"purchase";title:string;details:string;workSite:string|null;clientName:string|null;status:string}>>([]);
  type ConvertibleQuote={id:number;quoteCode:string;quantityMode:"fixed"|"open";seasonType:"regular"|"ramadan"|"hajj";paymentScheduleJson:string|null;vatRateBps:number;subtotalHalalas:number;clientName:string;title:string;items:Array<{profession:string;quantity:number;unitPriceHalalas?:number;sponsorshipType?:"dali"|"other"|null;sponsorName?:string|null;ajirContractStatus?:"not_applicable"|"with_ajir"|"without_ajir"|null}>};
  const [convertibleQuotes,setConvertibleQuotes]=useState<ConvertibleQuote[]>([]);
  const [selectedQuoteId,setSelectedQuoteId]=useState(initialQuoteId?String(initialQuoteId):"");
  const [quantityMode,setQuantityMode]=useState<"fixed"|"open">("fixed");
  const [seasonType,setSeasonType]=useState<"regular"|"ramadan"|"hajj">("regular");
  const [contractStartDate,setContractStartDate]=useState("");
  const [contractAmount,setContractAmount]=useState("");
  const [contractVatEnabled,setContractVatEnabled]=useState(true);
  const [contractVatRate,setContractVatRate]=useState("15");
  const [contractDirection,setContractDirection]=useState<WorkforceContractDirection>("dali_supplier");
  const [contractClauses,setContractClauses]=useState<Array<WorkforceContractClause&{key:string}>>(()=>defaultWorkforceContractClauses("dali_supplier").map((item,index)=>({...item,key:`clause-${index}`})));
  const [translatingClauses,setTranslatingClauses]=useState(false);
  const [submissionError,setSubmissionError]=useState("");
  useEffect(()=>{if(initialType!=="workforce_contract")return;void fetch("/api/portal/sales-representatives",{cache:"no-store"}).then(response=>response.ok?response.json():Promise.reject()).then((data:unknown)=>{const parsed=data as {representatives?:Array<{id:number;representativeCode:string;fullName:string;status:string;representativeType:"sales"|"purchasing"}>;requests?:Array<{id:number;requestCode:string;representativeId:number;requestType:"sales"|"purchase";title:string;details:string;workSite:string|null;clientName:string|null;status:string}>};setRepresentatives((parsed.representatives||[]).filter(item=>item.status==="active"));setRepresentativeRequests((parsed.requests||[]).filter(item=>item.status==="approved"));}).catch(()=>{setRepresentatives([]);setRepresentativeRequests([])});},[initialType]);
  useEffect(()=>{if(initialType!=="workforce_contract")return;void fetch("/api/portal/operations?limit=100",{cache:"no-store"}).then(response=>response.ok?response.json():Promise.reject()).then((raw:unknown)=>{const data=raw as {quotes?:Array<{id:number;quoteCode:string;opportunityId:number;status:string;quantityMode:"fixed"|"open";seasonType:"regular"|"ramadan"|"hajj";paymentScheduleJson:string|null;vatRateBps:number;subtotalHalalas:number}>;quoteItems?:Array<{quoteVersionId:number;profession:string;quantity:number;unitPriceHalalas:number;sponsorshipType?:"dali"|"other"|null;sponsorName?:string|null;ajirContractStatus?:"not_applicable"|"with_ajir"|"without_ajir"|null}>;opportunities?:Array<{id:number;clientId:number|null;title:string}>;clients?:Array<{id:number;legalName:string}>};setConvertibleQuotes((data.quotes||[]).filter(quote=>["approved","sent","accepted"].includes(quote.status)).map(quote=>{const opportunity=(data.opportunities||[]).find(item=>item.id===quote.opportunityId);const client=(data.clients||[]).find(item=>item.id===opportunity?.clientId);return{id:quote.id,quoteCode:quote.quoteCode,quantityMode:quote.quantityMode||"fixed",seasonType:quote.seasonType||"regular",paymentScheduleJson:quote.paymentScheduleJson||null,vatRateBps:quote.vatRateBps||0,subtotalHalalas:quote.subtotalHalalas||0,clientName:client?.legalName||"",title:opportunity?.title||quote.quoteCode,items:(data.quoteItems||[]).filter(item=>item.quoteVersionId===quote.id).map(item=>({profession:item.profession,quantity:item.quantity,unitPriceHalalas:item.unitPriceHalalas,sponsorshipType:item.sponsorshipType,sponsorName:item.sponsorName,ajirContractStatus:item.ajirContractStatus}))};}));}).catch(()=>setConvertibleQuotes([]));},[initialType]);
  type DraftProfession = { key: string; profession: string; customProfession?: string; requiredCount: number; unitSalary?: number; sponsorshipType:"dali"|"other"; sponsorName:string; ajirContractStatus:"not_applicable"|"with_ajir"|"without_ajir" };
  type DraftPayment = { key: string; title: string; dueDate: string; percentage: number };
  const [documentType, setDocumentType] = useState(initialType);
  const [selectedSourceRequestId,setSelectedSourceRequestId]=useState("");
  const selectedSourceRequest=requests.find(item=>String(item.id)===selectedSourceRequestId);
  useEffect(()=>{
    if(!selectedSourceRequest)return;
    const form=document.querySelector<HTMLFormElement>('.issue-modal form');if(!form)return;
    const set=(name:string,value:string)=>{const field=form.elements.namedItem(name);if(field instanceof HTMLInputElement||field instanceof HTMLTextAreaElement)field.value=value;};
    set("clientName",selectedSourceRequest.companyName||selectedSourceRequest.fullName);
    set("workSite",selectedSourceRequest.workSite||"");set("details",selectedSourceRequest.details||"");
  },[selectedSourceRequest]);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [professions, setProfessions] = useState<DraftProfession[]>([{ key: "profession-1", profession: workforceProfessions[0].label, customProfession: "", requiredCount: 1, unitSalary: 0, sponsorshipType:"dali", sponsorName:"", ajirContractStatus:"not_applicable" }]);
  const [payments,setPayments]=useState<DraftPayment[]>([{key:"payment-1",title:"الدفعة الأولى",dueDate:"",percentage:100}]);
  // Opening a quote conversion intentionally hydrates the contract wizard state once.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(()=>{if(!initialQuoteId||!convertibleQuotes.length)return;const quote=convertibleQuotes.find(item=>item.id===initialQuoteId);if(!quote)return;setSelectedQuoteId(String(quote.id));setQuantityMode(quote.quantityMode);setSeasonType(quote.seasonType);if(quote.paymentScheduleJson){try{const rows=JSON.parse(quote.paymentScheduleJson) as Array<{title:string;dueDate:string;percentageBps:number}>;setPayments(rows.map((row,index)=>({key:`quote-payment-${index}`,title:row.title,dueDate:row.dueDate,percentage:row.percentageBps/100})))}catch{setPayments([])}}setContractAmount(String(quote.subtotalHalalas/100));setContractVatEnabled(quote.vatRateBps>0);setContractVatRate(String(quote.vatRateBps/100));if(quote.items.length)setProfessions(quote.items.map((item,index)=>({key:`quote-profession-${index}`,profession:item.profession,requiredCount:quote.quantityMode==="open"?0:Math.max(1,item.quantity),unitSalary:(item.unitPriceHalalas||0)/100,sponsorshipType:item.sponsorshipType||"dali",sponsorName:item.sponsorName||"",ajirContractStatus:item.ajirContractStatus||"not_applicable"})));window.setTimeout(()=>{const form=document.querySelector<HTMLFormElement>(".issue-modal form");const field=form?.elements.namedItem("clientName");if(field instanceof HTMLInputElement)field.value=quote.clientName},0)},[initialQuoteId,convertibleQuotes]);
  const [selectedWorkers, setSelectedWorkers] = useState<Record<string, number[]>>({});
  const isContract = documentType === "workforce_contract";
  const capacity = professions.map((item) => {
    const registered = workers.filter((worker) => worker.profession === item.profession).length;
    const available = workers.filter((worker) => worker.profession === item.profession && worker.status === "available").length;
    return { ...item, registered, available, selected: selectedWorkers[item.key]?.length || 0, registeredShortage: Math.max(0, item.requiredCount - registered), availableShortage: Math.max(0, item.requiredCount - available) };
  });
  const totalShortage = capacity.reduce((sum, item) => sum + item.availableShortage, 0);

  function setProfessionValue(key: string, value: string) {
    setProfessions((items) => items.map((item) => item.key === key ? { ...item, profession: value } : item));
    setSelectedWorkers((items) => ({ ...items, [key]: [] }));
  }
  function setProfessionCount(key: string, value: number) {
    const requiredCount = Math.max(1, Math.min(100000, value || 1));
    setProfessions((items) => items.map((item) => item.key === key ? { ...item, requiredCount } : item));
    setSelectedWorkers((items) => ({ ...items, [key]: (items[key] || []).slice(0, requiredCount) }));
  }
  function setProfessionSalary(key: string, value: number) { setProfessions((items) => items.map((item) => item.key === key ? { ...item, unitSalary: Math.max(0, value || 0) } : item)); }
  function setProfessionSponsorship(key:string, value:"dali"|"other") { setProfessions(items=>items.map(item=>item.key===key?{...item,sponsorshipType:value,sponsorName:value==="dali"?"":item.sponsorName,ajirContractStatus:value==="dali"?"not_applicable":item.ajirContractStatus==="not_applicable"?"with_ajir":item.ajirContractStatus}:item)); }
  function setProfessionSponsorName(key:string,value:string){setProfessions(items=>items.map(item=>item.key===key?{...item,sponsorName:value}:item));}
  function setProfessionAjir(key:string,value:"with_ajir"|"without_ajir"){setProfessions(items=>items.map(item=>item.key===key?{...item,ajirContractStatus:value}:item));}
  function setCustomProfession(key: string, value: string) { setProfessions((items) => items.map((item) => item.key === key ? { ...item, customProfession: value } : item)); }
  function addProfession() {
    const used = new Set(professions.map((item) => item.profession));
    const next = workforceProfessions.find((item) => !used.has(item.label));
    if (!next) return;
    setProfessions((items) => [...items, { key: `profession-${Date.now()}`, profession: next.label, customProfession: "", requiredCount: 1, unitSalary: 0, sponsorshipType:"dali", sponsorName:"", ajirContractStatus:"not_applicable" }]);
  }
  function removeProfession(key: string) {
    if (professions.length === 1) return;
    setProfessions((items) => items.filter((item) => item.key !== key));
    setSelectedWorkers((items) => { const next = { ...items }; delete next[key]; return next; });
  }
  function toggleWorker(key: string, workerId: number, maximum: number) {
    setSelectedWorkers((items) => {
      const current = items[key] || [];
      const next = current.includes(workerId) ? current.filter((id) => id !== workerId) : current.length < maximum ? [...current, workerId] : current;
      return { ...items, [key]: next };
    });
  }
  function showContractValidationError(targetStep: 1 | 2 | 3 | 4, message: string, field?: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null) {
    setSubmissionError(message);
    setStep(targetStep);
    window.setTimeout(() => {
      field?.focus();
      field?.reportValidity();
      document.querySelector(".issue-modal")?.scrollTo({ top: 0, behavior: "smooth" });
    }, 0);
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setSubmissionError("");
    if (isContract) {
      const invalidProfession = professions.find((item) =>
        (item.profession === "أخرى" && (item.customProfession || "").trim().length < 2)
        || !Number.isFinite(item.unitSalary) || (item.unitSalary || 0) <= 0
        || (item.sponsorshipType === "other" && ((item.sponsorName || "").trim().length < 2 || !["with_ajir", "without_ajir"].includes(item.ajirContractStatus)))
      );
      if (invalidProfession) {
        showContractValidationError(2, "أكمل المهنة والراتب وجهة الكفالة وحالة عقد أجير لكل مهنة.");
        return;
      }
      if (seasonType !== "regular" && quantityMode === "fixed" && (payments.length === 0 || Math.abs(payments.reduce((sum,item)=>sum+item.percentage,0)-100) >= .01 || payments.some(item=>!item.title.trim()||!item.dueDate||item.percentage<=0))) {
        showContractValidationError(4, "أكمل جدول الدفعات الموسمية واجعل مجموع النسب 100٪.");
        return;
      }
      if (!contractClauses.some((item)=>item.included && item.title.trim() && item.body.trim())) {
        showContractValidationError(4, "يجب إبقاء بند تعاقدي مكتمل واحد على الأقل.");
        return;
      }
    }
    const invalid = Array.from(form.elements).find((element) =>
      (element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement)
      && element.type !== "hidden" && !element.checkValidity()
    ) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | undefined;
    if (invalid) {
      const finalStep = invalid.closest(".contract-final-step");
      showContractValidationError(finalStep ? 4 : 1, invalid.validationMessage || "أكمل الحقول المطلوبة قبل حفظ العقد.", invalid);
      return;
    }
    try {
      await onSubmit(form);
    } catch (error) {
      setSubmissionError(error instanceof Error ? error.message : "تعذّر حفظ العقد. راجع البيانات وحاول مرة أخرى.");
      document.querySelector(".issue-modal")?.scrollTo({ top: 0, behavior: "smooth" });
    }
  }
  function validateAndSetStep(target: 1 | 2 | 3 | 4) {
    if (target <= step) { setStep(target); return; }
    if (target > step + 1) return;
    const form = document.querySelector<HTMLFormElement>(".issue-modal form");
    const requiredFields = form ? Array.from(form.querySelectorAll("input[required], select[required], textarea[required]")).filter((field) => field instanceof HTMLElement && (!(field instanceof HTMLInputElement) || field.type !== "hidden") && field.offsetParent !== null) as Array<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement> : [];
    const invalid = requiredFields.find((field) => !field.checkValidity());
    if (invalid) { invalid.reportValidity(); invalid.focus(); return; }
    if (step === 1 && seasonType === "regular" && !annualEndDate) {
      const start = form?.elements.namedItem("startDate");
      if (start instanceof HTMLInputElement) { start.setCustomValidity("حدد تاريخ بداية العقد ليحسب النظام تاريخ النهاية السنوي."); start.reportValidity(); start.setCustomValidity(""); start.focus(); }
      return;
    }
    setStep(target);
  }

  function changeContractDirection(value:WorkforceContractDirection){setContractDirection(value);setContractClauses(defaultWorkforceContractClauses(value).map((item,index)=>({...item,key:`clause-${Date.now()}-${index}`})));}
  function updateContractClause(key:string,field:keyof WorkforceContractClause,value:string|boolean){setContractClauses(items=>items.map(item=>item.key===key?{...item,[field]:value}:item));}
  function addContractClause(){setContractClauses(items=>[...items,{key:`clause-${Date.now()}`,section:"بنود إضافية",sectionEn:"Additional Terms",title:"",titleEn:"",body:"",bodyEn:"",included:true}]);}
  async function translateContractClauses(){const active=contractClauses.filter(item=>item.included);if(!active.length)return;setTranslatingClauses(true);try{const values=active.flatMap(item=>[item.section,item.title,item.body]);const response=await fetch("/api/portal/translate",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({values})});const result=await readApiJson(response) as {translated?:string[];error?:string};if(!response.ok||!result.translated)throw new Error(result.error||"تعذرت الترجمة");let cursor=0;const translatedByKey=new Map(active.map(item=>[item.key,{sectionEn:result.translated![cursor++],titleEn:result.translated![cursor++],bodyEn:result.translated![cursor++]}]));setContractClauses(items=>items.map(item=>({...item,...translatedByKey.get(item.key)})));}catch(error){window.alert(error instanceof Error?error.message:"تعذرت الترجمة")}finally{setTranslatingClauses(false)}}

  function applyQuote(event: React.ChangeEvent<HTMLSelectElement>){const id=event.target.value;setSelectedQuoteId(id);const quote=convertibleQuotes.find(item=>String(item.id)===id);if(!quote)return;setQuantityMode(quote.quantityMode);setSeasonType(quote.seasonType);if(quote.paymentScheduleJson){try{const rows=JSON.parse(quote.paymentScheduleJson) as Array<{title:string;dueDate:string;percentageBps:number}>;setPayments(rows.map((row,index)=>({key:`quote-payment-${index}`,title:row.title,dueDate:row.dueDate,percentage:row.percentageBps/100})))}catch{setPayments([])}}else setPayments([]);setContractAmount(String(quote.subtotalHalalas/100));setContractVatEnabled(quote.vatRateBps>0);setContractVatRate(String(quote.vatRateBps/100));if(quote.items.length)setProfessions(quote.items.map((item,index)=>({key:`quote-profession-${index}`,profession:item.profession,requiredCount:quote.quantityMode==="open"?0:Math.max(1,item.quantity),unitSalary:(item.unitPriceHalalas||0)/100,sponsorshipType:item.sponsorshipType||"dali",sponsorName:item.sponsorName||"",ajirContractStatus:item.ajirContractStatus||"not_applicable"})));window.setTimeout(()=>{const form=event.target.form;if(!form)return;const client=form.elements.namedItem("clientName");if(client instanceof HTMLInputElement)client.value=quote.clientName;},0);}
  const annualSchedule = seasonType === "regular" ? annualContractSchedule(contractStartDate) : null;
  const annualEndDate = annualSchedule?.endDate || "";
  const annualMonthlySubtotalHalalas = professions.reduce((sum, item) => sum + (quantityMode === "fixed" ? item.requiredCount : 0) * Math.round((item.unitSalary || 0) * 100), 0);
  const annualVatRateBps = contractVatEnabled ? Math.round((Number(contractVatRate) || 0) * 100) : 0;
  const annualMonthlyVatHalalas = Math.round(annualMonthlySubtotalHalalas * annualVatRateBps / 10000);
  const annualPercentages = annualInstallmentPercentages(ANNUAL_CONTRACT_MONTHS);
  const annualInstallments = Array.from({ length: ANNUAL_CONTRACT_MONTHS }, (_, index) => ({ number: index + 1, dueDate: annualSchedule?.dueDates[index] || "", percentageBps: annualPercentages[index], subtotalHalalas: annualMonthlySubtotalHalalas, vatHalalas: annualMonthlyVatHalalas, amountHalalas: annualMonthlySubtotalHalalas + annualMonthlyVatHalalas }));
  const serializedProfessions = JSON.stringify(professions.map((item) => ({ profession: item.profession === "أخرى" ? (item.customProfession || "").trim() : item.profession, requiredCount: quantityMode==="open"?0:item.requiredCount, unitSalary:item.unitSalary || 0, sponsorshipType:item.sponsorshipType, sponsorName:item.sponsorshipType==="other"?item.sponsorName:null, ajirContractStatus:item.sponsorshipType==="dali"?"not_applicable":item.ajirContractStatus, workerIds: quantityMode==="open"?[]:(selectedWorkers[item.key] || []) })));
  const serializedPayments=JSON.stringify(quantityMode==="open"?[]:payments.map(({title,dueDate,percentage})=>({title,dueDate,percentage})));
  const serializedClauses=JSON.stringify(contractClauses.map(({section,sectionEn,title,titleEn,body,bodyEn,included})=>({section,sectionEn,title,titleEn,body,bodyEn,included})));
  return <div className="modal-layer"><button className="drawer-backdrop" aria-label="إغلاق نافذة إصدار المستند" onClick={onClose}/><section className="record-modal document-modal issue-modal" role="dialog" aria-modal="true" aria-label="إنشاء ملف PDF رسمي"><div className="drawer-head"><div><span>الإصدار الرسمي</span><h2>{isContract ? "إنشاء عقد توفير عمالة" : "إنشاء ملف PDF"}</h2></div><button onClick={onClose} aria-label="إغلاق"><Icon name="close"/></button></div>
    {!assetsReady && <div className="asset-required"><Icon name="stamp"/><p><strong>الختم والتوقيع غير مكتملين</strong><span>يجب أن يرفع مدير النظام الأصلين المعتمدين قبل الإصدار.</span></p></div>}
    <form className={`contract-quantity-${quantityMode}`} onSubmit={submit} noValidate>
      {submissionError&&<div className="contract-save-error span-two" role="alert"><strong>تعذّر حفظ العقد</strong><span>{submissionError}</span></div>}
      <div className="document-type-control span-two"><label>نوع المستند<select name="documentType" value={documentType} onChange={(event) => { setDocumentType(event.target.value); setStep(1); }}><option value="workforce_contract">عقد مقاولات لتوفير العمالة</option><option value="progress_claim">مستخلص أعمال</option><option value="invoice">فاتورة</option><option value="receipt">سند قبض</option><option value="payment_voucher">سند صرف</option></select></label><small>اختر نوع المستند أولًا، ثم أكمل البيانات والخطوات الخاصة به.</small></div>
      {isContract && <div className="contract-wizard-steps span-two"><button type="button" className={step === 1 ? "active" : "done"} onClick={() => validateAndSetStep(1)}>1 بيانات العقد</button><button type="button" className={step === 2 ? "active" : step > 2 ? "done" : ""} onClick={() => validateAndSetStep(2)}>2 المهن والأعداد</button><button type="button" className={step === 3 ? "active" : step > 3 ? "done" : ""} onClick={() => validateAndSetStep(3)}>3 اختيار العمالة</button><button type="button" className={step === 4 ? "active" : ""} onClick={() => validateAndSetStep(4)}>4 الدفعات والمرفقات</button></div>}
      <input type="hidden" name="professions" value={serializedProfessions}/>
      <input type="hidden" name="paymentSchedule" value={serializedPayments}/>
      <input type="hidden" name="quantityMode" value={quantityMode}/>
      <input type="hidden" name="quoteVersionId" value={selectedQuoteId}/>
      {isContract&&<><input type="hidden" name="contractDirection" value={contractDirection}/><input type="hidden" name="contractClauses" value={serializedClauses}/></>}
      {isContract&&<input type="hidden" name="seasonType" value={seasonType}/>}
      {isContract&&step===1&&<div className="contract-billing-controls span-two"><label>نوع التعاقد<select value={seasonType} onChange={event=>setSeasonType(event.target.value as "regular"|"ramadan"|"hajj")}><option value="regular">عقود سنوية بدفعات شهرية</option><option value="ramadan">موسم رمضان — دفعات بالنسب</option><option value="hajj">موسم الحج — دفعات بالنسب</option></select></label>{seasonType==="regular"&&<div className="billing-mode-summary success"><b>موعد أول دفعة تلقائي</b><span>تستحق بعد شهر كامل من بداية العقد، ثم تتكرر الدفعات شهريًا.</span></div>}<p className="form-hint span-two">في العقود السنوية يحسب النظام تاريخ النهاية و12 دفعة شهرية من تاريخ البداية. في الحج ورمضان تُستخدم نسب جدول الدفعات ويجب أن يكون مجموعها 100٪.</p></div>}
      <div className={`issue-form-step span-two ${!isContract || step === 1 ? "visible" : ""}`}>
        
        {isContract&&<><label className="span-two">اتجاه عقد العمالة<select value={contractDirection} onChange={event=>changeContractDirection(event.target.value as WorkforceContractDirection)} disabled={Boolean(selectedQuoteId)}><option value="dali_supplier">دالي مورّد العمالة — عقد إيراد مع عميل</option><option value="dali_purchaser">دالي مشتري العمالة — عقد تكلفة مع مورّد</option></select><small>يغير صفات الأطراف والبنود ومسار الدفعات والمحاسبة تلقائياً.</small></label>{contractDirection==="dali_supplier"&&<label className="span-two">عرض السعر المرتبط<select value={selectedQuoteId} onChange={applyQuote}><option value="">عقد مباشر — دون عرض سعر</option>{convertibleQuotes.map(quote=><option key={quote.id} value={quote.id}>{quote.quoteCode} — {quote.title} — {quote.quantityMode==="open"?"عدد مفتوح":"عدد محدد"}</option>)}</select></label>}{contractDirection==="dali_purchaser"&&<label className="span-two">طلب مندوب المشتريات المعتمد<select name="representativeRequestId" defaultValue=""><option value="">عقد شراء مباشر</option>{representativeRequests.filter(item=>item.requestType==="purchase").map(item=><option value={item.id} key={item.id}>{item.requestCode} — {item.title}</option>)}</select></label>}<label className="span-two">نطاق العدد<select value={quantityMode} onChange={event=>setQuantityMode(event.target.value as "fixed"|"open")} disabled={Boolean(selectedQuoteId)}><option value="fixed">عدد محدد — قيمة وجدول دفعات وضريبة</option><option value="open">عدد مفتوح — دون قيمة إجمالية، والضريبة عند الفوترة</option></select></label><label>مصدر العميل<select name="sourceRequestId" value={selectedSourceRequestId} onChange={event=>setSelectedSourceRequestId(event.target.value)} disabled={contractDirection==="dali_purchaser"}><option value="">{contractDirection==="dali_purchaser"?"مورّد مباشر أو طلب مندوب مشتريات":"عميل مباشر — غير قادم من الموقع"}</option>{requests.map(request=><option key={request.id} value={request.id}>{request.trackingCode} — {request.companyName||request.fullName}</option>)}</select><small>تُعبأ بيانات الطلب تلقائياً ويمكن تعديلها.</small></label><label>{contractDirection==="dali_purchaser"?"مندوب المشتريات المسؤول":"مندوب المبيعات المسؤول"}<select name="salesRepresentativeId" defaultValue=""><option value="">دون مندوب</option>{representatives.filter(item=>item.representativeType===(contractDirection==="dali_purchaser"?"purchasing":"sales")).map(item=><option key={item.id} value={item.id}>{item.representativeCode} — {item.fullName}</option>)}</select></label></>}
        <label>تاريخ الإصدار<input name="issueDate" required type="date" defaultValue={new Date().toISOString().slice(0, 10)}/></label><label>{isContract&&contractDirection==="dali_purchaser"?"اسم مورّد العمالة":"اسم العميل أو الجهة"}<input name="clientName" required maxLength={160}/></label><label>{isContract&&contractDirection==="dali_purchaser"?"السجل التجاري للمورّد":"السجل التجاري للعميل"}<input name="clientCr" required={isContract} maxLength={30} dir="ltr" placeholder={isContract ? "إلزامي للعقد" : "اختياري"}/></label><label>{isContract&&contractDirection==="dali_purchaser"?"الرقم الضريبي للمورّد":"الرقم الضريبي للعميل"}<input name="clientVat" required={isContract} maxLength={30} dir="ltr" placeholder={isContract ? "إلزامي للعقد" : "مطلوب عند تفعيل الضريبة"}/></label>{isContract&&<label className="span-two">{contractDirection==="dali_purchaser"?"العنوان الوطني للمورّد":"العنوان الوطني للعميل"}<input name="clientAddress" required maxLength={240} placeholder="العنوان الوطني المسجل للجهة المتعاقدة"/></label>}{!isContract&&<>{quantityMode==="fixed"&&<label>قيمة الخدمة قبل الضريبة<input name="amount" required type="number" min="0.01" max="1000000000" step="0.01" dir="ltr"/></label>}<label>تطبيق ضريبة القيمة المضافة<select name="vatEnabled" defaultValue="true"><option value="false">بدون ضريبة</option><option value="true">تطبيق الضريبة</option></select></label><label>نسبة الضريبة %<input name="vatRate" type="number" min="0" max="100" step="0.01" defaultValue="15" dir="ltr"/></label></>}
        {isContract ? <><label>موقع العمل<input name="workSite" required maxLength={180}/></label><label>بداية العقد<input name="startDate" required type="date" value={contractStartDate} onChange={event=>setContractStartDate(event.target.value)}/></label>{seasonType==="regular"?<div className="annual-contract-period"><span>مدة العقد السنوي</span><strong>{annualEndDate?formatDate(annualEndDate):"تُحسب بعد تحديد تاريخ البداية"}</strong><small>يحسب النظام تاريخ النهاية تلقائيًا بعد 12 شهرًا ويظهره في العقد وملف PDF.</small></div>:<label>نهاية العقد<input name="endDate" required type="date"/></label>}</> : <><label>{documentType === "quotation" ? "صلاحية العرض حتى" : "تاريخ الاستحقاق / الانتهاء"}<input name="expiryDate" type="date" required={documentType === "quotation"}/></label>{["invoice", "receipt", "payment_voucher", "progress_claim"].includes(documentType) && <label className="span-two">العقد المرتبط<select name="linkedContractId" defaultValue=""><option value="">دون عقد محدد</option>{contracts.map((contract) => <option value={contract.id} key={contract.id}>{contract.referenceCode} — {contract.clientName}</option>)}</select></label>}</>}
        <label className="span-two">التفاصيل والشروط<textarea name="details" required minLength={5} maxLength={4000} rows={6} placeholder={isContract ? "اكتب نطاق العمل، ساعات العمل، الالتزامات، وآلية الدفع..." : "اكتب بنود المستند وتفاصيل المبلغ والخدمة..."}/></label>
      </div>

      {isContract && <div className={`issue-form-step span-two ${step === 2 ? "visible" : ""}`}><div className="profession-builder-head"><div><strong>المهن المطلوبة في العقد</strong><small>يمكن إضافة أكثر من مهنة، ولكل مهنة عدد مستقل. اكتب داخل حقل المهنة للبحث السريع.</small></div><button type="button" onClick={addProfession} disabled={professions.length >= workforceProfessions.length}><Icon name="plus"/> إضافة مهنة</button></div><div className="profession-builder">{capacity.map((item) => <article key={item.key}><label>المهنة<SearchableCombobox name={`profession_${item.key}`} value={item.profession} options={workforceProfessions.map((option) => option.label).filter((label) => label === item.profession || !professions.some((other) => other.key !== item.key && other.profession === label))} onChange={(value) => setProfessionValue(item.key, value)} placeholder="ابحث عن المهنة" required/></label><label>العدد المطلوب<input type="number" min="1" max="100000" value={item.requiredCount} onChange={(event) => setProfessionCount(item.key, Number(event.target.value))}/></label><div><span><b>{item.available}</b> متاح</span><span><b>{item.registered}</b> مسجل</span></div><p className={item.registeredShortage || item.availableShortage ? "shortage" : "ready"}>{item.registeredShortage ? `أقل من المطلوب في السجلات بفارق ${item.registeredShortage}` : item.availableShortage ? `عجز تشغيلي حالي: ${item.availableShortage}` : "العدد متاح حالياً"}</p>{professions.length > 1 && <button className="remove-profession" type="button" onClick={() => removeProfession(item.key)}>حذف</button>}</article>)}</div><p className="form-hint">وجود عجز لا يمنع إنشاء العقد؛ سيظهر التنبيه ويظل استكمال العمالة متاحاً لاحقاً.</p></div>}

      {isContract && step === 2 && <div className="contract-profession-pricing span-two"><div className="profession-builder-head"><div><strong>الراتب والمهنة المخصصة</strong><small>راتب العامل الشهري إلزامي لكل مهنة حتى في العقد مفتوح العدد، ويُستخدم عند احتساب الفواتير الفعلية.</small></div></div><div className="profession-builder">{professions.map((item)=><article key={`pricing-${item.key}`}>{item.profession==="أخرى"&&<label>اكتب المهنة يدوياً<input required minLength={2} maxLength={120} value={item.customProfession||""} onChange={event=>setCustomProfession(item.key,event.target.value)} placeholder="مثال: فني مضخات"/></label>}<label>راتب العامل الشهري (ريال)<input required type="number" min="0.01" max="1000000" step="0.01" value={item.unitSalary||""} onChange={event=>setProfessionSalary(item.key,Number(event.target.value))}/></label><label>جهة الكفالة<select value={item.sponsorshipType} onChange={event=>setProfessionSponsorship(item.key,event.target.value as "dali"|"other")} disabled={Boolean(selectedQuoteId)}><option value="dali">على كفالة شركة دالي</option><option value="other">على كفالة جهة أخرى</option></select></label>{item.sponsorshipType==="other"&&<label>اسم الكفيل<input required minLength={2} maxLength={160} value={item.sponsorName} onChange={event=>setProfessionSponsorName(item.key,event.target.value)} readOnly={Boolean(selectedQuoteId)}/></label>}<label>حالة عقد أجير<select required={item.sponsorshipType==="other"} value={item.ajirContractStatus} onChange={event=>setProfessionAjir(item.key,event.target.value as "with_ajir"|"without_ajir")} disabled={Boolean(selectedQuoteId)||item.sponsorshipType==="dali"}>{item.sponsorshipType==="dali"?<option value="not_applicable">لا ينطبق — العامل على كفالة دالي</option>:<><option value="with_ajir">بعقد أجير</option><option value="without_ajir">بدون عقد أجير</option></>}</select><small>{item.sponsorshipType==="dali"?"يصبح اختيار أجير متاحًا عند اختيار كفالة جهة أخرى.":"حدد بوضوح هل توفير العامل مرتبط بعقد أجير."}</small></label><p>{item.profession==="أخرى"?(item.customProfession||"مهنة أخرى"):item.profession} · {quantityMode==="open"?"عدد مفتوح":`${item.requiredCount} عامل`} · {formatMoney(Math.round((item.unitSalary||0)*100))} للعامل/شهر</p></article>)}</div></div>}

      {isContract && <div className={`issue-form-step span-two ${step === 3 ? "visible" : ""}`}><div className="selection-intro"><strong>اختيار العمالة المتاحة</strong><p>اختيار الأسماء اختياري. يمكنك تخطي هذه الخطوة وإنشاء العقد ثم إضافة العمالة لاحقاً.</p></div><div className="worker-selection-groups">{capacity.map((item) => { const candidates = workers.filter((worker) => worker.profession === item.profession && worker.status === "available" && sponsorshipMatches(worker, item)); const selected = selectedWorkers[item.key] || []; return <section key={item.key}><header><div><strong>{item.profession}</strong><small>مطلوب {item.requiredCount} · مختار {selected.length}</small></div><span className={selected.length === item.requiredCount ? "complete" : ""}>{item.requiredCount - selected.length} متبقٍ</span></header><div>{candidates.length ? candidates.map((worker) => <label key={worker.id} className={selected.includes(worker.id) ? "selected" : ""}><input type="checkbox" checked={selected.includes(worker.id)} disabled={!selected.includes(worker.id) && selected.length >= item.requiredCount} onChange={() => toggleWorker(item.key, worker.id, item.requiredCount)}/><span>{initials(worker.fullName)}</span><p><strong>{worker.fullName}</strong><small>{worker.workerNumber} · إقامة {worker.iqamaNumber || "غير مسجلة"} · {sponsorshipLabel(worker)}</small></p></label>) : <p className="empty-operational">لا توجد عمالة متاحة بهذه المهنة حالياً.</p>}</div></section>; })}</div>{totalShortage > 0 && <div className="contract-shortage-summary"><Icon name="bell"/><p><strong>يمكن إصدار العقد رغم العجز</strong><span>إجمالي العجز التشغيلي الحالي {totalShortage} عامل عبر المهن المطلوبة.</span></p></div>}</div>}

      {isContract&&<div className={`issue-form-step contract-final-step span-two ${step===4?"visible":""}`}>
        <section className="contract-final-card payment-plan-card">
          <header className="contract-final-heading"><span><Icon name="finance"/></span><div><strong>خطة الفوترة والدفعات</strong><p>{quantityMode==="open"?"تُحسب القيمة والضريبة عند إصدار كل فاتورة حسب العمالة الفعلية.":seasonType==="regular"?"ينشئ النظام الدفعات الشهرية الاثنتي عشرة تلقائياً من رواتب المهن، وتُثبت مواعيدها عند اعتماد العقد.":"وزّع قيمة العقد على دفعات موسمية؛ يجب أن يكون مجموع النسب 100% قبل الإصدار."}</p></div></header>
          <div className="contract-tax-fields">
            {quantityMode==="fixed"&&seasonType!=="regular"&&<label>قيمة العقد قبل الضريبة<input name="amount" required type="number" min="0.01" max="1000000000" step="0.01" dir="ltr" value={contractAmount} onChange={event=>setContractAmount(event.target.value)} readOnly={Boolean(selectedQuoteId)}/><small>{selectedQuoteId?"القيمة مطابقة لعرض السعر المرتبط":"تُوزّع هذه القيمة على الدفعات أدناه"}</small></label>}
            {selectedQuoteId&&<input type="hidden" name="vatEnabled" value={contractVatEnabled?"true":"false"}/>}<label>{quantityMode==="open"?"الضريبة عند الفوترة الفعلية":"تطبيق ضريبة القيمة المضافة"}<select name={selectedQuoteId?undefined:"vatEnabled"} value={contractVatEnabled?"true":"false"} onChange={event=>setContractVatEnabled(event.target.value==="true")} disabled={Boolean(selectedQuoteId)}><option value="false">بدون ضريبة</option><option value="true">تطبيق الضريبة</option></select></label>
            {contractVatEnabled&&<label>نسبة الضريبة %<input name="vatRate" required type="number" min="0.01" max="100" step="0.01" dir="ltr" value={contractVatRate} onChange={event=>setContractVatRate(event.target.value)} readOnly={Boolean(selectedQuoteId)}/></label>}
            {!contractVatEnabled&&<input type="hidden" name="vatRate" value="0"/>}
            {quantityMode==="fixed"&&seasonType==="regular"&&<div className="calculated-contract-value"><strong>قيمة محسوبة تلقائياً</strong><span>عدد العمال × راتب العامل × 12 شهرًا، وتبدأ الدفعة الأولى بعد شهر من بداية العقد.</span></div>}
          </div>
          {quantityMode==="open"?<div className="billing-mode-summary neutral"><b>عقد بعدد مفتوح</b><span>لا تُطلب قيمة إجمالية أو نسب دفعات عند الإنشاء.</span></div>:seasonType==="regular"?<div className="annual-payment-plan"><div className="annual-payment-summary"><div><span>قيمة الدفعة الشهرية</span><strong>{formatMoney(annualMonthlySubtotalHalalas+annualMonthlyVatHalalas)}</strong><small>{contractVatEnabled?`تشمل ضريبة ${Number(contractVatRate)||0}%` : "بدون ضريبة"}</small></div><div><span>إجمالي السنة</span><strong>{formatMoney((annualMonthlySubtotalHalalas+annualMonthlyVatHalalas)*ANNUAL_CONTRACT_MONTHS)}</strong><small>{ANNUAL_CONTRACT_MONTHS} دفعة شهرية متساوية</small></div></div><div className="annual-payment-installments">{annualInstallments.map(installment=><article key={installment.number}><span>{installment.number}</span><div><strong>الدفعة الشهرية {installment.number}</strong><small>{installment.dueDate?`تستحق في ${installment.dueDate}`:`بعد ${installment.number} شهر من بداية العقد`}</small></div><b>{formatMoney(installment.amountHalalas)}</b></article>)}</div><p>يحسب النظام تاريخ كل دفعة من بداية العقد، ثم يعكس الدفعات كاملة في المالية وملف PDF.</p></div>:<>
            <div className="payment-total-bar"><div><span>إجمالي التوزيع</span><strong>{payments.reduce((sum,item)=>sum+item.percentage,0).toFixed(2)}%</strong></div><meter min="0" max="100" value={Math.min(100,payments.reduce((sum,item)=>sum+item.percentage,0))}/><span className={Math.abs(payments.reduce((sum,item)=>sum+item.percentage,0)-100)<.01?"complete":"incomplete"}>{Math.abs(payments.reduce((sum,item)=>sum+item.percentage,0)-100)<.01?"مكتمل وجاهز":"يجب إكمال المجموع إلى 100٪"}</span></div>
            <div className="contract-payment-builder">{payments.map((payment,index)=><article key={payment.key}><span className="payment-index">{index+1}</span><label>اسم الدفعة<input required value={payment.title} onChange={event=>setPayments(items=>items.map(item=>item.key===payment.key?{...item,title:event.target.value}:item))} placeholder="مثال: الدفعة المقدمة"/></label><label>تاريخ الاستحقاق<input required type="date" value={payment.dueDate} onChange={event=>setPayments(items=>items.map(item=>item.key===payment.key?{...item,dueDate:event.target.value}:item))}/></label><label>النسبة من العقد<input required type="number" min="0.01" max="100" step="0.01" value={payment.percentage} onChange={event=>setPayments(items=>items.map(item=>item.key===payment.key?{...item,percentage:Number(event.target.value)}:item))}/><i>%</i></label>{payments.length>1&&<button className="remove-payment" type="button" onClick={()=>setPayments(items=>items.filter(item=>item.key!==payment.key))} aria-label={`حذف الدفعة ${index+1}`}>حذف</button>}</article>)}</div>
            <button className="add-payment-button" type="button" onClick={()=>setPayments(items=>[...items,{key:`payment-${Date.now()}`,title:`الدفعة ${items.length+1}`,dueDate:new Date().toISOString().slice(0,10),percentage:0}])}><Icon name="plus"/> إضافة دفعة جديدة</button>
          </>}
        </section>
        <section className="contract-final-card contract-clauses-card span-two">
          <header className="contract-final-heading"><span><Icon name="documents"/></span><div><strong>بنود العقد القابلة للتحرير</strong><p>البنود الأساسية أضيفت وفق اتجاه العقد. يمكنك تعديلها أو حذفها أو إضافة بند في أي قسم، مع النص الإنجليزي المقابل للنسخة الثنائية.</p></div><div><button type="button" className="admin-secondary" disabled={translatingClauses} onClick={()=>void translateContractClauses()}>{translatingClauses?"جارٍ الترجمة...":"ترجمة الإنجليزية"}</button><button type="button" className="admin-secondary" onClick={addContractClause}>+ إضافة بند</button></div></header>
          <div className="contract-clause-editor">{contractClauses.map((clause,index)=><article key={clause.key} className={!clause.included?"excluded":""}><header><b>البند {index+1}</b><label><input type="checkbox" checked={clause.included} onChange={event=>updateContractClause(clause.key,"included",event.target.checked)}/> تضمين في العقد</label><button type="button" onClick={()=>setContractClauses(items=>items.filter(item=>item.key!==clause.key))}>حذف</button></header><div><label>القسم بالعربية<input required={clause.included} value={clause.section} onChange={event=>updateContractClause(clause.key,"section",event.target.value)}/></label><label>Section in English<input required={false} dir="ltr" value={clause.sectionEn||""} onChange={event=>updateContractClause(clause.key,"sectionEn",event.target.value)}/></label><label>عنوان البند بالعربية<input required={clause.included} value={clause.title} onChange={event=>updateContractClause(clause.key,"title",event.target.value)}/></label><label>Clause title in English<input required={false} dir="ltr" value={clause.titleEn||""} onChange={event=>updateContractClause(clause.key,"titleEn",event.target.value)}/></label><label className="span-two">نص البند بالعربية<textarea required={clause.included} rows={3} value={clause.body} onChange={event=>updateContractClause(clause.key,"body",event.target.value)}/></label><label className="span-two">English clause text<textarea required={false} dir="ltr" rows={3} value={clause.bodyEn||""} onChange={event=>updateContractClause(clause.key,"bodyEn",event.target.value)}/></label></div></article>)}</div>
          <p className="form-hint">بيانات الكفالة وحالة أجير تشغيلية داخلية ولا تظهر في PDF. بند النظام والاختصاص يدرج آلياً فقط إذا كانت جميع عمالة العقد بعقود أجير.</p>
        </section>
        <section className="contract-final-card attachments-card">
          <header className="contract-final-heading"><span><Icon name="documents"/></span><div><strong>مستندات العميل الإلزامية</strong><p>PDF أو JPG أو PNG. تُحفظ الملفات تلقائياً داخل ملف العميل وتبقى مرتبطة بالعقد.</p></div><b>3 ملفات مطلوبة</b></header>
          <div className="client-document-files"><label><span><Icon name="documents"/></span><strong>السجل التجاري</strong><small>نسخة سارية وواضحة</small><em>إلزامي</em><input required name="commercialRegistrationFile" type="file" accept="application/pdf,image/jpeg,image/png"/></label><label><span><Icon name="documents"/></span><strong>الشهادة الضريبية</strong><small>شهادة التسجيل في ضريبة القيمة المضافة</small><em>إلزامي</em><input required name="vatCertificateFile" type="file" accept="application/pdf,image/jpeg,image/png"/></label><label><span><Icon name="documents"/></span><strong>العنوان الوطني</strong><small>إثبات العنوان الوطني للمنشأة</small><em>إلزامي</em><input required name="nationalAddressFile" type="file" accept="application/pdf,image/jpeg,image/png"/></label></div>
          <div className="attachment-save-note"><Icon name="check"/><p><strong>حفظ وربط تلقائي</strong><span>عند إصدار العقد يُنشأ ملف العميل أو يُحدّث، وتصبح المستندات قابلة للمعاينة والتنزيل والمشاركة.</span></p></div>
        </section>
      </div>}

      <p className="form-hint span-two">سيُنشأ رقم مرجعي تلقائي، ويُحفظ الملف في المركز، ويُدرج الختم والتوقيع المعتمدان في النسخة الصادرة.</p><div className="modal-actions span-two">{isContract && step > 1 ? <button type="button" onClick={() => setStep((step - 1) as 1 | 2 | 3)}>السابق</button> : <button type="button" onClick={onClose}>إلغاء</button>}{isContract && step < 4 ? <button className="admin-primary" type="button" onClick={() => validateAndSetStep((step + 1) as 2 | 3 | 4)}>التالي</button> : <button className="admin-primary" type="submit" disabled={busy || !assetsReady || (isContract&&quantityMode==="fixed"&&seasonType!=="regular"&&Math.abs(payments.reduce((sum,item)=>sum+item.percentage,0)-100)>0.001)}>{busy ? "جارٍ الإصدار..." : isContract && totalShortage ? "إصدار العقد رغم العجز" : "إصدار واعتماد PDF"}</button>}</div>
    </form>
  </section></div>;
}
function StatusControl({ entity, id, value, canWrite, busy, onStatus }: { entity: RecordEntity; id: number; value: string; canWrite: boolean; busy: string | null; onStatus: (id: number, status: string) => void }) {
  if (!canWrite) return <span className={`status-pill ${statusClass(value)}`}>{recordStatus[entity][value] ?? value}</span>;
  return <select className="status-select" value={value} disabled={busy === `${entity}-${id}`} onChange={(event) => onStatus(id, event.target.value)}>{Object.entries(recordStatus[entity]).map(([status, label]) => <option value={status} key={status}>{label}</option>)}</select>;
}
function EmptyRows({ label }: { label: string }) { return <div className="empty-table"><span>⌁</span><strong>لا توجد سجلات بعد</strong><p>{label}</p></div>; }
function filterRecords<T>(records: T[], query: string) { const needle = query.trim().toLowerCase(); return needle ? records.filter((item) => JSON.stringify(item).toLowerCase().includes(needle)) : records; }

function EmployeeTable({ records, query, canWrite, busy, onStatus, onUpdate, onDelete }: { records: EmployeeRecord[]; query: string; canWrite: boolean; busy: string | null; onStatus: (id: number, status: string) => void; onUpdate: (id: number, data: Record<string, string>) => Promise<void>; onDelete: (id: number) => Promise<void> }) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const rows = filterRecords(records, query); if (!rows.length) return <EmptyRows label="أضف أول ملف موظف ليظهر هنا."/>;
  return <div className="management-table-wrap"><table className="management-table employee-compliance-table"><thead><tr><th>الموظف</th><th>المسمى والإدارة</th><th>جهة الكفالة</th><th>انتهاء الإقامة</th><th>انتهاء العقد</th><th>انتهاء رخصة العمل</th><th>الحالة</th><th>الإجراءات</th></tr></thead><tbody>{rows.map((item) => <Fragment key={item.id}><tr><td><strong>{item.fullName}</strong><small dir="ltr">{item.employeeNumber} · {item.mobile}</small></td><td><strong>{item.jobTitle}</strong><small>{item.department}</small></td><td><strong>{item.sponsorshipType === "dali" ? "على كفالة دالي" : "كفالة أخرى"}</strong><small>{item.sponsorName || "شركة دالي"}</small></td><td className={daysUntil(item.iqamaExpiry) < 29 ? "date-alert" : ""}>{formatDate(item.iqamaExpiry)}</td><td className={item.contractEndDate && daysUntil(item.contractEndDate) < 29 ? "date-alert" : ""}>{item.sponsorshipType === "dali" ? formatDate(item.contractEndDate) : "غير مطلوب"}</td><td className={item.workPermitExpiry && daysUntil(item.workPermitExpiry) < 29 ? "date-alert" : ""}>{item.sponsorshipType === "dali" ? formatDate(item.workPermitExpiry) : "غير مطلوب"}</td><td><StatusControl entity="employees" id={item.id} value={item.status} canWrite={canWrite} busy={busy} onStatus={onStatus}/></td><td><div className="employee-row-actions">{canWrite&&<><button onClick={()=>setEditingId(editingId===item.id?null:item.id)}>تحديث</button><button className="danger-action" disabled={busy===`employee-delete-${item.id}`} onClick={()=>void onDelete(item.id)}>{busy===`employee-delete-${item.id}`?"جارٍ الحذف":"حذف"}</button></>}</div></td></tr>{editingId===item.id&&<tr className="employee-editor-row"><td colSpan={8}><EmployeeComplianceEditor employee={item} busy={busy===`employee-update-${item.id}`} onCancel={()=>setEditingId(null)} onSave={async data=>{await onUpdate(item.id,data);setEditingId(null)}}/></td></tr>}</Fragment>)}</tbody></table></div>;
}

function EmployeeComplianceEditor({ employee, busy, onCancel, onSave }: { employee: EmployeeRecord; busy: boolean; onCancel: () => void; onSave: (data: Record<string, string>) => Promise<void> }) {
  const [sponsorshipType,setSponsorshipType]=useState<"dali"|"other">(employee.sponsorshipType==="other"?"other":"dali");
  return <form className="employee-compliance-editor" onSubmit={event=>{event.preventDefault();const form=new FormData(event.currentTarget);void onSave(Object.fromEntries([...form.entries()].map(([key,value])=>[key,String(value)])))} }><label>اسم الموظف<input name="fullName" required minLength={2} maxLength={120} defaultValue={employee.fullName}/></label><label>المسمى الوظيفي<input name="jobTitle" required maxLength={100} defaultValue={employee.jobTitle}/></label><label>الإدارة أو القسم<input name="department" required maxLength={100} defaultValue={employee.department}/></label><label>رقم الجوال<input name="mobile" required type="tel" maxLength={20} defaultValue={employee.mobile} dir="ltr"/></label><label>البريد الوظيفي<input name="email" type="email" maxLength={160} defaultValue={employee.email||""} dir="ltr"/></label><label>جهة الكفالة<select name="sponsorshipType" value={sponsorshipType} onChange={event=>setSponsorshipType(event.target.value as "dali"|"other")}><option value="dali">على كفالة دالي</option><option value="other">أخرى</option></select></label>{sponsorshipType==="other"?<label>اسم جهة الكفالة<input name="sponsorName" required minLength={2} maxLength={160} defaultValue={employee.sponsorName||""}/></label>:<><label>انتهاء عقد العمل<input name="contractEndDate" type="date" required defaultValue={employee.contractEndDate||""}/></label><label>انتهاء رخصة العمل<input name="workPermitExpiry" type="date" required defaultValue={employee.workPermitExpiry||""}/></label></>}<label>انتهاء الإقامة<input name="iqamaExpiry" type="date" required defaultValue={employee.iqamaExpiry||""}/></label><div><button type="button" onClick={onCancel}>إلغاء</button><button className="admin-primary" disabled={busy}>{busy?"جارٍ الحفظ":"حفظ التحديث"}</button></div></form>;
}
function FinanceTable({ records, workers, contracts, query, canWrite, busy, onStatus }: { records: FinanceRecord[]; workers: WorkerRecord[]; contracts: WorkforceContract[]; query: string; canWrite: boolean; busy: string | null; onStatus: (id: number, status: string) => void }) {
  const rows = filterRecords(records, query); if (!rows.length) return <EmptyRows label="أضف أول عملية مالية ليظهر السجل هنا."/>;
  return <div className="management-table-wrap"><table className="management-table finance-table"><thead><tr><th>المرجع</th><th>النوع</th><th>العامل / العقد</th><th>البيان</th><th>المبلغ</th><th>الفترة والطريقة</th><th>الاستحقاق</th><th>الحالة</th></tr></thead><tbody>{rows.map((item) => { const worker = workers.find((entry) => entry.id === item.workerId); const contract = contracts.find((entry) => entry.id === item.contractId); return <tr key={item.id}><td dir="ltr">{item.referenceCode}</td><td><strong>{financeLabels[item.category] ?? item.category}</strong><small>{item.subCategory ? workforceExpenseLabels[item.subCategory] || item.subCategory : ""}</small></td><td><strong>{worker?.fullName || contract?.clientName || "غير مرتبط"}</strong><small>{worker ? `${worker.profession} · ${worker.iqamaNumber}` : contract?.referenceCode || ""}</small></td><td><strong>{item.description}</strong><small>{contract ? contract.title : item.notes || ""}</small></td><td className={`money-cell ${item.category === "worker_deduction" ? "deduction" : ""}`}>{item.category === "worker_deduction" ? "− " : ""}{formatMoney(item.amountHalalas)}</td><td><strong>{item.periodMonth || "—"}</strong><small>{item.paymentMethod ? paymentMethodLabels[item.paymentMethod] || item.paymentMethod : "غير محدد"}</small></td><td>{formatDate(item.dueDate)}</td><td><StatusControl entity="finance" id={item.id} value={item.status} canWrite={canWrite} busy={busy} onStatus={onStatus}/></td></tr>; })}</tbody></table></div>;
}
function LegalTable({ records, query, canWrite, busy, onStatus }: { records: LegalRecord[]; query: string; canWrite: boolean; busy: string | null; onStatus: (id: number, status: string) => void }) {
  const rows = filterRecords(records, query); if (!rows.length) return <EmptyRows label="أضف أول عقد أو ملف قانوني ليظهر هنا."/>;
  return <div className="management-table-wrap"><table className="management-table"><thead><tr><th>المرجع</th><th>النوع</th><th>العنوان</th><th>الطرف الآخر</th><th>ملف العميل المحال</th><th>الانتهاء/التجديد</th><th>الحالة</th></tr></thead><tbody>{rows.map((item) => {const summary=legalFileSummary(item.fileSnapshotJson);return <tr key={item.id}><td dir="ltr">{item.referenceCode}</td><td>{legalLabels[item.category] ?? item.category}</td><td><strong>{item.title}</strong>{item.referralReason&&<small>سبب الإحالة: {item.referralReason}</small>}</td><td>{item.counterparty}</td><td>{summary?<details className="legal-case-file"><summary>فتح الملف الكامل</summary><p><b>{summary.referenceCode}</b><span>{summary.documents} مستندات · {summary.payments} دفعات · {summary.finances} حركات مالية · {summary.workers} عمال</span><small>أحيل بواسطة {item.referredBy||"النظام"} في {formatDate(item.referredAt,true)}</small></p></details>:"—"}</td><td className={daysUntil(item.expiryDate) <= 45 ? "date-alert" : ""}>{formatDate(item.expiryDate)}</td><td><StatusControl entity="legal" id={item.id} value={item.status} canWrite={canWrite} busy={busy} onStatus={onStatus}/></td></tr>})}</tbody></table></div>;
}

function WorkforceOperations({ workers, attachments }: { workers: WorkerRecord[]; attachments: WorkerAttachment[] }) {
  const assigned = workers.filter((item) => item.status === "assigned").length;
  const utilization = workers.length ? Math.round((assigned / workers.length) * 100) : 0;
  const completeFiles = workers.filter((worker) => workerRequirementStatus(worker, attachments).percent === 100).length;
  const beneficiaries = Array.from(workers.reduce((map, worker) => {
    if (worker.status === "assigned" && worker.beneficiaryName) map.set(worker.beneficiaryName, (map.get(worker.beneficiaryName) || 0) + 1);
    return map;
  }, new Map<string, number>())).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const professions = workforceProfessions.map((profession) => ({
    label: profession.label,
    total: workers.filter((worker) => worker.profession === profession.label).length,
    available: workers.filter((worker) => worker.profession === profession.label && worker.status === "available").length,
  })).filter((item) => item.total > 0).sort((a, b) => b.total - a.total).slice(0, 5);

  return <section className="workforce-command-grid"><article className="panel allocation-panel"><div className="panel-head"><div><h2>التوزيع التشغيلي الحالي</h2><p>الجهات المستفيدة ونسبة إشغال القوى العاملة</p></div><span className="live-indicator">مباشر</span></div><div className="allocation-body"><div className="utilization-ring" style={{ background: `conic-gradient(var(--admin-red) ${utilization}%, #e8edf0 0)` }}><span><strong>{utilization}%</strong><small>نسبة الإشغال</small></span></div><div className="beneficiary-list">{beneficiaries.length ? beneficiaries.map(([name, count]) => <div key={name}><p><strong>{name}</strong><small>{count} عامل</small></p><span><i style={{ width: `${Math.max(12, Math.round((count / Math.max(assigned, 1)) * 100))}%` }}/></span></div>) : <div className="empty-operational">لا توجد عمالة مسندة إلى جهات حالياً.</div>}</div></div></article><article className="panel readiness-panel"><div className="panel-head"><div><h2>الجاهزية حسب المهنة</h2><p>المسجل والمتاح للعقود الجديدة</p></div><span className="readiness-score">{completeFiles}/{workers.length} مكتمل</span></div><div className="profession-readiness">{professions.length ? professions.map((item) => <div key={item.label}><span>{item.label}</span><p><strong>{item.available}</strong> متاح من {item.total}</p><div><i style={{ width: `${Math.round((item.available / item.total) * 100)}%` }}/></div></div>) : <div className="empty-operational">أضف العمالة لتظهر مؤشرات الجاهزية.</div>}</div></article></section>;
}

function ContractOperations({ contracts, professions, assignments, onSelect }: { contracts: WorkforceContract[]; professions: ContractProfession[]; assignments: ContractAssignment[]; onSelect: (id: number) => void }) {
  const rows = contracts.slice(0, 12);
  return <section className="panel contracts-panel"><div className="panel-head"><div><h2>عقود توفير العمالة</h2><p>المهن المطلوبة والعمالة المسندة والجهات المستفيدة</p></div><span className="panel-count">{contracts.filter((item) => item.status === "active").length} نشط</span></div>{rows.length ? <div className="management-table-wrap"><table className="management-table contracts-table"><thead><tr><th>العقد</th><th>الجهة المستفيدة</th><th>المهن المطلوبة</th><th>التغطية</th><th>المدة</th><th>الحالة</th><th><span className="sr-only">إدارة</span></th></tr></thead><tbody>{rows.map((contract) => { const contractProfessionRows = professions.filter((item) => item.contractId === contract.id); const activeAssignments = assignments.filter((item) => item.contractId === contract.id && item.status === "active"); const required = contractProfessionRows.reduce((sum, item) => sum + item.requiredCount, 0); const assigned = activeAssignments.length; const labels = contractProfessionRows.map((item) => `${item.profession} (${item.requiredCount})`).join("، "); return <tr key={contract.id}><td><strong dir="ltr">{contract.referenceCode}</strong><small>{contract.title}</small></td><td><strong>{contract.clientName}</strong><small>{contract.workSite}</small></td><td><strong>{contractProfessionRows.length} مهنة</strong><small>{labels || "لم تُسجّل المهن"}</small></td><td><div className="contract-fill"><span><i style={{ width: `${required ? Math.min(100, Math.round((assigned / required) * 100)) : 0}%` }}/></span><small>{assigned} من {required} · متبقٍ {Math.max(0, required - assigned)}</small></div></td><td><strong>{formatDate(contract.startDate)}</strong><small>حتى {formatDate(contract.endDate)}</small></td><td><span className={`status-pill ${contract.status === "active" ? "status-contacted" : "status-closed"}`}>{contract.status === "active" ? "نشط" : contract.status}</span></td><td><button className="worker-view" onClick={() => onSelect(contract.id)}>إدارة العمالة ←</button></td></tr>; })}</tbody></table></div> : <EmptyRows label="أنشئ عقد توفير عمالة ليظهر هنا مع المهن والأعداد."/>}</section>;
}

const contractStatusLabels: Record<string, string> = { draft: "مسودة", internal_review: "مراجعة داخلية", legal_review: "مراجعة قانونية", approved: "معتمد", sent: "مرسل للطرف الثاني", signed: "موقع", active: "ساري", suspended: "معلق", expired: "منتهي", terminated: "منهى", cancelled: "ملغى", superseded: "استبدل بإصدار أحدث" };
const contractNextStatuses: Record<string, string[]> = { draft: ["internal_review", "approved", "cancelled"], internal_review: ["draft", "legal_review", "approved", "cancelled"], legal_review: ["internal_review", "approved", "cancelled"], approved: ["active", "sent", "cancelled"], sent: ["signed", "cancelled"], signed: ["active", "cancelled"], active: ["suspended", "terminated", "expired", "superseded"], suspended: ["active", "terminated"], expired: ["superseded"] };

function ContractDrawer({ contract, professions, assignments, workers, canWrite, isAdmin, isOwner, busy, onClose, onAssign, onRelease, onStatus, onEdit, onDelete }: {
  contract: WorkforceContract; professions: ContractProfession[]; assignments: ContractAssignment[]; workers: WorkerRecord[]; canWrite: boolean; isAdmin: boolean; isOwner: boolean; busy: string | null; onClose: () => void;
  onAssign: (contractId: number, contractProfessionId: number, workerId: number) => Promise<void>;
  onRelease: (contractId: number, assignmentId: number) => Promise<void>;
  onStatus: (contractId: number, status: string, reason: string) => Promise<void>;
  onEdit: (contract: WorkforceContract) => Promise<void>;
  onDelete: (contract: WorkforceContract) => Promise<void>;
}) {
  const [choices, setChoices] = useState<Record<number, string>>({});
  const [nextStatus, setNextStatus] = useState("");
  const [statusReason, setStatusReason] = useState("");
  const activeAssignments = assignments.filter((item) => item.status === "active");
  const plannedAssignments = assignments.filter((item) => item.status === "planned");
  const requiredTotal = professions.reduce((sum, item) => sum + item.requiredCount, 0);
  return <div className="drawer-layer"><button className="drawer-backdrop" aria-label="إغلاق إدارة العقد" onClick={onClose}/><aside className="request-drawer contract-drawer" role="dialog" aria-modal="true" aria-label={`إدارة عمالة العقد ${contract.referenceCode}`}><div className="drawer-head"><div><span dir="ltr">{contract.referenceCode}</span><h2>إدارة عمالة العقد</h2></div><button onClick={onClose} aria-label="إغلاق"><Icon name="close"/></button></div>
    <div className="contract-drawer-summary"><div><span>الجهة المستفيدة</span><strong>{contract.clientName}</strong><small>{contract.workSite}</small></div><div><span>الحالة التعاقدية</span><strong>{contractStatusLabels[contract.status] || contract.status}</strong><small>الإصدار {contract.versionNumber || 1}</small></div><div><span>التغطية الحالية</span><strong>{activeAssignments.length} / {requiredTotal}</strong><small>{plannedAssignments.length ? `${plannedAssignments.length} عامل مخطط للإسناد عند السريان` : `متبقٍ ${Math.max(0, requiredTotal - activeAssignments.length)} عامل`}</small></div><div><span>مدة العقد</span><strong>{formatDate(contract.startDate)}</strong><small>حتى {formatDate(contract.endDate)}</small></div></div>
    {isOwner && ["draft","internal_review","legal_review"].includes(contract.status) && <button className="admin-primary contract-direct-approve" disabled={busy === `contract-status-${contract.id}`} onClick={() => void onStatus(contract.id, "approved", "اعتماد مباشر من شاشة العقد")}>{busy === `contract-status-${contract.id}` ? "جارٍ اعتماد العقد..." : "اعتماد العقد الآن"}</button>}
    {contract.approvedBy ? <div className="pdf-language-actions"><a className="contract-pdf-link" href={`/api/portal/documents/${contract.documentId}?language=ar`}><Icon name="download"/> نسخة عربية</a><a className="contract-pdf-link" href={`/api/portal/documents/${contract.documentId}?language=bilingual`}><Icon name="download"/> نسخة عربي/English</a></div> : <p className="readonly-note">يتاح تنزيل PDF العقد بعد اعتماد المالك أو مشرف النظام فقط.</p>}
    {canWrite && !["active","suspended","expired","terminated","superseded"].includes(contract.status) && <div className="document-actions"><button disabled={busy === `contract-edit-${contract.id}`} onClick={() => void onEdit(contract)}>تعديل بيانات العقد</button>{contract.status === "draft" && !contract.approvedBy && <button className="danger-action" disabled={busy === `contract-delete-${contract.id}`} onClick={() => void onDelete(contract)}>حذف مسودة العقد</button>}</div>}
    {canWrite && (contractNextStatuses[contract.status]?.length || 0) > 0 && <section className="drawer-section contract-lifecycle"><h3>دورة اعتماد العقد</h3><p>اعتماد العقد للمالك أو مشرف النظام، وبعد الاعتماد يستطيع صاحب صلاحية التشغيل تفعيله فتبدأ آثاره التشغيلية والمالية.</p><div><select value={nextStatus} onChange={(event) => setNextStatus(event.target.value)}><option value="">اختر الحالة التالية</option>{contractNextStatuses[contract.status].filter((status) => status === "approved" ? isOwner : isAdmin || !["signed","terminated","cancelled","superseded"].includes(status)).map((status) => <option value={status} key={status}>{contractStatusLabels[status]}</option>)}</select><textarea value={statusReason} onChange={(event) => setStatusReason(event.target.value)} rows={2} maxLength={1000} placeholder="سبب القرار إلزامي للتعليق أو الإنهاء أو الإلغاء"/><button className="admin-primary" disabled={!nextStatus || busy === `contract-status-${contract.id}`} onClick={() => void onStatus(contract.id, nextStatus, statusReason).then(() => { setNextStatus(""); setStatusReason(""); })}>{busy === `contract-status-${contract.id}` ? "جارٍ الحفظ..." : "حفظ انتقال الحالة"}</button></div></section>}
    <div className="contract-profession-sections">{professions.map((profession) => { const professionActive = activeAssignments.filter((item) => item.contractProfessionId === profession.id); const professionPlanned = plannedAssignments.filter((item) => item.contractProfessionId === profession.id); const visibleAssignments = professionActive.length ? professionActive : professionPlanned; const assignedIds = new Set(visibleAssignments.map((item) => item.workerId)); const candidates = workers.filter((worker) => worker.profession === profession.profession && worker.status === "available" && sponsorshipMatches(worker, profession) && !assignedIds.has(worker.id)); const remaining = Math.max(0, profession.requiredCount - visibleAssignments.length); return <section key={profession.id}><header><div><strong>{profession.profession}</strong><small>مطلوب {profession.requiredCount} عامل · {profession.sponsorshipType === "dali" ? "على كفالة شركة دالي" : profession.sponsorshipType === "other" ? `على كفالة ${profession.sponsorName || "جهة أخرى"} — ${profession.ajirContractStatus === "with_ajir" ? "بعقد أجير" : "بدون عقد أجير"}` : "الكفالة غير محددة"}</small></div><span className={remaining === 0 ? "complete" : ""}>{visibleAssignments.length}/{profession.requiredCount}</span></header><div className="contract-assigned-list">{visibleAssignments.map((assignment) => { const worker = workers.find((item) => item.id === assignment.workerId); const planned = assignment.status === "planned"; return <article key={assignment.id}><span>{initials(worker?.fullName || "عامل")}</span><p><strong>{worker?.fullName || `عامل رقم ${assignment.workerId}`}</strong><small>{worker?.iqamaNumber || "رقم الإقامة غير متاح"} · {planned ? "مخطط عند السريان" : formatDate(assignment.assignedAt)}</small></p>{planned ? <b className="planned-assignment">مخطط</b> : canWrite && <button disabled={busy === `contract-release-${assignment.id}`} onClick={() => void onRelease(contract.id, assignment.id)}>{busy === `contract-release-${assignment.id}` ? "جارٍ..." : "إنهاء الإسناد"}</button>}</article>; })}{!visibleAssignments.length && <p className="empty-operational">لم تُحدّد عمالة لهذه المهنة بعد.</p>}</div>{canWrite && contract.status === "active" && remaining > 0 && <div className="contract-add-worker"><label>إضافة عامل متاح<select value={choices[profession.id] || ""} onChange={(event) => setChoices((items) => ({ ...items, [profession.id]: event.target.value }))}><option value="">اختر العامل</option>{candidates.map((worker) => <option value={worker.id} key={worker.id}>{worker.fullName} — {worker.iqamaNumber} — {sponsorshipLabel(worker)}</option>)}</select></label><button className="admin-primary" disabled={!choices[profession.id] || busy === `contract-assign-${profession.id}`} onClick={() => choices[profession.id] && void onAssign(contract.id, profession.id, Number(choices[profession.id]))}>{busy === `contract-assign-${profession.id}` ? "جارٍ الإسناد..." : "إضافة إلى العقد"}</button>{!candidates.length && <small>لا توجد عمالة متاحة مطابقة للمهنة حالياً.</small>}</div>}{contract.status !== "active" && remaining > 0 && <p className="readonly-note">يُتاح الإسناد اليدوي بعد اعتماد العقد وتوقيعه وتحويله إلى ساري.</p>}{remaining === 0 && <p className="profession-complete-note">اكتمل العدد المطلوب لهذه المهنة.</p>}</section>; })}</div>
  </aside></div>;
}

function WorkerTable({ records, attachments, query, onSelect }: { records: WorkerRecord[]; attachments: WorkerAttachment[]; query: string; onSelect: (id: number) => void }) {
  const rows = filterRecords(records, query); if (!rows.length) return <EmptyRows label="أضف أول ملف عامل متكامل ليظهر هنا."/>;
  return <div className="management-table-wrap"><table className="management-table workforce-table"><thead><tr><th>العامل</th><th>المهنة</th><th>الجهة المستفيدة</th><th>موقع العمل</th><th>انتهاء الإقامة</th><th>اكتمال الملف</th><th>الحالة</th><th><span className="sr-only">عرض</span></th></tr></thead><tbody>{rows.map((item) => { const profile = workerRequirementStatus(item, attachments); const photo = profile.files.find((file) => file.documentType === "photo"); return <tr key={item.id}><td><div className="worker-identity">{photo ? <Image unoptimized src={`/api/portal/workers/attachments/${photo.id}?inline=1`} alt={`صورة ${item.fullName}`} width={56} height={56}/> : <span>{initials(item.fullName)}</span>}<p><strong>{item.fullName}</strong><small dir="ltr">{item.iqamaNumber || "رقم الإقامة غير مسجل"}</small></p></div></td><td><strong>{item.profession}</strong><small>{item.nationality}</small></td><td><strong>{item.beneficiaryName || "غير مسند"}</strong><small>{item.status === "assigned" ? "مستفيد حالي" : "متاح للإسناد"}</small></td><td>{item.clientSite}</td><td className={daysUntil(item.iqamaExpiry) <= 30 ? "date-alert" : ""}>{formatDate(item.iqamaExpiry)}</td><td><div className="file-completion"><span><i style={{ width: `${profile.percent}%` }}/></span><small>{profile.percent}% · {profile.missing.length ? `${profile.missing.length} ناقص` : "مكتمل"}</small></div></td><td><span className={`status-pill ${statusClass(item.status)}`}>{recordStatus.workforce[item.status] || item.status}</span></td><td><button className="worker-view" onClick={() => onSelect(item.id)}>عرض الملف ←</button></td></tr>; })}</tbody></table></div>;
}

function RecordModal({ entity, users, busy, onClose, onSubmit }: { entity: Exclude<RecordEntity, "finance" | "workforce">; users: PortalUser[]; busy: boolean; onClose: () => void; onSubmit: (entity: RecordEntity, form: HTMLFormElement) => Promise<void> }) {
  const titles = { employees: "إضافة موظف", legal: "إضافة ملف قانوني" };
  const [iban,setIban]=useState("SA");
  const [employeeSponsorship,setEmployeeSponsorship]=useState<"dali"|"other">("dali");
  const detectedBank=bankNameFromSaudiIban(iban)||"";
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void onSubmit(entity, event.currentTarget); }
  return <div className="modal-layer"><button className="drawer-backdrop" aria-label="إغلاق النافذة" onClick={onClose}/><section className="record-modal" role="dialog" aria-modal="true" aria-label={titles[entity]}><div className="drawer-head"><div><span>سجل جديد</span><h2>{titles[entity]}</h2></div><button onClick={onClose} aria-label="إغلاق"><Icon name="close"/></button></div><form onSubmit={submit}>
    {entity === "employees" && <><label className="span-two">مستخدم الموظف<select name="portalUserEmail" required defaultValue=""><option value="" disabled>اختر مستخدمًا نشطًا غير مرتبط بموظف</option>{users.filter(user=>user.status==="active").map(user=><option key={user.email} value={user.email}>{user.displayName} · {user.email}</option>)}</select></label><label>الرقم الوظيفي<input name="employeeNumber" required maxLength={30} placeholder="EMP-001" dir="ltr"/></label><label>الاسم الكامل<input name="fullName" required maxLength={120}/></label><label>رقم الهوية أو الإقامة<input name="nationalId" required inputMode="numeric" pattern="[0-9]{10}" maxLength={10} dir="ltr"/></label><label>الجنسية<input name="nationality" maxLength={80}/></label><label>المسمى الوظيفي<input name="jobTitle" required maxLength={100}/></label><label>الإدارة أو القسم<input name="department" required maxLength={100}/></label><label>رقم الجوال<input name="mobile" required type="tel" maxLength={20} dir="ltr"/></label><label>البريد الوظيفي<input name="email" type="email" maxLength={160} dir="ltr"/></label><label>تاريخ الالتحاق<input name="hireDate" required type="date"/></label><label>تاريخ انتهاء الإقامة<input name="iqamaExpiry" required type="date"/></label><label>جهة الكفالة<select name="sponsorshipType" value={employeeSponsorship} onChange={event=>setEmployeeSponsorship(event.target.value as "dali"|"other")}><option value="dali">على كفالة دالي</option><option value="other">أخرى</option></select></label>{employeeSponsorship==="other"?<label>اسم جهة الكفالة<input name="sponsorName" required minLength={2} maxLength={160}/></label>:<><label>تاريخ انتهاء عقد العمل<input name="contractEndDate" required type="date"/></label><label>تاريخ انتهاء رخصة العمل<input name="workPermitExpiry" required type="date"/></label></>}<label>الراتب الأساسي<input name="baseSalary" required type="number" min="0" step="0.01" defaultValue="0" dir="ltr"/></label><label>بدل السكن<input name="housingAllowance" type="number" min="0" step="0.01" defaultValue="0" dir="ltr"/></label><label>بدل النقل<input name="transportAllowance" type="number" min="0" step="0.01" defaultValue="0" dir="ltr"/></label><label>بدلات أخرى<input name="otherAllowance" type="number" min="0" step="0.01" defaultValue="0" dir="ltr"/></label><label>رقم الآيبان — اختياري<input name="iban" value={iban} onChange={event=>setIban(formatSaudiIban(event.target.value))} inputMode="numeric" maxLength={29} placeholder="SA00 0000 0000 0000 0000 0000" dir="ltr"/><small>يبقى SA ثابتًا، وتضاف مسافة تلقائيًا بعد كل أربع خانات.</small></label><label>اسم البنك — تلقائي<input name="bankName" value={detectedBank} readOnly placeholder={iban.length>2?"سيظهر بعد اكتمال رمز البنك":"يُعبأ من الآيبان"}/></label><label className="file-drop">صورة شخصية — اختيارية<input name="photo" type="file" accept="image/png,image/jpeg"/></label><label className="file-drop">صورة الإقامة — إلزامية<input name="iqamaDocument" type="file" required accept="application/pdf,image/png,image/jpeg"/></label><label className="file-drop span-two">عقد العمل — إلزامي ويُحفظ في ملف الموظف<input name="employmentContract" type="file" required accept="application/pdf,image/png,image/jpeg"/></label></>}
    {entity === "legal" && <><label>نوع الملف<select name="category" required defaultValue=""><option value="" disabled>اختر النوع</option><option value="contract">عقد</option><option value="case">قضية</option><option value="license">ترخيص</option><option value="compliance">امتثال</option></select></label><label>العنوان<input name="title" required maxLength={180}/></label><label>الطرف الآخر أو الجهة<input name="counterparty" required maxLength={160}/></label><label>تاريخ الانتهاء أو التجديد<input name="expiryDate" type="date"/></label></>}
    <div className="modal-actions span-two"><button type="button" onClick={onClose}>إلغاء</button><button className="admin-primary" type="submit" disabled={busy}>{busy ? "جارٍ الحفظ..." : "حفظ السجل"}</button></div>
  </form></section></div>;
}

function SearchableCombobox({ name, value, options, onChange, placeholder, required = false }: { name: string; value: string; options: readonly string[]; onChange: (value: string) => void; placeholder: string; required?: boolean }) {
  const [open, setOpen] = useState(false);
  const hasExactSelection = options.includes(value);
  const filtered = options.filter((option) => hasExactSelection || !value.trim() || option.toLowerCase().includes(value.trim().toLowerCase())).slice(0, 40);
  const listId = `combobox-${name.replace(/[^a-zA-Z0-9_-]/g, "-")}-options`;
  return <div className="searchable-combobox"><div><Icon name="search"/><input name={name} value={value} required={required} autoComplete="off" placeholder={placeholder} role="combobox" aria-controls={listId} aria-expanded={open} aria-autocomplete="list" onFocus={() => setOpen(true)} onBlur={() => window.setTimeout(() => setOpen(false), 120)} onChange={(event) => { onChange(event.target.value); setOpen(true); }} onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); if (event.key === "Enter" && open && filtered[0]) { event.preventDefault(); onChange(filtered[0]); setOpen(false); } }}/><button type="button" aria-label="عرض الخيارات" onMouseDown={(event) => event.preventDefault()} onClick={() => setOpen((visible) => !visible)}>⌄</button></div>{open && <div className="combobox-options" id={listId} role="listbox">{filtered.length ? filtered.map((option) => <button type="button" role="option" aria-selected={option === value} key={option} className={option === value ? "selected" : ""} onMouseDown={(event) => event.preventDefault()} onClick={() => { onChange(option); setOpen(false); }}>{option}{option === value && <Icon name="check"/>}</button>) : <p>لا توجد خيارات مطابقة. اكتب جزءاً من الاسم للبحث.</p>}</div>}</div>;
}

function WorkerModal({ busy, onClose, onSubmit }: { busy: boolean; onClose: () => void; onSubmit: (form: HTMLFormElement) => Promise<void> }) {
  const [profession, setProfession] = useState(workforceProfessions[0].label);
  const [nationality, setNationality] = useState("");
  const [workerCount,setWorkerCount]=useState(1);
  const [workerSponsorship,setWorkerSponsorship]=useState<Record<number,"dali"|"other">>({});
  const requirements = requirementsForProfession(profession);
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void onSubmit(event.currentTarget); }
  return <div className="modal-layer"><button className="drawer-backdrop" aria-label="إغلاق نافذة إضافة عامل" onClick={onClose}/><section className="record-modal worker-modal" role="dialog" aria-modal="true" aria-label="إنشاء ملف عامل"><div className="drawer-head"><div><span>شؤون العمالة</span><h2>إنشاء ملف عامل متكامل</h2></div><button onClick={onClose} aria-label="إغلاق"><Icon name="close"/></button></div><div className="worker-modal-steps"><span className="active">1 البيانات</span><span className="active">2 متطلبات المهنة</span><span className="active">3 الجاهزية للعقود</span></div><form onSubmit={submit}>
    <input type="hidden" name="workerCount" value={workerCount}/><p className="form-section-title span-two">الإعداد المشترك للدفعة</p><label>عدد العمال المراد إضافتهم<input type="number" min="1" max="20" value={workerCount} onChange={event=>setWorkerCount(Math.max(1,Math.min(20,Number(event.target.value)||1)))}/></label><label>الجنسية<SearchableCombobox name="nationality" value={nationality} options={workforceNationalities} onChange={setNationality} placeholder="اكتب للبحث عن الجنسية" required/></label><label className="span-two">المهنة<SearchableCombobox name="profession" value={profession} options={workforceProfessions.map((item) => item.label)} onChange={setProfession} placeholder="اكتب للبحث عن المهنة" required/></label>
    {Array.from({length:workerCount},(_,index)=><div className="bulk-worker-entry span-two" key={index}><h3>بيانات العامل {index+1}</h3><div><label>رقم العامل<input name={`workerNumber:${index}`} required maxLength={30} placeholder={`WRK-${String(index+1).padStart(3,"0")}`} dir="ltr"/></label><label>رقم الإقامة<input name={`iqamaNumber:${index}`} required inputMode="numeric" pattern="[0-9]{10}" maxLength={10} placeholder="10 أرقام" dir="ltr"/></label><label>الاسم الكامل<input name={`fullName:${index}`} required maxLength={120}/></label><label>رقم الجوال<input name={`mobile:${index}`} required type="tel" maxLength={20} dir="ltr"/></label><label>الراتب الشهري (ريال)<input name={`monthlySalary:${index}`} required type="number" min="0.01" step="0.01"/></label><label>جهة الكفالة<select name={`sponsorshipType:${index}`} value={workerSponsorship[index]||"dali"} onChange={event=>setWorkerSponsorship(items=>({...items,[index]:event.target.value as "dali"|"other"}))}><option value="dali">على كفالة شركة دالي</option><option value="other">على كفالة جهة أخرى</option></select></label>{workerSponsorship[index]==="other"&&<><label>اسم الكفيل<input name={`sponsorName:${index}`} required minLength={2} maxLength={160}/></label><label>حالة عقد أجير<select name={`ajirContractStatus:${index}`} required defaultValue=""><option value="" disabled>اختر الحالة</option><option value="with_ajir">بعقد أجير</option><option value="without_ajir">بدون عقد أجير</option></select></label></>}<label>اسم البنك<select name={`bankName:${index}`} required defaultValue=""><option value="" disabled>اختر البنك</option>{saudiBanks.map(bank=><option value={bank} key={bank}>{bank}</option>)}</select></label><label>رقم الآيبان السعودي<input name={`iban:${index}`} required pattern="SA[0-9]{22}" minLength={24} maxLength={24} placeholder="SA0000000000000000000000" dir="ltr"/></label><label>تاريخ انتهاء الإقامة<input name={`iqamaExpiry:${index}`} required type="date"/></label><label>تاريخ انتهاء التأمين الطبي<input name={`medicalInsuranceExpiry:${index}`} required type="date"/></label><label className="file-drop requirement-file">صورة الإقامة — إلزامية<input name={`iqamaDocument:${index}`} type="file" required accept="application/pdf,image/png,image/jpeg"/></label><label className="file-drop requirement-file">صورة العامل — إلزامية<input name={`photo:${index}`} type="file" required accept="image/png,image/jpeg"/></label><label className="file-drop requirement-file">شهادة الآيبان — إلزامية<input name={`ibanCertificate:${index}`} type="file" required accept="application/pdf,image/png,image/jpeg"/></label>{(workerSponsorship[index]||"dali")==="dali"&&<label className="file-drop requirement-file">عقد العمل — إلزامي للعامل على كفالة دالي<input name={`workContract:${index}`} type="file" required accept="application/pdf,image/png,image/jpeg"/></label>}{requirements.map(requirement=><label className="file-drop" key={requirement.code}>{requirement.label} — اختياري<input name={`requirement:${requirement.code}:${index}`} type="file" accept="application/pdf,image/png,image/jpeg"/></label>)}<label className="file-drop">مرفقات إضافية اختيارية<input name={`extraCertificates:${index}`} type="file" multiple accept="application/pdf,image/png,image/jpeg"/></label></div></div>)}
    <p className="form-hint span-two">لن يُنشأ الملف قبل إرفاق الصورة وجميع المستندات المطلوبة للمهنة. يُسجّل العامل متاحاً، ثم تُحدّد الجهة المستفيدة تلقائياً عند اختياره في عقد نشط.</p><div className="modal-actions span-two"><button type="button" onClick={onClose}>إلغاء</button><button className="admin-primary" type="submit" disabled={busy}>{busy ? "جارٍ إنشاء الملف..." : "إنشاء ملف العامل"}</button></div>
  </form></section></div>;
}

function WorkerDrawer({ worker, attachments, contracts, contractAssignments, canWrite, busy, onClose, onUploadAttachment }: {
  worker: WorkerRecord; attachments: WorkerAttachment[]; contracts: WorkforceContract[]; contractAssignments: ContractAssignment[]; canWrite: boolean; busy: string | null; onClose: () => void;
  onUploadAttachment: (workerId: number, form: HTMLFormElement) => Promise<void>;
}) {
  const profile = workerRequirementStatus(worker, attachments);
  const photo = attachments.find((item) => item.documentType === "photo");
  const activeAssignment = contractAssignments.find((item) => item.workerId === worker.id && item.status === "active");
  const activeContract = contracts.find((item) => item.id === activeAssignment?.contractId);
  function submitAttachment(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void onUploadAttachment(worker.id, event.currentTarget); }
  async function archiveWorker() { const reason=window.prompt("اكتب سبب حذف/أرشفة العامل (10 أحرف على الأقل)");if(!reason||reason.trim().length<10)return;const response=await fetch("/api/portal/workers",{method:"DELETE",headers:{"content-type":"application/json"},body:JSON.stringify({id:worker.id,reason})});const result=await readApiJson(response) as {error?:string};if(!response.ok){window.alert(result.error||"تعذر حذف العامل");return;}window.location.reload(); }
  return <div className="drawer-layer"><button className="drawer-backdrop" aria-label="إغلاق ملف العامل" onClick={onClose}/><aside className="request-drawer worker-drawer" role="dialog" aria-modal="true" aria-label={`ملف العامل ${worker.fullName}`}><div className="drawer-head"><div><span>{worker.workerNumber}</span><h2>ملف العامل</h2></div><button onClick={onClose} aria-label="إغلاق"><Icon name="close"/></button></div><div className="worker-profile-head">{photo ? <Image unoptimized src={`/api/portal/workers/attachments/${photo.id}?inline=1`} alt={`صورة ${worker.fullName}`} width={96} height={96}/> : <span>{initials(worker.fullName)}</span>}<div><h3>{worker.fullName}</h3><p>{worker.profession} · {worker.nationality}</p><p>{sponsorshipLabel(worker)}</p><small dir="ltr">إقامة: {worker.iqamaNumber || "غير مسجل"}</small></div><b className={`status-pill ${statusClass(worker.status)}`}>{recordStatus.workforce[worker.status] || worker.status}</b></div><div className="profile-completion"><div><strong>اكتمال الملف</strong><span>{profile.percent}%</span></div><p><i style={{ width: `${profile.percent}%` }}/></p><small>{profile.missing.length ? `متبقٍ ${profile.missing.length} مستند مهني` : "جميع متطلبات المهنة مكتملة"}</small></div>
    <div className="drawer-section worker-facts"><h3>البيانات التشغيلية والبنكية</h3><dl><div><dt>الجوال</dt><dd dir="ltr">{worker.mobile || "غير مسجل"}</dd></div><div><dt>البنك</dt><dd>{worker.bankName || "غير مسجل"}</dd></div><div><dt>رقم الآيبان</dt><dd dir="ltr">{worker.iban || "غير مسجل"}</dd></div><div><dt>انتهاء الإقامة</dt><dd className={daysUntil(worker.iqamaExpiry) <= 30 ? "date-alert" : ""}>{formatDate(worker.iqamaExpiry)}</dd></div><div><dt>انتهاء التأمين الطبي</dt><dd className={daysUntil(worker.medicalInsuranceExpiry) <= 30 ? "date-alert" : ""}>{formatDate(worker.medicalInsuranceExpiry)}</dd></div><div><dt>الجهة المستفيدة</dt><dd>{activeContract?.clientName || worker.beneficiaryName || "غير مسند"}</dd></div><div><dt>العقد النشط</dt><dd>{activeContract?.referenceCode || "لا يوجد عقد نشط"}</dd></div><div><dt>موقع العمل</dt><dd>{activeContract?.workSite || worker.clientSite}</dd></div><div><dt>بداية الإسناد</dt><dd>{formatDate(activeAssignment?.assignedAt || worker.assignmentStartDate)}</dd></div></dl></div>
    <div className="drawer-section"><h3>الصورة والمستندات</h3><div className="worker-file-list">{attachments.map((item) => <a key={item.id} href={`/api/portal/workers/attachments/${item.id}?inline=1`} target="_blank" rel="noreferrer"><span><Icon name={item.documentType === "photo" ? "employees" : "documents"}/></span><p><strong>{item.title}</strong><small>{item.fileName} · {formatBytes(item.sizeBytes)}{item.expiryDate?` · ينتهي ${formatDate(item.expiryDate)}`:" · دون انتهاء"}</small></p><span>معاينة</span></a>)}</div>{!attachments.length && <div className="empty-operational">لا توجد مرفقات في هذا الملف.</div>}{canWrite && <form className="attachment-upload" onSubmit={submitAttachment}><strong>إضافة مرفق إلى ملف العامل</strong><label>نوع المستند<select name="requirementCode" defaultValue=""><option value="">مرفق إضافي</option>{profile.requirements.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}</select></label><label>اسم المرفق<input name="title" required maxLength={160} placeholder="مثال: بطاقة صحية"/></label><label>تاريخ انتهاء المرفق<input name="expiryDate" type="date"/></label><label>الملف<input name="file" type="file" required accept="application/pdf,image/png,image/jpeg"/></label><button className="admin-primary" disabled={busy === `worker-attachment-${worker.id}`}>{busy === `worker-attachment-${worker.id}` ? "جارٍ الرفع..." : "رفع المرفق"}</button></form>}</div>
    <div className="drawer-section"><h3>مصدر الجهة المستفيدة</h3><div className="contract-source-note"><Icon name="documents"/><p><strong>{activeContract ? "الإسناد مرتبط بعقد نشط" : "العامل متاح للعقود"}</strong><span>{activeContract ? `تُحدّث الجهة والموقع من العقد ${activeContract.referenceCode}. لإلغاء الإسناد أو تغييره افتح إدارة العقد.` : "تظهر العمالة في خطوة الاختيار عند إنشاء عقد يتضمن مهنتها، ويمكن إضافتها لاحقاً من إدارة العقد."}</span></p></div>{canWrite&&<button className="danger-action" type="button" onClick={()=>void archiveWorker()}>حذف العامل من النظام</button>}{!canWrite && <p className="readonly-note">صلاحية حسابك تتيح الاطلاع والتنزيل فقط.</p>}</div>
  </aside></div>;
}

function RequestTable({ requests, onSelect }: { requests: WorkforceRequest[]; onSelect: (id: number) => void }) {
  if (!requests.length) return <EmptyRows label="ستظهر طلبات الموقع هنا بمجرد وصولها."/>;
  return <div className="request-table-wrap"><table className="request-table"><thead><tr><th>رقم الطلب</th><th>العميل</th><th>الاحتياج</th><th>التاريخ</th><th>الحالة</th><th><span className="sr-only">الإجراء</span></th></tr></thead><tbody>{requests.map((item) => { const status = requestStatuses[safeRequestStatus(item.status)]; return <tr key={item.id} onClick={() => onSelect(item.id)}><td><b>{item.trackingCode}</b></td><td><strong>{item.companyName || item.fullName}</strong><small>{item.companyName ? `${item.fullName} · ${item.mobile}` : item.mobile}</small></td><td><span>{item.specialization}</span>{item.requestType === "quotation" && <small className="quote-request-kind">طلب عرض سعر</small>}</td><td>{formatDate(item.createdAt)}</td><td><span className={`status-pill ${status.className}`}>{status.label}</span></td><td><button aria-label={`عرض طلب ${item.trackingCode}`}>←</button></td></tr>; })}</tbody></table></div>;
}
function StructuredQuoteRequest({request}:{request:WorkforceRequest}){
  if(request.requestType!=="quotation"||!request.quotationItemsJson)return null;
  let items:Array<{description?:string;quantity?:number;durationMonths?:number;unit?:string;sponsorshipType?:string;sponsorName?:string;ajirContractStatus?:string;notes?:string|null}>=[];
  let terms:Record<string,string|null>={};
  try{items=JSON.parse(request.quotationItemsJson) as typeof items}catch{}
  try{terms=JSON.parse(request.quotationTermsJson||"{}") as Record<string,string|null>}catch{}
  const party=(value:string|null|undefined)=>value==="client"?"العميل":value==="dali"?"شركة دالي":"لا ينطبق";
  return <><div className="drawer-section"><h3>بيانات المنشأة التعاقدية</h3><dl><div><dt>السجل التجاري</dt><dd>{request.clientCr||"غير مسجل"}</dd></div><div><dt>الرقم الضريبي</dt><dd>{request.clientVat||"غير مسجل"}</dd></div><div><dt>العنوان الوطني</dt><dd>{request.clientAddress||"غير مسجل"}</dd></div><div><dt>صفة الممثل</dt><dd>{request.representativeTitle||"غير مسجلة"}</dd></div><div><dt>نوع النشاط</dt><dd>{request.specialization}</dd></div><div><dt>نطاق العدد</dt><dd>{request.quantityMode==="open"?"عدد مفتوح":"عدد محدد"}</dd></div></dl></div><div className="drawer-section"><h3>بنود العرض المطلوبة</h3><div className="request-quote-items">{items.map((item,index)=><article key={`${item.description}-${index}`}><strong>{item.description||`البند ${index+1}`}</strong><span>{request.quantityMode==="open"?"عدد مفتوح":`${item.quantity||0} ${item.unit||"وحدة"}`} · {item.durationMonths||0} شهر</span>{item.sponsorshipType&&<small>{item.sponsorshipType==="dali"?"على كفالة شركة دالي":`على كفالة ${item.sponsorName||"جهة أخرى"} — ${item.ajirContractStatus==="with_ajir"?"بعقد أجير":"بدون عقد أجير"}`}</small>}{item.notes&&<p>{item.notes}</p>}</article>)}</div></div><div className="drawer-section"><h3>شروط التشغيل المقترحة</h3><dl><div><dt>تاريخ النهاية</dt><dd>{formatDate(terms.endDate)}</dd></div><div><dt>ساعات العمل</dt><dd>{terms.workingHours||"غير محددة"}</dd></div><div><dt>الراحة الأسبوعية</dt><dd>{terms.weeklyOff||"غير محددة"}</dd></div><div><dt>السكن</dt><dd>{party(terms.accommodationParty)}</dd></div><div><dt>النقل</dt><dd>{party(terms.transportParty)}</dd></div><div><dt>شروط الدفع</dt><dd>{terms.paymentTerms||"تحدد في العرض"}</dd></div></dl>{terms.specialTerms&&<p className="request-details">{terms.specialTerms}</p>}</div></>;
}
function RequestDrawer({ request, replies, emailConfigured, canWrite, statusBusy, replyBusy, onClose, onStatus, onReply }: {
  request: WorkforceRequest; replies: WorkforceRequestReply[]; emailConfigured: boolean; canWrite: boolean; statusBusy: boolean; replyBusy: boolean;
  onClose: () => void; onStatus: (id: number, status: RequestStatus) => void; onReply: (id: number, form: HTMLFormElement) => Promise<void>;
}) {
  function submitReply(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void onReply(request.id, event.currentTarget); }
  const deliveryLabels: Record<string, string> = { sent: "تم الإرسال", pending: "قيد الإرسال", failed: "فشل الإرسال", configuration_required: "تحتاج تهيئة البريد" };
  return <div className="drawer-layer"><button className="drawer-backdrop" aria-label="إغلاق تفاصيل الطلب" onClick={onClose}/><aside className="request-drawer visitor-request-drawer" role="dialog" aria-modal="true" aria-label="تفاصيل طلب الزائر"><div className="drawer-head"><div><span>{request.trackingCode}</span><h2>{request.requestType === "quotation" ? "طلب عرض سعر" : "طلب الزائر والردود"}</h2></div><button onClick={onClose} aria-label="إغلاق"><Icon name="close"/></button></div><div className="drawer-status"><span>حالة الطلب</span>{canWrite ? <select value={safeRequestStatus(request.status)} disabled={statusBusy} onChange={(event) => onStatus(request.id, event.target.value as RequestStatus)}>{Object.entries(requestStatuses).map(([value, meta]) => <option value={value} key={value}>{meta.label}</option>)}</select> : <span className={`status-pill ${requestStatuses[safeRequestStatus(request.status)].className}`}>{requestStatuses[safeRequestStatus(request.status)].label}</span>}</div><div className="drawer-section"><h3>بيانات الزائر</h3><dl><div><dt>الاسم</dt><dd>{request.fullName}</dd></div><div><dt>الشركة أو الجهة</dt><dd>{request.companyName || "غير محددة"}</dd></div><div><dt>رقم الجوال</dt><dd dir="ltr">{request.mobile}</dd></div><div><dt>البريد الإلكتروني</dt><dd dir="ltr">{request.email}</dd></div></dl></div><div className="drawer-section"><h3>{request.requestType === "quotation" ? "بيانات عرض السعر" : "موضوع الطلب"}</h3><dl><div><dt>نوع الاحتياج</dt><dd>{request.specialization}</dd></div><div><dt>موقع العمل</dt><dd>{request.workSite || "غير محدد"}</dd></div>{request.requestType === "quotation" && <><div><dt>العدد التقريبي</dt><dd>{request.quantityMode==="open"?"مفتوح":request.requestedCount||"غير محدد"}</dd></div><div><dt>تاريخ البدء</dt><dd>{formatDate(request.requiredStartDate)}</dd></div><div><dt>مدة التعاقد</dt><dd>{request.duration || "غير محددة"}</dd></div><div><dt>التواصل المفضل</dt><dd>{request.preferredContact === "phone" ? "اتصال هاتفي" : request.preferredContact === "email" ? "بريد إلكتروني" : "الجوال أو البريد"}</dd></div></>}<div><dt>تاريخ الطلب</dt><dd>{formatDate(request.createdAt, true)}</dd></div></dl><p className="request-details">{request.details}</p></div><StructuredQuoteRequest request={request}/>
    {canWrite && <div className="drawer-section reply-composer"><div className="reply-section-title"><span><Icon name="mail"/></span><div><h3>الرد عبر البريد الإلكتروني</h3><p>سيُحفظ النص وحالة التسليم في سجل الطلب، وتتحول الحالة تلقائياً إلى «تم التواصل» بعد نجاح الإرسال.</p></div></div>{!emailConfigured && <div className="email-configuration-alert"><strong>خدمة البريد غير مهيأة</strong><span>يجب على مدير النظام إضافة مفتاح خدمة الإرسال وبريد المرسل قبل تفعيل زر الإرسال.</span></div>}<form onSubmit={submitReply}><label>عنوان الرسالة<input name="subject" required minLength={3} maxLength={180} defaultValue={`رد شركة دالي للتشغيل والصيانة على طلبكم ${request.trackingCode}`}/></label><label>نص الرد<textarea name="body" required minLength={2} maxLength={10000} rows={8} placeholder="اكتب الرد الذي سيصل إلى بريد الزائر كما هو..."/></label><button className="admin-primary" disabled={replyBusy || !emailConfigured}>{replyBusy ? "جارٍ الإرسال..." : "إرسال الرد وحفظه"}<Icon name="mail"/></button></form></div>}
    <div className="drawer-section reply-history"><div className="reply-section-title"><span><Icon name="documents"/></span><div><h3>سجل المراسلات</h3><p>{replies.length} رسالة مرتبطة بهذا الطلب</p></div></div>{replies.length ? <div className="reply-list">{replies.map((reply) => <article key={reply.id}><header><p><strong>{reply.subject}</strong><small>بواسطة {reply.senderName} · {formatDate(reply.sentAt || reply.createdAt, true)}</small></p><span className={`reply-status ${reply.deliveryStatus}`}>{deliveryLabels[reply.deliveryStatus] || reply.deliveryStatus}</span></header><p>{reply.body}</p><footer><span>إلى: <b dir="ltr">{reply.recipientEmail}</b></span>{reply.deliveryStatus === "sent" && <span><Icon name="check"/> موثّق في سجل التسليم</span>}</footer></article>)}</div> : <div className="empty-operational">لم يُرسل رد على هذا الطلب بعد.</div>}</div><div className="drawer-actions"><a href={`tel:${request.mobile}`}>اتصال بالعميل</a><a href={`mailto:${request.email}`}>فتح البريد الخارجي</a></div></aside></div>;
}
function activityLabel(action: string) {
  const securityLabels: Record<string, string> = {
    "portal-session-started": "بدء جلسة إدارية آمنة",
    "portal-session-ended": "إنهاء جلسة إدارية",
    "portal-session-expired": "انتهاء جلسة إدارية",
    "portal-session-anomaly": "إيقاف جلسة غير معتادة",
    "portal-access-request-submitted": "تقديم طلب انضمام",
    "portal-access-request-updated": "تحديث طلب انضمام",
    "chat-automation-updated": "تحديث نظام الرد الآلي",
  };
  if (securityLabels[action]) return securityLabels[action];
  const labels: Record<string, string> = { "request-status-updated": "تحديث حالة طلب", "user-access-updated": "تحديث صلاحية مستخدم", "employee-created": "إضافة موظف", "financial-record-created": "إضافة سجل مالي", "legal-record-created": "إضافة ملف قانوني", "worker-created": "إضافة عامل", "worker-profile-created": "إنشاء ملف عامل متكامل", "worker-assignment-updated": "تحديث إسناد عامل", "worker-certificate-uploaded": "إضافة شهادة عامل", "company-document-uploaded": "رفع مستند شركة", "official-pdf-issued": "إصدار ملف PDF رسمي", "workforce-contract-created": "إنشاء عقد توفير عمالة", "contract-worker-assigned": "إسناد عامل إلى عقد", "contract-worker-released": "إنهاء إسناد عامل", "document-share-created": "إنشاء رابط مشاركة", "document-downloaded": "تنزيل مستند", "company-stamp-updated": "تحديث ختم الشركة", "company-signature-updated": "تحديث توقيع الشركة", "live-chat-replied": "الرد على محادثة زائر", "live-chat-closed": "إغلاق محادثة زائر", "live-chat-status-updated": "تحديث حالة محادثة", "business-hours-updated": "تحديث ساعات الدوام" };
  return labels[action] ?? "تحديث سجل إداري";
}
