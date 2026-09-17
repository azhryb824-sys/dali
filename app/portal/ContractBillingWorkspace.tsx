"use client";

import { readApiJson } from "@/lib/client-api";
import { appConfirm, appPrompt } from "@/app/components/AppDialogProvider";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { createWhatsAppUrl } from "@/lib/whatsapp";
import {
  openDaliWhatsApp,
  type DaliWhatsAppLinks,
} from "@/lib/whatsapp-runtime";
import {
  downloadDaliShareFiles,
  prepareDaliShareFiles,
  shareDaliFilesNatively,
  sharePreparedDaliFiles,
  supportsDaliNativeFileShare,
  supportsDaliWebFileShare,
  type DaliPreparedShareFiles,
  type DaliShareFileDescriptor,
} from "@/lib/file-share-runtime";
import ContractCancellationDialog from "./ContractCancellationDialog";
import ContractApprovalStampDialog, {
  type ContractApprovalStamp,
} from "./ContractApprovalStampDialog";
import LegalPaymentReferralDialog from "./LegalPaymentReferralDialog";
import ContractFullEditDialog from "./ContractFullEditDialog";
import LegalContractCorrespondence from "./LegalContractCorrespondence";
import ContractPaymentSettlementDialog, {
  type SettlementDialogAllocation,
} from "./ContractPaymentSettlementDialog";
type Contract = {
  id: number;
  documentId: number;
  clientId: number | null;
  referenceCode: string;
  clientName: string;
  clientCr: string | null;
  clientVat: string | null;
  title: string;
  workSite: string;
  issueDate: string;
  amountHalalas: number;
  quantityMode: "fixed" | "open";
  seasonType: string;
  vatRateBps: number;
  startDate: string;
  endDate: string;
  status: string;
  contractDirection: "dali_supplier" | "dali_purchaser";
  accommodationParty: string | null;
  transportParty: string | null;
  details: string;
  showPaymentSchedule: boolean;
  approvedBy: string | null;
};
type Profession = {
  id?: number;
  contractId: number;
  profession: string;
  requiredCount: number;
  unitSalaryHalalas: number;
  actualSalaryHalalas: number;
  sponsorshipType: string | null;
  sponsorName: string | null;
  ajirContractStatus: string | null;
};
type Payment = {
  id: number;
  contractId: number;
  installmentNumber: number;
  title: string;
  dueDate: string;
  percentageBps: number;
  amountHalalas: number;
  invoiceAmountHalalas: number;
  paidAmountHalalas: number;
  remainingAmountHalalas: number;
  isOverdue: boolean;
  absenceDeductionHalalas: number;
  subtotalHalalas?: number;
  vatRateBps?: number;
  status: string;
  invoiceDocumentId: number | null;
  paymentJournalEntryId: number | null;
};
type Bank = {
  id: number;
  accountCode: string;
  bankName: string;
  accountName: string;
  iban: string;
  status: string;
};
type PaymentAccount = {
  id: number;
  code: string;
  nameAr: string;
  accountType: string;
  isPosting: boolean;
  status: string;
};
type Settlement = {
  id: number;
  paymentScheduleId: number;
  referenceCode: string;
  direction: "customer_receipt" | "supplier_payment";
  amountHalalas: number;
  paymentDate: string;
  journalEntryId: number;
  reversalJournalEntryId: number | null;
  status: "active" | "reversal_pending" | "reversed" | "void";
  recordedBy: string;
  reversalReason: string | null;
};
type SettlementAllocation = {
  id: number;
  settlementId: number;
  paymentMethod: "bank_transfer" | "cash" | "cheque" | "legacy";
  amountHalalas: number;
  bankAccountId: number | null;
  paymentReference: string | null;
};
type Data = {
  contracts: Contract[];
  payments: Payment[];
  professions: Profession[];
  banks: Bank[];
  paymentAccounts: PaymentAccount[];
  settlements: Settlement[];
  settlementAllocations: SettlementAllocation[];
  clientMobiles: Record<string, string>;
  canManageContracts: boolean;
  canApproveContracts: boolean;
  canRefer: boolean;
  canInvoice: boolean;
  canRecordPayment: boolean;
  canReferLegal: boolean;
  canShareApprovedContracts: boolean;
};
const money = (value: number) =>
  new Intl.NumberFormat("ar-SA", {
    style: "currency",
    currency: "SAR",
    maximumFractionDigits: 2,
  }).format(value / 100);
