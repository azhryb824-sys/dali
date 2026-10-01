export type Matter = {
  id: number;
  referenceCode: string;
  title: string;
  counterparty: string;
  status: string;
  referralReason: string | null;
  fileSnapshotJson: string | null;
  clientId: number | null;
  contractId: number | null;
  referredBy: string | null;
  referredAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Activity = {
  id: number;
  legalRecordId: number;
  activityType: string;
  title: string;
  details: string | null;
  priority: string;
  status: string;
  dueAt: string | null;
  assignedTo: string | null;
};

export type LegalCaseData = {
  cases: Matter[];
  activities: Activity[];
  canWrite: boolean;
  canApprove: boolean;
};

export type SnapshotDocument = {
  id: number;
  referenceCode?: string;
  title?: string;
  fileName?: string;
  documentType?: string;
  category?: string;
  contentType?: string;
};

export type CancellationRequest = {
  type: "contract-cancellation";
  requestedStatus: "cancelled" | "terminated";
  reason: string;
  requestedBy: string;
  requestedAt: string;
  contractStatusAtReferral: string;
};

export type CaseSnapshot = {
  schemaVersion?: number;
  capturedAt?: string;
  request?: CancellationRequest;
  contract?: {
    id?: number;
    referenceCode?: string;
    clientName?: string;
    title?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
    workSite?: string;
    amountHalalas?: number;
    totalValueHalalas?: number;
    documentId?: number | null;
  };
  client?: Record<string, unknown> | null;
  documents?: SnapshotDocument[];
  payments?: Array<{ id?: number; title?: string; dueDate?: string; status?: string; amountHalalas?: number }>;
  finances?: Array<{ id?: number; description?: string; status?: string; amountHalalas?: number }>;
  professions?: Array<{
    id?: number;
    profession?: string;
    professionName?: string;
    quantity?: number;
    requiredCount?: number;
  }>;
  assignments?: Array<Record<string, unknown>>;
  workers?: Array<{
    id?: number;
    fullName?: string;
    name?: string;
    nationality?: string;
    status?: string;
  }>;
};

export const activityTypes: Record<string, string> = {
  task: "مهمة",
  deadline: "موعد نظامي",
  note: "ملاحظة",
  communication: "مراسلة",
  hearing: "جلسة",
  settlement: "تسوية",
};

export const caseStatuses: Record<string, string> = {
  active: "نشط",
  reviewing: "قيد المراجعة",
  closed: "مغلق",
  archived: "مؤرشف",
};

export const contractStatuses: Record<string, string> = {
  draft: "مسودة",
  internal_review: "مراجعة داخلية",
  legal_review: "مراجعة قانونية",
  approved: "معتمد",
  sent: "مرسل",
  signed: "موقّع",
  active: "ساري",
  suspended: "معلّق",
  expired: "منتهي",
  terminated: "منهى",
  cancelled: "ملغى",
  superseded: "مستبدل",
};

export const money = (value: number) =>
  new Intl.NumberFormat("ar-SA", {
    style: "currency",
    currency: "SAR",
    maximumFractionDigits: 2,
  }).format(value / 100);

export function parseSnapshot(raw: string | null | undefined): CaseSnapshot | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as CaseSnapshot;
    return value && typeof value === "object" ? value : null;
  } catch {
    return null;
  }
}

export function formatDate(value: string | null | undefined, includeTime = false) {
  if (!value) return "غير مسجل";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return includeTime ? date.toLocaleString("ar-SA") : date.toLocaleDateString("ar-SA");
}
