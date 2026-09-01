"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { readApiJson } from "@/lib/client-api";

type Matter = {
  id: number;
  referenceCode: string;
  category: string;
  title: string;
  counterparty: string;
  status: string;
  referralReason: string | null;
  referredAt: string | null;
  expiryDate: string | null;
  fileSnapshotJson: string | null;
  contractId: number | null;
  assignedLawyerId: number | null;
  assignedLawyerEmail: string | null;
  assignedBy: string | null;
  assignedAt: string | null;
  courtCaseNumber: string | null;
  courtName: string | null;
  circuitName: string | null;
  claimType: string | null;
  companyCapacity: string | null;
  currentHearingNumber: string | null;
  claimAmountHalalas: number | null;
  judgmentAmountHalalas: number | null;
  enforcementInstrumentNumber: string | null;
  opposingCounsel: string | null;
  litigationStage: string | null;
  litigationLevel: string | null;
};
type Lawyer = {
  id: number;
  fullName: string;
  licenseNumber: string | null;
  licenseExpiryDate: string | null;
  mobile: string | null;
  email: string | null;
  portalUserEmail: string | null;
  notes: string | null;
  status: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};
type LawyerUser = { email: string; displayName: string };
type ExternalShare = {
  id: string;
  legalRecordId: number;
  attachmentId: number;
  lawyerId: number;
  channel: string;
  expiresAt: string;
  revokedAt: string | null;
  revokedBy: string | null;
  maxDownloads: number;
  downloadCount: number;
  lastAccessedAt: string | null;
  sharedBy: string;
  sharedAt: string;
};
type Activity = {
  id: number;
  legalRecordId: number;
  activityType: string;
  title: string;
  details: string | null;
  priority: string;
  status: string;
  dueAt: string | null;
  assignedTo: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};
type ActionLog = {
  id: number;
  legalRecordId: number;
  activityId: number | null;
  action: string;
  fromStatus: string | null;
  toStatus: string | null;
  details: string | null;
  actorEmail: string;
  actorRole: string;
  createdAt: string;
};
type Attachment = {
  id: number;
  legalRecordId: number;
  title: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
  documentCategory: string;
  versionNumber: number;
  approvalStatus: string;
  sha256: string | null;
};
type Bank = {
  id: number;
  accountCode: string;
  bankName: string;
  accountName: string;
  iban: string;
};
type JudgmentPayment = {
  id: number;
  legalRecordId: number;
  amountHalalas: number;
  description: string;
  status: string;
  requestedBy: string;
  requestedAt: string;
  paidBy: string | null;
  paidAt: string | null;
  bankAccountId: number | null;
  journalEntryId: number | null;
  responseReason: string | null;
};
type Snapshot = {
  contract?: Record<string, unknown>;
  documents?: Array<Record<string, unknown>>;
  payments?: Array<Record<string, unknown>>;
  finances?: Array<Record<string, unknown>>;
  workers?: Array<Record<string, unknown>>;
};
type Data = {
  cases: Matter[];
  activities: Activity[];
  attachments: Attachment[];
  actionLog: ActionLog[];
  judgmentPayments: JudgmentPayment[];
  banks: Bank[];
  lawyers: Lawyer[];
  externalShares: ExternalShare[];
  currentActorEmail: string;
  currentActorRole: string;
  canWrite: boolean;
  canApprove: boolean;
  canManageCases: boolean;
  canSupervise: boolean;
  canShareExternally: boolean;
  canPayJudgments: boolean;
};
type Hearing = {
  id: number;
  legalRecordId: number;
  hearingNumber: string;
  scheduledAt: string;
  attendeesJson: string;
  requestsJson: string;
  decisionText: string | null;
  nextHearingAt: string | null;
  status: string;
};
type Submission = {
  id: number;
  legalRecordId: number;
  submissionType: string;
  title: string;
  versionNumber: number;
  status: string;
  content: string | null;
};
type Settlement = {
  id: number;
  legalRecordId: number;
  amountHalalas: number;
  concessions: string | null;
  paymentScheduleJson: string;
  status: string;
  requestedBy: string;
};
type WorkflowData = {
  hearings: Hearing[];
  submissions: Submission[];
  settlements: Settlement[];
  canSupervise: boolean;
  canApproveSettlement: boolean;
};
const types: Record<string, string> = {
  task: "مهمة",
  deadline: "موعد نظامي",
  note: "ملاحظة",
  communication: "مراسلة",
  hearing: "جلسة",
  settlement: "تسوية",
};
const riskLabels: Record<string, string> = {
  low: "منخفض",
  medium: "متوسط",
  high: "مرتفع",
  critical: "حرج",
};
const riskRank: Record<string, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};
const text = (value: unknown) =>
  value === null || value === undefined || value === ""
    ? "غير مسجل"
    : String(value);
const money = (value: unknown) =>
  new Intl.NumberFormat("ar-SA", { style: "currency", currency: "SAR" }).format(
    Number(value || 0) / 100,
  );