const labels: Record<string, string> = {
  scheduled: "مجدولة",
  due: "مستحقة",
  referred: "محالة للمحاسبة",
  invoiced: "صدرت الفاتورة",
  partially_paid: "مسددة جزئيًا",
  paid: "مسددة",
  cancelled: "ملغاة",
};
const contractLabels: Record<string, string> = {
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
export default function ContractBillingWorkspace() {
  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState(0);
  const [notice, setNotice] = useState("");
  const [editingContract, setEditingContract] = useState<Contract | null>(null);
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);
  const [signedUploadContract, setSignedUploadContract] =
    useState<Contract | null>(null);
  const [cancellingContract, setCancellingContract] = useState<Contract | null>(
    null,
  );
  const [settlingPayment, setSettlingPayment] = useState<Payment | null>(null);
  const [sharingContract, setSharingContract] = useState<Contract | null>(null);
  const [contractShareBusy, setContractShareBusy] = useState(false);
  const [contractShareError, setContractShareError] = useState("");
  const [contractShareResult, setContractShareResult] = useState<
    (DaliWhatsAppLinks & {
      shareUrl: string;
      shareMessage: string;
      files: DaliShareFileDescriptor[];
    }) | null
  >(null);
  const [contractPreparedFiles, setContractPreparedFiles] =
    useState<DaliPreparedShareFiles | null>(null);
  const [contractFileShareBusy, setContractFileShareBusy] = useState(false);
  const [pendingContractApproval, setPendingContractApproval] = useState<{
    contract: Contract;
    stamps: ContractApprovalStamp[];
  } | null>(null);
  const load = useCallback(async () => {
    const response = await fetch("/api/portal/contract-payments", {
      cache: "no-store",
    });
    const result = (await readApiJson(response)) as Data & { error?: string };
    if (!response.ok)
      throw new Error(result.error || "تعذر تحميل العقود والدفعات");
    setData(result);
  }, []);
  useEffect(() => {
    let active = true;
    void fetch("/api/portal/contract-payments", { cache: "no-store" })
      .then(async (response) => {
        const result = (await readApiJson(response)) as Data & {
          error?: string;
        };
        if (!response.ok) throw new Error(result.error || "تعذر التحميل");
        if (active) setData(result);
      })
      .catch((error) => {
        if (active)
          setNotice(error instanceof Error ? error.message : "تعذر التحميل");
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    const update = (event: Event) => {
      const contract = (event as CustomEvent<{ contract?: Contract }>).detail
        ?.contract;
      if (!contract) return;
      setData((current) =>
        current
          ? {
              ...current,
              contracts: current.contracts.map((item) =>
                item.id === contract.id ? { ...item, ...contract } : item,
              ),
            }
          : current,
      );
    };
    window.addEventListener("dali-contract-updated", update);
    return () => window.removeEventListener("dali-contract-updated", update);
  }, []);
  const [legalReferralPayment, setLegalReferralPayment] =
    useState<Payment | null>(null);
  const [expandedContracts, setExpandedContracts] = useState<Set<number>>(
    () => new Set(),
  );
  async function patch(payment: Payment, action: string, reason = "") {
    setBusy(payment.id);
    setNotice("");
    try {
      const response = await fetch("/api/portal/contract-payments", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ paymentId: payment.id, action, reason }),
      });
      const result = (await readApiJson(response)) as { error?: string };
      if (!response.ok) throw new Error(result.error || "تعذر تنفيذ الإجراء");
      await load();
      setNotice(
        action === "refer-accounting"
          ? "أُحيلت الدفعة للمحاسبة."
          : action === "mark-paid"
            ? "تم تسجيل السداد وربطه بالسجل المالي."
            : "أُحيل ملف العميل والعقد للشؤون القانونية.",
      );
      return true;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "تعذر التنفيذ");
      return false;
    } finally {
      setBusy(0);
    }
  }
  async function referPaymentToLegal(
    payment: Payment,
    reason: string,
    shouldCancel: boolean,
  ) {
    const contract = data?.contracts.find(
      (item) => item.id === payment.contractId,
    );
    if (!contract) return;
    const referred = await patch(payment, "refer-legal", reason);
    if (!referred) return;
    if (shouldCancel) await cancelContract(contract, "", "late_payment");
    setLegalReferralPayment(null);
    setNotice(
      shouldCancel
        ? `أُحيلت الدفعة للقانونية وتم ${["active", "suspended"].includes(contract.status) ? "إنهاء" : "إلغاء"} العقد مع بقاء المطالبة المالية.`
        : "أُحيلت الدفعة والملف للقانونية وبقي العقد بحالته الحالية.",
    );
  }
  function toggleContract(id: number) {
    setExpandedContracts((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  async function settleContractPayment(input: {
    paymentDate: string;
    allocations: SettlementDialogAllocation[];
    notes: string;
  }) {
    if (!settlingPayment) return;
    setBusy(settlingPayment.id);
    setNotice("");
    try {
      const response = await fetch("/api/portal/contract-payments", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          paymentId: settlingPayment.id,
          action: "record-settlement",
          ...input,
        }),
      });
      const result = (await readApiJson(response)) as { error?: string };
      if (!response.ok)
        throw new Error(result.error || "تعذّر تسجيل السداد");
      setSettlingPayment(null);
      await load();
      setNotice(
        "تم تسجيل السداد وتوزيعه وإنشاء قيد متوازن مستقل بانتظار الاعتماد والترحيل.",
      );
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "تعذّر تسجيل السداد",
      );
    } finally {
      setBusy(0);
    }
  }
  async function reverseSettlement(payment: Payment, settlement: Settlement) {
    const reason = await appPrompt(
      `اكتب سبب عكس السداد ${settlement.referenceCode} (10 أحرف على الأقل). إذا كان القيد مرحّلًا فسيُنشأ قيد عكسي بانتظار الاعتماد والترحيل.`,
      {
        title: "عكس سجل السداد",
        multiline: true,
        minLength: 10,
        tone: "danger",
      },
    );
    if (!reason) return;
    setBusy(payment.id);
    setNotice("");
    try {
      const response = await fetch("/api/portal/contract-payments", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "reverse-settlement",
          paymentId: payment.id,
          settlementId: settlement.id,
          reason,
        }),
      });
      const result = (await readApiJson(response)) as {
        pending?: boolean;
        error?: string;
      };
      if (!response.ok) throw new Error(result.error || "تعذر عكس السداد");
      await load();
      setNotice(
        result.pending
          ? "أُنشئ القيد العكسي، ويظل أثر السداد قائمًا حتى اعتماده وترحيله."
          : "أُلغي قيد السداد غير المرحّل وأعيد احتساب المتبقي والحالة المالية.",
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "تعذر عكس السداد");
    } finally {
      setBusy(0);
    }
  }
  async function reschedule(payment: Payment) {
    setEditingPayment(payment);
  }
  async function savePaymentSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingPayment) return;
    const dueDate = String(
      new FormData(event.currentTarget).get("dueDate") || "",
    );
    setBusy(editingPayment.id);
    setNotice("");
    try {
      const response = await fetch("/api/portal/contract-payments", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          paymentId: editingPayment.id,
          action: "reschedule",
          dueDate,
        }),
      });
      const result = (await readApiJson(response)) as { error?: string };
      if (!response.ok)
        throw new Error(result.error || "تعذر تعديل موعد الدفعة");
      setEditingPayment(null);
      await load();
      setNotice(
        "تم تعديل موعد الاستحقاق وتحديث التوقع المالي دون تغيير قيمة الدفعة.",
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "تعذر تعديل الموعد");
    } finally {
      setBusy(0);
    }
  }
  async function openContractApproval(contract: Contract) {
    setBusy(-contract.id);
    setNotice("");
    try {
      const stampResponse = await fetch("/api/portal/document-stamps", {
          cache: "no-store",
        }),
        stampData = (await readApiJson(stampResponse)) as {
          stamps?: Array<{ id: number; name: string }>;
          error?: string;
        };
      if (!stampResponse.ok || !stampData.stamps?.length)
        throw new Error(stampData.error || "أضف ختمًا نشطًا قبل اعتماد العقد");
      setPendingContractApproval({ contract, stamps: stampData.stamps });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "تعذر تحميل أختام الاعتماد");
    } finally {
      setBusy(0);
    }
  }
  async function approveContract(contract: Contract, stampId: number) {
    setBusy(-contract.id);
    setNotice("");
    try {
      const response = await fetch(
        `/api/portal/contracts/${contract.id}/status`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            status: "approved",
            reason: "اعتماد مباشر من صفحة العقود والدفعات",
            stampId,
          }),
        },
      );
      const result = (await readApiJson(response)) as {
        error?: string;
        signatureUploadUrl?: string;
      };
      if (!response.ok) throw new Error(result.error || "تعذر اعتماد العقد");
      let copied = false;
      if (result.signatureUploadUrl) try {
        await navigator.clipboard.writeText(result.signatureUploadUrl);
        copied = true;
      } catch {
        // Some embedded browsers block clipboard access after an async request.
      }
      await load();
      setPendingContractApproval(null);
      setNotice(
        !result.signatureUploadUrl
          ? `تم اعتماد العقد ${contract.referenceCode}. يمكن رفع النسخة الموقعة من زر «رفع العقد الموقع».`
          : copied
          ? `تم اعتماد العقد ${contract.referenceCode} ونسخ رابط رفع النسخة الموقعة إلى الحافظة: ${result.signatureUploadUrl}`
          : `تم اعتماد العقد ${contract.referenceCode}. رابط رفع النسخة الموقعة: ${result.signatureUploadUrl}`,
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "تعذر اعتماد العقد");
    } finally {
      setBusy(0);
    }
  }
  async function uploadSignedContract(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!signedUploadContract) return;
    setBusy(-signedUploadContract.id);
    setNotice("");
    try {
      const form = new FormData(event.currentTarget);
      const response = await fetch(
        `/api/portal/contracts/${signedUploadContract.id}/signed-document`,
        { method: "POST", body: form },
      );
      const result = (await readApiJson(response)) as { error?: string };
      if (!response.ok)
        throw new Error(result.error || "تعذر رفع العقد الموقع");
      const reference = signedUploadContract.referenceCode;
      setSignedUploadContract(null);
      await load();
      setNotice(
        `تم رفع العقد الموقع ${reference} وأصبح هو ملف PDF الحالي مع الاحتفاظ بمرجع النسخة السابقة.`,
      );
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "تعذر رفع العقد الموقع",
      );
    } finally {
      setBusy(0);
    }
  }
  async function editContract(contract: Contract) {
    setEditingContract(contract);
  }
  async function deleteContract(contract: Contract) {
    if (!await appConfirm(`حذف مسودة العقد ${contract.referenceCode} نهائيًا؟`, { title: "حذف مسودة العقد", tone: "danger", confirmLabel: "حذف" }))
      return;
    setBusy(-contract.id);
    setNotice("");
    try {
      const response = await fetch(`/api/portal/contracts/${contract.id}`, {
        method: "DELETE",
      });
      const result = (await readApiJson(response)) as { error?: string };
      if (!response.ok) throw new Error(result.error || "تعذر حذف العقد");
      await load();
      setNotice(`تم حذف مسودة العقد ${contract.referenceCode}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "تعذر حذف العقد");
    } finally {
      setBusy(0);
    }
  }
  async function cancelContract(
    contract: Contract,
    reason: string,
    reasonCode: "late_payment" | "other",
  ) {
    setBusy(-contract.id);
    setNotice("");
    try {
      const status = ["active", "suspended"].includes(contract.status)
        ? "terminated"
        : "cancelled";
      const response = await fetch(
        `/api/portal/contracts/${contract.id}/status`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ status, reason, reasonCode }),
        },
      );
      const result = (await readApiJson(response)) as { error?: string };
      if (!response.ok) throw new Error(result.error || "تعذر إلغاء العقد");
      setCancellingContract(null);
      await load();
      setNotice(
        `تم ${status === "terminated" ? "إنهاء" : "إلغاء"} العقد ${contract.referenceCode} وإحالته تلقائيًا للشؤون القانونية.`,
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "تعذر إلغاء العقد");
    } finally {
      setBusy(0);
    }
  }
  async function invoice(payment: Payment) {
    setBusy(payment.id);
    setNotice("");
    try {
      const response = await fetch("/api/portal/contract-payments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ paymentId: payment.id }),
      });
      const result = (await readApiJson(response)) as { error?: string };
      if (!response.ok) throw new Error(result.error || "تعذر إصدار الفاتورة");
      await load();
      setNotice(
        "أُنشئت الفاتورة المالية وملف PDF وأصبحت جاهزة للتنزيل والمشاركة.",
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "تعذر إصدار الفاتورة");
    } finally {
      setBusy(0);
    }
  }
  async function share(documentId: number) {
    const payment = data?.payments.find(
      (item) => item.invoiceDocumentId === documentId,
    );
    const contract = payment
      ? data?.contracts.find((item) => item.id === payment.contractId)
      : null;
    if (
      payment &&
      contract &&
      contract.clientId &&
      data?.clientMobiles[String(contract.clientId)]
    )
      return shareWhatsApp(documentId, contract, payment);
    try {
      const response = await fetch("/api/portal/documents/share", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          documentId,
          expiresInDays: 7,
          maxDownloads: 20,
        }),
      });
      const result = (await readApiJson(response)) as {
        shareUrl?: string;
        error?: string;
      };
      if (!response.ok || !result.shareUrl)
        throw new Error(result.error || "تعذر إنشاء الرابط");
      await navigator.clipboard.writeText(result.shareUrl);
      setNotice("لا يوجد جوال للعميل؛ تم نسخ رابط PDF الآمن للمشاركة يدويًا.");
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "تعذر إنشاء رابط المشاركة",
      );
    }
  }
  async function shareWhatsApp(
    documentId: number,
    contract: Contract,
    payment: Payment,
  ) {
    const raw = contract.clientId
      ? data?.clientMobiles[String(contract.clientId)] || ""
      : "";
    try {
      const response = await fetch("/api/portal/documents/share", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          documentId,
          expiresInDays: 7,
          maxDownloads: 20,
        }),
      });
      const result = (await readApiJson(response)) as {
        shareUrl?: string;
        error?: string;
      };
      if (!response.ok || !result.shareUrl)
        throw new Error(result.error || "تعذر إنشاء الرابط");
      const message = `السلام عليكم، نرفق لكم فاتورة ${payment.title} للعقد ${contract.referenceCode}. رابط PDF الآمن: ${result.shareUrl}`;
      const whatsappUrl = createWhatsAppUrl(raw, message);
      if (!whatsappUrl)
        throw new Error("لا يوجد رقم جوال سعودي صحيح لجهة اتصال العميل.");
      const opened = window.open(whatsappUrl, "_blank", "noopener,noreferrer");
      if (!opened) window.location.assign(whatsappUrl);
      setNotice(
        "فُتحت محادثة العميل مباشرة في واتساب مع رسالة الفاتورة ورابط PDF الآمن.",
      );
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "تعذر مشاركة الفاتورة عبر واتساب",
      );
    }
  }
  async function shareApprovedContract(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!sharingContract) return;
    const values = Object.fromEntries(new FormData(event.currentTarget));
    setContractShareBusy(true);
    setContractShareError("");
    setContractShareResult(null);
    setContractPreparedFiles(null);
    setNotice("");
    try {
      const response = await fetch(
        `/api/portal/contracts/${sharingContract.id}/share`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(values),
        },
      );
      const result = (await readApiJson(response)) as {
        error?: string;
        whatsappUrl?: string;
        whatsappAppUrl?: string;
        whatsappWebUrl?: string;
        whatsappLaunchUrl?: string;
        shareUrl?: string;
        shareMessage?: string;
        files?: DaliShareFileDescriptor[];
      };
      if (
        !response.ok ||
        !result.whatsappUrl ||
        !result.whatsappAppUrl ||
        !result.whatsappWebUrl ||
        !result.whatsappLaunchUrl ||
        !result.shareUrl ||
        !result.shareMessage ||
        !result.files?.length
      )
        throw new Error(result.error || "تعذر تجهيز مشاركة العقد");
      const links: DaliWhatsAppLinks = {
        appUrl: result.whatsappAppUrl,
        universalUrl: result.whatsappUrl,
        webUrl: result.whatsappWebUrl,
        secureLaunchUrl: result.whatsappLaunchUrl,
      };
      setContractShareResult({
        ...links,
        shareUrl: result.shareUrl,
        shareMessage: result.shareMessage,
        files: result.files,
      });
      setNotice(
        "جُهز ملف PDF الفعلي والرابط الآمن. اختر مشاركة الملف مباشرة أو فتح واتساب.",
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "تعذر مشاركة العقد عبر واتساب";
      setContractShareError(message);
      setNotice(message);
    } finally {
      setContractShareBusy(false);
    }
  }
  async function shareApprovedContractFiles() {
    if (!contractShareResult || !sharingContract) return;
    const options = {
      title: `العقد المعتمد ${sharingContract.referenceCode}`,
      text: contractShareResult.shareMessage,
    };
    setContractFileShareBusy(true);
    setContractShareError("");
    try {
      if (supportsDaliNativeFileShare()) {
        await shareDaliFilesNatively(contractShareResult.files, options);
        setNotice("فُتحت نافذة مشاركة الملف الفعلي؛ اختر واتساب لإرساله مرفقًا.");
        return;
      }
      if (contractPreparedFiles) {
        const outcome = await sharePreparedDaliFiles(
          contractPreparedFiles,
          options,
        );
        if (outcome === "shared") {
          setNotice("تم تسليم ملف PDF الفعلي إلى نافذة المشاركة.");
          return;
        }
        if (outcome === "cancelled") {
          setNotice("أُغلقت نافذة مشاركة الملف دون إرسال.");
          return;
        }
      } else if (supportsDaliWebFileShare()) {
        const prepared = await prepareDaliShareFiles(contractShareResult.files);
        setContractPreparedFiles(prepared);
        setNotice(
          "اكتمل تحميل PDF بأمان. اضغط «مشاركة PDF الفعلي» مرة أخرى واختر واتساب.",
        );
        return;
      }
      downloadDaliShareFiles(contractShareResult.files);
      openDaliWhatsApp("app", contractShareResult);
      setNotice(
        "بدأ تنزيل PDF الفعلي وفُتح واتساب؛ أرفق الملف الذي نُزّل من نافذة المحادثة.",
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "تعذر تجهيز ملف العقد للمشاركة";
      setContractShareError(message);
      setNotice(message);
    } finally {
      setContractFileShareBusy(false);
    }
  }
  if (!data)
    return (
      <section className="panel">
        <p>{notice || "جارٍ تحميل العقود والدفعات..."}</p>
      </section>
    );
  return (
    <>
      {notice && (
        <div className="operations-notice" role="status">
          {notice}
        </div>
      )}
      <section className="panel contract-billing">
        <header>
          <div>
            <h2>العقود وجدول الدفعات</h2>
            <p>
              إحالة الدفعات المستحقة، إصدار الفواتير، تسجيل السداد، والإحالة
              القانونية عند التأخر.
            </p>
          </div>
          <b>{data.contracts.length} عقد</b>
        </header>
        <div className="contract-billing-list">
          {data.contracts.map((contract) => {
            const payments = data.payments.filter(
              (item) => item.contractId === contract.id,
            );
            const needsApproval = [
              "draft",
              "internal_review",
              "legal_review",
            ].includes(contract.status);
            const canEdit = ![
              "active",
              "suspended",
              "expired",
              "terminated",
              "cancelled",
              "superseded",
            ].includes(contract.status);
            const canCancel = ![
              "expired",
              "terminated",
              "cancelled",
              "superseded",
            ].includes(contract.status);
            const purchaser = contract.contractDirection === "dali_purchaser";
            return (
              <article key={contract.id}>
                <header>
                  <div>
                    <strong>{contract.referenceCode}</strong>
                    <h3>{contract.clientName}</h3>
                    <p>
                      {purchaser
                        ? "دالي مشتري — التزام مورد"
                        : "دالي مورّد — إيراد عميل"}{" "}
                      · {contract.title} ·{" "}
                      {contract.quantityMode === "open"
                        ? `عدد مفتوح · الضريبة ${(contract.vatRateBps / 100).toFixed(2)}%`
                        : money(contract.amountHalalas)}
                    </p>
                  </div>
                  <div className="contract-card-actions">
                    <button
                      className="contract-card-toggle"
                      type="button"
                      aria-expanded={expandedContracts.has(contract.id)}
                      onClick={() => toggleContract(contract.id)}
                    >
                      {expandedContracts.has(contract.id)
                        ? "إغلاق البطاقة"
                        : "فتح واستعراض"}
                    </button>
                    <a
                      className="contract-card-action"
                      href={`/api/portal/documents/${contract.documentId}?language=ar`}
                    >
                      PDF عربي
                    </a>
                    <a
                      className="contract-card-action"
                      href={`/api/portal/documents/${contract.documentId}?language=bilingual`}
                    >
                      PDF عربي/English
                    </a>
                    {data.canShareApprovedContracts && contract.approvedBy && (
                      <button
                        type="button"
                        className="contract-card-action whatsapp-contract-share"
                        onClick={() => {
                          setContractShareError("");
                          setContractShareResult(null);
                          setContractPreparedFiles(null);
                          setSharingContract(contract);
                        }}
                      >
                        مشاركة العقد عبر واتساب
                      </button>
                    )}
                    <span className={`workflow-status ${contract.status}`}>
                      {contractLabels[contract.status] || contract.status}
                    </span>
                    {data.canApproveContracts && needsApproval && (
                      <button
                        className="contract-card-approve"
                        disabled={busy === -contract.id}
                        onClick={() => void openContractApproval(contract)}
                      >
                        {busy === -contract.id
                          ? "جارٍ الاعتماد..."
                          : "اعتماد العقد"}
                      </button>
                    )}
                    {data.canManageContracts &&
                      ["approved", "sent", "signed"].includes(
                        contract.status,
                      ) && (
                        <button
                          className="contract-card-action"
                          disabled={busy === -contract.id}
                          onClick={() => setSignedUploadContract(contract)}
                        >
                          رفع العقد الموقع
                        </button>
                      )}
                    {data.canManageContracts && canEdit && (
                      <button
                        className="contract-card-action"
                        aria-label="تعديل العقد"
                        disabled={busy === -contract.id}
                        onClick={() => void editContract(contract)}
                      >
                        تعديل
                      </button>
                    )}
                    {data.canManageContracts &&
                      contract.status === "draft" &&
                      !contract.status.includes("approved") && (
                        <button
                          className="contract-card-action danger-action"
                          disabled={busy === -contract.id}
                          onClick={() => void deleteContract(contract)}
                        >
                          حذف
                        </button>
                      )}
                    {data.canApproveContracts && canCancel && (
                      <button
                        className="contract-card-action cancel-action"
                        disabled={busy === -contract.id}
                        onClick={() => setCancellingContract(contract)}
                      >
                        {["active", "suspended"].includes(contract.status)
                          ? "إنهاء العقد"
                          : "إلغاء العقد"}
                      </button>
                    )}
                  </div>
                </header>
                {expandedContracts.has(contract.id) && (
                  <div className="contract-card-details">
                    <div className="contract-card-facts">
                      <span>
                        <small>بداية العقد</small>
                        <b>{contract.startDate}</b>
                      </span>
                      <span>
                        <small>نهاية العقد</small>
                        <b>{contract.endDate}</b>
                      </span>
                      <span>
                        <small>عدد الدفعات</small>
                        <b>{payments.length}</b>
                      </span>
                      <span>
                        <small>نوع العقد</small>
                        <b>
                          {contract.seasonType === "regular" ? "سنوي" : "موسمي"}
                        </b>
                      </span>
                    </div>
                    <div className="payment-schedule-list">
                      {payments.map((payment) => (
                        <div key={payment.id}>
                          <p>
                            <strong>
                              {payment.installmentNumber}. {payment.title}
                            </strong>
                            <small>
                              الاستحقاق {payment.dueDate} ·{" "}
                              {(payment.percentageBps / 100).toFixed(2)}%
                            </small>
                          </p>
                          <b>
                            {money(payment.invoiceAmountHalalas)}
                            {payment.invoiceDocumentId && (
                              <small>
                                مسدد {money(payment.paidAmountHalalas)} · متبقي{" "}
                                {money(payment.remainingAmountHalalas)}
                              </small>
                            )}
                            {payment.absenceDeductionHalalas > 0 && (
                              <small>
                                خصم غياب{" "}
                                {money(payment.absenceDeductionHalalas)}
                              </small>
                            )}
                          </b>
                          <span className={`workflow-status ${payment.status}`}>
                            {labels[payment.status] || payment.status}
                          </span>
                          <div className="payment-actions">
                            {data.canInvoice &&
                              ["scheduled", "due"].includes(payment.status) && (
                                <button
                                  disabled={busy === payment.id}
                                  onClick={() => void reschedule(payment)}
                                >
                                  تعديل موعد الدفعة
                                </button>
                              )}
                            {data.canRefer &&
                              ["scheduled", "due"].includes(payment.status) &&
                              payment.dueDate <=
                                new Date().toISOString().slice(0, 10) && (
                                <button
                                  disabled={busy === payment.id}
                                  onClick={() =>
                                    void patch(payment, "refer-accounting")
                                  }
                                >
                                  تحويل للمحاسب
                                </button>
                              )}
                            {data.canInvoice &&
                              payment.status === "referred" && (
                                <button
                                  disabled={busy === payment.id}
                                  onClick={() => void invoice(payment)}
                                >
                                  {purchaser
                                    ? "إصدار استحقاق المورد"
                                    : "إصدار الفاتورة"}
                                </button>
                              )}
                            {payment.invoiceDocumentId && (
                              <>
                                <a
                                  href={`/api/portal/documents/${payment.invoiceDocumentId}?language=ar`}
                                >
                                  PDF عربي
                                </a>
                                <a
                                  href={`/api/portal/documents/${payment.invoiceDocumentId}?language=en`}
                                >
                                  PDF English
                                </a>
                              </>
                            )}
                            {payment.invoiceDocumentId && (
                              <button
                                onClick={() =>
                                  void share(payment.invoiceDocumentId!)
                                }
                              >
                                مشاركة
                              </button>
                            )}
                            {data.canRecordPayment &&
                              ["invoiced", "partially_paid"].includes(
                                payment.status,
                              ) &&
                              payment.remainingAmountHalalas > 0 && (
                                <button
                                  disabled={busy === payment.id}
                                  onClick={() => setSettlingPayment(payment)}
                                >
                                  {purchaser
                                    ? "تسجيل سداد المورد"
                                    : "تسجيل تحصيل العميل"}
                                </button>
                              )}
                            {data.settlements.some(
                              (item) => item.paymentScheduleId === payment.id,
                            ) && (
                              <details className="payment-settlement-history">
                                <summary>سجل السداد</summary>
                                {data.settlements
                                  .filter(
                                    (item) =>
                                      item.paymentScheduleId === payment.id,
                                  )
                                  .map((settlement) => {
                                    const allocations =
                                      data.settlementAllocations.filter(
                                        (item) =>
                                          item.settlementId === settlement.id,
                                      );
                                    return (
                                      <article key={settlement.id}>
                                        <p>
                                          <strong>{settlement.referenceCode}</strong>
                                          <small>
                                            {settlement.paymentDate} ·{" "}
                                            {allocations
                                              .map(
                                                (item) =>
                                                  `${item.paymentMethod === "bank_transfer" ? "تحويل" : item.paymentMethod === "cash" ? "نقدي" : item.paymentMethod === "cheque" ? "شيك" : "سابق"} ${money(item.amountHalalas)}`,
                                              )
                                              .join(" + ") ||
                                              money(settlement.amountHalalas)}
                                          </small>
                                        </p>
                                        <span
                                          className={`workflow-status ${settlement.status}`}
                                        >
                                          {settlement.status === "active"
                                            ? "نشط"
                                            : settlement.status ===
                                                "reversal_pending"
                                              ? "عكس بانتظار الترحيل"
                                              : settlement.status === "reversed"
                                                ? "معكوس"
                                                : "ملغى"}
                                        </span>
                                        {data.canRecordPayment &&
                                          settlement.status === "active" && (
                                            <button
                                              className="danger-action"
                                              disabled={busy === payment.id}
                                              onClick={() =>
                                                void reverseSettlement(
                                                  payment,
                                                  settlement,
                                                )
                                              }
                                            >
                                              عكس السداد
                                            </button>
                                          )}
                                      </article>
                                    );
                                  })}
                              </details>
                            )}
                            {data.canReferLegal &&
                              payment.isOverdue && (
                                <button
                                  className="legal-referral"
                                  disabled={busy === payment.id}
                                  onClick={() =>
                                    setLegalReferralPayment(payment)
                                  }
                                >
                                  إحالة الملف للقانونية
                                </button>
                              )}
                          </div>
                        </div>
                      ))}
                    </div>
                    <LegalContractCorrespondence
                      key={`contract-correspondence-${contract.id}`}
                      mode="contracts"
                      contractId={contract.id}
                    />
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>
      {editingContract && (
        <ContractFullEditDialog
          contract={editingContract}
          professions={data.professions.filter(
            (item) => item.contractId === editingContract.id,
          )}
          payments={data.payments.filter(
            (item) => item.contractId === editingContract.id,
          )}
          busy={busy === -editingContract.id}
          onClose={() => setEditingContract(null)}
          onSaved={async () => {
            await load();
            setNotice(
              `تم تعديل العقد ${editingContract.referenceCode} بالكامل وإعادته للمسودة للاعتماد مجددًا.`,
            );
          }}
        />
      )}
      {pendingContractApproval && (
        <ContractApprovalStampDialog
          stamps={pendingContractApproval.stamps}
          busy={busy === -pendingContractApproval.contract.id}
          onClose={() => setPendingContractApproval(null)}
          onSelect={(stampId) =>
            void approveContract(pendingContractApproval.contract, stampId)
          }
        />
      )}
      {editingPayment && (
        <div className="modal-layer">
          <button
            className="drawer-backdrop"
            aria-label="إغلاق نموذج تعديل الدفعة"
            onClick={() => setEditingPayment(null)}
          />
          <section
            className="record-modal"
            role="dialog"
            aria-modal="true"
            aria-label="تعديل موعد الدفعة"
          >
            <div className="drawer-head">
              <div>
                <span>{editingPayment.title}</span>
                <h2>تعديل موعد استحقاق الدفعة</h2>
              </div>
              <button
                type="button"
                onClick={() => setEditingPayment(null)}
                aria-label="إغلاق"
              >
                ×
              </button>
            </div>
            <form className="feature-form" onSubmit={savePaymentSchedule}>
              <label>
                موعد الاستحقاق
                <input
                  name="dueDate"
                  type="date"
                  required
                  defaultValue={editingPayment.dueDate}
                />
              </label>
              <div className="modal-actions">
                <button type="button" onClick={() => setEditingPayment(null)}>
                  إلغاء
                </button>
                <button
                  className="admin-primary"
                  disabled={busy === editingPayment.id}
                >
                  حفظ الموعد
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
      {sharingContract && (
        <div className="modal-layer">
          <button
            className="drawer-backdrop"
            aria-label="إغلاق نموذج مشاركة العقد"
            onClick={() => {
              setSharingContract(null);
              setContractShareError("");
              setContractShareResult(null);
              setContractPreparedFiles(null);
            }}
          />
          <section
            className="record-modal"
            role="dialog"
            aria-modal="true"
            aria-label="مشاركة العقد المعتمد عبر واتساب"
          >
            <div className="drawer-head">
              <div>
                <span>{sharingContract.referenceCode}</span>
                <h2>مشاركة العقد المعتمد عبر واتساب</h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSharingContract(null);
                  setContractShareError("");
                  setContractShareResult(null);
                  setContractPreparedFiles(null);
                }}
                aria-label="إغلاق"
              >
                ×
              </button>
            </div>
            <form className="feature-form" onSubmit={shareApprovedContract}>
              <label>
                رقم واتساب المستلم
                <input
                  name="whatsappNumber"
                  type="tel"
                  inputMode="tel"
                  autoComplete="off"
                  placeholder="05xxxxxxxx"
                  pattern="[+0-9 -]{9,20}"
                  required
                  autoFocus
                />
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
              <p className="span-two">
                يجب كتابة الرقم عند كل مشاركة. يمكنك إرسال ملف PDF نفسه من
                نافذة المشاركة، ويبقى الرابط المشفر المؤقت خيارًا احتياطيًا.
                لن يُحفظ رقم المستلم ضمن العقد.
              </p>
              {contractShareError && (
                <p className="whatsapp-share-feedback error span-two" role="alert">
                  {contractShareError}
                </p>
              )}
              {contractShareResult && (
                <div className="whatsapp-share-feedback success span-two" role="status">
                  <p>
                    جُهز PDF الفعلي والرابط الآمن. استخدم المشاركة المباشرة
                    لإرفاق الملف نفسه، أو افتح تطبيق واتساب/واتساب ويب لإرسال
                    الرسالة والرابط.
                  </p>
                  <div>
                    <button
                      type="button"
                      disabled={contractFileShareBusy}
                      onClick={() => void shareApprovedContractFiles()}
                    >
                      {contractFileShareBusy
                        ? "جارٍ تجهيز PDF الفعلي..."
                        : contractPreparedFiles
                          ? "مشاركة PDF الفعلي — اختر واتساب"
                          : supportsDaliNativeFileShare()
                            ? "مشاركة PDF الفعلي — اختر واتساب"
                            : supportsDaliWebFileShare()
                              ? "تحميل PDF للمشاركة المباشرة"
                              : "تنزيل PDF ثم فتح واتساب"}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        openDaliWhatsApp("app", contractShareResult)
                      }
                    >
                      فتح تطبيق واتساب
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        openDaliWhatsApp("web", contractShareResult)
                      }
                    >
                      المتابعة إلى واتساب ويب
                    </button>
                    <a
                      href={contractShareResult.shareUrl}
                      target="_blank"
                      rel="noreferrer"
                      download
                    >
                      تنزيل PDF الفعلي
                    </a>
                  </div>
                </div>
              )}
              <div className="modal-actions span-two">
                <button
                  type="button"
                  onClick={() => {
                    setSharingContract(null);
                    setContractShareError("");
                    setContractShareResult(null);
                    setContractPreparedFiles(null);
                  }}
                >
                  {contractShareResult ? "إغلاق" : "إلغاء"}
                </button>
                <button className="admin-primary" disabled={contractShareBusy}>
                  {contractShareBusy
                    ? "جارٍ تجهيز الملف والرابط..."
                    : contractShareResult
                      ? "إنشاء رابط مشاركة جديد"
                      : "تجهيز PDF للمشاركة"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
      {signedUploadContract && (
        <div className="modal-layer">
          <button
            className="drawer-backdrop"
            aria-label="إغلاق نموذج رفع العقد الموقع"
            onClick={() => setSignedUploadContract(null)}
          />
          <section
            className="record-modal"
            role="dialog"
            aria-modal="true"
            aria-label="رفع العقد الموقع"
          >
            <div className="drawer-head">
              <div>
                <span>{signedUploadContract.referenceCode}</span>
                <h2>رفع النسخة الموقعة من الطرف الثاني</h2>
              </div>
              <button
                type="button"
                onClick={() => setSignedUploadContract(null)}
                aria-label="إغلاق"
              >
                ×
              </button>
            </div>
            <form className="feature-form" onSubmit={uploadSignedContract}>
              <label>
                ملف العقد الموقع PDF
                <input
                  name="file"
                  type="file"
                  accept="application/pdf,.pdf"
                  required
                />
              </label>
              <p className="span-two">
                ستصبح هذه النسخة ملف العقد الحالي، مع الاحتفاظ بمرجع النسخة
                السابقة في سجل المستند.
              </p>
              <div className="modal-actions span-two">
                <button
                  type="button"
                  onClick={() => setSignedUploadContract(null)}
                >
                  إلغاء
                </button>
                <button
                  className="admin-primary"
                  disabled={busy === -signedUploadContract.id}
                >
                  {busy === -signedUploadContract.id
                    ? "جارٍ الرفع والحفظ..."
                    : "رفع واستبدال نسخة العقد"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
      {legalReferralPayment &&
        data.contracts.find(
          (item) => item.id === legalReferralPayment.contractId,
        ) && (
          <LegalPaymentReferralDialog
            payment={legalReferralPayment}
            contract={data.contracts.find(
              (item) => item.id === legalReferralPayment.contractId,
            )!}
            busy={
              busy === legalReferralPayment.id ||
              busy === -legalReferralPayment.contractId
            }
            onClose={() => setLegalReferralPayment(null)}
            onConfirm={(reason, shouldCancel) =>
              referPaymentToLegal(legalReferralPayment, reason, shouldCancel)
            }
          />
        )}{" "}
      {cancellingContract && (
        <ContractCancellationDialog
          contract={cancellingContract}
          busy={busy === -cancellingContract.id}
          onClose={() => setCancellingContract(null)}
          onConfirm={(reason, reasonCode) =>
            cancelContract(cancellingContract, reason, reasonCode)
          }
        />
      )}{" "}
      {settlingPayment && (
        <ContractPaymentSettlementDialog
          payment={settlingPayment}
          contract={data.contracts.find(
            (item) => item.id === settlingPayment.contractId,
          )!}
          banks={data.banks}
          paymentAccounts={data.paymentAccounts}
          busy={busy === settlingPayment.id}
          onClose={() => setSettlingPayment(null)}
          onSubmit={settleContractPayment}
        />
      )}
    </>
  );
}