export default function LegalCaseWorkspace() {
  const [data, setData] = useState<Data | null>(null),
    [selected, setSelected] = useState(0),
    [notice, setNotice] = useState(""),
    [uploading, setUploading] = useState(false),
    [companyCaseModal, setCompanyCaseModal] = useState(false),
    [companyCaseBusy, setCompanyCaseBusy] = useState(false),
    [lawyerModal, setLawyerModal] = useState(false),
    [editingLawyer, setEditingLawyer] = useState<Lawyer | null>(null),
    [lawyerBusy, setLawyerBusy] = useState(false),
    [assignmentBusy, setAssignmentBusy] = useState(false),
    [shareBusy, setShareBusy] = useState(false),
    [currentTime, setCurrentTime] = useState(0),
    [lawyerUsers, setLawyerUsers] = useState<LawyerUser[]>([]),
    [transferringLawyer, setTransferringLawyer] = useState<Lawyer | null>(
      null,
    ),
    [sharingAttachment, setSharingAttachment] = useState<Attachment | null>(
      null,
    ),
    [payingJudgment, setPayingJudgment] = useState<JudgmentPayment | null>(
      null,
    );
  const [workflows, setWorkflows] = useState<WorkflowData>({
    hearings: [],
    submissions: [],
    settlements: [],
    canSupervise: false,
    canApproveSettlement: false,
  });
  const load = useCallback(async () => {
    const [response, workflowResponse, lawyerResponse] = await Promise.all([
      fetch("/api/portal/legal-cases", { cache: "no-store" }),
      fetch("/api/portal/legal-cases/workflows", { cache: "no-store" }),
      fetch("/api/portal/legal-lawyers", { cache: "no-store" }),
    ]);
    const result = (await readApiJson(response)) as Data & { error?: string };
    if (!response.ok) throw new Error(result.error || "تعذر تحميل القضايا");
    if (workflowResponse.ok)
      setWorkflows((await readApiJson(workflowResponse)) as WorkflowData);
    if (lawyerResponse.ok) {
      const directory = (await readApiJson(lawyerResponse)) as {
        lawyers?: Lawyer[];
        userCandidates?: LawyerUser[];
      };
      if (directory.lawyers) result.lawyers = directory.lawyers;
      setLawyerUsers(directory.userCandidates || []);
    }
    setData(result);
    setCurrentTime(Date.now());
    setSelected((value) => value || result.cases[0]?.id || 0);
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(
      () =>
        void load().catch((error) =>
          setNotice(error instanceof Error ? error.message : "تعذر التحميل"),
        ),
      0,
    );
    return () => window.clearTimeout(timer);
  }, [load]);
  const matter = data?.cases.find((item) => item.id === selected);
  const assignedLawyer = data?.lawyers.find(
    (lawyer) => lawyer.id === matter?.assignedLawyerId,
  );
  const externalLawyers = useMemo(
    () =>
      data?.lawyers.filter(
        (lawyer) =>
          lawyer.status === "active" &&
          !lawyer.portalUserEmail &&
          Boolean(lawyer.mobile),
      ) || [],
    [data],
  );
  const matterShares = useMemo(
    () =>
      data?.externalShares.filter(
        (share) => share.legalRecordId === selected,
      ) || [],
    [data, selected],
  );
  const activities = useMemo(
    () =>
      data?.activities.filter((item) => item.legalRecordId === selected) || [],
    [data, selected],
  );
  const selectedRisk = useMemo(
    () =>
      activities
        .filter((item) => !["completed", "cancelled"].includes(item.status))
        .reduce(
          (highest, item) =>
            (riskRank[item.priority] || 0) > (riskRank[highest] || 0)
              ? item.priority
              : highest,
          "low",
        ),
    [activities],
  );
  const responseDeadline = useMemo(
    () =>
      activities.find(
        (item) =>
          item.activityType === "deadline" &&
          item.title === "انتهاء مهلة الرد على الدعوى" &&
          !["completed", "cancelled"].includes(item.status),
      ) || null,
    [activities],
  );
  const attachments = useMemo(
    () =>
      data?.attachments.filter((item) => item.legalRecordId === selected) || [],
    [data, selected],
  );
  const actionLog = useMemo(
    () =>
      data?.actionLog
        .filter((item) => item.legalRecordId === selected)
        .slice()
        .reverse() || [],
    [data, selected],
  );
  const judgmentPayments = useMemo(
    () =>
      data?.judgmentPayments.filter(
        (item) => item.legalRecordId === selected,
      ) || [],
    [data, selected],
  );
  const companyDefenseCases = useMemo(
    () =>
      data?.cases.filter(
        (item) => item.companyCapacity === "مدعى عليها",
      ) || [],
    [data],
  );
  const urgentDefenseDeadlines = useMemo(() => {
    if (!data || !currentTime) return [];
    const defenseIds = new Set(companyDefenseCases.map((item) => item.id));
    const sevenDaysFromNow = currentTime + 7 * 86_400_000;
    return data.activities.filter(
      (item) =>
        defenseIds.has(item.legalRecordId) &&
        item.activityType === "deadline" &&
        !["completed", "cancelled"].includes(item.status) &&
        Boolean(item.dueAt) &&
        Date.parse(item.dueAt || "") <= sevenDaysFromNow,
    );
  }, [companyDefenseCases, currentTime, data]);
  const snapshot = useMemo(() => {
    if (!matter?.fileSnapshotJson) return null;
    try {
      return JSON.parse(matter.fileSnapshotJson) as Snapshot;
    } catch {
      return null;
    }
  }, [matter]);
  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const body = Object.fromEntries(new FormData(form).entries());
    const response = await fetch("/api/portal/legal-cases", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...body, legalRecordId: selected }),
    });
    const result = (await readApiJson(response)) as { error?: string };
    if (!response.ok) {
      setNotice(result.error || "تعذر حفظ الإجراء");
      return;
    }
    form.reset();
    setNotice("تمت إضافة الإجراء إلى سجل القضية.");
    await load();
  }
  async function createCompanyDefenseCase(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    const form = event.currentTarget;
    setCompanyCaseBusy(true);
    try {
      const response = await fetch("/api/portal/legal-cases", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "create-company-defense-case",
          ...Object.fromEntries(new FormData(form)),
        }),
      });
      const result = (await readApiJson(response)) as {
        error?: string;
        case?: Matter;
      };
      if (!response.ok || !result.case)
        throw new Error(result.error || "تعذر تسجيل القضية المرفوعة على الشركة");
      setSelected(result.case.id);
      setCompanyCaseModal(false);
      setNotice(
        `سُجلت القضية ${result.case.referenceCode} مع مهلة الرد وسجل الإسناد.`,
      );
      await load();
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "تعذر تسجيل القضية المرفوعة على الشركة",
      );
    } finally {
      setCompanyCaseBusy(false);
    }
  }
  async function requestJudgmentPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget,
      fd = new FormData(form);
    const response = await fetch("/api/portal/legal-cases", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "request-judgment-payment",
        legalRecordId: selected,
        amount: fd.get("amount"),
        description: fd.get("description"),
      }),
    });
    const result = (await readApiJson(response)) as { error?: string };
    if (!response.ok) {
      setNotice(result.error || "تعذر إرسال طلب السداد");
      return;
    }
    form.reset();
    setNotice("أُرسل طلب سداد المحكوم به للمالك.");
    await load();
  }
  async function payJudgment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!payingJudgment) return;
    const fd = new FormData(event.currentTarget);
    const response = await fetch("/api/portal/legal-cases", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "pay-judgment",
        paymentId: payingJudgment.id,
        bankAccountId: fd.get("bankAccountId"),
        paymentReference: fd.get("paymentReference"),
      }),
    });
    const result = (await readApiJson(response)) as { error?: string };
    if (!response.ok) {
      setNotice(result.error || "تعذر تسجيل سداد المحكوم به");
      return;
    }
    setPayingJudgment(null);
    setNotice(
      "تم تسجيل السداد وإنشاء قيد الأحكام القانونية بانتظار الاعتماد والترحيل.",
    );
    await load();
  }
  async function assignCase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget,
      assignedLawyerId = Number(
        new FormData(form).get("assignedLawyerId") || 0,
      );
    if (!assignedLawyerId) {
      setNotice("اختر المحامي المستلم للقضية.");
      return;
    }
    setAssignmentBusy(true);
    try {
      const response = await fetch("/api/portal/legal-cases", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "assign-case",
          legalRecordId: selected,
          assignedLawyerId,
        }),
      });
      const result = (await readApiJson(response)) as { error?: string };
      if (!response.ok)
        throw new Error(result.error || "تعذر إسناد القضية");
      setNotice("تم تحديد المحامي المستلم للقضية وتسجيل وقت الإسناد.");
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "تعذر إسناد القضية");
    } finally {
      setAssignmentBusy(false);
    }
  }
  function closeLawyerModal() {
    setLawyerModal(false);
    setEditingLawyer(null);
  }
  async function saveLawyer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setLawyerBusy(true);
    try {
      const values = Object.fromEntries(new FormData(form).entries());
      const response = await fetch("/api/portal/legal-lawyers", {
        method: editingLawyer ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          editingLawyer
            ? {
                ...values,
                action: "update-details",
                lawyerId: editingLawyer.id,
              }
            : values,
        ),
      });
      const result = (await readApiJson(response)) as { error?: string };
      if (!response.ok)
        throw new Error(
          result.error ||
            (editingLawyer
              ? "تعذر تعديل بيانات المحامي"
              : "تعذر إضافة المحامي"),
        );
      form.reset();
      const updated = Boolean(editingLawyer);
      closeLawyerModal();
      setNotice(
        updated
          ? "تم تعديل بيانات المحامي وتسجيل العملية."
          : "تمت إضافة المحامي إلى السجل القانوني.",
      );
      await load();
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "تعذر حفظ بيانات المحامي",
      );
    } finally {
      setLawyerBusy(false);
    }
  }
  async function updateLawyerStatus(lawyer: Lawyer) {
    setLawyerBusy(true);
    try {
      const response = await fetch("/api/portal/legal-lawyers", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          lawyerId: lawyer.id,
          status: lawyer.status === "active" ? "inactive" : "active",
        }),
      });
      const result = (await readApiJson(response)) as { error?: string };
      if (!response.ok)
        throw new Error(result.error || "تعذر تحديث حالة المحامي");
      setNotice("تم تحديث حالة المحامي وتسجيل العملية.");
      await load();
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "تعذر تحديث حالة المحامي",
      );
    } finally {
      setLawyerBusy(false);
    }
  }
  async function deleteLawyer(lawyer: Lawyer) {
    if (
      !window.confirm(
        `هل تريد حذف المحامي «${lawyer.fullName}» نهائيًا من السجل؟`,
      )
    )
      return;
    const reason = window.prompt("اكتب سبب حذف المحامي")?.trim() || "";
    if (!reason) return;
    setLawyerBusy(true);
    try {
      const response = await fetch("/api/portal/legal-lawyers", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lawyerId: lawyer.id, reason }),
      });
      const result = (await readApiJson(response)) as { error?: string };
      if (!response.ok)
        throw new Error(result.error || "تعذر حذف المحامي");
      setNotice("حُذف المحامي من السجل مع توثيق سبب الحذف.");
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "تعذر حذف المحامي");
    } finally {
      setLawyerBusy(false);
    }
  }
  async function transferLawyerCases(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!transferringLawyer) return;
    const values = Object.fromEntries(new FormData(event.currentTarget));
    setLawyerBusy(true);
    try {
      const response = await fetch("/api/portal/legal-lawyers", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...values,
          action: "transfer-cases",
          lawyerId: transferringLawyer.id,
        }),
      });
      const result = (await readApiJson(response)) as {
        error?: string;
        transferredCount?: number;
      };
      if (!response.ok)
        throw new Error(result.error || "تعذر تحويل القضايا");
      setTransferringLawyer(null);
      setNotice(
        `تم تحويل ${result.transferredCount || 0} قضية وتسجيل وقت الإسناد الجديد.`,
      );
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "تعذر تحويل القضايا");
    } finally {
      setLawyerBusy(false);
    }
  }
  async function shareOnWhatsApp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!sharingAttachment) return;
    const popup = window.open("about:blank", "_blank");
    if (popup) popup.opener = null;
    const values = Object.fromEntries(new FormData(event.currentTarget));
    setShareBusy(true);
    try {
      const response = await fetch("/api/portal/legal-cases/shares", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...values,
          legalRecordId: selected,
          attachmentId: sharingAttachment.id,
        }),
      });
      const result = (await readApiJson(response)) as {
        error?: string;
        whatsappUrl?: string;
      };
      if (!response.ok || !result.whatsappUrl)
        throw new Error(result.error || "تعذر تجهيز مشاركة واتساب");
      setSharingAttachment(null);
      setNotice("تم تسجيل تاريخ وساعة المشاركة وفتح محادثة واتساب.");
      if (popup) popup.location.href = result.whatsappUrl;
      else window.location.href = result.whatsappUrl;
      await load();
    } catch (error) {
      popup?.close();
      setNotice(
        error instanceof Error ? error.message : "تعذر تجهيز مشاركة واتساب",
      );
    } finally {
      setShareBusy(false);
    }
  }
  async function revokeShare(share: ExternalShare) {
    const reason = window.prompt("سبب إبطال رابط المشاركة") || "";
    if (!reason) return;
    const response = await fetch("/api/portal/legal-cases/shares", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ shareId: share.id, reason }),
    });
    const result = (await readApiJson(response)) as { error?: string };
    if (!response.ok) {
      setNotice(result.error || "تعذر إبطال رابط المشاركة");
      return;
    }
    setNotice("أُبطل رابط المشاركة مع بقاء سجلها وتاريخها محفوظين.");
    await load();
  }
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget,
      body = new FormData(form);
    body.set("legalRecordId", String(selected));
    setUploading(true);
    const response = await fetch("/api/portal/legal-cases/attachments", {
      method: "POST",
      body,
    });
    const result = (await readApiJson(response)) as { error?: string };
    setUploading(false);
    if (!response.ok) {
      setNotice(result.error || "تعذر رفع المرفق");
      return;
    }
    form.reset();
    setNotice("تم حفظ المرفق داخل الملف القانوني.");
    await load();
  }
  async function update(id: number, status: string) {
    const response = await fetch("/api/portal/legal-cases", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    const result = (await readApiJson(response)) as { error?: string };
    if (!response.ok) {
      setNotice(result.error || "تعذر تحديث الإجراء");
      return;
    }
    await load();
  }
  async function legalDecision(
    action: string,
    payload: Record<string, unknown>,
  ) {
    const response = await fetch("/api/portal/legal-cases", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, ...payload }),
    });
    const result = (await readApiJson(response)) as { error?: string };
    if (!response.ok) {
      setNotice(result.error || "تعذر تنفيذ القرار");
      return;
    }
    setNotice("تم حفظ القرار في سجل القضية.");
    await load();
  }
  async function updateCaseStatus(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    await legalDecision("update-case-status", {
      legalRecordId: selected,
      ...values,
    });
  }
  async function updateCaseDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await legalDecision("update-case-details", {
      legalRecordId: selected,
      ...Object.fromEntries(new FormData(event.currentTarget)),
    });
  }
  async function workflowAction(
    method: "POST" | "PATCH",
    payload: Record<string, unknown>,
    form?: HTMLFormElement,
  ) {
    const response = await fetch("/api/portal/legal-cases/workflows", {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = (await readApiJson(response)) as { error?: string };
    if (!response.ok) {
      setNotice(result.error || "تعذر حفظ الدورة القانونية");
      return;
    }
    form?.reset();
    setNotice("تم تحديث الدورة القانونية وتوثيقها.");
    await load();
  }
  if (!data)
    return (
      <section className="panel legal-matter-workspace">
        <p>{notice || "جارٍ تحميل إدارة القضايا..."}</p>
      </section>
    );
  return (
    <section className="panel legal-matter-workspace">
      <header>
        <div>
          <span>إدارة القضايا والمطالبات القانونية</span>
          <h2>ملف قانوني مترابط بالعقد والعميل</h2>
          <p>
            القضايا المرفوعة من الشركة أو عليها، والمحامين والمواعيد والمذكرات
            والمرفقات في ملف قانوني واحد.
          </p>
        </div>
        <div className="heading-actions">
          {data.canManageCases && (
            <>
              <button
                type="button"
                className="admin-primary legal-defense-create"
                onClick={() => setCompanyCaseModal(true)}
              >
                + تسجيل قضية على الشركة
              </button>
              <button
                type="button"
                className="admin-secondary"
                onClick={() => {
                  setEditingLawyer(null);
                  setLawyerModal(true);
                }}
              >
                + إضافة محامي
              </button>
            </>
          )}
          <b>
            {data.cases.filter((item) => item.status !== "closed").length} ملف
            مفتوح
          </b>
        </div>
      </header>
      {notice && <p className="operations-notice">{notice}</p>}
      <div className="legal-defense-kpis">
        <article>
          <span>قضايا مرفوعة على الشركة</span>
          <strong>{companyDefenseCases.length}</strong>
          <small>
            {
              companyDefenseCases.filter(
                (item) => !["closed", "cancelled"].includes(item.status),
              ).length
            }{" "}
            قيد المتابعة
          </small>
        </article>
        <article className={urgentDefenseDeadlines.length ? "urgent" : ""}>
          <span>مهل رد خلال 7 أيام أو متأخرة</span>
          <strong>{urgentDefenseDeadlines.length}</strong>
          <small>تُرتب حسب سجل المواعيد القانوني</small>
        </article>
      </div>
      <details className="legal-lawyer-register">
        <summary>
          سجل المحامين — {data.lawyers.filter((item) => item.status === "active").length} نشط
        </summary>
        <div className="management-table-wrap">
          <table className="management-table">
            <thead>
              <tr>
                <th>المحامي</th>
                <th>الرخصة</th>
                <th>النوع والصلاحية</th>
                <th>التواصل</th>
                <th>الحالة</th>
                {data.canManageCases && <th>إجراء</th>}
              </tr>
            </thead>
            <tbody>
              {data.lawyers.map((lawyer) => (
                <tr key={lawyer.id}>
                  <td>
                    <strong>{lawyer.fullName}</strong>
                    <small>{lawyer.notes || "دون ملاحظات"}</small>
                  </td>
                  <td>
                    <strong dir="ltr">{lawyer.licenseNumber || "—"}</strong>
                    <small>
                      {lawyer.licenseExpiryDate
                        ? `تنتهي ${new Date(`${lawyer.licenseExpiryDate}T00:00:00`).toLocaleDateString("ar-SA")}`
                        : "دون تاريخ انتهاء"}
                    </small>
                  </td>
                  <td>
                    <strong>
                      {lawyer.portalUserEmail
                        ? "محامي لديه مستخدم"
                        : "محامي خارجي"}
                    </strong>
                    <small dir="ltr">{lawyer.portalUserEmail || "دون دخول للنظام"}</small>
                  </td>
                  <td>
                    <strong dir="ltr">{lawyer.mobile || "—"}</strong>
                    <small dir="ltr">{lawyer.email || "—"}</small>
                  </td>
                  <td>{lawyer.status === "active" ? "نشط" : "غير نشط"}</td>
                  {data.canManageCases && (
                    <td>
                      <div className="legal-lawyer-actions">
                        <button
                          type="button"
                          className="admin-secondary"
                          disabled={lawyerBusy}
                          onClick={() => {
                            setEditingLawyer(lawyer);
                            setLawyerModal(true);
                          }}
                        >
                          تعديل
                        </button>
                        <button
                          type="button"
                          className="admin-secondary"
                          disabled={
                            lawyerBusy ||
                            !data.lawyers.some(
                              (item) =>
                                item.id !== lawyer.id &&
                                item.status === "active",
                            )
                          }
                          onClick={() => setTransferringLawyer(lawyer)}
                        >
                          تحويل القضايا
                        </button>
                        <button
                          type="button"
                          className="admin-secondary"
                          disabled={lawyerBusy}
                          onClick={() => void updateLawyerStatus(lawyer)}
                        >
                          {lawyer.status === "active" ? "تعطيل" : "تفعيل"}
                        </button>
                        <button
                          type="button"
                          className="danger"
                          disabled={lawyerBusy}
                          onClick={() => void deleteLawyer(lawyer)}
                        >
                          حذف
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {!data.lawyers.length && (
            <p className="legal-empty">لم يُضف أي محامٍ بعد.</p>
          )}
        </div>
      </details>
      <div className="legal-matter-layout">
        <aside>
          {data.cases.map((item) => (
            <button
              type="button"
              key={item.id}
              className={selected === item.id ? "active" : ""}
              onClick={() => setSelected(item.id)}
            >
              <strong>{item.referenceCode}</strong>
              <span>{item.counterparty}</span>
              <small>
                {item.companyCapacity === "مدعى عليها"
                  ? `مرفوعة على الشركة · ${item.status}`
                  : item.status}
              </small>
            </button>
          ))}
        </aside>
        <main>
          {matter ? (
            <>
              <div className="legal-matter-head">
                <div>
                  <div className="legal-case-classification">
                    <span
                      className={
                        matter.companyCapacity === "مدعى عليها"
                          ? "defense"
                          : ""
                      }
                    >
                      {matter.companyCapacity === "مدعى عليها"
                        ? "قضية مرفوعة على الشركة"
                        : matter.companyCapacity || "ملف قانوني"}
                    </span>
                    {matter.companyCapacity === "مدعى عليها" && (
                      <span className={`risk-${selectedRisk}`}>
                        مخاطر {riskLabels[selectedRisk] || selectedRisk}
                      </span>
                    )}
                  </div>
                  <h3>{matter.title}</h3>
                  <p>{matter.referralReason || "ملف قانوني مسجل يدويًا"}</p>
                  {matter.companyCapacity === "مدعى عليها" && (
                    <div className="legal-defense-dates">
                      <p>
                        <strong>المدعي:</strong> {matter.counterparty}
                      </p>
                      <p>
                        <strong>استلام التبليغ:</strong>{" "}
                        {matter.referredAt
                          ? new Date(matter.referredAt).toLocaleString("ar-SA", {
                              dateStyle: "medium",
                              timeStyle: "short",
                            })
                          : "غير مسجل"}
                      </p>
                      <p
                        className={
                          responseDeadline?.dueAt &&
                          Date.parse(responseDeadline.dueAt) < currentTime
                            ? "overdue"
                            : ""
                        }
                      >
                        <strong>انتهاء مهلة الرد:</strong>{" "}
                        {responseDeadline?.dueAt
                          ? new Date(responseDeadline.dueAt).toLocaleString(
                              "ar-SA",
                              { dateStyle: "medium", timeStyle: "short" },
                            )
                          : matter.expiryDate
                            ? new Date(
                                `${matter.expiryDate}T00:00:00`,
                              ).toLocaleDateString("ar-SA")
                            : "غير مسجل"}
                      </p>
                    </div>
                  )}
                  <p>
                    <strong>المحامي المستلم للقضية:</strong>{" "}
                    {assignedLawyer?.fullName ||
                      matter.assignedLawyerEmail ||
                      "لم يُسند بعد"}
                  </p>
                  {matter.assignedAt && (
                    <p>
                      <strong>تاريخ ووقت الإسناد:</strong>{" "}
                      {new Date(matter.assignedAt).toLocaleString("ar-SA", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                      {matter.assignedBy ? ` · أسندها ${matter.assignedBy}` : ""}
                    </p>
                  )}
                  {assignedLawyer && (
                    <p>
                      <strong>نوع المحامي:</strong>{" "}
                      {assignedLawyer.portalUserEmail
                        ? "محامي لديه مستخدم ويدير جميع القضايا"
                        : "محامي خارجي دون دخول للنظام"}
                    </p>
                  )}
                  {data.canManageCases && (
                    <>
                      <form
                        className="legal-assignment-control"
                        key={`assignment-${matter.id}-${matter.assignedLawyerId || 0}`}
                        onSubmit={assignCase}
                      >
                        <label>
                          المحامي المستلم
                          <select
                            name="assignedLawyerId"
                            required
                            defaultValue={matter.assignedLawyerId || ""}
                          >
                            <option value="" disabled>
                              اختر المحامي المستلم
                            </option>
                            {data.lawyers
                              .filter((lawyer) => lawyer.status === "active")
                              .map((lawyer) => (
                                <option key={lawyer.id} value={lawyer.id}>
                                  {lawyer.fullName} — {lawyer.portalUserEmail ? "داخلي" : "خارجي"}
                                </option>
                              ))}
                          </select>
                        </label>
                        <button
                          type="submit"
                          disabled={
                            assignmentBusy ||
                            !data.lawyers.some(
                              (lawyer) => lawyer.status === "active",
                            )
                          }
                        >
                          {assignmentBusy
                            ? "جارٍ الإسناد..."
                            : matter.assignedLawyerId
                              ? "إعادة إسناد القضية"
                              : "إسناد القضية"}
                        </button>
                      </form>
                      <form onSubmit={updateCaseStatus}>
                        <select name="status" defaultValue={matter.status}>
                          <option value="reviewing">قيد المراجعة</option>
                          <option value="active">مفتوح</option>
                          <option value="in_progress">قيد العمل</option>
                          <option value="closed">مغلق</option>
                          <option value="cancelled">ملغى</option>
                        </select>
                        <input
                          name="reason"
                          placeholder="سبب الإغلاق أو تغيير الحالة"
                        />
                        <button>تحديث حالة الملف</button>
                      </form>
                    </>
                  )}
                </div>
                <span>
                  {
                    activities.filter(
                      (item) =>
                        !["completed", "cancelled"].includes(item.status),
                    ).length
                  }{" "}
                  إجراءات مفتوحة
                </span>
              </div>
              {snapshot && (
                <section className="legal-linked-file">
                  <h3>العقد والملف المحال</h3>
                  <dl>
                    <div>
                      <dt>مرجع العقد</dt>
                      <dd>{text(snapshot.contract?.referenceCode)}</dd>
                    </div>
                    <div>
                      <dt>العميل</dt>
                      <dd>
                        {text(
                          snapshot.contract?.clientName || matter.counterparty,
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>حالة العقد</dt>
                      <dd>{text(snapshot.contract?.status)}</dd>
                    </div>
                    <div>
                      <dt>قيمة العقد</dt>
                      <dd>{money(snapshot.contract?.amountHalalas)}</dd>
                    </div>
                  </dl>
                  <div className="legal-related-counts">
                    <span>
                      المستندات <b>{snapshot.documents?.length || 0}</b>
                    </span>
                    <span>
                      الدفعات <b>{snapshot.payments?.length || 0}</b>
                    </span>
                    <span>
                      السجلات المالية <b>{snapshot.finances?.length || 0}</b>
                    </span>
                    <span>
                      العمالة <b>{snapshot.workers?.length || 0}</b>
                    </span>
                  </div>
                  {snapshot.documents?.map((item, index) => (
                    <article key={index}>
                      <strong>{text(item.title || item.referenceCode)}</strong>
                      <small>{text(item.fileName || item.status)}</small>
                      {Boolean(item.id) && (
                        <a
                          href={`/api/portal/documents/${item.id}?inline=1`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          فتح المستند
                        </a>
                      )}
                    </article>
                  ))}
                </section>
              )}
              {data.canManageCases && (
                <details className="legal-linked-file">
                  <summary>بيانات القضية والمحكمة</summary>
                  <form
                    className="legal-activity-form"
                    onSubmit={updateCaseDetails}
                  >
                    <input
                      name="courtCaseNumber"
                      defaultValue={matter.courtCaseNumber || ""}
                      placeholder="رقم القضية لدى المحكمة"
                    />
                    <input
                      name="courtName"
                      defaultValue={matter.courtName || ""}
                      placeholder="المحكمة"
                    />
                    <input
                      name="circuitName"
                      defaultValue={matter.circuitName || ""}
                      placeholder="الدائرة"
                    />
                    <input
                      name="claimType"
                      defaultValue={matter.claimType || ""}
                      placeholder="نوع الدعوى"
                    />
                    <input
                      name="companyCapacity"
                      defaultValue={matter.companyCapacity || ""}
                      placeholder="صفة الشركة"
                    />
                    <input
                      name="currentHearingNumber"
                      defaultValue={matter.currentHearingNumber || ""}
                      placeholder="رقم الجلسة"
                    />
                    <input
                      name="claimAmount"
                      type="number"
                      min="0"
                      step="0.01"
                      defaultValue={(matter.claimAmountHalalas || 0) / 100}
                      placeholder="قيمة المطالبة"
                    />
                    <input
                      name="judgmentAmount"
                      type="number"
                      min="0"
                      step="0.01"
                      defaultValue={(matter.judgmentAmountHalalas || 0) / 100}
                      placeholder="قيمة الحكم"
                    />
                    <input
                      name="enforcementInstrumentNumber"
                      defaultValue={matter.enforcementInstrumentNumber || ""}
                      placeholder="رقم السند التنفيذي"
                    />
                    <input
                      name="opposingCounsel"
                      defaultValue={matter.opposingCounsel || ""}
                      placeholder="محامي الخصم"
                    />
                    <input
                      name="litigationStage"
                      defaultValue={matter.litigationStage || ""}
                      placeholder="المرحلة القضائية"
                    />
                    <input
                      name="litigationLevel"
                      defaultValue={matter.litigationLevel || ""}
                      placeholder="درجة التقاضي"
                    />
                    <button>حفظ بيانات القضية</button>
                  </form>
                </details>
              )}
              <details className="legal-linked-file">
                <summary>الجلسات القضائية</summary>
                {data.canWrite && (
                  <form
                    className="legal-activity-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const form = event.currentTarget;
                      void workflowAction(
                        "POST",
                        {
                          action: "hearing",
                          legalRecordId: selected,
                          ...Object.fromEntries(new FormData(form)),
                        },
                        form,
                      );
                    }}
                  >
                    <input
                      name="hearingNumber"
                      required
                      placeholder="رقم الجلسة"
                    />
                    <input name="scheduledAt" type="datetime-local" required />
                    <input name="courtName" placeholder="المحكمة" />
                    <input name="circuitName" placeholder="الدائرة" />
                    <textarea
                      name="attendees"
                      placeholder="الحضور؛ كل اسم في سطر"
                    />
                    <textarea
                      name="requests"
                      placeholder="الطلبات؛ كل طلب في سطر"
                    />
                    <textarea name="decisionText" placeholder="قرار الجلسة" />
                    <input name="nextHearingAt" type="datetime-local" />
                    <select name="status">
                      <option value="scheduled">مجدولة</option>
                      <option value="held">انعقدت</option>
                      <option value="postponed">مؤجلة</option>
                      <option value="cancelled">ملغاة</option>
                    </select>
                    <button>حفظ بطاقة الجلسة</button>
                  </form>
                )}
                <div className="employee-related-list">
                  {workflows.hearings
                    .filter((item) => item.legalRecordId === selected)
                    .map((item) => (
                      <article key={item.id}>
                        <div>
                          <strong>جلسة {item.hearingNumber}</strong>
                          <small>
                            {new Date(item.scheduledAt).toLocaleString("ar-SA")}{" "}
                            · {item.status}
                          </small>
                        </div>
                        <span>{item.decisionText || "لم يسجل قرار بعد"}</span>
                      </article>
                    ))}
                </div>
              </details>
              <details className="legal-linked-file">
                <summary>المذكرات واللوائح وإصداراتها</summary>
                {data.canWrite && (
                  <form
                    className="legal-activity-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const form = event.currentTarget;
                      void workflowAction(
                        "POST",
                        {
                          action: "submission",
                          legalRecordId: selected,
                          ...Object.fromEntries(new FormData(form)),
                        },
                        form,
                      );
                    }}
                  >
                    <select name="submissionType">
                      <option value="memorandum">مذكرة</option>
                      <option value="pleading">لائحة</option>
                      <option value="response">رد</option>
                      <option value="appeal">استئناف</option>
                    </select>
                    <input
                      name="title"
                      required
                      minLength={3}
                      placeholder="عنوان المذكرة"
                    />
                    <select name="parentId" defaultValue="">
                      <option value="">إصدار أول</option>
                      {workflows.submissions
                        .filter((item) => item.legalRecordId === selected)
                        .map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.title} · إصدار {item.versionNumber}
                          </option>
                        ))}
                    </select>
                    <textarea name="content" placeholder="محتوى المسودة" />
                    <button>حفظ المسودة</button>
                  </form>
                )}
                <div className="employee-related-list">
                  {workflows.submissions
                    .filter((item) => item.legalRecordId === selected)
                    .map((item) => (
                      <article key={item.id}>
                        <div>
                          <strong>
                            {item.title} · إصدار {item.versionNumber}
                          </strong>
                          <small>
                            {item.submissionType} · {item.status}
                          </small>
                        </div>
                        {data.canWrite && item.status === "draft" && (
                          <button
                            onClick={() =>
                              void workflowAction("PATCH", {
                                action: "submission-status",
                                submissionId: item.id,
                                status: "review",
                              })
                            }
                          >
                            إرسال للمراجعة
                          </button>
                        )}
                        {workflows.canSupervise && item.status === "review" && (
                          <button
                            onClick={() =>
                              void workflowAction("PATCH", {
                                action: "submission-status",
                                submissionId: item.id,
                                status: "approved",
                              })
                            }
                          >
                            اعتماد
                          </button>
                        )}
                        {workflows.canSupervise &&
                          item.status === "approved" && (
                            <button
                              onClick={() =>
                                void workflowAction("PATCH", {
                                  action: "submission-status",
                                  submissionId: item.id,
                                  status: "issued",
                                })
                              }
                            >
                              إصدار نهائي
                            </button>
                          )}
                      </article>
                    ))}
                </div>
              </details>
              <details className="legal-linked-file">
                <summary>التسويات القانونية</summary>
                {data.canWrite && (
                  <form
                    className="legal-activity-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const form = event.currentTarget;
                      void workflowAction(
                        "POST",
                        {
                          action: "settlement",
                          legalRecordId: selected,
                          ...Object.fromEntries(new FormData(form)),
                        },
                        form,
                      );
                    }}
                  >
                    <input
                      name="amount"
                      type="number"
                      min="0.01"
                      step="0.01"
                      required
                      placeholder="قيمة التسوية"
                    />
                    <textarea
                      name="paymentSchedule"
                      placeholder="جدول السداد؛ كل دفعة في سطر"
                    />
                    <textarea
                      name="concessions"
                      placeholder="التنازلات والشروط"
                    />
                    <button>إرسال التسوية للاعتماد</button>
                  </form>
                )}
                <div className="employee-related-list">
                  {workflows.settlements
                    .filter((item) => item.legalRecordId === selected)
                    .map((item) => (
                      <article key={item.id}>
                        <div>
                          <strong>{money(item.amountHalalas)}</strong>
                          <small>
                            {item.status} · طلبها {item.requestedBy}
                          </small>
                        </div>
                        <span>{item.concessions || "دون تنازلات"}</span>
                        {workflows.canApproveSettlement &&
                          item.status === "pending_approval" && (
                            <>
                              <button
                                onClick={() =>
                                  void workflowAction("PATCH", {
                                    action: "settlement-decision",
                                    settlementId: item.id,
                                    decision: "approved",
                                  })
                                }
                              >
                                اعتماد التسوية
                              </button>
                              <button
                                className="danger"
                                onClick={() =>
                                  void workflowAction("PATCH", {
                                    action: "settlement-decision",
                                    settlementId: item.id,
                                    decision: "rejected",
                                  })
                                }
                              >
                                رفض
                              </button>
                            </>
                          )}
                      </article>
                    ))}
                </div>
              </details>
              <section className="legal-judgment-payments">
                <h3>طلبات سداد المحكوم به</h3>
                {data.canWrite && (
                  <form
                    className="legal-activity-form"
                    onSubmit={requestJudgmentPayment}
                  >
                    <input
                      name="amount"
                      type="number"
                      min="0.01"
                      step="0.01"
                      required
                      placeholder="المبلغ بالريال"
                    />
                    <textarea
                      name="description"
                      required
                      minLength={5}
                      placeholder="وصف الحكم وسبب السداد"
                    />
                    <button>إرسال طلب السداد للمالك</button>
                  </form>
                )}
                {judgmentPayments.map((item) => (
                  <article key={item.id}>
                    <div>
                      <strong>{money(item.amountHalalas)}</strong>
                      <p>{item.description}</p>
                      <small>
                        طلبه {item.requestedBy} في{" "}
                        {new Date(item.requestedAt).toLocaleString("ar-SA")}
                        {item.paidBy ? ` · سدده ${item.paidBy}` : ""}
                      </small>
                      {item.responseReason && (
                        <small>سبب القرار: {item.responseReason}</small>
                      )}
                    </div>
                    <span className={`workflow-status ${item.status}`}>
                      {item.status === "requested"
                        ? "بانتظار المالك"
                        : item.status === "paid"
                          ? "تم السداد"
                          : item.status}
                    </span>
                    {data.canPayJudgments && item.status === "requested" && (
                      <>
                        <button onClick={() => setPayingJudgment(item)}>
                          تم السداد
                        </button>
                        <button
                          onClick={() => {
                            const reason = window.prompt("سبب طلب التعديل");
                            if (reason)
                              void legalDecision("request-judgment-changes", {
                                paymentId: item.id,
                                reason,
                              });
                          }}
                        >
                          طلب تعديل
                        </button>
                        <button
                          className="danger"
                          onClick={() => {
                            const reason = window.prompt("سبب الرفض");
                            if (reason)
                              void legalDecision("reject-judgment", {
                                paymentId: item.id,
                                reason,
                              });
                          }}
                        >
                          رفض
                        </button>
                      </>
                    )}
                    {["requested", "changes_requested"].includes(item.status) &&
                      item.requestedBy === data.currentActorEmail && (
                        <button
                          className="danger"
                          onClick={() => {
                            const reason = window.prompt("سبب إلغاء الطلب");
                            if (reason)
                              void legalDecision("cancel-judgment", {
                                paymentId: item.id,
                                reason,
                              });
                          }}
                        >
                          إلغاء الطلب
                        </button>
                      )}
                    {item.journalEntryId && (
                      <small>قيد مالي #{item.journalEntryId}</small>
                    )}
                  </article>
                ))}
                {!judgmentPayments.length && (
                  <p className="legal-empty">لا توجد طلبات سداد محكوم به.</p>
                )}
              </section>
              <section className="legal-case-files">
                <h3>مرفقات الشؤون القانونية</h3>
                {attachments.map((item) => (
                  <article className="legal-case-file-row" key={item.id}>
                    <a
                      href={`/api/portal/legal-cases/attachments/${item.id}?inline=1`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <strong>{item.title}</strong>
                      <small>
                        {item.fileName} ·{" "}
                        {(item.sizeBytes / 1024 / 1024).toFixed(2)} م.ب
                      </small>
                    </a>
                    {data.canShareExternally && externalLawyers.length > 0 && (
                      <button
                        type="button"
                        className="whatsapp-share-button"
                        onClick={() => setSharingAttachment(item)}
                      >
                        مشاركة عبر واتساب
                      </button>
                    )}
                  </article>
                ))}
                {!attachments.length && (
                  <p className="legal-empty">لا توجد مرفقات قانونية إضافية.</p>
                )}
                {data.canWrite && (
                  <form onSubmit={upload}>
                    <input
                      name="title"
                      maxLength={180}
                      placeholder="اسم المرفق"
                    />
                    <select name="documentCategory">
                      <option value="general">عام</option>
                      <option value="evidence">دليل</option>
                      <option value="judgment">حكم</option>
                      <option value="pleading">مذكرة أو لائحة</option>
                      <option value="settlement">اتفاق تسوية</option>
                      <option value="correspondence">مراسلات</option>
                    </select>
                    <input
                      name="file"
                      type="file"
                      required
                      accept="application/pdf,image/png,image/jpeg"
                    />
                    <button disabled={uploading}>
                      {uploading ? "جارٍ الرفع..." : "إرفاق ملف قانوني"}
                    </button>
                  </form>
                )}
              </section>
              <section className="legal-share-history">
                <h3>سجل مشاركة الملفات مع المحامين الخارجيين</h3>
                {matterShares.map((share) => {
                  const lawyer = data.lawyers.find(
                    (item) => item.id === share.lawyerId,
                  );
                  const attachment = data.attachments.find(
                    (item) => item.id === share.attachmentId,
                  );
                  const expired = Date.parse(share.expiresAt) <= currentTime;
                  const active = !share.revokedAt && !expired;
                  return (
                    <article key={share.id}>
                      <div>
                        <strong>
                          {attachment?.title || `ملف #${share.attachmentId}`}
                        </strong>
                        <span>
                          إلى {lawyer?.fullName || `محامٍ #${share.lawyerId}`}
                        </span>
                        <small>
                          شاركه {share.sharedBy} في{" "}
                          {new Date(share.sharedAt).toLocaleString("ar-SA", {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })}
                        </small>
                        <small>
                          التنزيلات {share.downloadCount}/{share.maxDownloads}
                          {share.lastAccessedAt
                            ? ` · آخر فتح ${new Date(share.lastAccessedAt).toLocaleString("ar-SA")}`
                            : " · لم يُفتح بعد"}
                        </small>
                      </div>
                      <span className={`workflow-status ${active ? "active" : "cancelled"}`}>
                        {share.revokedAt
                          ? "مُبطل"
                          : expired
                            ? "منتهي"
                            : `صالح حتى ${new Date(share.expiresAt).toLocaleString("ar-SA")}`}
                      </span>
                      {active && data.canShareExternally && (
                        <button
                          type="button"
                          className="danger"
                          onClick={() => void revokeShare(share)}
                        >
                          إبطال الرابط
                        </button>
                      )}
                    </article>
                  );
                })}
                {!matterShares.length && (
                  <p className="legal-empty">
                    لم تُسجل مشاركة خارجية لملفات هذه القضية.
                  </p>
                )}
              </section>
              {data.canWrite && (
                <form className="legal-activity-form" onSubmit={add}>
                  <select name="activityType" required defaultValue="task">
                    {Object.entries(types).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <input
                    name="title"
                    required
                    minLength={3}
                    placeholder="عنوان الإجراء"
                  />
                  <select name="priority" defaultValue="medium">
                    <option value="low">منخفض</option>
                    <option value="medium">متوسط</option>
                    <option value="high">عالٍ</option>
                    <option value="critical">عاجل</option>
                  </select>
                  <input name="dueAt" type="datetime-local" />
                  <input
                    name="assignedTo"
                    type="email"
                    placeholder="المسؤول بالبريد"
                  />
                  <textarea
                    name="details"
                    placeholder="الملاحظات والخطوة المطلوبة"
                  />
                  <button>إضافة إلى القضية</button>
                </form>
              )}
              <div className="legal-timeline">
                {activities.map((item) => (
                  <article
                    key={item.id}
                    className={`${item.priority} ${item.status}`}
                  >
                    <i />
                    <div>
                      <header>
                        <strong>
                          {types[item.activityType] || item.activityType} —{" "}
                          {item.title}
                        </strong>
                        <span>{item.priority}</span>
                      </header>
                      <p>{item.details || "دون ملاحظات إضافية"}</p>
                      <small>
                        {item.dueAt
                          ? `الموعد: ${new Date(item.dueAt).toLocaleString("ar-SA")}`
                          : "دون موعد"}
                        {item.assignedTo
                          ? ` · المسؤول: ${item.assignedTo}`
                          : ""}{" "}
                        · أنشأه: {item.createdBy}
                        {item.completedAt
                          ? ` · أُكمل: ${new Date(item.completedAt).toLocaleString("ar-SA")}`
                          : ""}
                      </small>
                    </div>
                    {data.canWrite &&
                      !["completed", "cancelled"].includes(item.status) && (
                        <div>
                          <button
                            onClick={() => void update(item.id, "in_progress")}
                          >
                            قيد التنفيذ
                          </button>
                          <button
                            onClick={() => void update(item.id, "completed")}
                          >
                            إكمال
                          </button>
                        </div>
                      )}
                  </article>
                ))}
                {!activities.length && (
                  <p className="legal-empty">
                    لا توجد إجراءات مسجلة لهذه القضية.
                  </p>
                )}
              </div>
              <section className="legal-action-audit">
                <h3>سجل منفذي الإجراءات</h3>
                {actionLog.map((log) => (
                  <article key={log.id}>
                    <strong>{log.actorEmail}</strong>
                    <span>
                      {log.actorRole === "legal_supervisor"
                        ? "محامي مشرف"
                        : log.actorRole === "lawyer"
                          ? "محامي مسؤول"
                          : log.actorRole === "legal_lawyer"
                          ? "محامي فرعي"
                          : log.actorRole}
                    </span>
                    <p>{log.details || log.action}</p>
                    <small>
                      {new Date(log.createdAt).toLocaleString("ar-SA")}
                    </small>
                  </article>
                ))}
                {!actionLog.length && (
                  <p className="legal-empty">لا توجد حركات موثقة بعد.</p>
                )}
              </section>
            </>
          ) : (
            <p className="legal-empty">اختر ملفًا قانونيًا.</p>
          )}
        </main>
      </div>
      {companyCaseModal && (
        <div className="modal-layer legal-lawyer-modal-layer">
          <button
            className="drawer-backdrop"
            aria-label="إغلاق نموذج تسجيل قضية على الشركة"
            onClick={() => setCompanyCaseModal(false)}
          />
          <section
            className="record-modal legal-lawyer-modal legal-company-case-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="company-defense-case-title"
          >
            <div className="drawer-head">
              <div>
                <span>استقبال دعاوى الخصوم</span>
                <h2 id="company-defense-case-title">
                  تسجيل قضية مرفوعة على الشركة
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setCompanyCaseModal(false)}
              >
                ×
              </button>
            </div>
            <form onSubmit={createCompanyDefenseCase}>
              <p className="legal-transfer-summary span-two">
                ينشئ النظام ملف دفاع مستقلًا، ومهلة رد، وجلسة أولى عند تحديدها،
                ويسجل الإسناد وتوقيته في السجل القانوني.
              </p>
              <label className="span-two">
                موضوع الدعوى
                <input
                  name="title"
                  required
                  minLength={3}
                  maxLength={180}
                  placeholder="مثال: مطالبة مالية عن عقد تشغيل"
                />
              </label>
              <label>
                اسم المدعي
                <input
                  name="claimantName"
                  required
                  minLength={2}
                  maxLength={180}
                />
              </label>
              <label>
                رقم القضية لدى المحكمة
                <input
                  name="courtCaseNumber"
                  required
                  maxLength={120}
                  dir="ltr"
                />
              </label>
              <label>
                المحكمة
                <input name="courtName" required maxLength={180} />
              </label>
              <label>
                الدائرة
                <input name="circuitName" maxLength={180} />
              </label>
              <label>
                نوع الدعوى
                <input
                  name="claimType"
                  required
                  maxLength={120}
                  placeholder="عمالية، تجارية، تنفيذية..."
                />
              </label>
              <label>
                قيمة المطالبة
                <input
                  name="claimAmount"
                  type="number"
                  min="0"
                  step="0.01"
                  defaultValue="0"
                />
              </label>
              <label>
                درجة التقاضي
                <select name="litigationLevel" required defaultValue="first_instance">
                  <option value="first_instance">ابتدائي</option>
                  <option value="appeal">استئناف</option>
                  <option value="supreme">عليا</option>
                  <option value="enforcement">تنفيذ</option>
                </select>
              </label>
              <label>
                مستوى المخاطر
                <select name="riskLevel" required defaultValue="high">
                  <option value="low">منخفض</option>
                  <option value="medium">متوسط</option>
                  <option value="high">مرتفع</option>
                  <option value="critical">حرج</option>
                </select>
              </label>
              <label>
                تاريخ ووقت استلام التبليغ
                <input name="noticeReceivedAt" type="datetime-local" required />
              </label>
              <label>
                نهاية مهلة الرد
                <input name="responseDeadlineAt" type="datetime-local" required />
              </label>
              <label>
                رقم الجلسة الأولى
                <input
                  name="firstHearingNumber"
                  maxLength={80}
                  placeholder="الأولى"
                />
              </label>
              <label>
                موعد الجلسة الأولى — اختياري
                <input name="firstHearingAt" type="datetime-local" />
              </label>
              <label>
                محامي المدعي — اختياري
                <input name="opposingCounsel" maxLength={180} />
              </label>
              <label>
                المحامي المستلم — اختياري
                <select name="assignedLawyerId" defaultValue="">
                  <option value="">غير مسند — يُسند لاحقًا</option>
                  {data.lawyers
                    .filter((lawyer) => lawyer.status === "active")
                    .map((lawyer) => (
                      <option key={lawyer.id} value={lawyer.id}>
                        {lawyer.fullName} — {lawyer.portalUserEmail ? "داخلي" : "خارجي"}
                      </option>
                    ))}
                </select>
              </label>
              <label className="span-two">
                ملخص المطالبة ومتطلبات الدفاع
                <textarea
                  name="claimSummary"
                  required
                  minLength={10}
                  maxLength={5000}
                  rows={4}
                  placeholder="ملخص الوقائع والطلبات والمستندات المطلوب جمعها وخطة الرد الأولية"
                />
              </label>
              <div className="modal-actions span-two">
                <button
                  type="button"
                  onClick={() => setCompanyCaseModal(false)}
                >
                  إلغاء
                </button>
                <button className="admin-primary" disabled={companyCaseBusy}>
                  {companyCaseBusy ? "جارٍ تسجيل القضية..." : "تسجيل القضية وبدء المتابعة"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
      {lawyerModal && (
        <div className="modal-layer legal-lawyer-modal-layer">
          <button
            className="drawer-backdrop"
            aria-label={
              editingLawyer
                ? "إغلاق نموذج تعديل المحامي"
                : "إغلاق نموذج إضافة محامي"
            }
            onClick={closeLawyerModal}
          />
          <section
            className="record-modal legal-lawyer-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-lawyer-title"
          >
            <div className="drawer-head">
              <div>
                <span>سجل الشؤون القانونية</span>
                <h2 id="add-lawyer-title">
                  {editingLawyer ? "تعديل بيانات المحامي" : "إضافة محامي"}
                </h2>
              </div>
              <button type="button" onClick={closeLawyerModal}>
                ×
              </button>
            </div>
            <form
              key={editingLawyer?.id || "new-lawyer"}
              onSubmit={saveLawyer}
            >
              <label>
                اسم المحامي
                <input
                  name="fullName"
                  required
                  minLength={3}
                  maxLength={180}
                  defaultValue={editingLawyer?.fullName || ""}
                />
              </label>
              <label>
                رقم رخصة المحاماة
                <input
                  name="licenseNumber"
                  maxLength={80}
                  dir="ltr"
                  defaultValue={editingLawyer?.licenseNumber || ""}
                />
              </label>
              <label>
                تاريخ انتهاء الرخصة
                <input
                  name="licenseExpiryDate"
                  type="date"
                  defaultValue={editingLawyer?.licenseExpiryDate || ""}
                />
              </label>
              <label>
                رقم الجوال وواتساب
                <input
                  name="mobile"
                  type="tel"
                  required
                  maxLength={20}
                  placeholder="9665XXXXXXXX"
                  dir="ltr"
                  defaultValue={editingLawyer?.mobile || ""}
                />
              </label>
              <label>
                البريد المهني
                <input
                  name="email"
                  type="email"
                  maxLength={254}
                  dir="ltr"
                  defaultValue={editingLawyer?.email || ""}
                />
              </label>
              <label>
                ربط بمستخدم — اختياري
                <select
                  name="portalUserEmail"
                  defaultValue={editingLawyer?.portalUserEmail || ""}
                >
                  <option value="">محامي خارجي دون حساب</option>
                  {editingLawyer?.portalUserEmail &&
                    !lawyerUsers.some(
                      (user) => user.email === editingLawyer.portalUserEmail,
                    ) && (
                      <option value={editingLawyer.portalUserEmail}>
                        المستخدم الحالي — {editingLawyer.portalUserEmail}
                      </option>
                    )}
                  {lawyerUsers.map((user) => (
                    <option key={user.email} value={user.email}>
                      {user.displayName} — {user.email}
                    </option>
                  ))}
                </select>
              </label>
              <label className="span-two">
                ملاحظات
                <textarea
                  name="notes"
                  rows={3}
                  maxLength={2000}
                  defaultValue={editingLawyer?.notes || ""}
                />
              </label>
              <p className="form-hint span-two">
                لا يُنشئ هذا النموذج مستخدمًا. عند عدم ربط حساب، يبقى المحامي
                خارجيًا ويمكن إسناد القضايا إليه ومشاركة ملفاتها عبر واتساب.
              </p>
              <div className="modal-actions span-two">
                <button type="button" onClick={closeLawyerModal}>
                  إلغاء
                </button>
                <button className="admin-primary" disabled={lawyerBusy}>
                  {lawyerBusy
                    ? "جارٍ الحفظ..."
                    : editingLawyer
                      ? "حفظ التعديلات"
                      : "حفظ المحامي"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
      {transferringLawyer && (
        <div className="modal-layer legal-lawyer-modal-layer">
          <button
            className="drawer-backdrop"
            aria-label="إغلاق نموذج تحويل القضايا"
            onClick={() => setTransferringLawyer(null)}
          />
          <section
            className="record-modal legal-lawyer-modal legal-transfer-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="transfer-lawyer-cases-title"
          >
            <div className="drawer-head">
              <div>
                <span>{transferringLawyer.fullName}</span>
                <h2 id="transfer-lawyer-cases-title">
                  تحويل القضايا إلى محامٍ آخر
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setTransferringLawyer(null)}
              >
                ×
              </button>
            </div>
            <form onSubmit={transferLawyerCases}>
              <p className="legal-transfer-summary span-two">
                سيُسجل النظام المحامي السابق والجديد ومن نفذ التحويل، ويحدّث
                تاريخ ووقت الإسناد لكل قضية محولة.
              </p>
              <label>
                المحامي البديل
                <select name="targetLawyerId" required defaultValue="">
                  <option value="" disabled>
                    اختر المحامي البديل
                  </option>
                  {data.lawyers
                    .filter(
                      (lawyer) =>
                        lawyer.id !== transferringLawyer.id &&
                        lawyer.status === "active",
                    )
                    .map((lawyer) => (
                      <option key={lawyer.id} value={lawyer.id}>
                        {lawyer.fullName} — {lawyer.portalUserEmail ? "داخلي" : "خارجي"}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                نطاق التحويل
                <select name="scope" defaultValue="open">
                  <option value="open">القضايا المفتوحة فقط</option>
                  <option value="all">جميع القضايا بما فيها المغلقة</option>
                </select>
              </label>
              <div className="modal-actions span-two">
                <button
                  type="button"
                  onClick={() => setTransferringLawyer(null)}
                >
                  إلغاء
                </button>
                <button className="admin-primary" disabled={lawyerBusy}>
                  {lawyerBusy ? "جارٍ التحويل..." : "تأكيد تحويل القضايا"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
      {sharingAttachment && (
        <div className="modal-layer">
          <button
            className="drawer-backdrop"
            aria-label="إغلاق نموذج مشاركة واتساب"
            onClick={() => setSharingAttachment(null)}
          />
          <section
            className="record-modal legal-share-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="legal-share-title"
          >
            <div className="drawer-head">
              <div>
                <span>{matter?.referenceCode}</span>
                <h2 id="legal-share-title">مشاركة ملف مع محامٍ خارجي</h2>
              </div>
              <button type="button" onClick={() => setSharingAttachment(null)}>
                ×
              </button>
            </div>
            <form onSubmit={shareOnWhatsApp}>
              <p className="legal-share-file span-two">
                <strong>{sharingAttachment.title}</strong>
                <span>{sharingAttachment.fileName}</span>
              </p>
              <label>
                المحامي الخارجي
                <select name="lawyerId" required defaultValue="">
                  <option value="" disabled>
                    اختر حساب واتساب
                  </option>
                  {externalLawyers.map((lawyer) => (
                    <option key={lawyer.id} value={lawyer.id}>
                      {lawyer.fullName} — {lawyer.mobile}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                صلاحية الرابط
                <select name="expiresInDays" defaultValue="7">
                  <option value="1">يوم واحد</option>
                  <option value="3">3 أيام</option>
                  <option value="7">7 أيام</option>
                  <option value="14">14 يومًا</option>
                </select>
              </label>
              <p className="form-hint span-two">
                سيُفتح واتساب مباشرة بعد إنشاء رابط مشفر مؤقت. تُسجل ساعة
                المشاركة واسم المشارك والمحامي وعدد مرات فتح الملف، ويمكن إبطال
                الرابط من سجل المشاركة.
              </p>
              <div className="modal-actions span-two">
                <button type="button" onClick={() => setSharingAttachment(null)}>
                  إلغاء
                </button>
                <button className="admin-primary" disabled={shareBusy}>
                  {shareBusy ? "جارٍ تجهيز الرابط..." : "فتح واتساب وتسجيل المشاركة"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
      {payingJudgment && (
        <div className="modal-layer">
          <button
            className="drawer-backdrop"
            aria-label="إغلاق نموذج سداد المحكوم به"
            onClick={() => setPayingJudgment(null)}
          />
          <section className="record-modal" role="dialog" aria-modal="true">
            <div className="drawer-head">
              <div>
                <span>طلب #{payingJudgment.id}</span>
                <h2>تأكيد سداد المحكوم به</h2>
              </div>
              <button type="button" onClick={() => setPayingJudgment(null)}>
                ×
              </button>
            </div>
            <form className="feature-form" onSubmit={payJudgment}>
              <p className="span-two">
                {money(payingJudgment.amountHalalas)} —{" "}
                {payingJudgment.description}
              </p>
              <label>
                الحساب البنكي
                <select name="bankAccountId" required defaultValue="">
                  <option value="" disabled>
                    اختر الحساب البنكي
                  </option>
                  {data.banks.map((bank) => (
                    <option key={bank.id} value={bank.id}>
                      {bank.bankName} — {bank.accountName} — {bank.iban}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                مرجع العملية
                <input
                  name="paymentReference"
                  maxLength={180}
                  placeholder="رقم العملية البنكية"
                />
              </label>
              <p className="span-two">
                القيد مستقل: مدين مصروفات وأحكام قانونية، ودائن البنك المختار.
              </p>
              <div className="modal-actions span-two">
                <button type="button" onClick={() => setPayingJudgment(null)}>
                  إلغاء
                </button>
                <button
                  className="admin-primary"
                  disabled={data.banks.length === 0}
                >
                  تم السداد وإنشاء القيد
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}
